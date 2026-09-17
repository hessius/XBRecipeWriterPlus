import React, {useState} from "react";
import {TextInput} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

/**
 * The same ceiling the Name row carried on the brew deck.
 *
 * A name is a headline, not a description. The note on ABOUT is where a
 * sentence belongs.
 */
const MAX_LENGTH = 100;

/**
 * Renames a recipe, from wherever in the editor you happen to be.
 *
 * A sheet rather than a field in the header, which is what the header being
 * tappable might suggest. The header collapses on scroll and a software
 * keyboard arrives under it, and an editable field caught between those two is
 * the shape of bug that behaves on one platform and not the other. A sheet has
 * neither problem: the header may collapse, the keyboard belongs to the sheet,
 * and it works identically from all three decks, which renaming never did.
 *
 * Inter rather than Doto, because a recipe's name is something a person wrote
 * rather than a label the app prints. The shelf sheet is shift locked for the
 * opposite reason: a shelf name is drawn as a system label.
 *
 * The field holds its own text and hands over a trimmed one. What an empty name
 * means is the screen's business: it is not a missing value, it means follow
 * the pod.
 */
export default function RenameSheet({open, onOpenChange, name, onRename}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * The recipe's own `name`, not its `displayName()`.
     *
     * A recipe following its pod has an empty name and a title it borrowed, and
     * seeding the field with the borrowed one would turn the next save into a
     * rename nobody asked for.
     */
    name: string;
    onRename: (name: string) => void;
}) {
    const [draft, setDraft] = useState(name);
    // Seeded per opening rather than per mount, so the sheet always greets the
    // user with the name the recipe has now. Reading it at render against the
    // value it was opened with is the house alternative to an effect, which the
    // compiler forbids: `useTraceAnimation` does the same with its phase.
    const [seededFor, setSeededFor] = useState(name);
    if (seededFor !== name) {
        setSeededFor(name);
        setDraft(name);
    }

    function submit() {
        onRename(draft.trim());
        onOpenChange(false);
    }

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {
            // Discarded on the way out, so a sheet dismissed and reopened does
            // not offer back the name the user just decided against.
            if (!next) setDraft(name);
            onOpenChange(next);
        }} title="Rename recipe" heightPercent={34}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    Leave it empty to follow the pod name.
                </Text>

                <TextInput
                    testID="rename-field"
                    accessibilityLabel="Recipe name"
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={MAX_LENGTH}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    placeholder="Yirgacheffe"
                    placeholderTextColor={palette.muted}
                    autoCorrect={false}
                    style={{
                        fontSize:        16,
                        color:           palette.text,
                        backgroundColor: palette.raised,
                        borderRadius:    12,
                        paddingHorizontal: 14,
                        paddingVertical: 12
                    }}/>

                <XStack
                    accessibilityRole="button"
                    accessibilityLabel="Save the name"
                    testID="rename-confirm"
                    onPress={submit}
                    height={48} alignItems="center" justifyContent="center"
                    borderRadius="$4"
                    backgroundColor={palette.text}>
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        SAVE NAME
                    </DotMatrixText>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}
