import {useRef} from "react";
import type {
    LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent
} from "react-native";
import {useSharedValue} from "react-native-reanimated";
import type {SharedValue} from "react-native-reanimated";

import {scrollFadeOpacity} from "@/library/scrollFade";

/**
 * Drives the bottom fade on a scroller whose content may overflow.
 *
 * The opacity lives in a shared value rather than in state on purpose. The
 * thing being faded over is the finished brew summary, which draws a trace, a
 * rate chart and a rung per stage; re-rendering it on every scroll frame to
 * move a gradient a few percent would be the most expensive way imaginable to
 * draw thirty-six points of nothing. A shared value moves the gradient on the
 * UI thread and the summary never renders again.
 *
 * There are three inputs, and a scroll event is the only thing that carries
 * all three. Waiting for one is too late: the fade exists to tell a reader
 * that the summary continues below, and a reader who has already scrolled has
 * worked that out for themselves. So the viewport and the content height are
 * taken as they are laid out, the offset is remembered between events, and
 * any one of the three arriving recomputes against the other two.
 *
 * They are kept in refs rather than in state for the same reason the opacity
 * is: a layout that re-rendered the summary would be a layout that caused
 * another layout.
 */
export default function useScrollFade(): {
    progress: SharedValue<number>;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: (event: LayoutChangeEvent) => void;
    onContentSizeChange: (width: number, height: number) => void;
} {
    const progress = useSharedValue(0);
    const offsetY = useRef(0);
    const viewportHeight = useRef(0);
    const contentHeight = useRef(0);

    function recompute() {
        progress.value = scrollFadeOpacity({
            offsetY: offsetY.current,
            viewportHeight: viewportHeight.current,
            contentHeight: contentHeight.current
        });
    }

    function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        const {contentOffset, layoutMeasurement, contentSize} = event.nativeEvent;
        offsetY.current = contentOffset.y;
        viewportHeight.current = layoutMeasurement.height;
        contentHeight.current = contentSize.height;
        recompute();
    }

    function onLayout(event: LayoutChangeEvent) {
        viewportHeight.current = event.nativeEvent.layout.height;
        recompute();
    }

    function onContentSizeChange(_width: number, height: number) {
        contentHeight.current = height;
        recompute();
    }

    return {progress, onScroll, onLayout, onContentSizeChange};
}
