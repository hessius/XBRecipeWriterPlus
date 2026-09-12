export type RevealInput = {
    viewportHeight: number;
    contentHeight: number;
    offset: number;
    rowTop: number;
    rowHeight: number;
    inset?: number;
};

function clamp(n: number, low: number, high: number): number {
    return Math.min(Math.max(n, low), high);
}

export function minimalRevealOffset({
    viewportHeight,
    contentHeight,
    offset,
    rowTop,
    rowHeight,
    inset = 8
}: RevealInput): number | null {
    if (viewportHeight <= 0 || contentHeight <= viewportHeight) return null;

    const rowBottom = rowTop + rowHeight;
    const visibleBottom = offset + viewportHeight;
    if (rowTop >= offset && rowBottom <= visibleBottom) return null;

    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const target = rowTop < offset ? rowTop - inset : rowBottom + inset - viewportHeight;
    return clamp(target, 0, maxOffset);
}
