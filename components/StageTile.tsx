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

/**
 * A flat run of stages up to and including this one, for the tile's sparkline.
 *
 * Every reached stage is given the same volume on purpose. The sparkline says
 * how far into the recipe this stage falls, not what shape it pours — the shape
 * is already drawn full size by StageProfile directly above the list, and a
 * second, tinier copy of it beside every row would say the same thing five
 * times. Do not feed the real volumes in.
 */
function runUpTo(index: number, count: number): Pour[] {
    return Array.from({length: count}, (_, i) => {
        const pour = new Pour(i + 1);
        pour.volume = i <= index ? 1 : 0;
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
                        {/* Flow rate is the one value the card stores in
                            tenths: byte 30 is 3.0 ml/s. The stepper works in
                            the units on the label and the byte is put back
                            here, because a stage that reported 3.2 would be
                            written to a card as three. */}
                        <StageValue label="Flow rate" value={pour.getFlowRate() / 10}
                                    min={3} max={3.5} step={0.1}
                                    onChange={(v) =>
                                        onChange(index, "flowRate", Math.round(v * 10))}/>
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
                        <StageToggles label="Agitation" accent={accent}
                                      toggles={[
                                          {
                                              label: "BEFORE",
                                              spoken: "Agitate before",
                                              on:     pour.getAgitationBefore(),
                                              onPress: (on) =>
                                                  onChange(index, "agitationBefore", on ? 1 : 0)
                                          },
                                          {
                                              label: "AFTER",
                                              spoken: "Agitate after",
                                              on:     pour.getAgitationAfter(),
                                              onPress: (on) =>
                                                  onChange(index, "agitationAfter", on ? 1 : 0)
                                          }
                                      ]}/>
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
            <Text fontSize={9.5} letterSpacing={1.4} textTransform="uppercase"
                  color={palette.muted}>
                {label}
            </Text>
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


type StageTogglesProps = {
    label: string;
    accent: string;
    toggles: readonly {
        label: string;
        /** What a screen reader says. The chip itself is one word. */
        spoken: string;
        on: boolean;
        onPress: (on: boolean) => void;
    }[];
};

/**
 * Independent on-off chips under one label.
 *
 * Agitation before and agitation after are two separate switches, not one
 * choice between them, so they are checkboxes rather than a radio group. Drawn
 * first as two adjacent two-option groups — BEFORE / NO BEFORE beside AFTER /
 * NO AFTER, the second with no label of its own — which needed reading twice to
 * work out that the right-hand pair was a second question.
 */
function StageToggles({label, accent, toggles}: StageTogglesProps) {
    return (
        <XStack flex={1} alignItems="center" justifyContent="space-between" gap="$2">
            <Text fontSize={9.5} letterSpacing={1.4} textTransform="uppercase"
                  color={palette.muted}>
                {label}
            </Text>
            <XStack gap={2}>
                {toggles.map((toggle) => (
                    <Pressable key={toggle.label} accessibilityRole="checkbox"
                               accessibilityLabel={toggle.spoken}
                               accessibilityState={{checked: toggle.on}}
                               onPress={() => toggle.onPress(!toggle.on)}>
                        <Text fontSize={10.5} fontWeight="600"
                              paddingHorizontal="$2" paddingVertical="$1"
                              borderRadius="$2"
                              backgroundColor={toggle.on ? accent : palette.raised}
                              color={toggle.on ? palette.base : palette.dim}>
                            {toggle.label}
                        </Text>
                    </Pressable>
                ))}
            </XStack>
        </XStack>
    );
}
