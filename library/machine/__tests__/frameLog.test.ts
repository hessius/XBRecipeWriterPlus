import type {FrameLogEntry} from "@/library/machine/Machine";
import {frameLogText, historyLine, readingOf, stateName, toHex, waterVolumeOf}
    from "@/library/machine/frameLog";

function entry(over: Partial<FrameLogEntry>): FrameLogEntry {
    return {
        at:        Date.parse("2026-09-08T18:51:44.123Z"),
        direction: "received",
        frame:     new Uint8Array([0x58, 0x02, 0x07]),
        parsed:    {kind: "status", state: 0x0C},
        ...over
    };
}

describe("toHex", () => {
    it("renders bytes upper case, space separated", () => {
        expect(toHex(new Uint8Array([0x58, 0x02, 0x0f]))).toBe("58 02 0F");
    });
});

describe("stateName", () => {
    it("names a known state", () => {
        expect(stateName(0x0c)).toBe("no_water");
    });

    it("does not invent a name for one it does not know", () => {
        expect(stateName(0xee)).toBe("unknown");
    });
});

describe("readingOf", () => {
    it("names the state behind a status frame", () => {
        expect(readingOf({kind: "status", state: 0x0c})).toBe("state 0x0c no_water");
    });

    it("carries an event's payload byte", () => {
        expect(readingOf({kind: "event", code: 40522, value: 1})).toBe("event 40522 (1)");
    });

});

describe("waterVolumeOf", () => {
    it("returns undefined for a frame too short to hold a float", () => {
        expect(waterVolumeOf(new Uint8Array(11))).toBeUndefined();
    });
});

describe("historyLine", () => {
    it("puts the clock, the arrow, the hex and the reading on one line", () => {
        expect(historyLine(entry({}))).toBe("18:51:44.123  ←  58 02 07  state 0x0c no_water");
    });

    it("names the channel a frame came in on", () => {
        expect(historyLine(entry({source: "notify2"}))).toContain("←notify2");
    });

    it("decodes nothing for a frame the app sent", () => {
        expect(historyLine(entry({direction: "sent"})))
            .toBe("18:51:44.123  →  58 02 07  ");
    });
});

describe("frameLogText", () => {
    it("is one line per frame, oldest first", () => {
        const text = frameLogText([
            entry({}),
            entry({at: Date.parse("2026-09-08T18:51:45.000Z")})
        ]);
        expect(text.split("\n")).toHaveLength(2);
        expect(text.split("\n")[1]).toContain("18:51:45.000");
    });
});
