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
    if (
        ![viewportHeight, contentHeight, offset, rowTop, rowHeight, inset].every(Number.isFinite) ||
        viewportHeight <= 0 ||
        contentHeight <= 0 ||
        rowHeight <= 0 ||
        inset < 0 ||
        contentHeight <= viewportHeight
    ) {
        return null;
    }

    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const normalizedOffset = clamp(offset, 0, maxOffset);

    const rowBottom = rowTop + rowHeight;
    if (rowHeight >= viewportHeight) {
        const target = clamp(rowTop - inset, 0, maxOffset);
        return target === normalizedOffset ? null : target;
    }

    const visibleBottom = normalizedOffset + viewportHeight;
    if (rowTop >= normalizedOffset && rowBottom <= visibleBottom) return null;

    const target = rowTop < normalizedOffset ? rowTop - inset : rowBottom + inset - viewportHeight;
    return clamp(target, 0, maxOffset);
}
