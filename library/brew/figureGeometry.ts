export const BREW_FIGURE_LABEL_SIZE = 10;
export const BREW_FIGURE_VALUE_SIZE = 28;
export const BREW_FIGURE_DETAIL_VALUE_SIZE = 20;
export const BREW_FIGURE_INTERNAL_GAP = 2;
export const BREW_FIGURE_ROW_GAP = 4;
export const BREW_FIGURE_COLUMN_GAP = 13;
export const BREW_FIGURE_VALUE_TRACKING = 0.5;
export const BREW_FIGURE_LABEL_TRACKING = 1.6;

export type BrewFigureTextGeometry = {
    labelSize: number;
    valueSize: number;
    detailValueSize: number;
    labelTracking: number;
    valueTracking: number;
    columnGap: number;
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
