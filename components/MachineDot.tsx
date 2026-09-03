import React from "react";
import {Pressable, View} from "react-native";

import {palette} from "@/constants/colors";
import type {LinkStatus} from "@/hooks/useMachine";

type Props = {
    status: LinkStatus;
    accent: string;
    onPress: () => void;
};

const SIZE = 9;
/** The HIG's smallest comfortable target, as in HomeHeader. */
const TOUCH_TARGET = 44;

const LABELS: Record<LinkStatus, string> = {
    connected:    "Machine connected",
    connecting:   "Machine connecting",
    disconnected: "Machine not in range",
    failed:       "Machine not in range"
};

/**
 * Nine pixels of presence, left of the settings gear.
 *
 * Padded out to a full touch target rather than given `hitSlop`, for the reason
 * `HomeHeader` states: hit slop on adjacent controls overlaps into the gap
 * between them and the later sibling wins, which here would put the gear under
 * a tap aimed at the dot.
 */
export default function MachineDot({status, accent, onPress}: Props) {
    const connected = status === "connected";
    const colour = connected || status === "connecting" ? accent : palette.muted;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={LABELS[status]}
            onPress={onPress}
            style={{
                width:           TOUCH_TARGET,
                height:          TOUCH_TARGET,
                alignItems:      "center",
                justifyContent:  "center"
            }}
        >
            {connected && (
                <View
                    testID="machine-dot-ring"
                    style={{
                        position:     "absolute",
                        width:        SIZE * 2.2,
                        height:       SIZE * 2.2,
                        borderRadius: SIZE * 1.1,
                        borderWidth:  1,
                        borderColor:  accent,
                        opacity:      0.25
                    }}
                />
            )}
            <View
                testID="machine-dot"
                style={{
                    width:           SIZE,
                    height:          SIZE,
                    borderRadius:    SIZE / 2,
                    backgroundColor: colour,
                    opacity:         status === "connecting" ? 0.5 : 1
                }}
            />
        </Pressable>
    );
}
