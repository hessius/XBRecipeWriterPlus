import React from "react";
import {Pressable, View} from "react-native";
// Gesture Handler's press, for the tile header only.
//
// A scroll view holds a touch back while it decides whether the finger is
// starting a scroll, and a tap that lands inside that window is swallowed --
// felt on a deck of tap-to-open tiles as roughly every third tap doing nothing.
// React Native used to expose `delaysContentTouches` to turn that off; 0.86 no
// longer does. A Gesture Handler press is a native gesture that negotiates with
// the scroll view's own rather than queueing behind its decision.
//
// Only the header. Everything below it lives inside the `Collapsible`, which
// hides a closed stage by setting `pointerEvents` to none -- and a Gesture
// Handler press is a native recogniser that does not necessarily honour an
// ancestor's pointer events, so a closed tile's steppers could still be hit.
import {Pressable as GesturePressable} from "react-native-gesture-handler";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import Stepper from "@/components/Stepper";
import {palette} from "@/constants/colors";
import {RECIPE_HELP, type HelpTopic} from "@/constants/recipeHelp";
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
 * One stage of the brew.
 *
 * A raised tile with air around it rather than a row in a list. Three flatter
 * treatments were drawn and all of them had the same two faults: nothing said
 * the row opened, and one row's tap target ran into the next one's.
 */
