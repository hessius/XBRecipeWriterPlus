import {buildType1, buildType1Bytes, buildType2, crc16Kermit} from "@/library/machine/protocol";

import {hex, kermit, type1, type1Bytes, type2} from "./protocolFixtures";

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
