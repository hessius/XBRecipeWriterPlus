import {palette} from "@/constants/colors";

describe("the desaturated twins", () => {
    /** sRGB relative luminance, per WCAG. */
    function luminance(hex: string): number {
        const channels = [1, 3, 5].map((i) => {
            const c = parseInt(hex.slice(i, i + 2), 16) / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function contrastOnBase(hex: string): number {
        return (luminance(hex) + 0.05) / (luminance(palette.base) + 0.05);
    }

    it.each([
        ["success", palette.success, palette.successMuted],
        ["warn", palette.warn, palette.warnMuted]
    ])("keeps %s legible after desaturating it", (_name, full, twin) => {
        // The point of desaturating rather than dimming: the glyph must not
        // get harder to see as it steps back. 3:1 is the WCAG floor for a
        // non-text graphic.
        expect(contrastOnBase(twin)).toBeGreaterThan(3);
        // And it must genuinely be a step back, not a different colour at the
        // same saturation.
        expect(contrastOnBase(twin)).toBeCloseTo(contrastOnBase(full), 0);
    });
});
