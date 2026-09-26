import {
    BYPASS_VOLUME, BYPASS_DEFAULT_VOLUME, BYPASS_DEFAULT_TEMPERATURE, clampBypassVolume,
    BYPASS_TEMPERATURE, clampBypassTemp, isUsableBypassTemp
} from "@/library/bypassLimits";
import {TEMPERATURE} from "@/library/cardLimits";

describe("bypass limits", () => {
    it("allows 1 to 500 ml", () => {
        expect(BYPASS_VOLUME).toEqual({min: 1, max: 500});
    });

    it("seeds a freshly enabled bypass at 30 ml and 85 C", () => {
        expect(BYPASS_DEFAULT_VOLUME).toBe(30);
        expect(BYPASS_DEFAULT_TEMPERATURE).toBe(85);
    });

    it("clamps to the range", () => {
        expect(clampBypassVolume(0)).toBe(1);
        expect(clampBypassVolume(9000)).toBe(500);
        expect(clampBypassVolume(45)).toBe(45);
    });

    it("reuses the card temperature range rather than declaring its own", () => {
        // The machine has one kettle. A bypass temperature outside the range a
        // stage may use is not a thing the hardware can do.
        expect(TEMPERATURE).toEqual({min: 39, max: 99});
        expect(BYPASS_TEMPERATURE).toBe(TEMPERATURE);
    });

    it("clamps a temperature to the range", () => {
        expect(clampBypassTemp(0)).toBe(39);
        expect(clampBypassTemp(500)).toBe(99);
        expect(clampBypassTemp(70.4)).toBe(70);
    });

    it("clamps the unset sentinel up to the coolest the kettle does", () => {        // `Pour.temperature` is -1 when unset. Clamping is the last line: the
        // callers that know a value is unset should be reaching for the
        // default instead, and a -1 arriving here is already a bug elsewhere.
        expect(clampBypassTemp(-1)).toBe(39);
    });

    it("answers the default for a value that is not a number at all", () => {
        // Clamping NaN with Math.min/Math.max returns NaN, which would go on
        // to the frame builder as four bytes of quiet nonsense.
        expect(clampBypassTemp(Number.NaN)).toBe(85);
    });

    it("calls the unset sentinel unusable, along with anything out of range", () => {
        expect(isUsableBypassTemp(-1)).toBe(false);
        expect(isUsableBypassTemp(0)).toBe(false);
        expect(isUsableBypassTemp(120)).toBe(false);
        expect(isUsableBypassTemp(Number.NaN)).toBe(false);
        expect(isUsableBypassTemp(undefined)).toBe(false);
        expect(isUsableBypassTemp(85)).toBe(true);
        expect(isUsableBypassTemp(39)).toBe(true);
        expect(isUsableBypassTemp(99)).toBe(true);
    });
});
