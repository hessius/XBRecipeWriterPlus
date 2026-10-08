import {renderHook} from "@testing-library/react-native";

import useScrollFade from "@/hooks/useScrollFade";

function scrollEvent(offsetY: number, viewportHeight: number, contentHeight: number) {
    return {
        nativeEvent: {
            contentOffset: {x: 0, y: offsetY},
            layoutMeasurement: {width: 390, height: viewportHeight},
            contentSize: {width: 390, height: contentHeight}
        }
    } as never;
}

describe("useScrollFade", () => {
    /**
     * The fade starts hidden. A scroller reports nothing until it has laid
     * out, and drawing a gradient over a summary nobody has measured yet is
     * the one failure the fade must not have: it would say "there is more"
     * on a brew that fits.
     */
    it("starts hidden", async () => {
        const {result} = await renderHook(() => useScrollFade());
        expect(result.current.progress.value).toBe(0);
    });

    it("opens when the content overflows", async () => {
        const {result} = await renderHook(() => useScrollFade());
        result.current.onScroll(scrollEvent(0, 600, 1400));
        expect(result.current.progress.value).toBe(1);
    });

    it("clears at the end of the content", async () => {
        const {result} = await renderHook(() => useScrollFade());
        result.current.onScroll(scrollEvent(0, 600, 1400));
        result.current.onScroll(scrollEvent(800, 600, 1400));
        expect(result.current.progress.value).toBe(0);
    });

    /**
     * The summary's height is not fixed: it grows with the stage count and
     * the screen re-measures as the brew finishes. So the handler has to read
     * the sizes out of each event rather than latching the first ones.
     */
    it("follows a scroller that changes size", async () => {
        const {result} = await renderHook(() => useScrollFade());
        result.current.onScroll(scrollEvent(0, 600, 1400));
        result.current.onScroll(scrollEvent(0, 600, 600));
        expect(result.current.progress.value).toBe(0);
    });
});
