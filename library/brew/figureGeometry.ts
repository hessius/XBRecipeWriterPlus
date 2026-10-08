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
export const STORY_FIT_MARGIN = 0.75;
export const BREW_FIGURE_ADJUSTMENT_COLUMNS = 2;

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
 * DRAWDOWN is the only eight-character label in the row, so its column is
 * wider than the others rather than the row being sized for its longest word.
 */
export const BREW_FIGURE_DRAWDOWN_FLEX = 1.4;

/**
 * GRIND carries the longest quiet-line text in the row (`RECIPE nn`), while
 * DELAY's value is the shortest (`+N`), so DELAY yields share to GRIND without
 * changing the DRAWDOWN slot or the row's total flex.
 */
export const BREW_FIGURE_GRIND_FLEX = 1.25;
export const BREW_FIGURE_DELAY_FLEX = 0.75;

const FOUR_COLUMN_FLEX = [
    BREW_FIGURE_GRIND_FLEX,
    BREW_FIGURE_DELAY_FLEX,
    BREW_FIGURE_DRAWDOWN_FLEX,
    1
];
const THREE_COLUMN_FLEX = [1, 1, 1];

function columnWidthsForFlex(contentWidth: number, flex: number[], scale = 1): number[] {
    const geometry = brewFigureTextGeometry(scale);
    const free = Math.max(0, contentWidth - geometry.columnGap * (flex.length - 1));
    const total = flex.reduce((sum, share) => sum + share, 0);
    return flex.map((share) => (free * share) / total);
}

/** Whether the detail row can afford four columns at this width and text scale. */
export function brewFigureUsesFourColumns(fontScale: number, contentWidth: number): boolean {
    // Before the first layout pass there is no measured width. Assume the
    // intended row, otherwise mount can blink through the fallback and back.
    if (contentWidth <= 0) return true;

    const [grind] = columnWidthsForFlex(contentWidth, FOUR_COLUMN_FLEX);
    return brewFigureBadgeWidth("RECIPE 58", fontScale) + STORY_FIT_MARGIN <= grind;
}

/** The flex shares the detail row's columns take, left to right. */
export function brewFigureColumnFlex(fontScale: number, contentWidth: number): number[] {
    return brewFigureUsesFourColumns(fontScale, contentWidth)
        ? FOUR_COLUMN_FLEX
        : THREE_COLUMN_FLEX;
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
    return columnWidthsForFlex(
        contentWidth,
        brewFigureColumnFlex(fontScale, contentWidth),
        scale
    );
}

export function brewFigureAdjustmentColumns(
    contentWidth: number,
    fontScale: number,
    badges: string[],
    scale = 1
): 1 | 2 {
    if (contentWidth <= 0) return 2;
    const geometry = brewFigureTextGeometry(scale);
    const twoColumnWidth = Math.max(
        0,
        (
            contentWidth
            - geometry.columnGap * (BREW_FIGURE_ADJUSTMENT_COLUMNS - 1)
        ) / BREW_FIGURE_ADJUSTMENT_COLUMNS
    );
    return badges.every((badge) =>
        brewFigureBadgeWidth(badge, fontScale, scale) + STORY_FIT_MARGIN <= twoColumnWidth)
        ? 2
        : 1;
}

export type BrewFigureAdjustmentLayout = {
    columns: 1 | 2;
    columnWidth: number;
    rows: number;
};

/** The adjustment row wraps to one column when a badge needs it. */
export function brewFigureAdjustmentLayout(
    contentWidth: number,
    fontScale: number,
    badges: string[],
    scale = 1
): BrewFigureAdjustmentLayout {
    const columns = brewFigureAdjustmentColumns(contentWidth, fontScale, badges, scale);
    if (columns === 1) {
        return {
            columns,
            columnWidth: Math.max(0, contentWidth),
            rows:        badges.length
        };
    }
    const geometry = brewFigureTextGeometry(scale);
    return {
        columns,
        columnWidth: Math.max(
            0,
            (
                contentWidth
                - geometry.columnGap * (columns - 1)
            ) / columns
        ),
        rows: Math.ceil(badges.length / columns)
    };
}

/** The adjustment row wraps to one column when a badge needs it. */
export function brewFigureAdjustmentColumnWidth(
    contentWidth: number,
    fontScale: number,
    badges: string[],
    scale = 1
): number {
    return brewFigureAdjustmentLayout(contentWidth, fontScale, badges, scale).columnWidth;
}
