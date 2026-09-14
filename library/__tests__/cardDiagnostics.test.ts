import {
    type CardCapture,
    captureToText,
    parseCapture,
    serialiseCapture
} from "../cardDiagnostics";

function sampleCapture(): CardCapture {
    return {
        at: "2026-09-07T19:20:52.313Z",
        uid: [0x04, 0xa1, 0xb2, 0xc3],
        data: Array.from({length: 40}, (_, i) => i),
        systemInfo: {afi: 0, dsfid: 0, blockCount: 60, blockSize: 4}
    };
}

describe("serialiseCapture / parseCapture round trip", () => {
    it("returns an equal capture after a round trip", () => {
        const capture = sampleCapture();
        const parsed = parseCapture(serialiseCapture(capture));
        // Not asserted against `capture` by identity: the serialised form is
        // the thing a future version reads back, so this proves the JSON
        // carries every field intact rather than that two references match.
        expect(parsed).toEqual(capture);
    });

    it("round-trips a capture whose system info is null", () => {
        const capture: CardCapture = {...sampleCapture(), systemInfo: null};
        expect(parseCapture(serialiseCapture(capture))).toEqual(capture);
    });
});

describe("parseCapture rejects rubbish without throwing", () => {
    it("returns null for the empty string", () => {
        expect(parseCapture("")).toBeNull();
    });

    it("returns null for malformed JSON", () => {
        expect(parseCapture("{not json")).toBeNull();
    });

    it("returns null for a JSON primitive", () => {
        expect(parseCapture("42")).toBeNull();
        expect(parseCapture("\"hello\"")).toBeNull();
        expect(parseCapture("null")).toBeNull();
    });

    it("returns null for a JSON array", () => {
        expect(parseCapture("[]")).toBeNull();
    });

    it("returns null when `at` is missing or not a string", () => {
        const {at: _at, ...rest} = sampleCapture();
        expect(parseCapture(JSON.stringify(rest))).toBeNull();
        expect(parseCapture(JSON.stringify({...sampleCapture(), at: 5}))).toBeNull();
    });

    it("returns null when `uid` is not an array of numbers", () => {
        expect(parseCapture(JSON.stringify({...sampleCapture(), uid: "04a1"}))).toBeNull();
        expect(parseCapture(JSON.stringify({...sampleCapture(), uid: [1, "2", 3]}))).toBeNull();
    });

    it("returns null when `data` is not an array of numbers", () => {
        expect(parseCapture(JSON.stringify({...sampleCapture(), data: null}))).toBeNull();
        expect(parseCapture(JSON.stringify({...sampleCapture(), data: [1, null, 3]}))).toBeNull();
    });

    it("returns null when `systemInfo` is present but the wrong shape", () => {
        expect(parseCapture(JSON.stringify({
            ...sampleCapture(),
            systemInfo: {afi: 0, dsfid: 0, blockCount: 60}
        }))).toBeNull();
        expect(parseCapture(JSON.stringify({
            ...sampleCapture(),
            systemInfo: {afi: 0, dsfid: 0, blockCount: "60", blockSize: 4}
        }))).toBeNull();
        expect(parseCapture(JSON.stringify({...sampleCapture(), systemInfo: 5}))).toBeNull();
    });

    it("accepts an explicit null systemInfo", () => {
        expect(parseCapture(JSON.stringify({...sampleCapture(), systemInfo: null}))).not.toBeNull();
    });
});

describe("captureToText", () => {
    it("reports the timestamp, UID and capacity figures", () => {
        const text = captureToText(sampleCapture());
        expect(text).toContain("2026-09-07T19:20:52.313Z");
        expect(text).toContain("04 A1 B2 C3");
        // 60 blocks × 4 bytes = 240 bytes of card.
        expect(text).toContain("60");
        expect(text).toContain("4");
        expect(text).toContain("240");
        // The length actually read, which is not the card capacity.
        expect(text).toContain("40");
    });

    it("says so plainly when there is no system info", () => {
        const text = captureToText({...sampleCapture(), systemInfo: null});
        expect(text).toMatch(/no system info|not available/i);
    });

    it("lays the bytes out in groups of four with a decimal offset per line", () => {
        // 40 bytes 0x00..0x27. First line starts at offset 0, second at 32.
        const text = captureToText(sampleCapture());
        const lines = text.split("\n");
        const firstHex = lines.find(l => l.startsWith("0:"));
        const secondHex = lines.find(l => l.startsWith("32:"));
        // Eight 4-byte groups on the first line.
        expect(firstHex).toBe("0: 00010203 04050607 08090A0B 0C0D0E0F 10111213 14151617 18191A1B 1C1D1E1F");
        // The remaining eight bytes on the next line.
        expect(secondHex).toBe("32: 20212223 24252627");
    });

    it("uppercases the hex", () => {
        const text = captureToText({...sampleCapture(), data: [0xde, 0xad, 0xbe, 0xef]});
        expect(text).toContain("DEADBEEF");
        expect(text).not.toContain("deadbeef");
    });
});