export default function StageTile({
    pour, index, count, open, accent, isTea, onToggle, onChange, onDelete
}: Props) {
    "use no memo";

    // These components draw a model that is mutated in place: `pour.getVolume()`
    // is a method call, not a property read, so the React Compiler cannot see
    // that the value moved and would serve a cached render. The screen used to
    // force the redraw with a React `key`, but that remounts, and a remounted
    // `Stepper` loses the chained timer behind hold-to-repeat after one step —
    // on a stage volume that ranges to 240 ml, that is the whole feature.

    // No hint line here, unlike the BREW deck. A stage packs six controls into
    // two columns, and a six-word note under each one doubles the height of a
    // tile that already has to fit on a phone screen next to the profile it is
    // being read against. What a stage control means is in the help sheet.

    const fact = (value: number | string, unit?: string) => (
        <XStack alignItems="baseline" gap={2}>
            <DotMatrixText fontSize={16} weight="bold" color={palette.text}>
                {value}
            </DotMatrixText>
            {unit && <Text fontSize={9.5} color={palette.dim} letterSpacing={1}>{unit}</Text>}
        </XStack>
    );

    return (
        <YStack backgroundColor={open ? palette.surface : palette.raised}
                borderRadius="$5" padding="$3" marginTop="$2.5"
                borderWidth={open ? 1 : 0} borderColor={accent}>
            <GesturePressable accessibilityRole="button"
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
                    {/* No sparkline here any more. It drew a flat run of equal
                        bars saying only how far into the recipe this stage
                        fell, which at 56x22 was unreadable — and the profile
                        above the list now highlights the open stage, which says
                        the same thing legibly and in one place. */}
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
            </GesturePressable>

            <Collapsible open={open}>
                <YStack gap="$2" paddingTop="$3">
                    <StageRow topics={["volume", "temperature"]}>
                        <StageValue topic="volume" value={pour.getVolume()}
                                    min={1} max={isTea ? 90 : 240} step={1} accent={accent}
                                    onChange={(v) => onChange(index, "volume", v)}/>
                        <StageValue topic="temperature" value={pour.getTemperature()}
                                    min={39} max={99} step={1}
                                    onChange={(v) => onChange(index, "temperature", v)}/>
                    </StageRow>
                    <StageRow topics={["flowRate", "pause"]}>
                        {/* Flow rate is the one value the card stores in
                            tenths: byte 30 is 3.0 ml/s. The stepper works in
                            the units on the label and the byte is put back
                            here, because a stage that reported 3.2 would be
                            written to a card as three. */}
                        <StageValue topic="flowRate" value={pour.getFlowRate() / 10}
                                    min={3} max={3.5} step={0.1}
                                    onChange={(v) =>
                                        onChange(index, "flowRate", Math.round(v * 10))}/>
                        <StageValue topic="pause" value={pour.getPauseTime()}
                                    min={0} max={isTea ? 360 : 59} step={1}
                                    onChange={(v) => onChange(index, "pauseTime", v)}/>
                    </StageRow>

                    <StageRow topics={["pattern"]} row={false}>
                        <StageChoice topic="pattern" accent={accent}
                                     value={String(pour.getPourPattern())}
                                     options={Object.values(POUR_PATTERN).map((p) => ({
                                         value: String(p),
                                         label: Pour.getPourPatternText(p).toUpperCase()
                                     }))}
                                     onChange={(v) => onChange(index, "pourPattern", Number(v))}/>
                    </StageRow>

                    {!isTea && (
                        <StageRow topics={["agitation"]} row={false}>
                        <StageToggles topic="agitation" accent={accent}
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
                        </StageRow>
                    )}

                    {count > 1 && (
                        <Pressable accessibilityRole="button"
                                   accessibilityLabel={`Delete stage ${index + 1}`}
                                   onPress={() => onDelete(index)}
                                   style={{alignSelf: "flex-start", paddingVertical: 8}}>
                            <XStack alignItems="center" gap="$2">
                                <DotIcon name="delete" size={14} color={palette.danger}/>
                                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
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

/**
 * One group of a stage's controls.
 *
 * Named by its topics rather than by a caption, so a row is findable by what it
 * edits. It used to unfold the long form of those topics underneath itself as
 * well, which is why it owns them: two controls sit side by side in half-width
 * pills, and a paragraph inside one pushed its neighbour's stepper out of line.
 * The long form is in the help sheet now and this is layout, but the shape is
 * worth keeping -- it is the seam the tile is laid out along.
 */
function StageRow({topics, row = true, children}: {
    topics: readonly HelpTopic[];
    /** False when the single child already lays itself out across the width. */
    row?: boolean;
    children: React.ReactNode;
}) {
    return (
        <YStack testID={`stage-row-${topics[0]}`} gap="$2">
            {row ? <XStack gap="$2">{children}</XStack> : children}
        </YStack>
    );
}

/**
 * A stage control's caption.
 *
 * The words come from `RECIPE_HELP` rather than a `label` prop, the same rule
 * the BREW deck follows: a control is identified by its topic, so a control
 * nobody wrote a note for cannot be drawn.
 */
function StageLabel({topic}: {topic: HelpTopic}) {
    return (
        <XStack alignItems="center" gap="$1.5">
            <Text fontSize={9.5} letterSpacing={1.4} textTransform="uppercase"
                  numberOfLines={1} color={palette.dim}>
                {RECIPE_HELP[topic].title}
            </Text>
        </XStack>
    );
}

type StageValueProps = {
    topic: HelpTopic; value: number; min: number; max: number; step: number;
    accent?: string; onChange: (value: number) => void;
};

/**
 * One numeric stage value.
 *
 * The label sits *above* the stepper rather than beside it. Side by side, a
 * label like STAGE VOLUME plus a 134 pt stepper needs more than the half-width
 * pill has, so the pill clipped the plus button off its right edge and cut the
 * number in half — see the device screenshot that prompted this. Stacking gives
 * the stepper the pill's full width and costs one line of height.
 */
function StageValue({topic, value, min, max, step, accent, onChange}: StageValueProps) {
    return (
        <YStack flex={1} alignItems="center" gap="$1"
                backgroundColor={palette.raised} borderRadius="$3"
                paddingHorizontal="$2" paddingVertical="$2">
            <StageLabel topic={topic}/>
            <Stepper label={RECIPE_HELP[topic].title} value={value} min={min}
                     max={max} step={step} accent={accent}
                     onChange={onChange}/>
        </YStack>
    );
}

type StageChoiceProps = {
    topic: HelpTopic; value: string; accent: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
};

function StageChoice({topic, value, accent, options, onChange}: StageChoiceProps) {
    return (
        // `alignSelf="stretch"`, never `flex`. These two groups are the only
        // controls here that sit directly in the tile's column rather than in a
        // half-width pair, and in React Native `flex: 1` also sets a flex basis
        // of zero -- so in a column that is a row asking to be nothing tall.
        // The result was a sliver of the option pills, which read as a progress
        // bar rather than as the control it had been.
        <XStack testID={`stage-group-${topic}`} alignSelf="stretch" alignItems="center"
                justifyContent="space-between" gap="$2">
            <StageLabel topic={topic}/>
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
                                  backgroundColor={selected ? accent : undefined}
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
    topic: HelpTopic;
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
function StageToggles({topic, accent, toggles}: StageTogglesProps) {
    return (
        // See `StageChoice`: stretch, not flex. Same column, same trap.
        <XStack testID={`stage-group-${topic}`} alignSelf="stretch" alignItems="center"
                justifyContent="space-between" gap="$2">
            <StageLabel topic={topic}/>
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
