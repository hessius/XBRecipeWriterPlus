import {maxStagesForBytes, SIGNATURE_BYTES} from "@/library/cardWriteErrors";

describe("maxStagesForBytes", () => {
    it("knows the signature is 32 bytes", () => {
        expect(SIGNATURE_BYTES).toBe(32);
    });

    it("gets ten stages out of a 128-byte card", () => {
        // 128 total, less the 32-byte signature, less 12 of header and
        // trailer, over 8 per stage.
        expect(maxStagesForBytes(128 - SIGNATURE_BYTES)).toBe(10);
    });

    it("gets fourteen out of a 160-byte card", () => {
        expect(maxStagesForBytes(160 - SIGNATURE_BYTES)).toBe(14);
    });

    it("never goes negative", () => {
        expect(maxStagesForBytes(4)).toBe(0);
    });
});
