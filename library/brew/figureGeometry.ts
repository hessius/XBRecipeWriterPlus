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
