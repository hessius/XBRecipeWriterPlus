import {createHash} from "node:crypto";
import type {IncomingMessage, ServerResponse} from "node:http";

import {parseSharePayload} from "./_lib/payload";
import {checkLimits} from "./_lib/rateLimit";
import {counterFromEnv, memoryCounter, type Store} from "./_lib/store";
import {mintRecipe, type MintResult} from "./_lib/xbloom";

/**
 * The XBRW++ share mint.
 *
 * The logic below is written against the web-standard `Request`/`Response`
 * pair, because that is what is worth testing. The default export is a thin
 * adapter onto Node's `(req, res)`, which is the shape Vercel's Node runtime
 * actually invokes here — a web-standard default export is accepted at deploy
 * time and then never called with anything that ends the socket, so every
 * request hangs until the gateway gives up at 504. That failure looks like a
 * broken function rather than a wrong signature, so it is worth naming.
 *
 * It never logs recipes, credentials, tokens, or raw IP addresses, and it only
 * returns short machine-readable error codes to clients.
 */
const store = counterFromEnv(process.env);
// The in-memory fallback is necessarily per warm instance; in the current
// production deployment, where Upstash is not configured, that is also the
// scope of idempotency deduplication.
const fallbackStore = memoryCounter();

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,200}$/;
const IN_FLIGHT_SECONDS = 60;
const COMPLETED_SECONDS = 86_400;
let primaryStoreUnavailable = false;

type IdempotencyEntry =
    {state: "inflight"} |
    {state: "complete"; result: MintResult};

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {"content-type": "application/json"}
    });
}

function clientKey(request: Request, salt: string): string {
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

async function checkLimitsWithFallback(hashedIp: string): Promise<"ip" | "global" | null> {
    if (primaryStoreUnavailable) {
        return checkLimits(fallbackStore, hashedIp);
    }
    try {
        return await checkLimits(store, hashedIp);
    } catch (e) {
        primaryStoreUnavailable = true;
        console.error("share: rate limit store unavailable", (e as Error).message);
        return checkLimits(fallbackStore, hashedIp);
    }
}

async function cacheGet(key: string): Promise<IdempotencyEntry | null> {
    if (primaryStoreUnavailable) {
        return fallbackStore.get(key) as Promise<IdempotencyEntry | null>;
    }
    try {
        return await store.get(key) as IdempotencyEntry | null;
    } catch (e) {
        primaryStoreUnavailable = true;
        console.error("share: idempotency store unavailable", (e as Error).message);
        return fallbackStore.get(key) as Promise<IdempotencyEntry | null>;
    }
}

async function cacheClaim(key: string): Promise<Store | null> {
    if (primaryStoreUnavailable) {
        return await fallbackStore.setIfMissing(key, {state: "inflight"}, IN_FLIGHT_SECONDS)
            ? fallbackStore
            : null;
    }
    try {
        return await store.setIfMissing(key, {state: "inflight"}, IN_FLIGHT_SECONDS)
            ? store
            : null;
    } catch (e) {
        primaryStoreUnavailable = true;
        console.error("share: idempotency store unavailable", (e as Error).message);
        return await fallbackStore.setIfMissing(key, {state: "inflight"}, IN_FLIGHT_SECONDS)
            ? fallbackStore
            : null;
    }
}

async function cacheDelete(usedStore: Store, key: string): Promise<void> {
    try {
        await usedStore.del(key);
    } catch (e) {
        console.error("share: idempotency store unavailable", (e as Error).message);
        await fallbackStore.del(key);
    }
}

export async function respond(request: Request): Promise<Response> {
    if (request.method !== "POST") {
        return json({error: "method"}, 405);
    }

    const email = process.env.XBLOOM_EMAIL;
    const password = process.env.XBLOOM_PASSWORD;
    const salt = process.env.SHARE_IP_SALT;
    if (!email || !password || !salt) {
        console.error("share: server configuration is incomplete");
        return json({error: "unavailable"}, 503);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({error: "invalid", reason: "body must be JSON"}, 400);
    }

    const payload = (body as {payload?: unknown} | null)?.payload;
    const parsed = parseSharePayload(payload);
    if (parsed.payload === null) {
        console.warn(`share: rejected payload (${parsed.reason})`);
        // The reason is our own validator's words, never the upstream's, so it
        // is safe to hand back and it is the only thing that makes a 400
        // diagnosable from a phone.
        return json({error: "invalid", reason: parsed.reason}, 400);
    }

    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
        return json({error: "invalid", reason: "Idempotency-Key is malformed"}, 400);
    }

    const hashedIp = clientKey(request, salt);
    const cacheKey = idempotencyKey === null ? null : `share:idem:${hashedIp}:${idempotencyKey}`;
    if (cacheKey) {
        const cached = await cacheGet(cacheKey);
        if (cached?.state === "complete") {
            return json(cached.result, 200);
        }
        if (cached?.state === "inflight") {
            return json({error: "inflight"}, 409);
        }
    }

    const breach = await checkLimitsWithFallback(hashedIp);
    if (breach) {
        return json({error: "limited", scope: breach}, 429);
    }

    let usedCacheStore: Store | null = null;
    try {
        if (cacheKey) {
            usedCacheStore = await cacheClaim(cacheKey);
            if (!usedCacheStore) {
                return json({error: "inflight"}, 409);
            }
        }
        const result = await mintRecipe(parsed.payload as unknown as Record<string, unknown>, {email, password});
        if (cacheKey) {
            await usedCacheStore?.set(cacheKey, {state: "complete", result}, COMPLETED_SECONDS);
        }
        console.log("share: minted");
        return json(result, 200);
    } catch {
        if (cacheKey && usedCacheStore) {
            await cacheDelete(usedCacheStore, cacheKey);
        }
        console.error("share: upstream failed");
        return json({error: "upstream"}, 502);
    }
}

/** Everything Node hands us, as the `Request` the logic above expects. */
async function toRequest(req: IncomingMessage): Promise<Request> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === "string") {
            headers.set(name, value);
        } else if (Array.isArray(value)) {
            headers.set(name, value.join(", "));
        }
    }
    const method = req.method ?? "GET";
    return new Request(`https://share.invalid${req.url ?? "/"}`, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" || chunks.length === 0
            ? undefined
            : Buffer.concat(chunks)
    });
}

export default async function handler(
    req: IncomingMessage, res: ServerResponse
): Promise<void> {
    let response: Response;
    try {
        response = await respond(await toRequest(req));
    } catch (error) {
        // Nothing below `respond` is allowed to throw, so reaching here is a
        // bug in the adapter itself. Answering is still better than hanging.
        console.error("share: handler failed", (error as Error)?.name);
        response = new Response(JSON.stringify({error: "upstream"}), {
            status:  502,
            headers: {"content-type": "application/json"}
        });
    }
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await response.arrayBuffer()));
}
