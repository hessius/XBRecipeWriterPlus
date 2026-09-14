import {
    BYPASS_VOLUME, BYPASS_DEFAULT_VOLUME, BYPASS_DEFAULT_TEMPERATURE, clampBypassVolume,
    BYPASS_TEMPERATURE
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
});
