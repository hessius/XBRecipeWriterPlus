import React, {useEffect} from "react";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import ScreenTitle, {TITLE_FONT_SIZE, TITLE_FONT_SIZE_COMPACT} from "@/components/ScreenTitle";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";

const ACTION_ICON_SIZE = 20;

/**
 * The smallest comfortable touch target, per the HIG. The glyphs are padded out
 * to this rather than given `hitSlop`, because hit slop on adjacent controls
 * overlaps into the gap between them and the later sibling wins — which here
 * would put "settings" under a tap aimed at "import".
 */
const TOUCH_TARGET = 44;
const ACTION_PADDING = (TOUCH_TARGET - ACTION_ICON_SIZE) / 2;

/**
 * The width the two arriving glyphs occupy once they have landed.
 *
 * It is stated rather than measured because the animation has to know the
 * target before the glyphs have anywhere to be measured in: they start at zero
 * width, so an `onLayout` would report zero and the slide would never leave.
 * Each glyph is exactly one touch target wide by construction above.
 */
const SLIDE_WIDTH = TOUCH_TARGET * 2;

type ActionProps = {
    icon: DotIconName;
    label: string;
    onPress: () => void;
    active?: boolean;
    disabled?: boolean;
};

function Action({icon, label, onPress, active = false, disabled = false}: ActionProps) {
    return (
        <XStack
            testID="home-header-action"
            accessible
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{disabled}}
            onPress={disabled ? undefined : onPress}
            padding={ACTION_PADDING}
            opacity={disabled ? 0.4 : 1}
            pressStyle={disabled ? undefined : {opacity: 0.6}}>
            <DotIcon name={icon} size={ACTION_ICON_SIZE}
                     color={active ? palette.success : palette.dim}/>
        </XStack>
    );
}

type Props = {
    count: number;
    /** Whether the list has scrolled far enough for the tiles to have gone. */
    collapsed: boolean;
    /** Whether the cards are currently showing their destructive actions. */
    editing: boolean;
    /** False when the library is empty: there is nothing to edit. */
    showEdit: boolean;
    /** False until sub-project 5 gives import a way to be handed a recipe. */
    canImport?: boolean;
    onToggleEdit: () => void;
    onScan: () => void;
    onImport: () => void;
    onSettings: () => void;
};

/**
 * The home screen's header, in both of its two states.
 *
 * Collapsed, it takes in the two primary actions that were CTA tiles a moment
 * ago and shrinks the title to make room. Expanded, it deliberately does not
 * show them: the tiles below are those actions, and showing both would be two
 * affordances for one job.
 *
 * Settings and the edit toggle are present in both states. No action is ever
 * only reachable in one of them — that is what allows the collapse to be this
 * aggressive.
 */
export default function HomeHeader({
    count,
    collapsed,
    editing,
    showEdit,
    canImport = true,
    onToggleEdit,
    onScan,
    onImport,
    onSettings
}: Props) {
    const reduced = useReducedMotion();

    // Two values, not one. Under Reduced Motion the glyphs must still fade, so
    // the user sees that the header changed — but they must not travel, so the
    // width is set outright. Driving both from a single progress value would
    // make one of the two behaviours impossible to express.
    const travel = useSharedValue(collapsed ? 1 : 0);
    const fade = useSharedValue(collapsed ? 1 : 0);

    useEffect(() => {
        const target = collapsed ? 1 : 0;
        travel.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
        fade.value = withTiming(target, {
            duration: reduced ? DURATION.fast : DURATION.base,
            easing:   EASING.out
        });
    }, [collapsed, reduced, travel, fade]);

    const slide = useAnimatedStyle(() => ({
        width:   travel.value * SLIDE_WIDTH,
        opacity: fade.value
    }));

    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$2"
                paddingHorizontal="$3" paddingVertical="$2">
            <ScreenTitle title="Recipes" count={count}
                         fontSize={collapsed ? TITLE_FONT_SIZE_COMPACT : TITLE_FONT_SIZE}/>

            <XStack alignItems="center">
                {/* The arriving glyphs go at the left edge of the group. The
                    group is right-aligned, so it grows leftwards and edit and
                    settings stay exactly where the user last saw them —
                    inserting in the middle would slide them sideways every
                    time the list crossed the threshold.

                    They stay mounted at zero width rather than being added and
                    removed, so the width is something that can be animated;
                    mounting them made the slot appear in one frame, and no
                    amount of fading hid that. Zero width is only a visual
                    absence, so they are also taken out of the accessibility
                    tree and made untappable while parked. */}
                <Animated.View testID="home-header-slide"
                               style={[slide, {overflow: "hidden"}]}
                               pointerEvents={collapsed ? "auto" : "none"}
                               accessibilityElementsHidden={!collapsed}
                               importantForAccessibility={
                                   collapsed ? "auto" : "no-hide-descendants"
                               }>
                    <XStack alignItems="center" width={SLIDE_WIDTH}>
                        <Action icon="scan" label="Read a card" onPress={onScan}/>
                        <Action icon="import" label="Import a recipe"
                                disabled={!canImport} onPress={onImport}/>
                    </XStack>
                </Animated.View>
                {showEdit && (
                    <Action icon="edit" active={editing}
                            label={editing ? "Done editing" : "Edit recipes"}
                            onPress={onToggleEdit}/>
                )}
                <Action icon="settings" label="Settings" onPress={onSettings}/>
            </XStack>
        </XStack>
    );
}
