import React from "react";
import {Pressable, View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import Stepper from "@/components/Stepper";
import {onAccent, palette} from "@/constants/colors";
import Pour, {POUR_PATTERN} from "@/library/Pour";

/** Which of a stage's values an edit refers to. */
export type StageField =
    "volume" | "temperature" | "flowRate" | "pauseTime"
    | "pourPattern" | "agitationBefore" | "agitationAfter";

type Props = {
    pour: Pour;
    index: number;
    count: number;
    open: boolean;
    accent: string;
    isTea: boolean;
    onToggle: (index: number) => void;
    onChange: (index: number, field: StageField, value: number) => void;
    onDelete: (index: number) => void;
};

/** The volumes of every stage up to and including this one, for its sparkline. */
function runUpTo(index: number, count: number): Pour[] {
    return Array.from({length: count}, (_, i) => {
        const pour = new Pour(i + 1);
        // A zero-volume tail would divide by zero in buildProfilePath, so the
        // unreached stages carry a vanishing volume rather than none.
        pour.volume = i <= index ? 1 : 0.001;
        return pour;
    });
}

/**
 * One stage of the brew.
 *
 * A raised tile with air around it rather than a row in a list. Three flatter
 * treatments were drawn and all of them had the same two faults: nothing said
 * the row opened, and one row's tap target ran into the next one's.
 */
export default function StageTile({
    pour, index, count, open, accent, isTea, onToggle, onChange, onDelete
}: Props) {
    const fact = (value: number | string, unit?: string) => (
        <XStack alignItems="baseline" gap={2}>
            <DotMatrixText fontSize={16} weight="bold" color={palette.text}>
                {value}
            </DotMatrixText>
            {unit && <Text fontSize={9.5} color={palette.muted} letterSpacing={1}>{unit}</Text>}
        </XStack>
    );

    return (
        <YStack backgroundColor={open ? palette.surface : palette.raised}
                borderRadius="$5" padding="$3" marginTop="$2.5"
                borderWidth={open ? 1 : 0} borderColor={accent}>
            <Pressable accessibilityRole="button"
                       accessibilityLabel={`Stage ${index + 1} of ${count}`}
                       accessibilityState={{expanded: open}}
                       onPress={() => onToggle(index)}>
                <XStack alignItems="center" gap="$2.5">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={accent}>
                        {String(index + 1).padStart(2, "0")}
                    </DotMatrixText>
                    <XStack flex={1} gap="$3" alignItems="baseline">
                        {fact(pour.getVolume(), "ml")}
                        {fact(pour.getTemperature(), "°C")}
                        {fact(Pour.getPourPatternText(pour.getPourPattern()).toUpperCase())}
                    </XStack>
                    <PourProfile pours={runUpTo(index, count)} width={56} height={22}
                                 stroke={accent} fill={onAccent.profileFill}/>
                    {/* The same bitmap as the header caret, turned to point at
                        what it will reveal. Rotating one glyph beats drawing a
                        second that has to look like its sibling. DotIcon owns
                        its own style prop, so the rotation goes on a wrapper —
                        it is decorative, so the wrapper takes no label. */}
                    <View style={{transform: [{rotate: open ? "180deg" : "0deg"}]}}>
                        <DotIcon name="more" size={14}
                                 color={open ? accent : palette.muted}/>
                    </View>
                </XStack>
            </Pressable>

            <Collapsible open={open}>
                <YStack gap="$2" paddingTop="$3">
                    <XStack gap="$2">
                        <StageValue label="Stage volume" value={pour.getVolume()}
                                    min={1} max={isTea ? 90 : 240} step={1} accent={accent}
                                    onChange={(v) => onChange(index, "volume", v)}/>
                        <StageValue label="Temperature" value={pour.getTemperature()}
                                    min={39} max={99} step={1}
                                    onChange={(v) => onChange(index, "temperature", v)}/>
                    </XStack>
                    <XStack gap="$2">
                        <StageValue label="Flow rate" value={pour.getFlowRate()}
                                    min={3} max={3.5} step={0.1}
                                    onChange={(v) => onChange(index, "flowRate", v)}/>
                        <StageValue label="Pause" value={pour.getPauseTime()}
                                    min={0} max={isTea ? 360 : 59} step={1}
                                    onChange={(v) => onChange(index, "pauseTime", v)}/>
                    </XStack>

                    <StageChoice label="Pattern" accent={accent}
                                 value={String(pour.getPourPattern())}
                                 options={Object.values(POUR_PATTERN).map((p) => ({
                                     value: String(p),
                                     label: Pour.getPourPatternText(p).toUpperCase()
                                 }))}
                                 onChange={(v) => onChange(index, "pourPattern", Number(v))}/>

                    {!isTea && (
                        <XStack gap="$2">
                            <StageChoice label="Agitation" accent={accent}
                                         value={pour.getAgitationBefore() ? "1" : "0"}
                                         options={[
                                             {value: "1", label: "BEFORE"},
                                             {value: "0", label: "NO BEFORE"}
                                         ]}
                                         onChange={(v) => onChange(index, "agitationBefore", Number(v))}/>
                            <StageChoice label="" accent={accent}
                                         value={pour.getAgitationAfter() ? "1" : "0"}
                                         options={[
                                             {value: "1", label: "AFTER"},
                                             {value: "0", label: "NO AFTER"}
                                         ]}
                                         onChange={(v) => onChange(index, "agitationAfter", Number(v))}/>
                        </XStack>
                    )}

                    {count > 1 && (
                        <Pressable accessibilityRole="button"
                                   accessibilityLabel={`Delete stage ${index + 1}`}
                                   onPress={() => onDelete(index)}
                                   style={{alignSelf: "flex-start", paddingVertical: 8}}>
                            <XStack alignItems="center" gap="$2">
                                <DotIcon name="delete" size={14} color={palette.danger}/>
                                <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.8}
                                               color={palette.danger}>
                                    REMOVE
                                </DotMatrixText>
                            </XStack>
                        </Pressable>
                    )}
                </YStack>
            </Collapsible>
        </YStack>
    );
}

