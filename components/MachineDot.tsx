import React, {useEffect} from "react";
import {Pressable, StyleSheet} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming
} from "react-native-reanimated";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import type {LinkStatus} from "@/hooks/useMachine";

type Props = {
    status: LinkStatus;
    /** Drives the desaturation. The header owns the threshold. */
    collapsed: boolean;
    /**
     * The tank is low on a machine that has no tap to draw from.
     *
     * Blinks amber a couple of times and then leaves the dot as it found it.
     * It is deliberately not a resting colour: nothing is wrong with the link,
     * which is the only thing this dot reports, and a machine parked on amber
     * would be saying the connection is in trouble when it is not. A low tank
     * is worth one glance at the moment it becomes knowable, which is when the
     * machine first answers, and the panel below carries the details from then
     * on.
     *
     * A plumbed machine never raises it: there is no tank to fill.
     */
    alarm?: boolean;
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
    idle:         "Machine not connected",
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
    idle:         {icon: "link-off",  lit: palette.muted,   dim: null},
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
/** How many amber flashes. Two, then it settles: enough to catch, not a strobe. */
const ALARM_FLASHES = 2;

export default function MachineDot({status, collapsed, alarm = false, onPress}: Props) {
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

    /**
     * The amber copy's opacity.
     *
     * A third copy cross-faded over the other two, for the reason the other two
     * exist: `DotIcon` takes its colour as a prop and Reanimated drives styles,
     * not props.
     *
     * Under Reduced Motion it is shown once and taken away rather than flashed.
     * The warning is information, so suppressing it entirely would withhold
     * something; it is the repetition that is the motion, so that is what goes.
     */
    const alarmed = useSharedValue(0);

    useEffect(() => {
        if (!alarm) {
            alarmed.value = 0;
            return;
        }
        const on = withTiming(1, {duration: DURATION.fast, easing: EASING.out});
        const off = withTiming(0, {duration: DURATION.hold, easing: EASING.out});
        alarmed.value = reduced
            ? withSequence(on, withTiming(1, {duration: DURATION.deliberate}), off)
            : withRepeat(withSequence(on, off), ALARM_FLASHES, false);
    }, [alarm, reduced, alarmed]);

    const alarmStyle = useAnimatedStyle(() => ({opacity: alarmed.value}));

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
                style={fades ? [StyleSheet.absoluteFill, styles.cover, tintStyle] : tintStyle}
                pointerEvents="none">
                <DotIcon testID="machine-dot-lit" name={look.icon}
                         size={SIZE} color={look.lit}/>
            </Animated.View>
            {alarm && (
                <Animated.View
                    testID="machine-dot-alarm"
                    style={[StyleSheet.absoluteFill, styles.cover, alarmStyle]}
                    pointerEvents="none">
                    <DotIcon testID="machine-dot-alarm-icon" name={look.icon}
                             size={SIZE} color={palette.warn}/>
                </Animated.View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    /**
     * The lit copy floats over the dim one, so it has to be centred the way the
     * `Pressable` centres the dim copy in the touch target -- an overlay is not
     * laid out by its parent's rules.
     *
     * Given as an array with the animated style rather than spread into one
     * object: spreading a Reanimated style drops the static keys, which left
     * this view with nothing but its opacity and put the lit glyph in the flow
     * *below* the dim one instead of on top of it. Two indicators, one crooked.
     */
    cover: {alignItems: "center", justifyContent: "center"}
});
