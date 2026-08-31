import type {Counter} from "./store";

/**
 * What one IP may mint in an hour.
 *
 * Ten is generous for a human sharing recipes and cheap to serve. The real
 * ceiling is the global one below; this exists so a single client cannot spend
 * the whole day's budget in a minute.
 */
export const PER_IP_PER_HOUR = 10;

/**
 * What the whole service may mint in a day.
 *
 * The account holder's own estimate of demand is single digits per month. Five
 * hundred is three orders of magnitude of headroom and still a bound, which
 * matters because the mints land in a real xBloom account under a real name and
 * — per the spike — **cannot be withdrawn afterwards.**
 */
export const GLOBAL_PER_DAY = 500;

const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

export type LimitBreach = "ip" | "global";

/** `2026-08-31T14` — the hour this instant falls in, in UTC. */
function hourWindow(at: number): string {
    return new Date(at).toISOString().slice(0, 13);
}

/** `2026-08-31` — the day this instant falls in, in UTC. */
function dayWindow(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

/**
 * Count this request and say whether it should be refused.
 *
 * The IP is already hashed by the caller. This module never sees an address,
 * which is what lets `PRIVACY.md` say so without qualification — and it keeps
 * `node:crypto` out of a file that is otherwise pure arithmetic and therefore
 * testable under jest-expo without a Node environment.
 *
 * The per-IP window is checked first, and a request refused there never touches
 * the global counter. The other order looks equivalent and is not: it lets one
 * client spend all 500 daily mints on 490 rejections, taking sharing down for
 * everybody — exactly what the per-IP limit exists to prevent.
 *
 * The IP's own counter is still incremented on a refusal, so a client that
 * keeps hammering keeps its own window pinned open. That part is the intent.
 */
export async function checkLimits(
    counter: Counter, hashedIp: string, at: number = Date.now()
): Promise<LimitBreach | null> {
    const perIp = await counter.bump(`share:ip:${hashedIp}:${hourWindow(at)}`, HOUR_SECONDS);
    if (perIp > PER_IP_PER_HOUR) {
        return "ip";
    }
    const global = await counter.bump(`share:global:${dayWindow(at)}`, DAY_SECONDS);
    if (global > GLOBAL_PER_DAY) {
        return "global";
    }
    return null;
}
