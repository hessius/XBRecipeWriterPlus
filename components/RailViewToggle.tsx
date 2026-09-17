import React from "react";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {CHIP_HEIGHT} from "@/components/RailChip";
import {onAccent, palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";

/** The glyph size inside a segment, matching the chips beside it. */
const ICON_SIZE = 18;

/** How wide one segment is. Square, so the pair reads as two chips joined. */
const SEGMENT_WIDTH = 40;

export type ViewToggleOption<T extends string> = {
    value: T;
    /** What a reader hears. The segment itself draws only the glyph. */
    label: string;
    icon: DotIconName;
};

type Props<T extends string> = {
    value: T;
    options: readonly ViewToggleOption<T>[];
    accessibilityLabel: string;
    onChange: (next: T) => void;
};

/**
 * The rail's view pair, built to the rail's own metrics.
 *
 * Deliberately **not** `components/SegmentedControl.tsx`, which this replaced in
 * the rail after device testing found the pair reading as a borrowed control
 * beside the chips: a different height, a different radius, and the system face
 * where everything around it is dot matrix. That component is a settings row's
 * control and `SortSheet` uses it too, so matching it to the rail would have
 * restyled two screens that did not ask to be. Matching here cannot.
 *
 * Every value it draws with comes from `RailChip`: the same `CHIP_HEIGHT`, the
 * same `$4` radius and 1 pt border, the same accent fill and `onAccent` ink. The
 * pair is one bordered shape rather than two, because two chips side by side
 * would read as two independent buttons, which is exactly the reading the design
 * rejected when it chose a pair over a toggling icon.
 *
 * Both halves are always on screen and the active one is lit, so the control
 * says which view you are in rather than which view a tap would take you to.
 */
export default function RailViewToggle<T extends string>({
    value, options, accessibilityLabel, onChange
}: Props<T>) {
    return (
        <XStack testID="rail-view-toggle"
                accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}
                height={CHIP_HEIGHT} alignItems="center"
                borderRadius="$4" borderWidth={1} borderColor={palette.line}
                overflow="hidden">
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <XStack key={option.value}
                            testID={`rail-view-${option.value}`}
                            accessible accessibilityRole="tab"
                            accessibilityLabel={option.label}
                            // The fill is the only visible mark of which half is
                            // live, and a fill is nothing to a reader, so the
                            // state is spoken as well as drawn.
                            accessibilityState={{selected}}
                            onPress={() => onChange(option.value)}
                            width={SEGMENT_WIDTH} height="100%"
                            alignItems="center" justifyContent="center"
                            backgroundColor={selected ? palette.text : palette.none}
                            pressStyle={{opacity: 0.7}}>
                        <DotIcon name={option.icon} size={ICON_SIZE}
                                 color={selected ? onAccent.text : palette.dim}/>
                    </XStack>
                );
            })}
        </XStack>
    );
}
