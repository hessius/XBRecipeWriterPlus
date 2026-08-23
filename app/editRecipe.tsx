import {useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useState} from "react";
import {Pressable} from "react-native";
import {Input, ScrollView, Text, XStack, YStack} from "tamagui";

import DeckSwitch, {type Deck} from "@/components/DeckSwitch";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import FieldRow from "@/components/FieldRow";
import HelpSheet from "@/components/HelpSheet";
import NfcOverlay from "@/components/NfcOverlay";
import RecipeHero from "@/components/RecipeHero";
import RecipeOverflowSheet from "@/components/RecipeOverflowSheet";
import RevertSheet from "@/components/RevertSheet";
import SegmentedRow from "@/components/SegmentedRow";
import Stepper from "@/components/Stepper";
import {palette} from "@/constants/colors";
import type {HelpTopic} from "@/constants/recipeHelp";
import {useCardWriter} from "@/hooks/useCardWriter";
import {RECIPE_LABELS, useRecipeEditor} from "@/hooks/useRecipeEditor";
import {useSetting} from "@/hooks/useSetting";
import {resolveAccent} from "@/library/accent";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {asHelpStyle, type HelpStyle} from "@/library/Settings";

/** What a field's edit callback commits, given a label and the new value. */
type Dispatch = (label: string, value: string) => void;

/**
 * The cup and grinder choices, as the segmented rows want them. Values are the
 * strings `editInputComplete` dispatches on: `cupType` as a number, the grinder
 * as the "1"/"0" its updater reads.
 */
const CUP_OPTIONS = [
    {value: String(CUP_TYPE.XPOD), label: "XPOD"},
    {value: String(CUP_TYPE.OMNI), label: "OMNI"},
    {value: String(CUP_TYPE.OTHER), label: "OTHER"}
] as const;

const GRINDER_OPTIONS = [
    {value: "1", label: "ON"},
    {value: "0", label: "OFF"}
] as const;

type TextFieldRowProps = {
    topic: HelpTopic;
    label: string;
    initialValue: string;
    maxLength?: number;
    autoCapitalize?: "none" | "characters";
    helpStyle: HelpStyle;
    explaining: boolean;
    onHelp: (topic: HelpTopic) => void;
    onCommit: (value: string) => void;
};

/**
 * A `FieldRow` whose value is typed.
 *
 * Uncontrolled — the recipe is mutated in place and published by a key bump, so
 * feeding the input back a controlled `value` on every keystroke would fight the
 * cursor. It commits when editing ends, which is when the value is worth writing
 * back.
 *
 * Declared at module scope so it is not a fresh component type on every render
 * of the screen, which would remount it and drop the text mid-entry.
 */
function TextFieldRow({
    topic, label, initialValue, maxLength, autoCapitalize,
    helpStyle, explaining, onHelp, onCommit
}: TextFieldRowProps) {
    return (
        <FieldRow topic={topic} helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}>
            {/* Keyed on the value it mirrors, so an external change — a revert,
                a refreshed xBloom name — remounts this one input and nothing
                else. The screen used to carry the key bump on the scroll
                container instead, which reset the scroll offset every time a
                stepper was nudged. */}
            <Input unstyled key={initialValue} accessibilityLabel={label}
                   defaultValue={initialValue} maxLength={maxLength}
                   autoCapitalize={autoCapitalize}
                   onEndEditing={(event) => onCommit(event.nativeEvent.text)}
                   textAlign="right" minWidth={110} fontSize={16}
                   color={palette.text}/>
        </FieldRow>
    );
}

type BrewDeckProps = {
    recipe: Recipe;
    accent: string;
    balanceTarget: number;
    helpStyle: HelpStyle;
    explaining: boolean;
    onHelp: (topic: HelpTopic) => void;
    dispatch: Dispatch;
};

/**
 * Every brew value on one surface.
 *
 * A reader operates nothing — the user's account of a visit is that most often
 * they only look at it — so there is no pager and no disclosure. The two fields
 * the target is computed from, dose and ratio, are drawn in the accent to tie
 * them to the readout above without a rule between them.
 *
 * Module scope, not an inline function: a component defined inside the screen's
 * body is a new type on every render and would remount its whole subtree.
 */
