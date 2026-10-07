import {dotoTextWidth, DOTO_MIN_FONT_SIZE} from "@/library/dotoMetrics";

export const BREW_FIGURE_LABEL_SIZE = 10;
export const BREW_FIGURE_VALUE_SIZE = 28;
export const BREW_FIGURE_DETAIL_VALUE_SIZE = 20;
export const BREW_FIGURE_INTERNAL_GAP = 2;
export const BREW_FIGURE_ROW_GAP = 4;
export const BREW_FIGURE_COLUMN_GAP = 13;
export const BREW_FIGURE_VALUE_TRACKING = 0.5;
export const BREW_FIGURE_LABEL_TRACKING = 1.6;
export const BREW_FIGURE_BADGE_FONT_SIZE = 11;
export const BREW_FIGURE_BADGE_TRACKING = 0.5;
export const BREW_FIGURE_BADGE_PADDING_X = 4;
export const BREW_FIGURE_BADGE_PADDING_Y = 1;
export const BREW_FIGURE_BADGE_BORDER_WIDTH = 1;
export const BREW_FIGURE_BADGE_GAP = 6;
export const BREW_FIGURE_BADGE_RADIUS = 4;

export type BrewFigureTextGeometry = {
    labelSize: number;
    valueSize: number;
    detailValueSize: number;
    labelTracking: number;
    valueTracking: number;
    columnGap: number;
};

export type BrewFigureBadgeGeometry = {
    fontSize: number;
    tracking: number;
    paddingHorizontal: number;
    paddingVertical: number;
    borderWidth: number;
    gap: number;
    borderRadius: number;
};

export function brewFigureTextGeometry(scale = 1): BrewFigureTextGeometry {
    return {
        labelSize:       BREW_FIGURE_LABEL_SIZE * scale,
        valueSize:       BREW_FIGURE_VALUE_SIZE * scale,
        detailValueSize: BREW_FIGURE_DETAIL_VALUE_SIZE * scale,
        labelTracking:   BREW_FIGURE_LABEL_TRACKING * scale,
        valueTracking:   BREW_FIGURE_VALUE_TRACKING * scale,
        columnGap:       BREW_FIGURE_COLUMN_GAP * scale
    };
}

export function brewFigureBadgeGeometry(scale = 1): BrewFigureBadgeGeometry {
    return {
        fontSize:          BREW_FIGURE_BADGE_FONT_SIZE * scale,
        tracking:          BREW_FIGURE_BADGE_TRACKING * scale,
        paddingHorizontal: BREW_FIGURE_BADGE_PADDING_X * scale,
        paddingVertical:   BREW_FIGURE_BADGE_PADDING_Y * scale,
        borderWidth:       BREW_FIGURE_BADGE_BORDER_WIDTH * scale,
        gap:               BREW_FIGURE_BADGE_GAP * scale,
        borderRadius:      BREW_FIGURE_BADGE_RADIUS * scale
    };
}

export function brewFigureBadgeWidth(
    text: string,
    fontScale: number,
    scale = 1
): number {
    const badge = brewFigureBadgeGeometry(scale);
    return dotoTextWidth(
        text,
        badge.fontSize,
        fontScale,
        badge.tracking,
        DOTO_MIN_FONT_SIZE * scale
    )
        + (badge.paddingHorizontal + badge.borderWidth) * 2;
}

/**
 * The text scale above which the detail row drops to three columns.
 *
 * Four columns hold at the default size and up to here. Past it the only
 * string that cannot follow is the `RECIPE nn` badge, which needs about
 * 99.8 pt at the 1.4 accessibility cap against the 71.7 pt a quarter of the
 * row would give it. Nothing is truncated and nothing is abbreviated; the row
 * simply spends its width on three columns instead of four.
 *
 * Exact, and here rather than inline at the call site, so the fallback is a
 * documented threshold both the layout and its test read from one place.
 */
export const BREW_FIGURE_FOUR_COLUMN_MAX_SCALE = 1.2;

/**
 * DRAWDOWN is the only eight-character label in the row, so its column is
 * wider than the others rather than the row being sized for its longest word.
 */
export const BREW_FIGURE_DRAWDOWN_FLEX = 1.4;

/** Whether the detail row can afford four columns at this text scale. */
export function brewFigureUsesFourColumns(fontScale: number): boolean {
    return fontScale <= BREW_FIGURE_FOUR_COLUMN_MAX_SCALE;
}

/** The flex shares the detail row's columns take, left to right. */
export function brewFigureColumnFlex(fontScale: number): number[] {
    return brewFigureUsesFourColumns(fontScale)
        ? [1, 1, BREW_FIGURE_DRAWDOWN_FLEX, 1]
        : [1, 1, 1];
}

/**
 * What each detail column actually measures, so a test can ask whether the
 * text fits instead of looking at a picture of it.
 *
 * @param contentWidth the row's width, after the screen's padding.
 * @param fontScale the user's text scale, which decides the column count.
 * @param scale the story card's shrink from the reference width.
 */
export function brewFigureColumnWidths(
    contentWidth: number,
    fontScale: number,
    scale = 1
): number[] {
    const flex = brewFigureColumnFlex(fontScale);
    const free = contentWidth - BREW_FIGURE_COLUMN_GAP * scale * (flex.length - 1);
    const total = flex.reduce((sum, share) => sum + share, 0);
    return flex.map((share) => (free * share) / total);
}
