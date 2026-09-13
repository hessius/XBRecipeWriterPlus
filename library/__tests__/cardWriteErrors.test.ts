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

    it("still gets only ten out of a 160-byte card, because the machine says so", () => {
        // This expectation used to be 14, which is what the byte arithmetic
        // gives: 160 less the signature and the header leaves room for that
        // many. The machine disagrees. On device, a card carrying eleven stages
        // is rejected outright -- the card will not load at all -- and ten
        // brews normally. So capacity is the lower of two unrelated ceilings
        // and the firmware's is the binding one on every card seen so far.
        //
        // The byte maths is still what decides for a card *smaller* than that,
        // which is why it has not simply been replaced by the constant.
        expect(maxStagesForBytes(160 - SIGNATURE_BYTES)).toBe(10);
    });

    it("is still the byte maths below the machine ceiling", () => {
        // 12 of header plus 8 apiece leaves room for 6 stages in 60 bytes,
        // which is under ten and so is not clamped. Without this the test above
        // would pass against a function that ignored `available` entirely.
        expect(maxStagesForBytes(60)).toBe(6);
    });

    it("never goes negative", () => {
        expect(maxStagesForBytes(4)).toBe(0);
    });
});
