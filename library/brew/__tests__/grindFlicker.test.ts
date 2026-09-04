import {flickerMsFor, FLICKER_BEATS_PER_TURN} from "@/library/brew/grindFlicker";

describe("the grinder's flicker", () => {
    it("beats three times per turn of the burr", () => {
        // 120 rpm is two turns a second, so a turn is 500 ms and a beat is a
        // third of that. Pins the rpm-to-ms conversion and the half-beat
        // (rather than whole-beat) result; the beat count itself is pinned
        // below, by the flash-rate test, so this does not also have to.
        expect(flickerMsFor(120) * 2).toBeCloseTo(500 / FLICKER_BEATS_PER_TURN, 5);
    });

    it("lopes at the slowest grind and buzzes at the fastest", () => {
        expect(flickerMsFor(60)).toBeGreaterThan(flickerMsFor(120));
    });

    it("is faster than the fixed period it replaces, at every speed", () => {
        // The whole point: 420 was judged too slow on hardware, so no setting
        // of the grinder may land back on or above it.
        for (let rpm = 60; rpm <= 120; rpm += 10) {
            expect(flickerMsFor(rpm)).toBeLessThan(420);
        }
    });

    it("falls back to the fastest burr for a speed that cannot be one", () => {
        // `Pour` and `Recipe` both use -1 as "never set", and a recipe read
        // off a damaged card can carry anything. A zero or negative period
        // would divide by zero in the square wave and freeze the flicker.
        for (const rpm of [0, -1, NaN]) {
            expect(flickerMsFor(rpm)).toBe(flickerMsFor(120));
        }
    });

    it("does not run away on a speed above the grinder's range", () => {
        // Clamped rather than trusted: the card's byte is not validated on
        // every path, and a 4 ms strobe is a photosensitivity problem, not a
        // fast grind.
        expect(flickerMsFor(9000)).toBe(flickerMsFor(120));
    });

    it("stays below a flash rate, however the beat is retuned", () => {
        // The fastest burr gives a 167 ms cycle, so about six flashes a second.
        // That is acceptable here for reasons that are worth writing down: it
        // is a thin trace stroke rather than a large area of the screen, and
        // both reduced motion and the animateBrewChart setting switch it off
        // entirely. Doubling the beat would put it at twelve, which is not.
        const flashesPerSecond = 1000 / (flickerMsFor(120) * 2);
        expect(flashesPerSecond).toBeLessThan(7);
    });
});
