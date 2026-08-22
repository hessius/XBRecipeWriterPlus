import React from "react";
import Animated, {FadeIn, FadeOut} from "react-native-reanimated";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import ScreenTitle, {TITLE_FONT_SIZE, TITLE_FONT_SIZE_COMPACT} from "@/components/ScreenTitle";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import {DURATION, useReducedMotion} from "@/constants/motion";

const ACTION_ICON_SIZE = 20;

/**
 * The smallest comfortable touch target, per the HIG. The glyphs are padded out
 * to this rather than given `hitSlop`, because hit slop on adjacent controls
 * overlaps into the gap between them and the later sibling wins — which here
 * would put "settings" under a tap aimed at "import".
 */
const TOUCH_TARGET = 44;
const ACTION_PADDING = (TOUCH_TARGET - ACTION_ICON_SIZE) / 2;

type ActionProps = {
    icon: DotIconName;
    label: string;
    onPress: () => void;
    active?: boolean;
};

function Action({icon, label, onPress, active = false}: ActionProps) {
    return (
        <XStack
            testID="home-header-action"
            accessible
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            padding={ACTION_PADDING}
            pressStyle={{opacity: 0.6}}>
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
    onToggleEdit,
    onScan,
    onImport,
    onSettings
}: Props) {
    const reduced = useReducedMotion();

    // Under Reduced Motion the two glyphs appear and disappear without the
    // travel, but they still fade — a user who disabled motion must still see
    // that the header changed rather than find two new controls with no
    // explanation.
    const entering = reduced ? FadeIn.duration(DURATION.fast) : FadeIn.duration(DURATION.base);
    const exiting = reduced ? FadeOut.duration(DURATION.fast) : FadeOut.duration(DURATION.fast);

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
                    time the list crossed the threshold. */}
                {collapsed && (
                    <Animated.View entering={entering} exiting={exiting}>
                        <XStack alignItems="center">
                            <Action icon="scan" label="Read a card" onPress={onScan}/>
                            <Action icon="import" label="Import a recipe" onPress={onImport}/>
                        </XStack>
                    </Animated.View>
                )}
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
