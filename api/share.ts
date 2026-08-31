import {createHash} from "node:crypto";

import {validateSharePayload} from "./_lib/payload";
import {checkLimits} from "./_lib/rateLimit";
import {counterFromEnv} from "./_lib/store";
import {mintRecipe} from "./_lib/xbloom";

/**
 * The XBRW++ share mint.
 *
 * Web-standard handler signature keeps the function dependency-free for Vercel.
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

export default async function handler(request: Request): Promise<Response> {
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
        return json({error: "payload"}, 400);
    }

    const payload = (body as {payload?: unknown} | null)?.payload;
    const reason = validateSharePayload(payload);
    if (reason) {
        console.warn(`share: rejected payload (${reason})`);
        return json({error: "payload"}, 400);
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
