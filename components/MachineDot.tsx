import React, {useEffect} from "react";
import {Pressable, StyleSheet} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import type {LinkStatus} from "@/hooks/useMachine";

type Props = {
    status: LinkStatus;
    /** Drives the desaturation. The header owns the threshold. */
    collapsed: boolean;
    onPress: () => void;
};

/**
 * The same size as the glyphs beside it.
 *
 * It used to be 9, a deliberately smaller circle meant to read as ambient. That
 * was the wrong lever: it made the one non-glyph in a row of glyphs also the
 * one odd size. Insistence is handled by colour and by the shape's own weight
 * now, so the size can simply match its neighbours.
 */
const SIZE = 20;
/** The HIG's smallest comfortable target, as in HomeHeader. */
const TOUCH_TARGET = 44;

const LABELS: Record<LinkStatus, string> = {
    connected:    "Machine connected",
    connecting:   "Machine connecting",
    disconnected: "Machine not in range",
    failed:       "Machine not in range"
};

/**
 * What each state looks like.
 *
 * `dim` is null where the colour is already grey: cross-fading `muted` to
 * `muted` is a pixel-identical overdraw on every frame of every scroll.
 */
const LOOKS: Record<LinkStatus, {icon: DotIconName; lit: string; dim: string | null}> = {
    connected:    {icon: "link-on",   lit: palette.success, dim: palette.successMuted},
    connecting:   {icon: "link-wait", lit: palette.warn,    dim: palette.warnMuted},
    disconnected: {icon: "link-off",  lit: palette.muted,   dim: null},
    failed:       {icon: "link-off",  lit: palette.muted,   dim: null}
};

/**
 * The machine link, left of the settings glyph.
 *
 * A diamond at three sizes rather than a dot at three colours. The state has to
 * survive being desaturated when the header collapses, and a state carried by
 * hue alone does not: desaturating it would delete the only thing it said. With
 * the shape carrying the ranking, the colour is free to step back.
 *
 * Drawn twice and cross-faded rather than animating one colour, for the reason
 * `HomeTitle` gives about the wordmark: `DotIcon` takes its colour as a prop,
 * and Reanimated drives styles, not props.
 *
 * Padded out to a full touch target rather than given `hitSlop`, for the reason
 * `HomeHeader` states: hit slop on adjacent controls overlaps into the gap
 * between them and the later sibling wins, which here would put the settings
 * glyph under a tap aimed at the dot.
 */
export default function MachineDot({status, collapsed, onPress}: Props) {
    const reduced = useReducedMotion();
    const look = LOOKS[status];

    /**
     * 1 is fully saturated. Collapsing carries it to 0, revealing the dim copy.
     *
     * Pinned at 1 when there is no dim copy. Fading the only drawn glyph out
     * would not desaturate it, it would delete it — the desaturation is the
     * *other* copy showing through, not this one going away.
     */
    const fades = look.dim !== null;
    const tint = useSharedValue(fades && collapsed ? 0 : 1);

    useEffect(() => {
        const target = fades && collapsed ? 0 : 1;
        tint.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
    }, [collapsed, fades, reduced, tint]);

    const tintStyle = useAnimatedStyle(() => ({opacity: tint.value}));

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={LABELS[status]}
            onPress={onPress}
            style={{
                width:          TOUCH_TARGET,
                height:         TOUCH_TARGET,
                alignItems:     "center",
                justifyContent: "center"
            }}
        >
            {fades && (
                <DotIcon testID="machine-dot-dim" name={look.icon}
                         size={SIZE} color={look.dim ?? look.lit}/>
            )}
            <Animated.View
                testID="machine-dot-tint"
                style={fades ? {...StyleSheet.flatten(StyleSheet.absoluteFill), ...tintStyle} : tintStyle}
                pointerEvents="none">
                <DotIcon testID="machine-dot-lit" name={look.icon}
                         size={SIZE} color={look.lit}/>
            </Animated.View>
        </Pressable>
    );
}
