import React, {useState} from "react";
import {TextInput} from "react-native";
import {Text, XStack} from "tamagui";

import DeckSection from "@/components/DeckSection";
import {palette} from "@/constants/colors";
import {MAX_DESCRIPTION} from "@/library/Recipe";

/**
 * The one line that says why a recipe is worth keeping.
 *
 * Capped where it is typed, with the count visible while it is being typed. A
 * limit a person can see is a limit; a limit they meet by having their words
 * disappear at the library row is a bug, which is why the cap is here and the
 * card below never clips.
 *
 * Inter rather than Doto: this is prose somebody wrote, not a label the app
 * printed.
 *
 * Uncontrolled, for the same reason every text row in this editor is: the
 * recipe is mutated in place and published by a key bump, so handing the input
 * back a `value` on every keystroke fights the cursor. The counter is the one
 * piece of state, and it renders beside the field rather than into it.
 */
export default function NoteSection({initialValue, onDraft, onCommit}: {
    initialValue: string;
    /** Every keystroke, so the screen can flush a field that never blurred. */
    onDraft: (value: string) => void;
    onCommit: (value: string) => void;
}) {
    const [length, setLength] = useState(initialValue.length);
    const full = length >= MAX_DESCRIPTION;

    return (
        <DeckSection title="NOTE" testID="about-note">
            <TextInput
                testID="note-field"
                accessibilityLabel="Note"
                accessibilityHint={`One line about this recipe, up to ${MAX_DESCRIPTION} characters.`}
                defaultValue={initialValue}
                maxLength={MAX_DESCRIPTION}
                placeholder="Sweet and light, good for mornings"
                placeholderTextColor={palette.muted}
                returnKeyType="done"
                onChangeText={(value) => {
                    setLength(value.length);
                    onDraft(value);
                }}
                onEndEditing={(event) => onCommit(event.nativeEvent.text)}
                style={{
                    fontSize:          16,
                    color:             palette.text,
                    backgroundColor:   palette.raised,
                    borderRadius:      12,
                    paddingHorizontal: 14,
                    paddingVertical:   12
                }}/>

            <XStack justifyContent="flex-end">
                {/* Hidden from a screen reader, which has the same ceiling in
                    the field's hint and would otherwise hear the count reread
                    after every character typed. */}
                <Text testID="note-counter" accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      fontSize={12} color={full ? palette.text : palette.dim}>
                    {`${length}/${MAX_DESCRIPTION}`}
                </Text>
            </XStack>
        </DeckSection>
    );
}
