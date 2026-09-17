import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {onAccent, palette} from "@/constants/colors";

/**
 * The bar across the bottom of the library while a shelf is being picked.
 *
 * The count is the shelf, never the view. `4 ON THIS SHELF` stays four while the
 * user filters to tea and sees one of them, because it is reporting what they
 * have built, not what they can currently see. A count that followed the list
 * would drop every time the lens changed and would read as members being lost.
 *
 * Done is allowed at zero only while editing, and it is the whole of how a shelf
 * is emptied: a shelf with no members is not a shelf, so saving one is deleting
 * it. The button says so rather than saying DONE and surprising them.
 */
export default function ShelfPickerBar({
    count, editing, onCancel, onDone, paddingBottom = 0
}: {
    count: number;
    /** An existing shelf rather than a new one, which changes what zero means. */
    editing: boolean;
    onCancel: () => void;
    onDone: () => void;
    paddingBottom?: number;
}) {
    const emptying = editing && count === 0;
    // Creating a shelf with nobody on it is the one thing the bar refuses.
    // There would be nothing to name and nothing to put the name on.
    const blocked = !editing && count === 0;

    const label = emptying ? "REMOVE SHELF" : editing ? "SAVE SHELF" : "NAME SHELF";
    const spoken = emptying
        ? "Remove this shelf. It has no recipes left on it."
        : editing
            ? `Save this shelf with ${count === 1 ? "1 recipe" : `${count} recipes`}`
            : `Name this shelf, ${count === 1 ? "1 recipe" : `${count} recipes`} chosen`;

    return (
        <YStack position="absolute" left={0} right={0} bottom={0}
                paddingHorizontal="$3" paddingTop="$3"
                paddingBottom={paddingBottom + 12}
                backgroundColor={palette.surface}
                borderTopWidth={1} borderTopColor={palette.line}
                testID="shelf-picker-bar">
            <XStack alignItems="center" gap="$3">
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel"
                           testID="shelf-picker-cancel" onPress={onCancel}>
                    <XStack height={44} paddingHorizontal="$3" alignItems="center">
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                       color={palette.dim}>
                            CANCEL
                        </DotMatrixText>
                    </XStack>
                </Pressable>

                <Text flex={1} fontSize={12} color={palette.dim} testID="shelf-picker-count">
                    {count === 1 ? "1 ON THIS SHELF" : `${count} ON THIS SHELF`}
                </Text>

                <XStack accessibilityRole="button"
                        accessibilityLabel={spoken}
                        accessibilityState={{disabled: blocked}}
                        testID="shelf-picker-done"
                        onPress={blocked ? undefined : onDone}
                        opacity={blocked ? 0.35 : 1}
                        height={44} paddingHorizontal="$4"
                        alignItems="center" justifyContent="center"
                        borderRadius="$4"
                        // An emptying save is a deletion, and the palette has a
                        // colour that says so. Nothing else in this bar is
                        // destructive, so the colour only ever appears when the
                        // button's meaning has actually changed.
                        backgroundColor={emptying ? palette.danger : palette.text}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        {label}
                    </DotMatrixText>
                </XStack>
            </XStack>
        </YStack>
    );
}
