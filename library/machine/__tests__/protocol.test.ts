import {buildType1, buildType1Bytes, buildType2, crc16Kermit, parseNotification, parseNotifications} from "@/library/machine/protocol";

import {event, float32, hex, kermit, notification, status, type1, type1Bytes, type2} from "./protocolFixtures";

describe("the frame codec", () => {
    it("matches the handshake frame captured from the official app", () => {
        // 8100, args [185, 1]. Published byte-exact in ble-protocol.md.
        expect(hex(buildType1(8100, [185, 1]))).toBe("580101A41F1400000001B900000001000000BDD1");
    });

    it("matches the commit frame captured from the official app", () => {
        // 8002, no integer arguments. The `[1]` the command table shows is the
        // frame's own payload marker, not an argument — the captured frame is
        // twelve bytes, which is exactly the overhead with an empty payload.
        expect(hex(buildType1(8002))).toBe("580101421F0C000000017FCF");
    });

    it("agrees with an independently written CRC", () => {
        const bytes = [0x58, 0x01, 0x01, 0x42, 0x1F, 0x0C, 0x00, 0x00, 0x00, 0x01];
        expect(crc16Kermit(Uint8Array.from(bytes))).toBe(kermit(bytes));
    });

    it("agrees with an independently written type 1 builder", () => {
        expect(Array.from(buildType1(8102, [0, 0, 18]))).toEqual(type1(8102, [0, 0, 18]));
    });

    it("agrees with an independently written raw-payload builder", () => {
        const blob = [0x08, 0x3C, 0x5D, 0x00, 0x00, 0xEC, 0x00, 0x5A, 0x1E, 0x14, 0x8B];
        expect(Array.from(buildType1Bytes(8001, Uint8Array.from(blob)))).toEqual(type1Bytes(8001, blob));
    });

    it("agrees with an independently written type 2 builder", () => {
        // Mode switch to PRO. The payload is the ASCII of "00000000".
        const payload = Array.from("00000000", (c) => c.charCodeAt(0));
        expect(Array.from(buildType2(11511, Uint8Array.from(payload)))).toEqual(type2(11511, payload));
    });
});

describe("reading what the machine says", () => {
    it("reads a machine state", () => {
        expect(parseNotification(Uint8Array.from(status(0x1F))))
            .toEqual({kind: "status", state: 0x1F});
    });

    it("reads an event code", () => {
        // 40510, bloom/pour start.
        expect(parseNotification(Uint8Array.from(event(40510))))
            .toMatchObject({kind: "event", code: 40510});
    });

    it("carries the pour index on a pour-start event", () => {
        expect(parseNotification(Uint8Array.from(notification(40510 & 0xFF, 40510 >> 8, [2]))))
            .toEqual({kind: "event", code: 40510, value: 2});
    });

    it("reads water weight as grams, not milligrams", () => {
        // The water stream is milligrams. 18500 mg is 18.5 g, and reporting it
        // as 18500 g would be the kind of wrong that looks like a unit bug for
        // an afternoon.
        const frame = notification(0x4B, 0x00, float32(18500));
        expect(parseNotification(Uint8Array.from(frame)))
            .toEqual({kind: "waterWeight", grams: 18.5});
    });

    it("reads cup weight as the grams it already is", () => {
        const frame = notification(0x15, 0x00, float32(36.25));
        const parsed = parseNotification(Uint8Array.from(frame));
        expect(parsed.kind).toBe("cupWeight");
        expect((parsed as {grams: number}).grams).toBeCloseTo(36.25, 3);
    });

    it("reads the machine info blob", () => {
        const payload = new Array(63).fill(0);
        const put = (at: number, text: string) => {
            for (let i = 0; i < text.length; i++) payload[at + i] = text.charCodeAt(i);
        };
        put(0, "J15ABC123456");
        put(13, "J15");
        put(19, "V12.0D.500");
        payload[33] = 1;                     // waterEnough
        payload[37] = 30 + 62;               // grinder raw, minus 30 → 62
        payload[40] = 0;                     // tempUnit, Celsius
        put(51, "91327856");                 // modeType → EASY

        const parsed = parseNotification(Uint8Array.from(notification(0x49, 0x9E, payload)));
        expect(parsed).toMatchObject({
            kind: "info",
            serial: "J15ABC123456",
            model: "J15",
            firmware: "V12.0D.500",
            waterEnough: true,
            grindSize: 62,
            mode: "EASY"
        });
    });

    it("reads the reported plumbed-machine frame as low tank with a tap feed", () => {
        const captured = Uint8Array.from([
            0x58, 0x02, 0x07, 0x49, 0x9E, 0x4B, 0x00, 0x00, 0x00, 0xC1,
            0x4A, 0x31, 0x35, 0x41, 0x30, 0x32, 0x41, 0x34, 0x35, 0x48,
            0x30, 0x33, 0x38, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x56,
            0x31, 0x32, 0x2E, 0x30, 0x44, 0x2E, 0x35, 0x30, 0x30, 0x80,
            0x30, 0xBA, 0x47, 0x00, 0x00, 0x01, 0x01, 0x5A, 0x0F, 0x6E,
            0x01, 0x01, 0x41, 0x36, 0x03, 0x00, 0x00, 0x00, 0x11, 0xDF,
            0x42, 0x91, 0x32, 0x78, 0x56, 0xBC, 0x02, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x39, 0x34
        ]);

        expect(parseNotification(captured)).toMatchObject({
            kind: "info",
            waterEnough: false,
            waterFeed: "tap"
        });
    });

    it("hands back a code it has no name for rather than dropping it", () => {
        // An undocumented event on somebody else's firmware is the most useful
        // thing they can send us, so it has to survive the parser.
        const parsed = parseNotification(Uint8Array.from(notification(0x77, 0x77, [1, 2, 3])));
        expect(parsed).toEqual({kind: "event", code: 0x7777, value: 1});
    });

    it("refuses a frame that is not a notification at all", () => {
        const frame = status(0x1F);
        frame[1] = 0x09;
        expect(parseNotification(Uint8Array.from(frame)).kind).toBe("unknown");
    });

    it("refuses a frame whose checksum does not hold", () => {
        const frame = status(0x1F);
        frame[frame.length - 1] ^= 0xFF;
        expect(parseNotification(Uint8Array.from(frame)).kind).toBe("unknown");
    });

    /**
     * The water and cup streams are matched on their type byte alone, so the
     * command byte above them is not consulted. Event 40523 is `0x9E4B`, whose
     * low byte is the water stream's `0x4B`, and it therefore decodes as a
     * weight rather than as an event 40523 — which is why the console's
     * tank-level readout has never had anything to show.
     *
     * Recorded rather than fixed: on this firmware 40523 *is* the water
     * stream, so the two readings are the same frame under two names, and
     * "correcting" the parser would silently break the brew trace. The point
     * of writing it down is the neighbour, 40522 `0x9E4A` — WATER_LOW —
     * which is one bit away from the flow reading and is treated as a
     * terminal fault.
     */
    it("decodes 40523 as a water weight, because the type byte alone selects the stream", () => {
        const frame = Uint8Array.from(notification(40523 & 0xFF, 40523 >> 8, float32(104000)));
        expect(parseNotification(frame)).toEqual({kind: "waterWeight", grams: 104});
    });

    it("still decodes its neighbour 40522 as the fault event it is", () => {
        const frame = Uint8Array.from(notification(40522 & 0xFF, 40522 >> 8, [1]));
        expect(parseNotification(frame)).toEqual({kind: "event", code: 40522, value: 1});
    });
});

