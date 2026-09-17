import React from "react";
import {YStack} from "tamagui";

import NoteSection from "@/components/NoteSection";
import TextFieldRow from "@/components/TextFieldRow";
import {RECIPE_LABELS} from "@/hooks/useRecipeEditor";
import Recipe, {isValidXID} from "@/library/Recipe";

/** What a field's edit callback commits, given a label and the new value. */
type Dispatch = (label: string, value: string) => void;

type Props = {
    recipe: Recipe;
    showHint: boolean;
    dispatch: Dispatch;
    /** Records an unblurred field's current text, for the screen to flush. */
    onDraft: (label: string, value: string) => void;
    /** Reports the recipe-ID field's validity into the screen's write/save gate. */
    onInputErrorChange: (invalid: boolean) => void;
    /**
     * The xBloom name lookup for this recipe's XID was tried and failed. Shown
     * as a quiet note on the XID row, not an error: the recipe is valid without
     * a looked-up name, so this never touches the save gate.
     */
    xidLookupFailed: boolean;
    /**
     * Counter bumped only when the recipe instance is swapped (a revert). The
     * two text rows key on it, so a genuine external replacement remounts them
     * and resets their visible text and validity, while an ordinary edit or an
     * XID lookup leaves the field a user is typing in mounted.
     */
    externalEpoch: number;
    /** The Recipe ID field reports focus so the hook can defer the XID lookup. */
    onXidFocusChange: (focused: boolean) => void;
};

/**
 * What a recipe is, rather than what it does.
 *
 * The third deck. It exists because `Recipe ID` and `Name` were sitting at the
 * bottom of the brew deck, among dose, ratio and grind, and they are identity
 * and a lookup key rather than brew parameters. Moving them takes the last two
 * text fields off a deck of steppers and segmented rows, and gives the three
 * sections still to land here -- the note, the pod and where a recipe arrived
 * from -- somewhere to be that is not a fourth thing bolted to BREW.
 *
 * The rows are moved, not rewritten. Their keying on the external-replacement
 * epoch and the focus report that defers the XID lookup are load-bearing, and
 * the comments that say why came with them.
 */
export default function AboutDeck({
    recipe, showHint, dispatch, onDraft, onInputErrorChange,
    xidLookupFailed, externalEpoch, onXidFocusChange
}: Props) {
    return (
        <YStack gap="$2" marginTop="$3">
            {/* Keyed on the external-replacement epoch, not on the value it
                mirrors. The counter bumps only when the whole recipe is swapped
                out — a revert — so that one case still remounts the row and
                resets its visible text, local `invalid` mark and the screen's
                save gate to the restored ID. An ordinary keystroke or a
                late-arriving XID lookup does not touch the epoch, so the field a
                user is typing in is never remounted mid-entry: keying on
                `recipe.xid` used to do exactly that, and a mid-typing render
                (the XID lookup resolving) reset the uncontrolled input and ate
                keystrokes.

                The `xid-`/`name-` prefixes keep the two rows in separate key
                namespaces, so a share-link import — which arrives with `xid`
                and `name` both empty and now shares the same epoch — cannot land
                two siblings on one key and draw React's duplicate-key warning. */}
            <TextFieldRow key={`xid-${externalEpoch}`} topic="xid" label="Recipe ID"
                          initialValue={recipe.xid}
                          maxLength={8} autoCapitalize="characters"
                          showHint={showHint}
                          note={xidLookupFailed ? "not found" : undefined}
                          validate={isValidXID} onInvalidChange={onInputErrorChange}
                          invalidReason="Not a valid ID: three letters, an optional T, then two or three digits, like CGL12."
                          onFocusChange={onXidFocusChange}
                          onDraft={(value) => onDraft(RECIPE_LABELS.XID, value)}
                          onCommit={(value) => dispatch(RECIPE_LABELS.XID, value)}/>

            <TextFieldRow key={`name-${externalEpoch}`} topic="name" label="Name"
                          initialValue={recipe.name}
                          maxLength={100}
                          showHint={showHint}
                          onDraft={(value) => onDraft(RECIPE_LABELS.TITLE, value)}
                          onCommit={(value) => dispatch(RECIPE_LABELS.TITLE, value)}/>

            {/* Keyed on the same epoch and for the same reason as the rows
                above: a revert has to reset the text the field is showing, and
                nothing else may remount it mid-sentence. */}
            <NoteSection key={`note-${externalEpoch}`}
                         initialValue={recipe.description}
                         onDraft={(value) => onDraft(RECIPE_LABELS.NOTE, value)}
                         onCommit={(value) => dispatch(RECIPE_LABELS.NOTE, value)}/>
        </YStack>
    );
}
