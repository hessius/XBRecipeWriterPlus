import React, {useState} from "react";
import {TextInput} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import DotMatrixText, {dotMatrixTextProps} from "@/components/DotMatrixText";

/**
 * Longer than this is a tasting note, not a name.
 *
 * Beanconqueror matches on a whole leading word, so a long string only narrows
 * the odds of a match. The cap is generous enough for a farm and a lot number
 * and mean enough to stop a sentence.
 */
const MAX_LENGTH = 40;

/**
 * Asks what coffee a brew was, on the way to Beanconqueror.
 *
 * Only for a brew the machine could not tell us about. A pod carries its own
 * coffee and never reaches this sheet.
 *
 * The field starts empty and the sheet says what will be tried if it stays
 * that way: a name taken from the recipe, because a recipe is usually named
 * after the coffee.
 *
 * There is one button, not two. It says SKIP while the field is empty and SEND
 * once something is typed, because both were always the same button: they sent
 * the brew, and differed only in whether a name went with it. Two buttons made
 * that look like a decision, and left a dimmed SEND sitting next to a live SKIP
 * as if the sheet could be failed. It cannot: the send goes through either way
 * -- Beanconqueror never refuses an unmatched bean, it falls back to a default
 * and says so in the brew note -- so this sheet is an opportunity to do better,
 * never a gate.
 */
export default function BeanNameSheet({
    open, onOpenChange, suggestion, onConfirm
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** What will be tried if the user skips. Empty when nothing could be derived. */
    suggestion: string;
    /** Called with the trimmed name, or an empty string when there is none. */
    onConfirm: (name: string) => void;
}) {
    // Stored with the brew it was typed against and discarded at render when
    // the two no longer agree, so opening the sheet on a second brew does not
    // greet the user with the first brew's answer. The house answer to state
    // that has to follow a prop, since the compiler forbids seeding it from an
    // effect.
    const [typed, setTyped] = useState<{name: string; forSuggestion: string}>(
        {name: "", forSuggestion: suggestion}
    );
    const name = typed.forSuggestion === suggestion ? typed.name : "";
    const trimmed = name.trim();

    function setName(next: string) {
        setTyped({name: next, forSuggestion: suggestion});
    }

    const doto = dotMatrixTextProps({fontSize: 16, letterSpacing: 1.5});

    function confirm(value: string) {
        onConfirm(value);
        onOpenChange(false);
    }

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title="What was the coffee?" heightPercent={34}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    {suggestion === ""
                        ? "Beanconqueror will look for a bean by this name. Skip to let it pick one."
                        : `Beanconqueror will look for a bean by this name. Skip and it will try "${suggestion}".`}
                </Text>

                <TextInput
                    testID="bean-name-field"
                    accessibilityLabel="Coffee name"
                    value={name}
                    onChangeText={setName}
                    maxLength={MAX_LENGTH}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => confirm(trimmed)}
                    placeholder="ETHIOPIA GUJI"
                    placeholderTextColor={palette.muted}
                    maxFontSizeMultiplier={doto.maxFontSizeMultiplier}
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
                    accessibilityLabel={trimmed.length === 0
                        ? "Send without naming the coffee"
                        : "Send with this coffee name"}
                    testID="bean-name-send"
                    onPress={() => confirm(trimmed)}
                    height={48} alignItems="center" justifyContent="center"
                    borderRadius="$4"
                    backgroundColor={palette.text}>
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        {trimmed.length === 0 ? "SKIP" : "SEND"}
                    </DotMatrixText>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}
