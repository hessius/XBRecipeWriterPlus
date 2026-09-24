import {
    bandY,
    temperatureInBand,
    temperatureBand,
    temperatureMarks,
    BAND_FLOOR,
    BAND_MAX,
    BAND_MIN,
    BAND_TOP,
    MIN_MARK_WIDTH,
    MIN_SPAN
} from "@/library/brew/tempBand";
import {stageSpans} from "@/library/brew/brewShape";
import Pour from "@/library/Pour";
import type {Box} from "@/library/brew/brewShape";

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

    it("keeps the span when the hot clamp bites, by shifting", () => {
        const band = temperatureBand([99])!;
        expect(band).toEqual({min: 85, max: 100});
    });

    it("ignores unset temperatures", () => {
        expect(temperatureBand([-1, 94, 92])).toEqual(temperatureBand([94, 92]));
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

// 40 ml at 4.0 ml/s is a 10 s pour, then a 30 s pause; then 100 ml, 25 s, no
// pause. Planned 65 s.
const stepped = [
    new Pour(1, 40, 94, 40, 0, 0, 30),
    new Pour(2, 100, 90, 40, 0, 0, 0)
];
const box: Box = {width: 400, height: 200, maxT: 65, maxV: 140};

describe("bandY", () => {
    it("puts the band's top at the top of its region and its floor at the bottom", () => {
        const band = {min: 85, max: 100};
        expect(bandY(100, band, 200)).toBeCloseTo(200 * BAND_TOP);
        expect(bandY(85, band, 200)).toBeCloseTo(200 * BAND_FLOOR);
    });

    it("runs downward, because screen coordinates do", () => {
        const band = {min: 85, max: 100};
        expect(bandY(90, band, 200)).toBeGreaterThan(bandY(94, band, 200));
    });
});

describe("temperatureInBand", () => {
    it("accepts temperatures inside the band, including both edges", () => {
        const band = {min: 85, max: 100};
        expect(temperatureInBand(85, band)).toBe(true);
        expect(temperatureInBand(92, band)).toBe(true);
        expect(temperatureInBand(100, band)).toBe(true);
    });

    it("rejects temperatures outside the band", () => {
        const band = {min: 85, max: 100};
        expect(temperatureInBand(84, band)).toBe(false);
        expect(temperatureInBand(101, band)).toBe(false);
    });

    it("rejects an unset temperature", () => {
        expect(temperatureInBand(-1, {min: 85, max: 100})).toBe(false);
    });
});

describe("temperatureMarks", () => {
    it("draws one mark per stage", () => {
        expect(temperatureMarks(stepped, {min: 85, max: 100}, box)).toHaveLength(2);
    });

    it("stops each mark at the end of its pour, not the end of its stage", () => {
        const marks = temperatureMarks(stepped, {min: 85, max: 100}, box);
        const spans = stageSpans(stepped);
        // The first stage pours for 10 s of its 40 s. A mark that ran to the
        // stage boundary would claim a water temperature during the pause.
        expect(marks[0].x + marks[0].width)
            .toBeCloseTo((spans[0].pourEnd / box.maxT) * box.width, 1);
        expect(marks[0].x + marks[0].width)
            .toBeLessThan((spans[0].end / box.maxT) * box.width);
        expect(marks[1].x)
            .toBeCloseTo((spans[1].start / box.maxT) * box.width, 1);
        expect(marks[1].x).toBeGreaterThan(marks[0].x + marks[0].width);
    });

    it("carries the temperature so the caller can print it", () => {
        const marks = temperatureMarks(stepped, {min: 85, max: 100}, box);
        expect(marks.map((m) => m.temperature)).toEqual([94, 90]);
    });

    it("keeps a tiny pour visible", () => {
        const rinse = [new Pour(1, 2, 94, 40, 0, 0, 300)];
        const wide: Box = {width: 400, height: 200, maxT: 300, maxV: 2};
        expect(temperatureMarks(rinse, {min: 85, max: 100}, wide)[0].width)
            .toBeGreaterThanOrEqual(MIN_MARK_WIDTH);
    });

    it("draws no mark for an unset temperature", () => {
        const withUnset = [
            new Pour(1, 40, -1, 40, 0, 0, 30),
            new Pour(2, 100, 90, 40, 0, 0, 0)
        ];
        expect(temperatureMarks(withUnset, {min: 85, max: 100}, box))
            .toHaveLength(1);
        expect(temperatureMarks(withUnset, {min: 85, max: 100}, box)[0].temperature)
            .toBe(90);
    });

    it("draws nothing without an axis", () => {
        expect(temperatureMarks(stepped, {min: 85, max: 100},
                                {...box, maxT: 0})).toEqual([]);
    });

    it("draws nothing without stages", () => {
        expect(temperatureMarks([], {min: 85, max: 100}, box)).toEqual([]);
    });
});
