/**
 * Where a rate-limit counter lives.
 *
 * Two implementations. In-memory is the fallback and is honest about being one:
 * serverless instances are neither shared nor long-lived, so it limits a burst
 * from a single warm instance and nothing more. Upstash is the real thing, and
 * is used when — and only when — its two environment variables are present.
 *
 * The interface is one method because that is all a windowed counter needs:
 * increment a key that expires, and say what the count is now. Anything richer
 * would be a database, and this is not one.
 */
export type Counter = {
    /** Increment `key`, set its TTL if unset, and return the new value. */
    bump(key: string, ttlSeconds: number): Promise<number>;
};

/** Process-local. Survives a warm invocation, nothing more. */
export function memoryCounter(): Counter {
    const counts = new Map<string, {value: number; expiresAt: number}>();
    return {
        async bump(key, ttlSeconds) {
            const now = Date.now();
            const existing = counts.get(key);
            if (!existing || existing.expiresAt <= now) {
                counts.set(key, {value: 1, expiresAt: now + ttlSeconds * 1000});
                return 1;
            }
            existing.value += 1;
            return existing.value;
        }
    };
}

/**
 * Upstash Redis over its REST API.
 *
 * REST rather than a client library so the function keeps zero runtime
 * dependencies — the deploy then needs no install step at all, which is what
 * lets `vercel.json` skip building the Expo tree.
 *
 * `EXPIRE ... NX` sets the TTL only if there is not one already, so the window
 * is fixed from the first request in it rather than sliding forward on every
 * subsequent one.
 */
export function upstashCounter(url: string, token: string): Counter {
    return {
        async bump(key, ttlSeconds) {
            const res = await fetch(`${url}/pipeline`, {
                method:  "POST",
                headers: {
                    Authorization:  `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify([
                    ["INCR", key],
                    ["EXPIRE", key, String(ttlSeconds), "NX"]
                ])
            });
            if (!res.ok) {
                throw new Error(`upstash ${res.status}`);
            }
            const body = (await res.json()) as {result?: number}[];
            const value = body?.[0]?.result;
            if (typeof value !== "number") {
                throw new Error("upstash returned no count");
            }
            return value;
        }
    };
}

/**
 * The counter this deployment should use.
 *
 * Falling back rather than failing is deliberate: a missing KV must not take
 * sharing down, and the account holder should be able to deploy without an
 * add-on. The trade is stated in the runbook.
 */
export function counterFromEnv(env: Record<string, string | undefined>): Counter {
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
        return upstashCounter(url, token);
    }
    return memoryCounter();
}
