import {temperatureBand, BAND_MIN, BAND_MAX, MIN_SPAN} from "@/library/brew/tempBand";

describe("temperatureBand", () => {
    it("has no band without temperatures", () => {
        expect(temperatureBand([])).toBeUndefined();
    });

    it("pads and rounds outwards to five", () => {
        // 90..94 pads to 88..96, which rounds out to 85..100.
        expect(temperatureBand([94, 92, 90])).toEqual({min: 85, max: 100});
    });

    it("gives a flat recipe a band it can be drawn in", () => {
        // 93 alone would be a band of nothing. The floor is a 15 degree span.
        const band = temperatureBand([93, 93, 93]);
        expect(band!.max - band!.min).toBeGreaterThanOrEqual(MIN_SPAN);
        expect(band).toEqual({min: 85, max: 100});
    });

    it("never widens beyond the card's own range", () => {
        const band = temperatureBand([40]);
        expect(band!.min).toBeGreaterThanOrEqual(BAND_MIN);
        expect(band!.max).toBeLessThanOrEqual(BAND_MAX);
    });

    it("keeps the span when a clamp bites, by shifting", () => {
        // 40 pads to 38, below the floor. The band shifts up rather than
        // shrinking, or a cool tea recipe would be drawn flatter than a hot one.
        const band = temperatureBand([40]);
        expect(band!.max - band!.min).toBe(MIN_SPAN);
        expect(band!.min).toBe(BAND_MIN);
    });

    it("contains every temperature it was given", () => {
        for (const temps of [[94, 92, 90], [93], [60, 95], [39, 99], [85, 86]]) {
            const band = temperatureBand(temps)!;
            for (const t of temps) {
                expect(t).toBeGreaterThanOrEqual(band.min);
                expect(t).toBeLessThanOrEqual(band.max);
            }
        }
    });

    it("spans a wide recipe without a minimum getting in the way", () => {
        expect(temperatureBand([60, 95])).toEqual({min: 55, max: 100});
    });
});
