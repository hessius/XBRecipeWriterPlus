import React from "react";
import {useWindowDimensions} from "react-native";
import {Button, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import Stepper from "@/components/Stepper";
import {palette} from "@/constants/colors";
import {
    describeAdjustment,
    describeGrind,
    describeKnobBaseline,
    describeTemperatureBaseline,
    effectiveGrind,
    quickEditBounds,
    quickEditProblems,
    type QuickEditKnob,
    type QuickEditAdjustments
} from "@/library/quickEdit";
import Recipe from "@/library/Recipe";
import {
    displayOffsetValues,
    fromDisplayOffset,
    toDisplayOffset,
    unitSuffix,
    type TemperatureUnit
} from "@/library/units";

export type QuickEditPanelBrewability = {
    brewable: boolean;
    problems: string[];
};

export type QuickEditPanelProps = {
    recipe: Recipe;
    adjustments: QuickEditAdjustments;
    accent: string;
    temperatureUnit: TemperatureUnit;
    onChange: (adjustments: QuickEditAdjustments) => void;
    renderBrewAction?: (brewability: QuickEditPanelBrewability) => React.ReactNode;
};

type AdjustmentKey = keyof QuickEditAdjustments;

type QuickEditRowProps = {
    label: string;
    children: React.ReactNode;
    detail?: React.ReactNode;
    fontScale: number;
};

function signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
}

function updateAdjustment(
    adjustments: QuickEditAdjustments,
    key: AdjustmentKey,
    value: number,
    saved: number
): QuickEditAdjustments {
    const next = {...adjustments};
    if (value === saved) {
        delete next[key];
    } else {
        next[key] = value;
    }
    return next;
}

/**
 * The height one baseline line occupies, at the system font size.
 *
 * The slot is reserved whether or not the line is in it, because a knob grows
 * its baseline the moment it is moved and a row that grew under the finger
 * would shift every row below it mid-adjustment. `minHeight`, not `height`,
 * so a wrapped line at a large font size still gets the room it asks for.
 */
const BASELINE_LINE_HEIGHT = 16;

function QuickEditRow({label, children, detail, fontScale}: QuickEditRowProps) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$3"
                paddingVertical="$2.5">
            <YStack flex={1} gap={3}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    {label}
                </DotMatrixText>
                <YStack testID="quick-edit-baseline-slot"
                        minHeight={Math.round(BASELINE_LINE_HEIGHT * fontScale)}
                        justifyContent="center">
                    {detail}
                </YStack>
            </YStack>
            {children}
        </XStack>
    );
}

/**
 * The saved value for a knob, shown only once that knob has been moved.
 *
 * TEMP OFFSET shows its baseline always, because an offset cannot say what it
 * is offsetting any other way. An absolute knob already reads as its own
 * value, so its baseline is only worth the row once it has been left behind.
 */
function baselineDetail(
    recipe: Recipe,
    knob: QuickEditKnob,
    adjusted: boolean,
    fontScale: number
): React.ReactNode {
    if (!adjusted) {
        return undefined;
    }

    return (
        <Text testID={`quick-edit-${knob}-baseline`} fontSize={12} lineHeight={16}
              color={palette.dim}>
            {describeKnobBaseline(recipe, knob, fontScale)}
        </Text>
    );
}

