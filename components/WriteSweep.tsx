import React, {useEffect} from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from "react-native-reanimated";

import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

export type BlockState = "written" | "active" | "pending";

/** What a given block index is doing, given how many blocks are committed. */
export function blockState(index: number, blocksWritten: number): BlockState {
    if (index < blocksWritten) {
        return "written";
    }
    return index === blocksWritten ? "active" : "pending";
}

const COLOURS: Record<BlockState, string> = {
    written: palette.success,
    active:  palette.text,
    pending: palette.line
};

type CellProps = {
    state: BlockState;
    reduced: boolean;
};

function SweepBlock({state, reduced}: CellProps) {
    const fade = useSharedValue(state === "pending" ? 0.4 : 1);

    useEffect(() => {
        const target = state === "pending" ? 0.4 : 1;
        fade.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.fast, easing: EASING.out});
    }, [state, reduced, fade]);

    const animatedStyle = useAnimatedStyle(() => ({opacity: fade.value}));

    return (
        <Animated.View
            testID="write-sweep-block"
            style={[
                {
                    flex:            1,
                    height:          10,
                    borderRadius:    2,
                    marginHorizontal: 1,
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
    const reduced = useReducedMotion();
    if (totalBlocks <= 0) {
        return null;
    }

    const written = Math.min(Math.max(blocksWritten, 0), totalBlocks);

    return (
        <View
            testID="write-sweep"
            accessibilityRole="progressbar"
            accessibilityValue={{min: 0, max: totalBlocks, now: written}}
            style={{flexDirection: "row", alignItems: "center"}}>
            {Array.from({length: totalBlocks}, (_, index) => (
                <SweepBlock key={index} state={blockState(index, written)}
                            reduced={reduced}/>
            ))}
        </View>
    );
}
