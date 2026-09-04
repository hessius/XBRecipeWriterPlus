import {rungSegments} from "@/library/brew/rungGeometry";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";

/** 70 ml at 4 ml/s is 17.5 s of pouring, then a 20 s rest. */
function stage(volume: number, pause: number): Pour {
    // Pour(pourNumber, volume, temperature, flowRate, agitation, pattern, pause).
    // flowRate is stored times ten.
    return new Pour(1, volume, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, pause);
}

describe("rungSegments", () => {
    it("is one water segment and one pause on a clean stage", () => {
        const segments = rungSegments({
            pour: stage(70, 20), delivered: 0, pauseElapsed: 0, stalls: []
        });

        expect(segments).toEqual([
            {kind: "water", seconds: 17.5, fill: 0},
            {kind: "pause", seconds: 20, fill: 0}
        ]);
    });

    it("fills the water segment by millilitres delivered, not by time", () => {
        const segments = rungSegments({
            pour: stage(70, 20), delivered: 35, pauseElapsed: 0, stalls: []
        });

        expect(segments[0]).toEqual({kind: "water", seconds: 17.5, fill: 0.5});
    });

    it("fills the pause segment by time, because millilitres stop meaning anything", () => {
        const segments = rungSegments({
            pour: stage(70, 20), delivered: 70, pauseElapsed: 5, stalls: []
        });

        expect(segments[0].fill).toBe(1);
        expect(segments[1]).toEqual({kind: "pause", seconds: 20, fill: 0.25});
    });

    it("inserts a stall at the millilitre it began, as wide as it was long", () => {
        const segments = rungSegments({
            pour: stage(70, 0), delivered: 70, pauseElapsed: 0,
            stalls: [{atMl: 20, seconds: 9}]
        });

        expect(segments).toEqual([
            {kind: "water", seconds: 5, fill: 1},
            {kind: "stall", seconds: 9, fill: 1},
            {kind: "water", seconds: 12.5, fill: 1}
        ]);
    });

    it("keeps several stalls in millilitre order and leaves water flowing between them", () => {
        const segments = rungSegments({
            pour: stage(40, 0), delivered: 25, pauseElapsed: 0,
            stalls: [{atMl: 30, seconds: 3}, {atMl: 10, seconds: 4}]
        });

        expect(segments.map((s) => s.kind))
            .toEqual(["water", "stall", "water", "stall", "water"]);
        // 0-10 ml is behind us, 10-30 is half delivered, 30-40 has not started.
        expect(segments[0].fill).toBe(1);
        expect(segments[2].fill).toBe(0.75);
        expect(segments[4].fill).toBe(0);
    });

    it("drops the zero-length water segment when a stage stalls at the very start", () => {
        const segments = rungSegments({
            pour: stage(40, 0), delivered: 0, pauseElapsed: 0,
            stalls: [{atMl: 0, seconds: 6}]
        });

        expect(segments).toEqual([
            {kind: "stall", seconds: 6, fill: 1},
            {kind: "water", seconds: 10, fill: 0}
        ]);
    });

    it("drops the zero-length water segment between two stalls at the same millilitre", () => {
        const segments = rungSegments({
            pour: stage(40, 0), delivered: 40, pauseElapsed: 0,
            stalls: [{atMl: 20, seconds: 3}, {atMl: 20, seconds: 5}]
        });

        expect(segments.map((s) => s.kind)).toEqual(["water", "stall", "stall", "water"]);
    });

    it("is just the pause when a stage carries no volume at all", () => {
        const segments = rungSegments({
            pour: stage(0, 15), delivered: 0, pauseElapsed: 0, stalls: []
        });

        expect(segments).toEqual([{kind: "pause", seconds: 15, fill: 0}]);
    });

    it("makes the lane exactly as long as the time the stage lost", () => {
        const clean = rungSegments({
            pour: stage(70, 20), delivered: 0, pauseElapsed: 0, stalls: []
        });
        const stalled = rungSegments({
            pour: stage(70, 20), delivered: 0, pauseElapsed: 0,
            stalls: [{atMl: 20, seconds: 9}]
        });
        const total = (segments: {seconds: number}[]) =>
            segments.reduce((sum, s) => sum + s.seconds, 0);

        expect(total(stalled) - total(clean)).toBe(9);
    });
});
