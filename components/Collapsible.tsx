import React, {useEffect, useState} from "react";
import {View} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";

import {DURATION, EASING, useReducedMotion} from "@/constants/motion";

/**
 * The row's style at a given point in the transition.
 *
 * Exported so the arithmetic can be tested directly: an animated style is
 * evaluated on the UI thread and a test can only read the value it was given at
 * mount, which is never the interesting one.
 */
export function rowStyle(progress: number, contentHeight: number | null) {
    "worklet";
    if (contentHeight === null) {
        return {opacity: progress};
    }
    return {height: progress * contentHeight, opacity: progress};
}

/**
 * The height to remember after a layout pass.
 *
 * A closed row is clipped to nothing, and a layout pass in that state reports
 * exactly that. Believing it is how the row came to have nothing to reopen to:
 * the content was measured at zero the moment it was hidden and stayed that way.
 * Only a row that is actually showing its content can say how tall it is.
 */
export function nextHeight(
    current: number | null,
    measured: number,
    open: boolean
): number | null {
    if (!open || measured <= 0) {
        return current;
    }
    return measured;
}

type Props = {
    /** Whether the children are shown. */
    open: boolean;
    children: React.ReactNode;
};

/**
 * Shows and hides its children by animating their height.
 *
 * Mounting and unmounting was tried first and cannot be made to animate: an
 * exit animation runs on a subtree that has already left layout, so whatever
 * sits below snaps up into the space in one frame regardless of how the
 * departing view fades. Here the children stay mounted and the row's height is
 * the thing that changes, which is what the rest of the screen actually
 * responds to.
 *
 * The height is measured rather than declared. The content is dot-matrix text
 * and icons that grow with the OS text size, so any number written here would
 * be wrong for exactly the users who most need it to be right.
 */
export default function Collapsible({open, children}: Props) {
    const reduced = useReducedMotion();
    const [contentHeight, setContentHeight] = useState<number | null>(null);
    const progress = useSharedValue(open ? 1 : 0);

    // The measurement is mirrored onto a shared value rather than read from
    // state inside the worklet. An animated style is re-evaluated when a shared
    // value it reads changes; a plain number captured in its closure is not a
    // signal the UI thread can be woken by, declared dependency or not. The
    // effect is the one place the compiler allows a shared value to be written.
    const height = useSharedValue<number | null>(null);

    useEffect(() => {
        height.value = contentHeight;
    }, [contentHeight, height]);

    useEffect(() => {
        const target = open ? 1 : 0;
        progress.value = reduced
            ? withTiming(target, {duration: DURATION.fast})
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
    }, [open, reduced, progress]);

    // Before the first layout pass there is no height to animate to, so the row
    // takes its natural one. Assuming zero would collapse it on the first frame
    // and then have it spring open.
    const style = useAnimatedStyle(() => rowStyle(progress.value, height.value));

    return (
        <Animated.View
            testID="collapsible"
            style={[style, {overflow: "hidden"}]}
            pointerEvents={open ? "auto" : "none"}
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? "auto" : "no-hide-descendants"}>
            {/* The child measures itself freely: its own height is independent
                of the fixed, animating height of the clipping parent above it. */}
            <View testID="collapsible-content"
                  onLayout={(event) => {
                      // `nextHeight` returns the current value unchanged when
                      // there is nothing to learn, which is most passes: layout
                      // fires whenever the row moves, and re-rendering the
                      // screen to store the same number would be wasted work.
                      const measured = event.nativeEvent.layout.height;
                      setContentHeight((current) => nextHeight(current, measured, open));
                  }}>
                {children}
            </View>
        </Animated.View>
    );
}
