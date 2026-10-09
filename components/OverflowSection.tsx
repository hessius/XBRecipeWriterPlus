import React, {useState} from "react";
import {Pressable, TextInput} from "react-native";
import {Text, YStack} from "tamagui";

import FieldRow from "@/components/FieldRow";
import SegmentedRow from "@/components/SegmentedRow";
import {OVERFLOW_ESTIMATE_NOTE, OVERFLOW_FOREGROUND_CAUTION} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {OVERFLOW_INTERVALS, type OverflowInterval, type OverflowProtection} from "@/library/brew/overflowConfig";

const INTERVAL_OPTIONS = OVERFLOW_INTERVALS.map((seconds) => ({
    value: String(seconds), label: `${seconds} S`
}));
const INVALID_LIMIT = "Enter a whole number of grams above 0.";

type Props = {
    config?: OverflowProtection;
    onChange: (config?: OverflowProtection) => void;
};

/** A whole positive safe number of grams, or null. Nothing here guesses a limit. */
function parseLimit(text: string): number | null {
    if (!/^[1-9]\d*$/.test(text)) return null;
    const grams = Number(text);
    return Number.isSafeInteger(grams) ? grams : null;
}

/**
 * Opt-in custom overflow protection for the Other dripper.
 *
 * The text is a local draft, so an entry that is not yet valid stays on screen
 * while the stored config is cleared: an invalid field must never sit in front
 * of an old limit that is still quietly armed. The call site keys this on the
 * recipe, so a different recipe opens its own draft rather than a prop effect
 * resetting this one.
 */
export default function OverflowSection({config, onChange}: Props) {
    const [draft, setDraft] = useState(config === undefined ? "" : String(config.retainedGrams));
    const [interval, setInterval] = useState<OverflowInterval>(config?.checkSeconds ?? OVERFLOW_INTERVALS[0]);

    const invalid = draft !== "" && parseLimit(draft) === null;
    const configured = config !== undefined;

    function onChangeText(text: string) {
        setDraft(text);
        const grams = parseLimit(text);
        onChange(grams === null ? undefined : {retainedGrams: grams, checkSeconds: interval});
    }

    function pickInterval(value: string) {
        const next = OVERFLOW_INTERVALS.find((seconds) => String(seconds) === value);
        if (next === undefined) return;
        setInterval(next);
        if (config !== undefined) onChange({retainedGrams: config.retainedGrams, checkSeconds: next});
    }

    function turnOff() {
        setDraft("");
        onChange(undefined);
    }

    return (
        <YStack testID="overflow-section">
            <FieldRow topic="overflowThreshold" showHint error={invalid ? INVALID_LIMIT : undefined}>
                <TextInput
                    testID="overflow-limit"
                    accessibilityLabel="Retained-water limit in grams"
                    value={draft}
                    onChangeText={onChangeText}
                    keyboardType="number-pad"
                    placeholder="grams"
                    placeholderTextColor={palette.placeholder}
                    returnKeyType="done"
                    style={{
                        width:             96,
                        minHeight:         44,
                        fontSize:          16,
                        textAlign:         "right",
                        color:             invalid ? palette.danger : palette.text,
                        backgroundColor:   palette.raised,
                        borderRadius:      12,
                        paddingHorizontal: 14
                    }}/>
            </FieldRow>

            {configured && (
                <>
                    <SegmentedRow topic="overflowInterval" value={String(interval)}
                                  options={INTERVAL_OPTIONS} onChange={pickInterval}/>
                    <YStack paddingHorizontal="$4" paddingVertical="$3" gap="$2"
                            borderBottomWidth={1} borderBottomColor={palette.line}>
                        <Text fontSize={12} lineHeight={17} color={palette.dim}>
                            {OVERFLOW_FOREGROUND_CAUTION}
                        </Text>
                        <Text fontSize={12} lineHeight={17} color={palette.dim}>
                            {OVERFLOW_ESTIMATE_NOTE}
                        </Text>
                        <Pressable accessibilityRole="button"
                                   accessibilityLabel="Turn off overflow protection"
                                   onPress={turnOff}
                                   style={{minHeight: 44, justifyContent: "center"}}>
                            <Text fontSize={11} letterSpacing={1.5} color={palette.danger}>
                                OFF
                            </Text>
                        </Pressable>
                    </YStack>
                </>
            )}
        </YStack>
    );
}
