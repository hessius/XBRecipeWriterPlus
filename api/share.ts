import {createHash} from "node:crypto";
import type {IncomingMessage, ServerResponse} from "node:http";

import {validateSharePayload} from "./_lib/payload";
import {checkLimits} from "./_lib/rateLimit";
import {counterFromEnv} from "./_lib/store";
import {mintRecipe} from "./_lib/xbloom";

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
const counter = counterFromEnv(process.env);

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {"content-type": "application/json"}
    });
}

function clientKey(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    const salt = process.env.SHARE_IP_SALT ?? "xbrw-share";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function respond(request: Request): Promise<Response> {
    if (request.method !== "POST") {
        return json({error: "method"}, 405);
    }

    const email = process.env.XBLOOM_EMAIL;
    const password = process.env.XBLOOM_PASSWORD;
    if (!email || !password) {
        console.error("share: credentials are not configured");
        return json({error: "unavailable"}, 503);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({error: "invalid", reason: "body must be JSON"}, 400);
    }

    const payload = (body as {payload?: unknown} | null)?.payload;
    const reason = validateSharePayload(payload);
    if (reason) {
        console.warn(`share: rejected payload (${reason})`);
        // The reason is our own validator's words, never the upstream's, so it
        // is safe to hand back and it is the only thing that makes a 400
        // diagnosable from a phone.
        return json({error: "invalid", reason}, 400);
    }

    let breach: "ip" | "global" | null;
    try {
        breach = await checkLimits(counter, clientKey(request));
    } catch (e) {
        console.error("share: rate limit store unavailable", (e as Error).message);
        breach = null;
    }
    if (breach) {
        return json({error: "limited", scope: breach}, 429);
    }

    try {
        const result = await mintRecipe(payload as Record<string, unknown>, {email, password});
        console.log(`share: minted ${result.tableId}`);
        return json(result, 200);
    } catch {
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
