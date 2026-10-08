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
    /**
     * The one the review caught. A scroll event is the only thing carrying
     * all three numbers, so a fade that waits for one shows nothing until
     * somebody has already scrolled, which is precisely the reader who did
     * not need telling. Layout has to be enough.
     */
    it("opens on layout alone, before anybody has scrolled", async () => {
        const {result} = await renderHook(() => useScrollFade());
        result.current.onLayout({
            nativeEvent: {layout: {height: 600, width: 390, x: 0, y: 0}}
        } as never);
        result.current.onContentSizeChange(390, 1400);
        expect(result.current.progress.value).toBe(1);
    });

    /**
     * And in the other order, because nothing guarantees which of the two
     * arrives first.
     */
    it("opens whichever measurement arrives first", async () => {
        const {result} = await renderHook(() => useScrollFade());
        result.current.onContentSizeChange(390, 1400);
        expect(result.current.progress.value).toBe(0);
        result.current.onLayout({
            nativeEvent: {layout: {height: 600, width: 390, x: 0, y: 0}}
        } as never);
        expect(result.current.progress.value).toBe(1);
    });

    /**
     * The summary grows as the brew finishes and the stage detail opens, so
     * a content height arriving after a scroll has to be taken against the
     * offset already reached rather than against zero.
     */
    it("keeps the scroll position when the content is re-measured", async () => {
        const {result} = await renderHook(() => useScrollFade());
        result.current.onScroll(scrollEvent(800, 600, 1400));
        expect(result.current.progress.value).toBe(0);
        result.current.onContentSizeChange(390, 2000);
        expect(result.current.progress.value).toBe(1);
    });

    it("follows a scroller that changes size", async () => {
        const {result} = await renderHook(() => useScrollFade());
        result.current.onScroll(scrollEvent(0, 600, 1400));
        result.current.onScroll(scrollEvent(0, 600, 600));
        expect(result.current.progress.value).toBe(0);
    });
});
