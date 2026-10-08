import {FADE_RAMP, scrollFadeOpacity} from "@/library/scrollFade";

describe("the scroller's bottom fade", () => {
    /**
     * The fade exists to say "there is more below", so the one thing it must
     * never do is say that when there is not. A summary short enough to fit
     * draws no fade at all, however the scroller reports itself.
     */
    it("draws nothing when the content fits", () => {
        expect(scrollFadeOpacity({
            offsetY: 0, viewportHeight: 600, contentHeight: 600
        })).toBe(0);
        expect(scrollFadeOpacity({
            offsetY: 0, viewportHeight: 600, contentHeight: 420
        })).toBe(0);
    });

    /**
     * A content height a fraction of a point over the viewport is a rounding
     * artefact, not a stage hiding below the edge. Fading for it would put a
     * permanent gradient on a summary that never scrolls.
     */
    it("ignores a sub-point overflow", () => {
        expect(scrollFadeOpacity({
            offsetY: 0, viewportHeight: 600, contentHeight: 600.4
        })).toBe(0);
    });

    it("draws fully when there is a screen of content below", () => {
        expect(scrollFadeOpacity({
            offsetY: 0, viewportHeight: 600, contentHeight: 1400
        })).toBe(1);
    });

    /**
     * It clears rather than switching off, so arriving at the end is a fade
     * and not a flicker.
     */
    it("ramps out over the last stretch", () => {
        const half = scrollFadeOpacity({
            offsetY: 800 - FADE_RAMP / 2, viewportHeight: 600, contentHeight: 1400
        });
        expect(half).toBeCloseTo(0.5, 5);
    });

    it("is gone at the end", () => {
        expect(scrollFadeOpacity({
            offsetY: 800, viewportHeight: 600, contentHeight: 1400
        })).toBe(0);
    });

    /**
     * Both platforms can report a scroll position outside the content: iOS
     * bounces past the end and past the top, and Android's overscroll glow
     * can land a frame the same way. Neither is a reason to draw a negative
     * or a greater-than-one opacity into the renderer.
     */
    it("survives an overscroll at either end", () => {
        expect(scrollFadeOpacity({
            offsetY: 900, viewportHeight: 600, contentHeight: 1400
        })).toBe(0);
        expect(scrollFadeOpacity({
            offsetY: -60, viewportHeight: 600, contentHeight: 1400
        })).toBe(1);
    });

    /**
     * A scroller that has not been measured yet reports zeroes. That is "we
     * do not know", and the honest answer is to draw nothing until it does.
     */
    it("draws nothing before the scroller has been measured", () => {
        expect(scrollFadeOpacity({
            offsetY: 0, viewportHeight: 0, contentHeight: 0
        })).toBe(0);
    });

    /**
     * The two measurements arrive separately and in no guaranteed order, so a
     * content height can turn up while the viewport is still zero. Measured
     * against nothing, any content overflows, and the fade would open fully
     * on a summary that goes on to fit.
     */
    it("draws nothing for content measured against an unknown viewport", () => {
        expect(scrollFadeOpacity({
            offsetY: 0, viewportHeight: 0, contentHeight: 1400
        })).toBe(0);
    });
});
