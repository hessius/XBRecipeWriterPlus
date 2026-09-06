import React from "react";
import {Pressable} from "react-native";
import Animated, {FadeIn, SlideOutDown} from "react-native-reanimated";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {XStack, YStack} from "tamagui";

import BrewTrace from "@/components/BrewTrace";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {MINI_FAILURE_WHY, OVER} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {DURATION} from "@/constants/motion";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {plannedSeconds} from "@/library/brew/brewShape";
import type {BrewPhase} from "@/library/machine/Machine";
import type Pour from "@/library/Pour";

type Props = {
    recipeName: string;
    dose: number;
    pours: Pour[];
    samples: BrewSample[];
    accent: string;
    phase: BrewPhase;
    elapsed: number;
    holding: boolean;
    heldSeconds: number;
    onOpen: () => void;
    onDismiss: () => void;
};

const TRACE_WIDTH = 86;
const TRACE_HEIGHT = 34;

/**
 * The bar's own padding, as a number rather than `$2.5`.
 *
 * The bottom edge adds the safe-area inset to it, and a token cannot be added
 * to. `$2.5` interpolates to 10 between `$2` (7) and `$3` (13); this is that
 * value, stated so the four sides stay equal above the inset.
 */
const BAR_PADDING = 10;

/** `1:42`, floored — matches the brew screen clock. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The two lines of words, and the colour the live line takes. */
function say(props: Props): {title: string; detail: string; line: string} {
    const {phase, recipeName, dose, elapsed, holding, heldSeconds, samples} = props;
    const upper = recipeName.toUpperCase();

    // A refusal before anything was sent is not a stopped brew. Nothing went
    // out, no dose was spent, and the recorder deliberately writes no row — so
    // this must not say the brew was kept, and it must not be red.
    if (phase.name === "failed" && phase.reason === "blocked") {
        return {
            title: "Did not start",
            detail: "NOTHING WAS SENT · TAP TO SEE WHY",
            line: palette.warn
        };
    }

    if (phase.name === "failed" || phase.name === "cancelled" ||
        phase.name === "lostContact") {
        const why = phase.name === "cancelled"
            ? "you stopped it"
            : phase.name === "lostContact"
                ? "lost contact"
                : (MINI_FAILURE_WHY[phase.reason] ?? "the machine stopped");
        return {
            title: `Stopped: ${why}`,
            detail: "KEPT IN YOUR BREW HISTORY",
            line: palette.danger
        };
    }

    if (phase.name === "done") {
        const cup = Math.round(samples[samples.length - 1]?.cup ?? 0);
        return {
            title: "Ready",
            detail: `${cup} G · ${clock(elapsed)} · TAP TO SEE IT`,
            line: palette.success
        };
    }

    if (holding) {
        return {
            title: "Waiting for the cup",
            detail: `+${Math.round(heldSeconds)} S · CARRIES ON BY ITSELF`,
            line: palette.warn
        };
    }

    if (phase.name === "pouring") {
        return {
            title: recipeName,
            detail: `POUR ${phase.pour} OF ${phase.pours} · ${clock(elapsed)}`,
            line: props.accent
        };
    }

    // Settling: the last pour is done but coffee is still draining onto the
    // scale. A phase *after* the pours, so it must not fall through to the
    // grinding default below and flip the bar back to "Grinding" while the
    // trace beside it is visibly still drawing.
    if (phase.name === "settling") {
        const cup = Math.round(samples[samples.length - 1]?.cup ?? 0);
        return {
            title: "Draining",
            detail: `${cup} G · ${clock(elapsed)} · ALMOST THERE`,
            line: props.accent
        };
    }

    // Grinding, and every phase before the first pour.
    return {title: "Grinding", detail: `${upper} · ${dose} G`, line: props.accent};
}

/**
 * The brew in miniature, along the bottom of the library.
 *
 * The trace at 86×34 — the same plan, live line and trailing cup — with a
 * status line beside it. Tapping it reopens the brew sheet. Done and stopped
 * states persist and show a dismiss control, because the finished trace is the
 * record and the bar is the way into it.
 */
export default function BrewMiniBar(props: Props) {
    const {pours, samples, phase, holding, onOpen, onDismiss} = props;
    const {title, detail, line} = say(props);
    const over = OVER.has(phase.name);
    const insets = useSafeAreaInsets();

    return (
        <Animated.View
            entering={FadeIn.duration(DURATION.base)}
            exiting={SlideOutDown.duration(DURATION.base)}
        >
            <XStack
                testID="mini-bar"
                alignItems="center"
                gap="$3"
                padding={BAR_PADDING}
                // The bar is mounted beside the navigator rather than inside a
                // screen, so it sits on the very edge of the display and the
                // corner radius clips it: the close control came out half
                // visible and the trace was cut. Only the bottom needs it --
                // the sides and top are nowhere near a corner.
                paddingBottom={insets.bottom + BAR_PADDING}
                backgroundColor={palette.surface}
                borderTopWidth={1}
                borderTopColor={palette.line}
            >
                {/* The whole bar is the tap target, which is why there is no
                    chevron: two affordances nine points apart compete, and the
                    chevron did nothing the bar did not already do. */}
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open the brew"
                    onPress={onOpen}
                    style={{flexDirection: "row", alignItems: "center", flex: 1, gap: 12}}
                >
                    <BrewTrace
                        pours={pours}
                        samples={samples}
                        accent={line}
                        width={TRACE_WIDTH}
                        height={TRACE_HEIGHT}
                        plannedSeconds={plannedSeconds(pours)}
                        holding={holding}
                        compact
                    />
                    <YStack flex={1} gap="$1">
                        <DotMatrixText fontSize={12} weight="bold" color={palette.text}>
                            {title}
                        </DotMatrixText>
                        <DotMatrixText
                            fontSize={10}
                            weight="bold"
                            letterSpacing={1.4}
                            color={palette.dim}
                        >
                            {detail}
                        </DotMatrixText>
                    </YStack>
                </Pressable>
                {/* Dismiss is only offered once the brew is over: offering it during
                    a brew would suggest it could stop the brew. */}
                {over && (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss"
                        hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                        onPress={onDismiss}
                    >
                        <DotIcon name="close" size={14} color={palette.dim} />
                    </Pressable>
                )}
            </XStack>
        </Animated.View>
    );
}
