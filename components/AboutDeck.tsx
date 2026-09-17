import React from "react";
import {YStack} from "tamagui";

import FromSection from "@/components/FromSection";
import HistorySection from "@/components/HistorySection";
import NoteSection from "@/components/NoteSection";
import PodSection from "@/components/PodSection";
import {RECIPE_LABELS} from "@/hooks/useRecipeEditor";
import type {BrewSummary} from "@/library/BrewDatabase";
import Recipe from "@/library/Recipe";

/** What a field's edit callback commits, given a label and the new value. */
type Dispatch = (label: string, value: string) => void;

type Props = {
    recipe: Recipe;
    /** The recipe's own colour, which the FROM mark falls back to. */
    accent: string;
    /** `showRecipeAvatars`, off by default. */
    showAvatar: boolean;
    /** How many times this recipe has been brewed, and when last. */
    brews: BrewSummary;
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
     * text rows key on it, so a genuine external replacement remounts them
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
 * and a lookup key rather than brew parameters. Taking them off gives the deck
 * of steppers and segmented rows its subject back, and gives the sections that
 * answer what a recipe is -- the note, the pod, where it arrived from and how
 * it has gone -- somewhere to be that is not a fourth thing bolted to BREW.
 *
 * The name has no row here. It is the screen header, renamed through a sheet
 * from any of the three decks, and a second place to type it would be two
 * controls for one field.
 *
 * The ID row is moved, not rewritten. Its keying on the external-replacement
 * epoch and the focus report that defers the XID lookup are load-bearing, and
 * the comments that say why went with it into the pod section.
 */
export default function AboutDeck({
    recipe, accent, showAvatar, brews, showHint, dispatch, onDraft, onInputErrorChange,
    xidLookupFailed, externalEpoch, onXidFocusChange
}: Props) {
    return (
        <YStack gap="$2" marginTop="$3">
            {/* Keyed on the same epoch and for the same reason as the ID row
                inside the pod section: a revert has to reset the text the field
                is showing, and nothing else may remount it mid-sentence. */}
            <NoteSection key={`note-${externalEpoch}`}
                         initialValue={recipe.description}
                         onDraft={(value) => onDraft(RECIPE_LABELS.NOTE, value)}
                         onCommit={(value) => dispatch(RECIPE_LABELS.NOTE, value)}/>

            <PodSection recipe={recipe} showHint={showHint}
                        xidLookupFailed={xidLookupFailed}
                        externalEpoch={externalEpoch}
                        onXidFocusChange={onXidFocusChange}
                        onInputErrorChange={onInputErrorChange}
                        onDraft={(value) => onDraft(RECIPE_LABELS.XID, value)}
                        onCommit={(value) => dispatch(RECIPE_LABELS.XID, value)}
                        onFollowPod={() => dispatch(RECIPE_LABELS.TITLE, "")}/>

            <FromSection recipe={recipe} accent={accent} showAvatar={showAvatar}/>

            <HistorySection summary={brews}/>
        </YStack>
    );
}
