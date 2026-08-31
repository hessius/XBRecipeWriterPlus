import {buildType1, buildType1Bytes, buildType2, crc16Kermit, parseNotification} from "@/library/machine/protocol";

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
});
