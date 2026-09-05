import {allocateBands, BAR_CAP, BAR_FLOOR, BAR_MAX, GAP_CAP, GAP_FLOOR,
        GAP_MAX, TRACE_CAP, TRACE_FLOOR, TRACE_MAX} from "@/library/brew/bands";

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

    it("never grows the trace past its ceiling", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

        expect(allocateBands(room, stages).traceHeight).toBe(TRACE_MAX);
    });

    it("gives the second of the slack to the bars", () => {
        const stages = 4;
        const spare = TRACE_CAP - TRACE_FLOOR;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + spare + 8;

        // Eight points over four stages is two points of bar each.
        expect(allocateBands(room, stages).barHeight).toBe(BAR_FLOOR + 2);
    });

    it("never grows a bar past its ceiling", () => {
        const stages = 4;
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + 400;

        expect(allocateBands(room, stages).barHeight).toBe(BAR_MAX);
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
            traceHeight: TRACE_MAX, barHeight: BAR_FLOOR, rungGap: GAP_FLOOR,
            scrolls: false
        });
    });

    it("holds each band at its soft cap before any band gets a second helping", () => {
        // Just enough to fill trace, bar and gap to their soft caps and no more.
        const stages = 4;
        const soft = (TRACE_CAP - TRACE_FLOOR)
            + stages * ((BAR_CAP - BAR_FLOOR) + (GAP_CAP - GAP_FLOOR));
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + soft;

        expect(allocateBands(room, stages)).toEqual({
            traceHeight: TRACE_CAP, barHeight: BAR_CAP, rungGap: GAP_CAP,
            scrolls: false
        });
    });

    it("gives the second helping to the trace first", () => {
        const stages = 4;
        const soft = (TRACE_CAP - TRACE_FLOOR)
            + stages * ((BAR_CAP - BAR_FLOOR) + (GAP_CAP - GAP_FLOOR));
        const room = TRACE_FLOOR + stages * (BAR_FLOOR + GAP_FLOOR) + soft + 20;
        const bands = allocateBands(room, stages);

        expect(bands.traceHeight).toBe(TRACE_CAP + 20);
        expect(bands.barHeight).toBe(BAR_CAP);
    });

    it("leaves nothing black at four stages on a real phone", () => {
        const bands = allocateBands(600, 4);
        const used = bands.traceHeight + 4 * (bands.barHeight + bands.rungGap);

        expect(600 - used).toBe(0);
        expect(bands).toEqual({
            traceHeight: 300, barHeight: 44, rungGap: 31, scrolls: false
        });
    });

    it("makes the bar the greater part of its own row at every stage count", () => {
        // The fault #88 reported: the bar was 15 pt in an 85 pt row.
        for (const stages of [4, 6, 9, 12]) {
            const bands = allocateBands(600, stages);
            expect(bands.barHeight).toBeGreaterThan(bands.rungGap);
        }
    });

    it("still cannot fill the screen at two stages, and says so by leaving room", () => {
        // Nothing is wrong here: a two-stage ladder thick enough to fill 600 pt
        // would look like a bug. The screen centres what is left.
        const bands = allocateBands(600, 2);
        const used = bands.traceHeight + 2 * (bands.barHeight + bands.rungGap);

        expect(bands).toEqual({
            traceHeight: TRACE_MAX, barHeight: BAR_MAX, rungGap: GAP_MAX,
            scrolls: false
        });
        expect(600 - used).toBe(144);
    });
});
