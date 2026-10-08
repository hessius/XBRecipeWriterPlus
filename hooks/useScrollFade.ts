import type {NativeScrollEvent, NativeSyntheticEvent} from "react-native";
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
 * The sizes are read out of each event rather than latched, because the
 * summary's height is not fixed: it grows with the stage count, and the screen
 * re-measures as a brew finishes.
 */
export default function useScrollFade(): {
    progress: SharedValue<number>;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
    const progress = useSharedValue(0);

    function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        const {contentOffset, layoutMeasurement, contentSize} = event.nativeEvent;
        progress.value = scrollFadeOpacity({
            offsetY: contentOffset.y,
            viewportHeight: layoutMeasurement.height,
            contentHeight: contentSize.height
        });
    }

    return {progress, onScroll};
}
