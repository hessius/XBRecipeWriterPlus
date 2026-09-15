import {accents, type AccentGroup} from "@/constants/colors";

/**
 * Give an imported recipe the palette accent closest to the colour it wore in
 * xBloom — but only when there really is one.
 *
 * The app's accents are a deliberate palette, so an imported hex cannot simply
 * be kept: it would sit among them looking almost right, which is worse than
 * looking different. Matching keeps the user's own sense of which recipe is
 * which without letting a foreign colour into the palette.
 *
 * The comparison is in OKLab because RGB distance does not mean what it looks
 * like it means: two colours a fixed RGB distance apart can be obviously
 * different in one part of the space and indistinguishable in another, and
 * the nearest neighbour by RGB is regularly not the nearest one to the eye.
 */

/**
 * How far is too far.
 *
 * The four coffee colours observed in a real account matched at 0.032-0.045.
 * The one tea colour observed was a blue-green whose nearest of four warm tea
 * accents was 0.093, with all four clustered inside 0.013 of each other —
 * which is to say "nearest" there was noise, and the winner would have been a
 * pink. Above this line the answer is no answer, and `assignAccent` picks as
 * it does for any other new recipe.
 *
 * The test pins this into the gap the observations leave — above every real
 * match, below the real miss — and deliberately not to 0.06 exactly. The
 * evidence justifies the gap, not the number, and a test asserting the number
 * would fail for every retune without ever catching a bad one.
 */
export const MAX_ACCENT_DISTANCE = 0.06;

type Lab = {L: number; a: number; b: number};

function parseHex(value: string | null | undefined): [number, number, number] | null {
    // Typed loosely on purpose. `theColor` arrives over the network, where a
    // recipe may simply not have one, and the type says nothing about what a
    // server actually sent. Every other malformed shape already answers null
    // and falls back to the app's own accent assignment; a missing one must
    // do the same rather than throw and take the whole import down with it.
    if (typeof value !== "string") return null;
    const hex = value.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
    ];
}

function toLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toOklab(hex: string | null | undefined): Lab | null {
    const rgb = parseHex(hex);
    if (!rgb) return null;
    const [r, g, b] = rgb.map(toLinear);

    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

    return {
        L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    };
}

function distance(x: Lab, y: Lab): number {
    return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

/**
 * The index of the nearest accent **within the given group**, or `null` when
 * nothing is near enough.
 *
 * An index, not a colour: `Recipe.accentIndex` is an index into the group's
 * array, and handing it a hex string would store something the palette cannot
 * be retuned through.
 */
export function matchAccent(color: string | null | undefined, group: AccentGroup): number | null {
    const target = toOklab(color);
    if (!target) return null;

    const palette = accents[group];
    let best: number | null = null;
    let bestDistance = Infinity;

    for (let i = 0; i < palette.length; i++) {
        const candidate = toOklab(palette[i]);
        if (!candidate) continue;
        const d = distance(target, candidate);
        if (d < bestDistance) {
            bestDistance = d;
            best = i;
        }
    }

    return bestDistance <= MAX_ACCENT_DISTANCE ? best : null;
}
