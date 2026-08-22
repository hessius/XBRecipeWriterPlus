import {accents, onAccent, palette} from "@/constants/colors";

/**
 * Contrast is the one property of this palette that cannot be checked by eye on
 * a desktop display, and the one that quietly excludes people when it is wrong.
 * These are the WCAG 2.1 relative-luminance and contrast formulae.
 */
function channel(value: number): number {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parse(colour: string): [number, number, number] {
    const rgba = colour.match(/^rgba?\(([^)]+)\)$/);
    if (rgba) {
        const [r, g, b] = rgba[1].split(",").map((part) => Number(part.trim()));
        return [r, g, b];
    }

    const hex = colour.replace("#", "");
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
    ];
}

function alphaOf(colour: string): number {
    const rgba = colour.match(/^rgba\(([^)]+)\)$/);
    if (!rgba) {
        return 1;
    }
    const parts = rgba[1].split(",");
    return parts.length === 4 ? Number(parts[3].trim()) : 1;
}

/** `colour` composited over an opaque `background`. */
function flatten(colour: string, background: string): [number, number, number] {
    const alpha = alphaOf(colour);
    const fg = parse(colour);
    const bg = parse(background);
    return [0, 1, 2].map((i) => alpha * fg[i] + (1 - alpha) * bg[i]) as
        [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(foreground: string, background: string): number {
    const a = luminance(flatten(foreground, background));
    const b = luminance(parse(background));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const everyAccent = [...accents.coffee, ...accents.tea];

describe("contrast helper", () => {
    it("computes the reference ratio for black on white", () => {
        expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    });

    it("computes 1 for a colour on itself", () => {
        expect(contrast("#4A7BC8", "#4A7BC8")).toBeCloseTo(1, 5);
    });

    it("composites a translucent foreground over its background", () => {
        // Fully transparent black over white is white: no contrast at all. This
        // is what stops the suite from silently ignoring alpha and grading every
        // translucent ink as pure black.
        expect(contrast("rgba(0,0,0,0)", "#FFFFFF")).toBeCloseTo(1, 5);
    });
});

describe("accent inks", () => {
    it.each(everyAccent)("carries readable value text on %s", (accent) => {
        expect(contrast(onAccent.text, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("carries readable micro-labels on %s", (accent) => {
        // 11 px, and the only cue to what the number beneath it means, so it is
        // held to the same 4.5:1 as body text rather than the large-text 3:1.
        expect(contrast(onAccent.label, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("carries a distinguishable beverage marker on %s", (accent) => {
        expect(contrast(onAccent.marker, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("draws the pour profile stroke visibly on %s", (accent) => {
        // A stroke is a graphical object, which AA holds to 3:1.
        expect(contrast(onAccent.profileStroke, accent)).toBeGreaterThanOrEqual(3);
    });
});

describe("palette inks on the base background", () => {
    it.each([
        ["text", palette.text],
        ["dim", palette.dim],
        ["success", palette.success],
        ["danger", palette.danger],
        ["warn", palette.warn],
        ["info", palette.info]
    ])("keeps %s readable", (_name, colour) => {
        expect(contrast(colour, palette.base)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the line colour below text contrast, as a divider not an ink", () => {
        // A guard against someone "fixing" the divider by brightening it into
        // something that reads as text.
        expect(contrast(palette.line, palette.base)).toBeLessThan(4.5);
    });
});