export default function QuickEditPanel({
    recipe, adjustments, accent, temperatureUnit, onChange, renderBrewAction
}: QuickEditPanelProps) {
    const {fontScale} = useWindowDimensions();
    const bounds = quickEditBounds(recipe);
    const savedDose = recipe.dosage;
    const savedRatio = recipe.ratio;
    const savedGrindValue = effectiveGrind(recipe);
    const grindBounds = bounds.grind;
    const dose = adjustments.dose ?? savedDose;
    const ratio = adjustments.ratio ?? savedRatio;
    const grind = adjustments.grind ?? savedGrindValue;
    const tempOffset = toDisplayOffset(adjustments.tempOffset ?? 0, temperatureUnit);
    const temperatureBaseline = describeTemperatureBaseline(recipe, fontScale, temperatureUnit);
    const offsetValues = displayOffsetValues(bounds.tempOffset, temperatureUnit);
    const explainer = describeAdjustment(recipe, adjustments);
    const problems = quickEditProblems(recipe, adjustments, temperatureUnit);
    const brewability: QuickEditPanelBrewability = {
        brewable: problems.length === 0,
        problems
    };

    return (
        <YStack testID="quick-edit-panel" gap="$3" padding="$4"
                backgroundColor={palette.surface} borderRadius="$5"
                borderWidth={1} borderColor={palette.line}>
            <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <YStack flex={1} gap={2}>
                    <DotMatrixText fontSize={16} weight="bold" letterSpacing={1.8}
                                   color={accent}>
                        QUICK EDIT
                    </DotMatrixText>
                    <Text fontSize={12} lineHeight={16} color={palette.dim}>
                        For this brew only.
                    </Text>
                </YStack>
                <Button size="$3" chromeless accessibilityRole="button"
                        accessibilityLabel="Reset quick edits"
                        color={accent}
                        onPress={() => onChange({})}>
                    RESET
                </Button>
            </XStack>

            <YStack gap="$1" borderTopWidth={1} borderBottomWidth={1}
                    borderColor={palette.line} paddingVertical="$1">
                <QuickEditRow label="DOSE" fontScale={fontScale}
                              detail={baselineDetail(
                                  recipe, "dose", adjustments.dose !== undefined, fontScale
                              )}>
                    <Stepper label="Quick edit dose" value={dose}
                             min={bounds.dose.min} max={bounds.dose.max} step={1}
                             unit="g" accent={accent}
                             onChange={(value) => onChange(updateAdjustment(
                                 adjustments, "dose", value, savedDose
                             ))}/>
                </QuickEditRow>

                {bounds.ratio !== null && (
                    <QuickEditRow label="RATIO" fontScale={fontScale}
                                  detail={baselineDetail(
                                      recipe, "ratio", adjustments.ratio !== undefined, fontScale
                                  )}>
                        <Stepper label="Quick edit ratio" value={ratio}
                                 min={bounds.ratio.min} max={bounds.ratio.max} step={1}
                                 accent={accent}
                                 onChange={(value) => onChange(updateAdjustment(
                                     adjustments, "ratio", value, savedRatio
                                 ))}/>
                    </QuickEditRow>
                )}

                {grindBounds !== null && (
                    <QuickEditRow label="GRIND" fontScale={fontScale}
                                  detail={baselineDetail(
                                      recipe, "grind", adjustments.grind !== undefined, fontScale
                                  )}>
                        <Stepper label="Quick edit grind" value={grind}
                                 min={grindBounds.min} max={grindBounds.off} step={1}
                                 accent={accent}
                                 formatValue={(value) => describeGrind(value)}
                                 onChange={(value) => onChange(updateAdjustment(
                                     adjustments, "grind", value, savedGrindValue
                                 ))}/>
                    </QuickEditRow>
                )}

                <QuickEditRow label="TEMP OFFSET" fontScale={fontScale}
                              detail={(
                                  <Text testID="quick-edit-temperature-baseline"
                                        fontSize={12} lineHeight={16}
                                        color={palette.dim}>
                                      {temperatureBaseline}
                                  </Text>
                              )}>
                    <Stepper label="Temperature offset" value={tempOffset}
                             min={offsetValues[0] ?? 0}
                             max={offsetValues[offsetValues.length - 1] ?? 0}
                             step={1}
                             values={offsetValues}
                             unit={unitSuffix(temperatureUnit)}
                             accent={accent} formatValue={signed} signedInput
                             onChange={(value) => onChange(updateAdjustment(
                                 adjustments,
                                 "tempOffset",
                                 fromDisplayOffset(value, temperatureUnit),
                                 0
                             ))}/>
                </QuickEditRow>
            </YStack>

            {explainer !== null && (
                <Text testID="quick-edit-explainer" fontSize={12} lineHeight={17}
                      color={palette.dim}>
                    {explainer}
                </Text>
            )}

            {problems.length > 0 && (
                <YStack testID="quick-edit-problems" gap="$2" padding="$3"
                        borderRadius="$4" backgroundColor={palette.raised}
                        borderLeftWidth={2} borderLeftColor={palette.danger}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                   color={palette.danger}>
                        CANNOT BREW
                    </DotMatrixText>
                    {problems.map((problem) => (
                        <Text key={problem} fontSize={12} lineHeight={16}
                              color={palette.dim}>
                            {problem}
                        </Text>
                    ))}
                </YStack>
            )}

            {renderBrewAction?.(brewability)}
        </YStack>
    );
}
