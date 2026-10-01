/**
 * A static "comet tail" for story-card chart strokes.
 *
 * The axis is in user-space x units so stacked charts with the same plot width
 * and maxT make the same moment equally faint. The floor stays above zero:
 * a fully transparent start reads as a broken path rather than history.
 */
export const TIME_FLOW_TAIL_OPACITY = 0.26;
export const TIME_FLOW_HEAD_OPACITY = 1;

export function timeFlowGradient(width: number) {
    return {
        gradientUnits: "userSpaceOnUse" as const,
        x1: 0,
        y1: 0,
        x2: width,
        y2: 0,
        start: {
            offset: "0",
            opacity: TIME_FLOW_TAIL_OPACITY
        },
        end: {
            offset: "1",
            opacity: TIME_FLOW_HEAD_OPACITY
        }
    };
}
