/**
 * How much of the scroller's bottom fade to draw.
 *
 * The finished brew pins its judgement and export actions below the summary,
 * outside the scroller, so they are never scrolled away. The cost of that is
 * that the summary ends at a hard border and a long stage list carries on
 * below it with nothing saying so. The fade is what says so.
 *
 * It is a pure function of three numbers rather than a piece of the component
 * because the interesting cases are all arithmetic: content that does not
 * overflow, content that overflows by a rounding error, and a scroll position
 * outside the content at either end. None of those need a renderer to check,
 * and the one rule worth protecting is the first: a fade over a summary that
 * cannot scroll is a decoration claiming to be information.
 */

/** How tall the gradient draws, in points. */
export const FADE_HEIGHT = 36;

/**
 * The remaining scroll, in points, over which the fade clears. Short enough
 * that it is gone by the time the last line is readable, long enough that
 * arriving at the end reads as a fade rather than a switch.
 */
export const FADE_RAMP = 48;

/**
 * Below this, an overflow is a sub-point layout artefact rather than content.
 * A scroller whose content measures a third of a point taller than its
 * viewport is not hiding anything.
 */
const OVERFLOW_FLOOR = 1;

export type ScrollFadeMetrics = {
    offsetY: number;
    viewportHeight: number;
    contentHeight: number;
};

export function scrollFadeOpacity(metrics: ScrollFadeMetrics): number {
    const {offsetY, viewportHeight, contentHeight} = metrics;

    // An unmeasured viewport is "we do not know yet", and the two arrive
    // separately: a content height can land before the scroller has reported
    // its own size. Measured against a viewport of zero, any content at all
    // overflows, and the fade would open fully on a summary that turns out to
    // fit.
    if (viewportHeight <= 0) return 0;

    const overflow = contentHeight - viewportHeight;
    if (!(overflow > OVERFLOW_FLOOR)) return 0;

    const remaining = overflow - offsetY;
    if (remaining <= 0) return 0;
    if (remaining >= FADE_RAMP) return 1;
    return remaining / FADE_RAMP;
}
