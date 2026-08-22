import React, {useEffect} from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from "react-native-reanimated";

import {DURATION, EASING} from "@/constants/motion";
import {palette} from "@/constants/colors";

export type BlockState = "written" | "active" | "pending";

/**
 * How many blocks are honestly on the card, defended.
 *
 * A block count arrives from the write loop and can be lost: a reader that
 * reports no total yields `NaN`, and a division yields `Infinity`. Neither may
 * become "the card is written" — that is the one lie this component must not
 * tell. A fraction is a block still in flight, so it rounds *down*: a block is
 * written or it is not.
 */
export function clampBlocks(blocksWritten: number, totalBlocks: number): number {
    if (!Number.isFinite(blocksWritten)) {
        return 0;
    }
    return Math.min(Math.max(Math.floor(blocksWritten), 0), Math.max(totalBlocks, 0));
}

/** What a given block index is doing, given how many blocks are committed. */
export function blockState(index: number, blocksWritten: number): BlockState {
    // Defended here too: the export is reachable with a raw count, and a helper
    // that disagrees with the component it backs is worse than no helper.
    const written = Number.isFinite(blocksWritten)
        ? Math.max(Math.floor(blocksWritten), 0)
        : 0;
    if (index < written) {
        return "written";
    }
    return index === written ? "active" : "pending";
}

const COLOURS: Record<BlockState, string> = {
    written: palette.success,
    active:  palette.text,
    pending: palette.line
};

/**
 * The gap either side of a block.
 *
 * A recipe write covers 20–40 four-byte blocks, and the blocks share the width
 * that the gaps do not take: a fixed 1 pt margin is 20% of the pitch at 32
 * blocks and 25% at 40, so the strip gets gappier exactly as it gets denser.
 */
function blockMargin(totalBlocks: number): number {
    return totalBlocks > 24 ? 0.5 : 1;
}

type CellProps = {
    state: BlockState;
    margin: number;
};

function SweepBlock({state, margin}: CellProps) {
    const fade = useSharedValue(state === "pending" ? 0.4 : 1);

    useEffect(() => {
        // Not branched on Reduce Motion. This is an opacity change with no
        // spatial component, which is precisely the cross-fade the setting asks
        // animations to degrade *to* — snapping it would leave a Reduce Motion
        // user with no indication that a block had committed at all.
        fade.value = withTiming(state === "pending" ? 0.4 : 1, {
            duration: DURATION.fast,
            easing:   EASING.out
        });
    }, [state, fade]);

    const animatedStyle = useAnimatedStyle(() => ({opacity: fade.value}));

    return (
        <Animated.View
            testID="write-sweep-block"
            style={[
                {
                    flex:            1,
                    height:          10,
                    borderRadius:    2,
                    marginHorizontal: margin,
                    backgroundColor: COLOURS[state]
                },
                animatedStyle
            ]}
        />
    );
}

type Props = {
    /** Blocks actually committed to the card. Never a timer. */
    blocksWritten: number;
    totalBlocks: number;
};

/**
 * The write ceremony: a strip of blocks that light up as they are committed.
 *
 * Deliberately literal. The card is written block by block, so the progress
 * shown is the progress that happened.
 */
export default function WriteSweep({blocksWritten, totalBlocks}: Props) {
    // `NaN <= 0` is false, so a lost total would otherwise slip past this and
    // render an empty progressbar announcing `max: NaN`.
    if (!Number.isFinite(totalBlocks) || totalBlocks <= 0) {
        return null;
    }

    const written = clampBlocks(blocksWritten, totalBlocks);

    return (
        <View
            testID="write-sweep"
            accessibilityRole="progressbar"
            accessibilityValue={{min: 0, max: totalBlocks, now: written}}
            style={{flexDirection: "row", alignItems: "center"}}>
            {Array.from({length: Math.floor(totalBlocks)}, (_, index) => (
                <SweepBlock key={index} state={blockState(index, written)}
                            margin={blockMargin(totalBlocks)}/>
            ))}
        </View>
    );
}
