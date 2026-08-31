import {memoryCounter} from "../_lib/store";
import {checkLimits, GLOBAL_PER_DAY, PER_IP_PER_HOUR} from "../_lib/rateLimit";

const HOUR = 3_600_000;

describe("checkLimits", () => {
    it("allows the first request", async () => {
        const c = memoryCounter();
        expect(await checkLimits(c, "hashedip", Date.parse("2026-08-31T10:00:00Z"))).toBeNull();
    });

    it("allows exactly the per-IP allowance and refuses the next", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        for (let i = 0; i < PER_IP_PER_HOUR; i++) {
            expect(await checkLimits(c, "hashedip", at)).toBeNull();
        }
        expect(await checkLimits(c, "hashedip", at)).toBe("ip");
    });

    it("does not spend the global budget on requests it has already refused", async () => {
        // The whole point of the per-IP limit: one client hammering must not be
        // able to take sharing down for everybody until UTC midnight.
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        for (let i = 0; i < PER_IP_PER_HOUR + 200; i++) {
            await checkLimits(c, "loud", at);
        }
        // A different address, hours later, same day: the global budget has
        // only PER_IP_PER_HOUR spent against it, not 210.
        for (let i = 0; i < GLOBAL_PER_DAY - PER_IP_PER_HOUR; i++) {
            expect(await checkLimits(c, `quiet${i}`, at + 5 * HOUR)).toBeNull();
        }
        expect(await checkLimits(c, "another", at + 5 * HOUR)).toBe("global");
    });

    it("forgets the per-IP count in the next hour window", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        for (let i = 0; i < PER_IP_PER_HOUR; i++) {
            await checkLimits(c, "hashedip", at);
        }
        expect(await checkLimits(c, "hashedip", at + HOUR)).toBeNull();
    });

    it("does not let one IP consume another's allowance", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        for (let i = 0; i < PER_IP_PER_HOUR; i++) {
            await checkLimits(c, "a", at);
        }
        expect(await checkLimits(c, "b", at)).toBeNull();
    });

    it("refuses once the global daily ceiling is reached, whoever is asking", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        // Spread across enough distinct IPs that the per-IP limit never bites.
        for (let i = 0; i < GLOBAL_PER_DAY; i++) {
            expect(await checkLimits(c, `ip-${i}`, at)).toBeNull();
        }
        expect(await checkLimits(c, "someone-new", at)).toBe("global");
    });

    it("keys the global window to the day, not to a rolling 24 hours", async () => {
        const c = memoryCounter();
        const morning = Date.parse("2026-08-31T01:00:00Z");
        const evening = Date.parse("2026-08-31T23:00:00Z");
        const nextDay = Date.parse("2026-09-01T01:00:00Z");
        for (let i = 0; i < GLOBAL_PER_DAY; i++) {
            await checkLimits(c, `ip-${i}`, morning);
        }
        expect(await checkLimits(c, "late", evening)).toBe("global");
        expect(await checkLimits(c, "late", nextDay)).toBeNull();
    });
});
