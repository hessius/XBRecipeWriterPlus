/**
 * WCAG 2.1 contrast, for tests.
 *
 * Contrast is the one property of this palette that cannot be checked by eye on
 * a desktop display, and the one that quietly excludes people when it is wrong.
 * These are the WCAG 2.1 relative-luminance and contrast formulae.
 *
 * This lives in `test-utils/` rather than beside the colour suite that first
 * needed it: importing a `*.test.ts` file to reuse a helper also re-registers
 * every `describe` inside it, so the colour suite would run again inside each
 * consumer.
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

/** WCAG AA for body text: 4.5:1. */
export const AA_TEXT = 4.5;

/** WCAG AA for large text and non-text graphics: 3:1. */
export const AA_LARGE = 3;