function BrewDeck({recipe, accent, balanceTarget, helpStyle, explaining, onHelp, dispatch}: BrewDeckProps) {
    const isTea = recipe.isTea();
    // Grind size and speed are meaningless with the grinder off, and a tea card
    // always writes the default grind — so those two rows hide in both cases.
    const showGrind = recipe.grinder && !isTea;

    return (
        <YStack marginTop="$3" backgroundColor={palette.surface} borderRadius="$5"
                overflow="hidden">
            <XStack alignItems="baseline" gap="$2"
                    paddingHorizontal="$4" paddingTop="$4" paddingBottom="$3">
                <DotMatrixText testID="brew-target" fontSize={22} weight="bold" color={accent}>
                    {balanceTarget}
                </DotMatrixText>
                {/* `dim`, not `muted`: muted is 4.12:1 and the palette says in
                    as many words that it is not a text colour. */}
                <Text fontSize={10} letterSpacing={1.6} color={palette.dim}>ML TOTAL</Text>
            </XStack>

            <FieldRow topic="dose" helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}>
                <Stepper label="Dose" value={recipe.dosage}
                         min={1} max={isTea ? 10 : 31} step={1} unit="g" accent={accent}
                         onChange={(value) => dispatch(RECIPE_LABELS.DOSE, String(value))}/>
            </FieldRow>

            <FieldRow topic="ratio" helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}>
                <Stepper label="Ratio" value={recipe.ratio}
                         min={5} max={100} step={1} accent={accent}
                         onChange={(value) => dispatch(RECIPE_LABELS.RATIO, String(value))}/>
            </FieldRow>

            {showGrind && (
                <FieldRow topic="grindSize" helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}>
                    <Stepper label="Grind size" value={recipe.grindSize}
                             min={40} max={80} step={1}
                             onChange={(value) => dispatch(RECIPE_LABELS.GRIND_SIZE, String(value))}/>
                </FieldRow>
            )}

            {showGrind && (
                <FieldRow topic="grindSpeed" helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}>
                    <Stepper label="Grind speed" value={recipe.grindRPM}
                             min={60} max={120} step={10} unit="rpm"
                             onChange={(value) => dispatch(RECIPE_LABELS.GRIND_RPM, String(value))}/>
                </FieldRow>
            )}

            <SegmentedRow topic="cup" value={String(recipe.cupType)} options={CUP_OPTIONS}
                          accent={accent} helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}
                          onChange={(value) => dispatch(RECIPE_LABELS.CUP, value)}/>

            <SegmentedRow topic="grinder" value={recipe.grinder ? "1" : "0"} options={GRINDER_OPTIONS}
                          helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}
                          onChange={(value) => dispatch(RECIPE_LABELS.GRINDER, value)}/>

            <TextFieldRow topic="xid" label="Recipe ID" initialValue={recipe.xid}
                          maxLength={8} autoCapitalize="characters"
                          helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}
                          onCommit={(value) => dispatch(RECIPE_LABELS.XID, value)}/>

            <TextFieldRow topic="name" label="Name" initialValue={recipe.name}
                          maxLength={100}
                          helpStyle={helpStyle} explaining={explaining} onHelp={onHelp}
                          onCommit={(value) => dispatch(RECIPE_LABELS.TITLE, value)}/>
        </YStack>
    );
}

/**
 * The STAGES deck lands in the next step (Task 15) together with the collapsing
 * hero. Until then this is an honest placeholder so the deck switch has
 * somewhere to send you, rather than a half-built editor that could write a
 * stage wrong.
 */
function StagesPlaceholder({stageCount}: {stageCount: number}) {
    return (
        <YStack testID="stages-placeholder" marginTop="$3" padding="$6"
                alignItems="center" gap="$2" backgroundColor={palette.surface}
                borderRadius="$5">
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.6} color={palette.dim}>
                {`STAGES · ${stageCount}`}
            </DotMatrixText>
            <Text fontSize={12} color={palette.muted} textAlign="center">
                The stage editor is not built yet.
            </Text>
        </YStack>
    );
}

type ActionBarProps = {
    accent: string;
    canWrite: boolean;
    canSave: boolean;
    onWrite: () => void;
    onSave: () => void;
};

/**
 * The two actions that earn the bottom of the screen: WRITE and SAVE.
 *
 * Everything else lives behind the caret. Write is disabled while the recipe is
 * one the machine would reject; save is not, because a half-finished recipe is
 * still worth keeping.
 *
 * Module scope, so it is a stable component type across the screen's renders.
 */
function ActionBar({accent, canWrite, canSave, onWrite, onSave}: ActionBarProps) {
    return (
        <XStack position="absolute" bottom={0} left={0} right={0} gap="$2"
                padding="$4" paddingBottom="$6" backgroundColor={palette.base}>
            <Pressable accessibilityRole="button" accessibilityLabel="Write card"
                       accessibilityState={{disabled: !canWrite}}
                       onPress={() => canWrite && onWrite()}
                       style={{flex: 2}}>
                {/* Disabled by swapping the fill, not by dropping the group's
                    opacity: opacity multiplies with whatever is beneath and
                    takes the label down with it. A flat raised tile keeps the
                    word legible while plainly not being the live accent. */}
                <YStack alignItems="center" paddingVertical="$3.5" borderRadius="$4"
                        backgroundColor={canWrite ? accent : palette.raised}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                                   color={canWrite ? palette.base : palette.dim}>
                        WRITE
                    </DotMatrixText>
                </YStack>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Save"
                       accessibilityState={{disabled: !canSave}}
                       onPress={() => canSave && onSave()}
                       style={{flex: 1}}>
                <YStack alignItems="center" paddingVertical="$3.5" borderRadius="$4"
                        borderWidth={1} borderColor={palette.line}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                                   color={canSave ? palette.text : palette.dim}>
                        SAVE
                    </DotMatrixText>
                </YStack>
            </Pressable>
        </XStack>
    );
}

