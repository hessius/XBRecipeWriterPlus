import React, {useState} from "react";
import {TextInput} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import DotMatrixText, {dotMatrixTextProps} from "@/components/DotMatrixText";

/**
 * A tag longer than this is not a shelf name, it is a sentence.
 *
 * The tile draws one line and truncates, so anything past this would be typed,
 * accepted, and then never shown in full anywhere in the app.
 */
const MAX_LENGTH = 24;

/**
 * Asks what to call a new shelf.
 *
 * It comes last, after the members have been chosen, because a manual shelf
 * cannot exist without members: asking for a name first would open an empty box
 * the user could name and then abandon, leaving a shelf of nothing.
 *
 * The field holds its own text and hands it over on submit. The screen owns
 * what a name means, and gets a trimmed one.
 */
export default function NameShelfSheet({open, onOpenChange, count, onName}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** How many recipes are going on it, so the sheet can say what it is naming. */
    count: number;
    onName: (name: string) => void;
}) {
    const [name, setName] = useState("");
    const trimmed = name.trim();
    const recipes = count === 1 ? "1 recipe" : `${count} recipes`;
    // The same Doto the rail's field and every heading use. Asked for through
    // the helper rather than by name, because Tamagui's Input drops a plain
    // fontFamily and this is the one path that survives it.
    const doto = dotMatrixTextProps({fontSize: 16, letterSpacing: 1.5});

    function submit() {
        if (trimmed.length === 0) return;
        onName(trimmed);
        setName("");
    }

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {
            // Cleared on the way out rather than on the way in, so a sheet that
            // is dismissed and reopened does not greet the user with the name
            // they just decided against.
            if (!next) setName("");
            onOpenChange(next);
        }} title="Name this shelf" heightPercent={32}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    {`${recipes} will go on it.`}
                </Text>

                <TextInput
                    testID="shelf-name-field"
                    accessibilityLabel="Shelf name"
                    value={name}
                    onChangeText={setName}
                    maxLength={MAX_LENGTH}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    placeholder="MORNINGS"
                    placeholderTextColor={palette.muted}
                    maxFontSizeMultiplier={doto.maxFontSizeMultiplier}
                    // Shift-locked, so a lower case letter is upper case before
                    // it is drawn rather than corrected a frame later. The rail's
                    // field learned that one on device.
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={[doto.style, {
                        color: palette.text,
                        backgroundColor: palette.raised,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12
                    }]}/>

                <XStack
                    accessibilityRole="button"
                    accessibilityLabel="Create the shelf"
                    accessibilityState={{disabled: trimmed.length === 0}}
                    testID="shelf-name-confirm"
                    onPress={trimmed.length === 0 ? undefined : submit}
                    opacity={trimmed.length === 0 ? 0.35 : 1}
                    height={48} alignItems="center" justifyContent="center"
                    borderRadius="$4"
                    backgroundColor={palette.text}>
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        CREATE SHELF
                    </DotMatrixText>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}