describe("more than one frame in a packet", () => {
    /**
     * Captured from a J15 on 2026-09-01, verbatim: an event frame and a water
     * weight frame delivered as one notification. The machine does this under
     * load — telemetry arrives about thirty times a second, and it gets denser
     * around a recipe send, which is precisely when a dropped status frame
     * costs the most.
     */
    const CAPTURED = [
        0x58, 0x02, 0x07, 0xFE, 0x2C, 0x10, 0x00, 0x00, 0x00, 0xC1,
        0x91, 0x32, 0x78, 0x56, 0x67, 0x74,
        0x58, 0x02, 0x07, 0x4B, 0x9E, 0x10, 0x00, 0x00, 0x00, 0xC1,
        0x00, 0x00, 0x00, 0x00, 0xFD, 0x32
    ];

    it("reads both frames, rather than the first and none of the rest", () => {
        const parsed = parseNotifications(Uint8Array.from(CAPTURED));

        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toMatchObject({kind: "event", code: 0x2CFE});
        expect(parsed[1]).toMatchObject({kind: "waterWeight", grams: 0});
    });

    it("reads a lone frame exactly as before", () => {
        expect(parseNotifications(Uint8Array.from(status(0x1F))))
            .toEqual([{kind: "status", state: 0x1F}]);
    });

    it("hands back a packet it cannot walk, rather than nothing at all", () => {
        // A length field that would run past the end, or a header we do not
        // recognise: the whole packet comes back as one unknown, because the
        // console rendering the bytes is what makes an unfamiliar firmware
        // debuggable.
        const junk = Uint8Array.from([0x58, 0x02, 0x07, 0x11, 0x22, 0xFF, 0xFF, 0, 0, 0xC1, 1, 2]);
        expect(parseNotifications(junk)).toEqual([{kind: "unknown", raw: junk}]);
    });

    it("keeps the frames it did read when the tail is truncated", () => {
        const truncated = Uint8Array.from([...CAPTURED.slice(0, 16), 0x58, 0x02, 0x07]);
        const parsed = parseNotifications(truncated);
        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toMatchObject({kind: "event", code: 0x2CFE});
        expect(parsed[1].kind).toBe("unknown");
    });

    it("never returns an empty list, so a caller cannot silently drop a packet", () => {
        expect(parseNotifications(Uint8Array.from([]))).toEqual([{kind: "unknown", raw: expect.anything()}]);
    });
});