/**
 * The recipe editor: a spec sheet you can edit.
 *
 * The screen owns only what is about the screen — which deck is showing and
 * which sheet is open. The recipe and every mutation on it come from
 * `useRecipeEditor`; the NFC write path comes from `useCardWriter`. The balance
 * is derived at render by the hook, not repainted by hand, which is what fixed
 * the stale total (#40).
 */
export default function EditRecipe() {
    const {recipeJSON, saveEnabled} = useLocalSearchParams();
    const navigation = useNavigation();

    const [helpStyleRaw] = useSetting("helpStyle");
    const helpStyle = asHelpStyle(helpStyleRaw);

    const [deck, setDeck] = useState<Deck>("brew");
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [revertOpen, setRevertOpen] = useState(false);
    const [helpTopic, setHelpTopic] = useState<HelpTopic | "all" | null>(null);

    const {
        recipe, key, balance, canWrite, canSave, revertSources,
        bumpKey, handleReloadTitlePress, saveRecipe, editInputComplete, setVolumeError
    } = useRecipeEditor({
        recipeJSON:           recipeJSON as string | undefined,
        initiallySaveEnabled: saveEnabled === "true",
        onSaved:              () => navigation.goBack()
    });

    const {writeCard, onNFCDialogClose, showNfcOverlay, writeProgress} = useCardWriter(setVolumeError);

    useEffect(() => {
        navigation.setOptions({
            title:       "Edit Recipe",
            headerShown: true,
            headerRight: () => (
                <Pressable accessibilityRole="button" accessibilityLabel="More"
                           onPress={() => setOverflowOpen(true)} hitSlop={12}>
                    <DotIcon name="more" size={16} color={palette.dim}/>
                </Pressable>
            )
        });
    }, [navigation]);

    if (!recipe) return null;

    const accent = resolveAccent(recipe);
    const explaining = helpStyle === "explain";

    // Every edit republishes the recipe: the model is mutated in place, so a key
    // bump is what repaints the steppers and the derived total. Several of the
    // hook's field updaters do not bump the key themselves, so the screen does.
    const dispatch: Dispatch = (label, value) => {
        void editInputComplete(label, value);
        bumpKey();
    };

    function duplicateRecipe() {
        new RecipeDatabase().cloneRecipe(recipe!.uuid);
        navigation.goBack();
    }

    function deleteRecipe() {
        new RecipeDatabase().deleteRecipe(recipe!.uuid);
        navigation.goBack();
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 120}}>
                <RecipeHero name={recipe.displayName()} named={recipe.hasName()}
                            xid={recipe.xid} accent={accent}
                            beverage={recipe.isTea() ? "TEA" : "COFFEE"} pours={recipe.pours}/>

                {/* The tea banner is Task 16. */}

                <DeckSwitch deck={deck} stageCount={recipe.pours.length}
                            accent={accent} onChange={setDeck}/>

                {/* The deck is keyed on the counter, not the scroll container: the
                    model is mutated in place, so `recipe` keeps its identity
                    across an edit and the deck has to be told the value moved.
                    The key used to sit on the ScrollView, which sent the user
                    back to the top of the screen on every nudge. */}
                {deck === "brew" ? (
                    <BrewDeck key={key} recipe={recipe} accent={accent} balanceTarget={balance.target}
                              helpStyle={helpStyle} explaining={explaining}
                              onHelp={setHelpTopic} dispatch={dispatch}/>
                ) : (
                    <StagesPlaceholder stageCount={recipe.pours.length}/>
                )}
            </ScrollView>

            <ActionBar accent={accent} canWrite={canWrite} canSave={canSave}
                       onWrite={() => writeCard(recipe)} onSave={saveRecipe}/>

            <RecipeOverflowSheet open={overflowOpen} canRefreshName={recipe.xid.trim().length > 0}
                                 onOpenChange={setOverflowOpen}
                                 onDuplicate={duplicateRecipe}
                                 onRefreshName={handleReloadTitlePress}
                                 onRevert={() => setRevertOpen(true)}
                                 onHelp={() => setHelpTopic("all")}
                                 onDelete={deleteRecipe}/>

            <RevertSheet open={revertOpen} sources={revertSources}
                         onOpenChange={setRevertOpen} onReverted={bumpKey}/>

            <HelpSheet open={helpTopic !== null} topic={helpTopic ?? "all"}
                       onOpenChange={(open) => {
                           if (!open) setHelpTopic(null);
                       }}/>

            <NfcOverlay visible={showNfcOverlay} mode="write"
                        progress={writeProgress} onCancel={onNFCDialogClose}/>
        </YStack>
    );
}
