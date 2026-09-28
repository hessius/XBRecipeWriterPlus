import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {CompareRow} from "@/library/brew/compare";
import {referenceCupColour} from "@/library/brew/traceStyle";

type Props = {
    rows: CompareRow[];
    accent: string;
};

function rowLabel(row: CompareRow): string {
    if (row.shared) return `${row.label}. Both brews agree at ${row.a}.`;
    return `${row.label}. This brew ${row.a}. That brew ${row.b}.`;
}

/**
 * Agreement is drawn, not omitted: shared figures form the centre spine and
 * differing figures are the only values that split into two columns.
 *
 * The two columns borrow the chart's grammar rather than inventing one. The
 * subject is the accent and the reference is `referenceCupColour`, the same
 * grey its cup line is drawn in, so a user who has just read which line is
 * theirs does not have to learn a second code to read the table. A shared
 * value is dimmer than either, because it is the thing they are not looking
 * for.
 */
export default function CompareTable({rows, accent}: Props) {
    if (rows.length === 0) {
        return (
            <Text testID="compare-table-empty" color={palette.dim} fontSize={13}>
                These two brews recorded nothing that can be set side by side.
            </Text>
        );
    }

    return (
        <YStack testID="compare-table">
            {rows.map((row, index) => (
                <XStack
                    key={row.label}
                    testID={`compare-row-${index}`}
                    accessible
                    accessibilityLabel={rowLabel(row)}
                    alignItems="center"
                    paddingVertical="$2"
                    borderBottomWidth={1}
                    borderColor={palette.line}>
                    <YStack width={84} flexShrink={0}>
                        <DotMatrixText
                            fontSize={10}
                            weight="bold"
                            letterSpacing={1.2}
                            color={palette.muted}>
                            {row.label}
                        </DotMatrixText>
                    </YStack>
                    {row.shared ? (
                        <YStack flex={1} alignItems="center">
                            <Text
                                testID={`compare-shared-${row.label}`}
                                color={palette.dim}
                                fontSize={14}>
                                {row.a}
                            </Text>
                        </YStack>
                    ) : (
                        <XStack flex={1} alignItems="center">
                            <YStack flex={1} alignItems="flex-start">
                                <Text
                                    testID={`compare-a-${row.label}`}
                                    color={accent}
                                    fontSize={14}>
                                    {row.a}
                                </Text>
                            </YStack>
                            <YStack flex={1} alignItems="flex-end">
                                <Text
                                    testID={`compare-b-${row.label}`}
                                    color={referenceCupColour}
                                    fontSize={14}>
                                    {row.b}
                                </Text>
                            </YStack>
                        </XStack>
                    )}
                </XStack>
            ))}
        </YStack>
    );
}
