export const DOTO_MIN_FONT_SIZE = 11;
export const DOTO_MAX_FONT_SCALE = 1.4;
export const DOTO_LINE_HEIGHT = 1.35;

export function dotoRequestedSize(fontSize: number, fontScale: number): number {
    return Math.max(fontSize, DOTO_MIN_FONT_SIZE / Math.min(fontScale, 1));
}

export function dotoDrawnFontSize(fontSize: number, fontScale: number): number {
    return dotoRequestedSize(fontSize, fontScale)
        * Math.min(fontScale, DOTO_MAX_FONT_SCALE);
}

export function dotoRowHeight(fontSize: number, fontScale: number): number {
    return Math.ceil(dotoDrawnFontSize(fontSize, fontScale) * DOTO_LINE_HEIGHT);
}

export function dotoTextWidth(
    text: string,
    fontSize: number,
    fontScale: number,
    tracking = 0.5
): number {
    const chars = text.length;
    if (chars === 0) return 0;
    return chars * 0.6 * dotoDrawnFontSize(fontSize, fontScale)
        + Math.max(0, chars - 1) * tracking;
}
