import {allocateBands, BAR_CAP, BAR_FLOOR, GAP_FLOOR, TRACE_CAP,
        TRACE_FLOOR} from "@/library/brew/bands";

describe("allocateBands", () => {
    it("sits at every floor when there is only just enough room", () => {
        const stages = 9;
        const tight = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR);

        expect(allocateBands(tight, stages)).toEqual({
            traceHeight: TRACE_FLOOR, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: false
        });
    });

    it("stays at every floor and scrolls when there is not enough room", () => {
        const stages = 9;
        const cramped = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) - 100;

        expect(allocateBands(cramped, stages)).toEqual({
            traceHeight: TRACE_FLOOR, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: true
        });
    });

    it("gives the first of the slack to the trace", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 30;

        expect(allocateBands(room, stages).traceHeight).toBe(TRACE_FLOOR + 30);
    });

    it("never grows the trace past its cap", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

        expect(allocateBands(room, stages).traceHeight).toBe(TRACE_CAP);
    });

    it("gives the second of the slack to the bars", () => {
        const stages = 4;
        const spare = TRACE_CAP - TRACE_FLOOR;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + spare + 8;

        // Eight points over four stages is two points of bar each.
        expect(allocateBands(room, stages).barHeight).toBe(BAR_FLOOR + 2);
    });

    it("never grows a bar past its cap", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

        expect(allocateBands(room, stages).barHeight).toBe(BAR_CAP);
    });

    it("gives everything left to the spacing, so nothing is left black", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;
        const bands = allocateBands(room, stages);

        const used = bands.traceHeight
            + stages * (bands.barHeight + bands.rungGap);
        expect(room - used).toBeLessThan(stages);
    });

    it("does not divide by a recipe with no stages", () => {
        expect(allocateBands(600, 0)).toEqual({
            traceHeight: TRACE_CAP, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: false
        });
    });
});
