/**
 * Where a rate-limit counter lives.
 *
 * Two implementations. In-memory is the fallback and is honest about being one:
 * serverless instances are neither shared nor long-lived, so it limits a burst
 * from a single warm instance and nothing more. Upstash is the real thing, and
 * is used when — and only when — its two environment variables are present.
 *
 * The interface stays deliberately tiny: enough for expiring counters and the
 * idempotency marker, not enough to become a database.
 */
export type Counter = {
    /** Increment `key`, set its TTL if unset, and return the new value. */
    bump(key: string, ttlSeconds: number): Promise<number>;
};

export type Store = Counter & {
    get(key: string): Promise<unknown>;
    setIfMissing(key: string, value: unknown, ttlSeconds: number): Promise<boolean>;
    set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
};

/** Process-local. Survives a warm invocation, nothing more. */
export function memoryCounter(): Store {
    const values = new Map<string, {value: unknown; expiresAt: number}>();
    const read = (key: string, now: number) => {
        const existing = values.get(key);
        if (!existing || existing.expiresAt <= now) {
            values.delete(key);
            return null;
        }
        return existing;
    };
    return {
        async bump(key, ttlSeconds) {
            const now = Date.now();
            const existing = read(key, now);
            if (!existing || typeof existing.value !== "number") {
                values.set(key, {value: 1, expiresAt: now + ttlSeconds * 1000});
                return 1;
            }
            existing.value += 1;
            return existing.value;
        },
        async get(key) {
            return read(key, Date.now())?.value ?? null;
        },
        async setIfMissing(key, value, ttlSeconds) {
            const now = Date.now();
            if (read(key, now)) {
                return false;
            }
            values.set(key, {value, expiresAt: now + ttlSeconds * 1000});
            return true;
        },
        async set(key, value, ttlSeconds) {
            values.set(key, {value, expiresAt: Date.now() + ttlSeconds * 1000});
        },
        async del(key) {
            values.delete(key);
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
async function command(url: string, token: string, body: unknown[]): Promise<unknown> {
    const res = await fetch(`${url}/${body.map((part) => encodeURIComponent(String(part))).join("/")}`, {
        method:  "POST",
        headers: {Authorization: `Bearer ${token}`}
    });
    if (!res.ok) {
        throw new Error(`upstash ${res.status}`);
    }
    return ((await res.json()) as {result?: unknown}).result;
}

export function upstashCounter(url: string, token: string): Store {
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
        },
        async get(key) {
            const value = await command(url, token, ["GET", key]);
            if (typeof value !== "string") {
                return null;
            }
            return JSON.parse(value);
        },
        async setIfMissing(key, value, ttlSeconds) {
            const result = await command(url, token, [
                "SET", key, JSON.stringify(value), "EX", ttlSeconds, "NX"
            ]);
            return result === "OK";
        },
        async set(key, value, ttlSeconds) {
            await command(url, token, ["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
        },
        async del(key) {
            await command(url, token, ["DEL", key]);
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
export function counterFromEnv(env: Record<string, string | undefined>): Store {
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
        return upstashCounter(url, token);
    }
    return memoryCounter();
}