type StageValueProps = {
    label: string; value: number; min: number; max: number; step: number;
    accent?: string; onChange: (value: number) => void;
};

function StageValue({label, value, min, max, step, accent, onChange}: StageValueProps) {
    return (
        <XStack flex={1} alignItems="center" justifyContent="space-between"
                backgroundColor={palette.raised} borderRadius="$3"
                paddingHorizontal="$2" paddingVertical="$1.5">
            <Text fontSize={9.5} letterSpacing={1.4} textTransform="uppercase"
                  color={palette.muted}>
                {label}
            </Text>
            <Stepper label={label} value={value} min={min}
                     max={max} step={step} accent={accent}
                     onChange={onChange}/>
        </XStack>
    );
}

type StageChoiceProps = {
    label: string; value: string; accent: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
};

function StageChoice({label, value, accent, options, onChange}: StageChoiceProps) {
    return (
        <XStack flex={1} alignItems="center" justifyContent="space-between" gap="$2">
            {label !== "" && (
                <Text fontSize={9.5} letterSpacing={1.4} textTransform="uppercase"
                      color={palette.muted}>
                    {label}
                </Text>
            )}
            <XStack accessibilityRole="radiogroup" backgroundColor={palette.raised}
                    borderRadius="$3" padding={2} gap={2}>
                {options.map((option) => {
                    const selected = option.value === value;
                    return (
                        <Pressable key={option.value} accessibilityRole="radio"
                                   accessibilityLabel={option.label}
                                   accessibilityState={{checked: selected}}
                                   onPress={() => onChange(option.value)}>
                            <Text fontSize={10.5} fontWeight="600"
                                  paddingHorizontal="$2" paddingVertical="$1"
                                  borderRadius="$2"
                                  backgroundColor={selected ? accent : "transparent"}
                                  color={selected ? palette.base : palette.dim}>
                                {option.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </XStack>
        </XStack>
    );
}
