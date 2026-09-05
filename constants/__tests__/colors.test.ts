import {accents, cupLineFor, palette} from "@/constants/colors";

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

/** Hue in degrees, 0-360. Local to the test so it cannot share a bug with the source. */
function hueOf(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (delta === 0) return 0;
    const h = max === r ? 60 * (((g - b) / delta) % 6)
            : max === g ? 60 * ((b - r) / delta + 2)
            :             60 * ((r - g) / delta + 4);
    return (h + 360) % 360;
}

/** Lightness, 0-1. */
function lightnessOf(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

/** Shortest distance between two hues, in degrees. */
function apart(a: number, b: number): number {
    return Math.abs(((a - b + 540) % 360) - 180);
}

const every = [...accents.coffee, ...accents.tea];

describe("cupLineFor", () => {
    it("returns a six-digit hex for every accent", () => {
        for (const accent of every) {
            expect(cupLineFor(accent)).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it("is never the accent it came from", () => {
        for (const accent of every) {
            expect(cupLineFor(accent)).not.toBe(accent.toLowerCase());
        }
    });

    it("puts the cup line opposite the accent", () => {
        // Peach is far from amber, so nothing pushes it off its complement.
        expect(apart(hueOf(cupLineFor("#F0B98E")), hueOf("#F0B98E")))
            .toBeGreaterThan(175);
    });

    it("keeps every cup line clear of amber", () => {
        const warn = hueOf(palette.warn);
        for (const accent of every) {
            expect(apart(hueOf(cupLineFor(accent)), warn))
                .toBeGreaterThanOrEqual(24);
        }
    });

    it("pushes Sky's complement out of the amber band", () => {
        // Sky's complement lands at 33 degrees, ten from amber. Guarded, it
        // comes out coral at about 18.
        const warn = hueOf(palette.warn);
        expect(apart(hueOf(cupLineFor("#9FC3F0")), warn)).toBeGreaterThanOrEqual(24);
        expect(hueOf(cupLineFor("#9FC3F0"))).toBeLessThan(warn);
    });

    it("leaves the two next-nearest accents where they fall", () => {
        // Ice at 16 degrees and Lilac at 72 are 27 and 29 clear of amber, so
        // the guard must not fire for them. If it did, they would land exactly
        // on the band edge instead.
        const warn = hueOf(palette.warn);
        expect(apart(hueOf(cupLineFor("#A6D6E8")), warn)).toBeGreaterThan(25.5);
        expect(apart(hueOf(cupLineFor("#BDB2E8")), warn)).toBeGreaterThan(25.5);
    });

    it("never returns a colour too dark to read on black", () => {
        for (const accent of every) {
            expect(lightnessOf(cupLineFor(accent)))
                .toBeGreaterThanOrEqual(0.599);
        }
    });
});
