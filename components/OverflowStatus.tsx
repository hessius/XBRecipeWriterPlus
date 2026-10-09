import React, {useEffect, useRef} from "react";
import {AccessibilityInfo, Platform} from "react-native";
import {Text, YStack} from "tamagui";

import {
    OVERFLOW_ESTIMATE_NOTE, OVERFLOW_ESTIMATE_UNAVAILABLE, OVERFLOW_FOREGROUND_CAUTION,
    OVERFLOW_STATE_COPY, OVERFLOW_WAITING_FOR_READINGS, overflowCountdownText,
    overflowEstimateLine, overflowGramsText
} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import type {OverflowSnapshot} from "@/library/brew/OverflowController";

type Props = {
    status: OverflowSnapshot;
    /** Epoch milliseconds, from the run's owner. Only the countdown reads it. */
    now: number;
    compact?: boolean;
};

function stateLine(status: OverflowSnapshot): string {
    switch (status.mode) {
        case "armed":      return OVERFLOW_STATE_COPY.armed;
        case "requesting": return OVERFLOW_STATE_COPY.requesting;
        case "holding":    return OVERFLOW_STATE_COPY.holding;
        case "resuming":   return OVERFLOW_STATE_COPY.resuming;
        case "disabled":   return OVERFLOW_STATE_COPY[status.disabledReason ?? "manualOverride"];
        case "error":      return status.error ?? OVERFLOW_STATE_COPY.error;
        case "ended":      return "";
    }
}

function estimate(status: OverflowSnapshot): string {
    return status.telemetryAvailable && status.retainedGrams !== null
        ? overflowGramsText(status.retainedGrams)
        : OVERFLOW_ESTIMATE_UNAVAILABLE;
}

function figuresLine(status: OverflowSnapshot, now: number): string | null {
    if (status.mode === "armed") return overflowEstimateLine(estimate(status), false);
    if (status.mode !== "holding") return null;
    const parts: string[] = [];
    if (status.telemetryAvailable && status.retainedGrams !== null) {
        parts.push(overflowEstimateLine(estimate(status), true));
    } else {
        parts.push(OVERFLOW_WAITING_FOR_READINGS);
    }
    if (status.nextCheckAt !== null) {
        parts.push(overflowCountdownText(Math.max(0, Math.ceil((status.nextCheckAt - now) / 1000))));
    }
    return parts.join(" ");
}

/**
 * What custom overflow protection is doing, for the live brew.
 *
 * Two kinds of text, kept apart on purpose. The state line is stable per state
 * and is the only Android live region. iOS queues an announcement when that text
 * changes, not on mount. The gram figure and the countdown move every few hundred
 * milliseconds and are deliberately not announced.
 */
export default function OverflowStatus({status, now, compact}: Props) {
    const stateText = stateLine(status);
    const previousStateText = useRef(stateText);
    useEffect(() => {
        const changed = previousStateText.current !== stateText;
        previousStateText.current = stateText;
        if (Platform.OS === "ios" && changed && stateText) {
            AccessibilityInfo.announceForAccessibilityWithOptions(stateText, {queue: true});
        }
    }, [stateText]);

    if (status.mode === "ended") return null;

    const failed = status.mode === "error";
    const stopped = status.mode === "disabled";
    const color = failed ? palette.danger : stopped ? palette.warn : palette.text;
    const figures = figuresLine(status, now);
    // Every state in which the protection is still in force keeps the caution.
    const active = status.mode === "armed" || status.mode === "requesting"
        || status.mode === "holding" || status.mode === "resuming";

    return (
        <YStack testID="overflow-status" gap="$1">
            <Text testID="overflow-status-state" accessibilityLiveRegion="polite"
                  fontSize={13} lineHeight={18} color={color}>
                {stateText}
            </Text>
            {!compact && figures !== null && (
                <Text testID="overflow-status-figures" fontSize={13} lineHeight={18}
                      color={palette.dim}>
                    {figures}
                </Text>
            )}
            {!compact && active && (
                <>
                    <Text fontSize={12} lineHeight={17} color={palette.dim}>
                        {OVERFLOW_FOREGROUND_CAUTION}
                    </Text>
                    <Text fontSize={12} lineHeight={17} color={palette.dim}>
                        {OVERFLOW_ESTIMATE_NOTE}
                    </Text>
                </>
            )}
        </YStack>
    );
}
