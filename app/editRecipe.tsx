import {useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useRef, useState} from "react";
import {Pressable, ScrollView, View, useWindowDimensions} from "react-native";
import Animated, {
    useAnimatedStyle, useSharedValue, withTiming
} from "react-native-reanimated";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Input, Text, XStack, YStack} from "tamagui";

import DeckSwitch, {type Deck} from "@/components/DeckSwitch";
import DotMatrixText from "@/components/DotMatrixText";
import FieldRow from "@/components/FieldRow";
import HelpSheet from "@/components/HelpSheet";
import HeroMorph, {type Rect} from "@/components/HeroMorph";
import NfcOverlay from "@/components/NfcOverlay";
import RecipeHero from "@/components/RecipeHero";
import RecipeOverflowSheet from "@/components/RecipeOverflowSheet";
import RevertSheet from "@/components/RevertSheet";
import SegmentedRow from "@/components/SegmentedRow";
import StageProfile from "@/components/StageProfile";
import StageTile, {type StageField} from "@/components/StageTile";
import Stepper from "@/components/Stepper";
import TeaBanner from "@/components/TeaBanner";
import {palette} from "@/constants/colors";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import type {HelpTopic} from "@/constants/recipeHelp";
import {useCardWriter} from "@/hooks/useCardWriter";
import {useCollapsibleHeader} from "@/hooks/useCollapsibleHeader";
import {RECIPE_LABELS, useRecipeEditor} from "@/hooks/useRecipeEditor";
import {useSetting} from "@/hooks/useSetting";
import {resolveAccent} from "@/library/accent";
import type Pour from "@/library/Pour";
import Recipe, {CUP_TYPE, isValidXID} from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

/**
 * The rectangle the editor was opened out of, if it was opened out of one.
 *
 * Route params are strings and a param is whatever the last caller put there,
 * so this is parsed defensively: a malformed or partial rectangle means no
 * transition, never a view flying in from a corner or from NaN.
 */
export function openedFrom(raw: string | string[] | undefined): Rect | null {
    if (typeof raw !== "string") {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object") {
            return null;
        }
        const rect = parsed as Partial<Rect>;
        const finite = (value: unknown): value is number =>
            typeof value === "number" && Number.isFinite(value);
        if (!finite(rect.x) || !finite(rect.y) || !finite(rect.width) || !finite(rect.height)) {
            return null;
        }
        return rect.width > 0 && rect.height > 0
            ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
            : null;
    } catch {
        return null;
    }
}

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
    showHint: boolean;
    onCommit: (value: string) => void;
    /** Validates on every keystroke; false marks the field and reports up. */
    validate?: (value: string) => boolean;
    /** The reason shown while `validate` returns false. Prose, not a caption. */
    invalidReason?: string;
    /** Reports the field's validity so the write and save gates can honour it. */
    onInvalidChange?: (invalid: boolean) => void;
};

/**
 * A `FieldRow` whose value is typed.
 *
 * Uncontrolled — the recipe is mutated in place and published by a key bump, so
 * feeding the input back a controlled `value` on every keystroke would fight the
 * cursor. It commits when editing ends, which is when the value is worth writing
 * back.
 *
 * A field may validate live: `validate` runs on every keystroke, not only on
 * commit, so a bad value closes the write and save gates before the field
 * blurs. Validity is reported up rather than kept here alone, because the gate
 * it feeds lives on the screen.
 *
 * Declared at module scope so it is not a fresh component type on every render
 * of the screen, which would remount it and drop the text mid-entry.
 */
function TextFieldRow({
    topic, label, initialValue, maxLength, autoCapitalize,
    showHint, onCommit,
    validate, invalidReason, onInvalidChange
}: TextFieldRowProps) {
    const [invalid, setInvalid] = useState(() => validate ? !validate(initialValue) : false);

    // Reports validity on mount, and this row is keyed on the value it mirrors
    // by its call sites — so an external change (a revert to a good ID, a
    // refreshed name) remounts the whole row and both the local `invalid` mark
    // and the screen's gate are recomputed from the new value. Keying only the
    // inner input left this state behind: the danger colour and the reason
    // stayed on a field that now held something valid.
    useEffect(() => {
        if (validate) onInvalidChange?.(!validate(initialValue));
    }, [initialValue, validate, onInvalidChange]);

    function onChangeText(value: string) {
        if (!validate) return;
        const bad = !validate(value);
        setInvalid(bad);
        onInvalidChange?.(bad);
    }

    return (
        <FieldRow topic={topic} showHint={showHint}
                  error={invalid ? invalidReason : undefined}>
            {/* Not keyed here: the key belongs on the row, which is what owns
                the `invalid` state this input feeds. */}
            <Input unstyled accessibilityLabel={label}
                   defaultValue={initialValue} maxLength={maxLength}
                   autoCapitalize={autoCapitalize} onChangeText={onChangeText}
                   onEndEditing={(event) => onCommit(event.nativeEvent.text)}
                   textAlign="right" minWidth={110} fontSize={16}
                   color={invalid ? palette.danger : palette.text}/>
        </FieldRow>
    );
}

type BrewDeckProps = {
    recipe: Recipe;

    accent: string;
    balanceTarget: number;
    showHint: boolean;
    dispatch: Dispatch;
    /** Reports the recipe-ID field's validity into the screen's write/save gate. */
    onInputErrorChange: (invalid: boolean) => void;
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
function BrewDeck({
    recipe, accent, balanceTarget, showHint,
    dispatch, onInputErrorChange
}: BrewDeckProps) {
    "use no memo";

    // These components draw a model that is mutated in place: `pour.getVolume()`
    // is a method call, not a property read, so the React Compiler cannot see
    // that the value moved and would serve a cached render. The screen used to
    // force the redraw with a React `key`, but that remounts, and a remounted
    // `Stepper` loses the chained timer behind hold-to-repeat after one step —
    // on a stage volume that ranges to 240 ml, that is the whole feature.

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

            <FieldRow topic="dose"
                      showHint={showHint}>
                <Stepper label="Dose" value={recipe.dosage}
                         min={1} max={isTea ? 10 : 31} step={1} unit="g" accent={accent}
                         onChange={(value) => dispatch(RECIPE_LABELS.DOSE, String(value))}/>
            </FieldRow>

            <FieldRow topic="ratio"
                      showHint={showHint}>
                <Stepper label="Ratio" value={recipe.ratio}
                         min={5} max={100} step={1} accent={accent}
                         onChange={(value) => dispatch(RECIPE_LABELS.RATIO, String(value))}/>
            </FieldRow>

            {showGrind && (
                <FieldRow topic="grindSize"
                      showHint={showHint}>
                    <Stepper label="Grind size" value={recipe.grindSize}
                             min={40} max={80} step={1}
                             onChange={(value) => dispatch(RECIPE_LABELS.GRIND_SIZE, String(value))}/>
                </FieldRow>
            )}

            {showGrind && (
                <FieldRow topic="grindSpeed"
                      showHint={showHint}>
                    <Stepper label="Grind speed" value={recipe.grindRPM}
                             min={60} max={120} step={10} unit="rpm"
                             onChange={(value) => dispatch(RECIPE_LABELS.GRIND_RPM, String(value))}/>
                </FieldRow>
            )}

            {/* Both rows are coffee-only. A tea card's cup type is `TEA`, which
                is deliberately not among the three options — so on tea the row
                showed nothing selected and tapping any option silently turned
                the recipe into a coffee card. The grinder toggle is inert for
                tea besides, since a tea card always writes the default grind.
                The previous editor hid the pair for the same reasons. */}
            {!isTea && (
                <SegmentedRow topic="cup" value={String(recipe.cupType)} options={CUP_OPTIONS}
                              accent={accent}
                      showHint={showHint}
                              onChange={(value) => dispatch(RECIPE_LABELS.CUP, value)}/>
            )}

            {!isTea && (
                <SegmentedRow topic="grinder" value={recipe.grinder ? "1" : "0"} options={GRINDER_OPTIONS}
                      showHint={showHint}
                              onChange={(value) => dispatch(RECIPE_LABELS.GRINDER, value)}/>
            )}

            {/* Keyed on the value it mirrors, so an external change — a
                revert, a refreshed xBloom name — remounts this one row and
                nothing else. It sits on the row rather than the input because
                the row owns the validity state. The key bump used to live on
                the scroll container, which reset the scroll offset every time
                a stepper was nudged. */}
            <TextFieldRow key={recipe.xid} topic="xid" label="Recipe ID" initialValue={recipe.xid}
                          maxLength={8} autoCapitalize="characters"
                      showHint={showHint}
                          validate={isValidXID} onInvalidChange={onInputErrorChange}
                          invalidReason="Not a valid ID — three letters, an optional T, then two or three digits, like CGL12."
                          onCommit={(value) => dispatch(RECIPE_LABELS.XID, value)}/>

            <TextFieldRow key={recipe.name} topic="name" label="Name" initialValue={recipe.name}
                          maxLength={100}
                      showHint={showHint}
                          onCommit={(value) => dispatch(RECIPE_LABELS.TITLE, value)}/>
        </YStack>
    );
}

type StagesDeckProps = {
    recipe: Recipe;

    balance: {poured: number; target: number; balanced: boolean};
    accent: string;
    isTea: boolean;
    /** The open stage's index, or null. Held by the screen, not the tile. */
    openStage: number | null;
    setOpenStage: React.Dispatch<React.SetStateAction<number | null>>;
    /** Reports where a stage sits within the deck, so it can be scrolled to. */
    onStageLayout: (index: number, y: number) => void;
    editStage: (index: number, field: StageField, value: number) => void;
    addPour: (pourNumber: number) => void;
    deletePour: (pourNumber: number) => void;
    autoAdjustPourVolumes: () => void;
};

type StageProfileCardProps = {
    pours: Pour[];
    target: number;
    accent: string;
    /** The stage the list has open, so the curve can highlight its band. */
    selected: number | null;
    /** The header has collapsed, so the screen is short of room. */
    collapsed: boolean;
    onSelect: (index: number) => void;
    /** Reports how much of the content the pinned card covers, once laid out. */
    onHeight: (height: number) => void;
};

/**
 * The brew drawn as one curve, pinned to the top of the stages deck.
 *
 * A direct child of the screen's ScrollView rather than part of `StagesDeck`,
 * because `stickyHeaderIndices` only sticks direct children. It keeps its place
 * in the flow and pins once it reaches the top, so the curve stays in view while
 * you scroll down to a stage and watch your edits move it.
 *
 * The backdrop is opaque `base`: a sticky view has the list running underneath
 * it, and the card's rounded corners would otherwise show tiles sliding through.
 */
/**
 * How tall the curve is drawn, before and after the header collapses.
 *
 * Two pinned surfaces and a pinned action bar leave a phone screen with very
 * little room to edit in. The curve is a shape rather than a chart -- it has no
 * gridlines or labels to lose -- so it survives being read at forty points, and
 * giving those forty points back to the stage being edited is worth more than
 * the amplitude.
 */
export const PROFILE_HEIGHT = {full: 92, compact: 52} as const;

function StageProfileCard({
    pours, target, accent, selected, collapsed, onSelect, onHeight
}: StageProfileCardProps) {
    "use no memo";

    // The profile is drawn into an SVG of a fixed pixel size, so it has to be
    // told how wide the screen is. `16` of screen padding either side and `$3`
    // inside the card is 64 points in total.
    const {width} = useWindowDimensions();

    return (
        <YStack backgroundColor={palette.base}
                paddingTop={collapsed ? "$1.5" : "$3"} paddingBottom="$2.5"
                onLayout={(event) => onHeight(event.nativeEvent.layout.height)}>
            <YStack backgroundColor={palette.surface} borderRadius="$5"
                    padding={collapsed ? "$2" : "$3"}>
                <StageProfile testID="stage-profile" pours={pours}
                              target={target} accent={accent}
                              width={collapsed ? width - 56 : width - 64}
                              height={collapsed
                                  ? PROFILE_HEIGHT.compact
                                  : PROFILE_HEIGHT.full}
                              selected={selected ?? undefined} onSelect={onSelect}/>
            </YStack>
        </YStack>
    );
}

/**
 * The whole brew as one shape, with a stage opening in place underneath it.
 *
 * There is no pager. The pours used to be a horizontal pager nested inside the
 * vertical scroll and the two fought each other; here the stages are a plain
 * vertical run and the profile above them draws the brew as a single curve
 * against its target line.
 *
 * Which stage is open lives on the screen, not on the tile: one at a time, so
 * the profile has a single band to highlight, and a tile that owned its own
 * state would let three open at once.
 *
 * Module scope, so it is a stable component type across the screen's renders.
 */
function StagesDeck({
    recipe, balance, accent, isTea, openStage, setOpenStage, onStageLayout,
    editStage, addPour, deletePour, autoAdjustPourVolumes,
}: StagesDeckProps) {
    "use no memo";

    // These components draw a model that is mutated in place: `pour.getVolume()`
    // is a method call, not a property read, so the React Compiler cannot see
    // that the value moved and would serve a cached render. The screen used to
    // force the redraw with a React `key`, but that remounts, and a remounted
    // `Stepper` loses the chained timer behind hold-to-repeat after one step —
    // on a stage volume that ranges to 240 ml, that is the whole feature.

    // Adding a fourth tea stage is refused by the hook with a toast; the tile is
    // dimmed by swapping its colours, never by dropping the group's opacity —
    // opacity multiplies with what is beneath and has produced a contrast defect
    // in this sub-project before.
    const addDisabled = isTea && recipe.pours.length >= 3;

    return (
        <YStack>
            {!balance.balanced && (
                <XStack testID="stage-mismatch" alignItems="center" gap="$2.5"
                        marginTop="$2.5" padding="$3" borderRadius="$4"
                        backgroundColor={palette.raised}
                        borderLeftWidth={2} borderLeftColor={palette.danger}>
                    <YStack flex={1} gap={2}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={palette.danger}>
                            {`${balance.poured} OF ${balance.target} ML`}
                        </DotMatrixText>
                        <Text fontSize={12} lineHeight={16} color={palette.dim}>
                            The machine rejects a recipe whose stages do not add up to
                            the dose times the ratio.
                        </Text>
                    </YStack>
                    <Pressable accessibilityRole="button" accessibilityLabel="Auto fix"
                               onPress={autoAdjustPourVolumes}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={accent}>
                            AUTO FIX
                        </DotMatrixText>
                    </Pressable>
                </XStack>
            )}

            {recipe.pours.map((pour, index) => (
                <View key={index}
                      onLayout={(event) => onStageLayout(index, event.nativeEvent.layout.y)}>
                <StageTile pour={pour} index={index}
                           count={recipe.pours.length}
                           open={openStage === index} accent={accent} isTea={isTea}
                           // From the current value, not from the one this
                           // render closed over. The curve above also sets it,
                           // so two taps in quick succession -- or a tap
                           // arriving after a selection -- would otherwise
                           // decide against a stage that was already stale.
                           onToggle={(i) =>
                               setOpenStage((current) => (current === i ? null : i))}
                           onChange={editStage}
                           onDelete={(i) => {
                               // Close first, or `openStage` would point past
                               // the end of the shortened list.
                               setOpenStage(null);
                               deletePour(i);
                           }}/>
                </View>
            ))}

            <Pressable accessibilityRole="button" accessibilityLabel="Add stage"
                       accessibilityState={{disabled: addDisabled}}
                       disabled={addDisabled}
                       onPress={() => {
                           // `Recipe.addPour(n)` copies `pours[n]` and splices
                           // in after it, so appending is the last index.
                           if (!addDisabled) addPour(recipe.pours.length - 1);
                       }}>
                <XStack alignItems="center" justifyContent="center" gap="$2"
                        marginTop="$2.5" paddingVertical="$3.5" borderRadius="$5"
                        borderWidth={1} borderColor={addDisabled ? palette.line : accent}
                        borderStyle="dashed">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                                   color={addDisabled ? palette.dim : accent}>
                        + ADD STAGE
                    </DotMatrixText>
                </XStack>
            </Pressable>
        </YStack>
    );
}

/**
 * Where to scroll so a stage sits just under the pinned profile.
 *
 * `deckY` and `tileY` are both layout offsets -- the deck's within the scroll
 * content, the tile's within the deck -- and the profile card is pinned over
 * the top of the content, so its height has to come off. Clamped at zero
 * because the first stage is already above the fold and scrolling to a negative
 * offset would bounce.
 */
export function stageScrollTarget(deckY: number, tileY: number, stickyHeight: number) {
    return Math.max(0, deckY + tileY - stickyHeight);
}

/**
 * The screen, fading out while it is being left.
 *
 * Only the hero has a rectangle travelling back to the list for it; the deck
 * below has nothing, and a deck still at full strength around a shrinking
 * hero-sized patch of accent looks like a bug rather than a departure. So the
 * whole body goes, and what is left at the end is the rectangle over the base
 * colour -- which is what the list will replace.
 *
 * Its own component because the screen is marked `"use no memo"`, and the
 * compiler will not follow a shared value through a component it has bailed out
 * of: writing `fade.value` there is an error rather than a warning. It is the
 * better shape regardless.
 */
function ExitFade({away, children}: {away: boolean; children: React.ReactNode}) {
    const fade = useSharedValue(1);

    useEffect(() => {
        if (away) {
            fade.value = withTiming(0, {
                duration: DURATION.transition,
                easing:   EASING.emphasised
            });
        }
    }, [away, fade]);

    // One key, always. Reanimated does not clear a property that a style stops
    // returning -- it keeps applying the last value it saw -- so a style that
    // changes its shape leaves whatever it dropped stuck on the view.
    const style = useAnimatedStyle(() => ({opacity: fade.value}));

    return <Animated.View style={[{flex: 1}, style]}>{children}</Animated.View>;
}

type ActionBarProps = {
    accent: string;
    canWrite: boolean;
    canSave: boolean;
    onWrite: () => void;
    onSave: () => void;
    /** Reports how much of the screen the bar covers, once laid out. */
    onHeight: (height: number) => void;
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
/** How far the bar sits into the home indicator's inset. */
const ACTION_BAR_SINK = 5;

function ActionBar({accent, canWrite, canSave, onWrite, onSave, onHeight}: ActionBarProps) {
    const insets = useSafeAreaInsets();

    return (
        // The bottom padding is the home indicator's own height, less a few
        // points. The inset is clearance for a gesture, not a margin, and the
        // buttons are tall enough that overlapping its outer edge costs nothing
        // -- on the phone this was tuned against, the full inset still read as
        // the bar floating. The top padding is half the sides'. The bar is
        // pinned over the deck, so every point above the buttons is a point
        // taken off the control being edited underneath it.
        <XStack testID="editor-actions"
                position="absolute" bottom={0} left={0} right={0} gap="$2"
                paddingHorizontal="$4" paddingTop="$2"
                paddingBottom={Math.max(insets.bottom - ACTION_BAR_SINK, 0)}
                backgroundColor={palette.base}
                onLayout={(event) => onHeight(event.nativeEvent.layout.height)}>
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
    "use no memo";

    // The screen owns a `Recipe` that every edit mutates in place, and it
    // publishes those edits by bumping a counter rather than by cloning. The
    // React Compiler cannot see through that — the recipe's identity never
    // changes — so it is told not to cache this render or the elements it
    // builds. Its children that draw the same model opt out for the same
    // reason. Note that the compiler is off under jest, so no test can catch a
    // regression here; see `babel-preset-expo` and `app.json`'s experiments.

    const {recipeJSON, fromRect} = useLocalSearchParams<{recipeJSON: string; fromRect?: string}>();
    const navigation = useNavigation();
    const {width: windowWidth} = useWindowDimensions();
    const reducedMotion = useReducedMotion();

    const [showHint] = useSetting("showHints");

    const [deck, setDeck] = useState<Deck>("brew");
    const [openStage, setOpenStage] = useState<number | null>(null);
    const [actionBarHeight, setActionBarHeight] = useState(0);
    const [heroHeight, setHeroHeight] = useState(0);

    // The morph is a one-shot entrance: once it has played, or once the user has
    // asked for less motion, the screen is just a screen. It also has to be
    // asked for. Off, the screen is pushed with the platform's own slide, and
    // the rectangle must not be drawn at all -- it is measured against the
    // window, and a screen that is sliding is not where the window says it is.
    const [cardMorph] = useSetting("cardMorph");
    const [morphed, setMorphed] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const morphFrom = cardMorph ? openedFrom(fromRect) : null;
    const canMorph = !reducedMotion && morphFrom !== null && heroHeight > 0;
    const showMorph = canMorph && !morphed && !leaving;

    /**
     * Go back the way we came in.
     *
     * Running the entrance backwards rather than cutting: the card grew out of
     * the list, so it has to go back into it, and the screen underneath is the
     * list it came from. The body fades while the rectangle shrinks, because the
     * rectangle only covers the hero and the deck showing through a hero-sized
     * hole is worse than either. With the morph off there is a platform pop to
     * do the same job, so this is not in the way of anything.
     */
    const goBack = () => {
        if (canMorph && !leaving) {
            setLeaving(true);
        } else {
            navigation.goBack();
        }
    };


    // Layout facts, not state: nothing on screen changes when a stage moves,
    // and putting them in state would re-render the whole editor on every
    // layout pass of every tile.
    const scrollRef = useRef<ScrollView>(null);
    const stageOffsets = useRef<number[]>([]);
    const deckOffset = useRef(0);
    const profileHeight = useRef(0);

    /**
     * Open a stage from the curve and bring it into view.
     *
     * Selecting alone was not enough. The profile is pinned to the top, so from
     * halfway down the list a tap on it would highlight and open a tile that
     * was off screen in either direction, and nothing appeared to happen.
     */
    function selectStage(index: number) {
        setOpenStage(index);
        const tileY = stageOffsets.current[index];
        if (tileY === undefined) return;
        scrollRef.current?.scrollTo({
            y:        stageScrollTarget(deckOffset.current, tileY, profileHeight.current),
            animated: true
        });
    }
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [revertOpen, setRevertOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    // The setting supplies the initial value; the header toggle changes it for
    // this visit only and never writes back, so a user can fold the notes away
    // without changing what the next recipe opens on.

    const {collapsed, onScroll} = useCollapsibleHeader();

    const {
        recipe, balance, canWrite, canSave, revertSources,
        bumpKey, handleReloadTitlePress, saveRecipe, editInputComplete, setVolumeError,
        setInputError, editStage, addPour, deletePour, autoAdjustPourVolumes
    } = useRecipeEditor({
        recipeJSON: recipeJSON as string | undefined,
        onSaved:    () => navigation.goBack()
    });

    const {writeCard, onNFCDialogClose, showNfcOverlay, writeProgress} = useCardWriter(setVolumeError);

    // Computed before the header effect, not after the `recipe` guard below, so
    // the EXPLAIN caption can be drawn in the recipe's accent. Falls back to a
    // neutral tint on the render where the recipe has not resolved yet.
    const accent = recipe ? resolveAccent(recipe) : palette.dim;

    if (!recipe) return null;

    // Every edit republishes the recipe: the model is mutated in place, so a key
    // bump is what repaints the steppers and the derived total. Several of the
    // hook's field updaters do not bump the key themselves, so the screen does.
    const dispatch: Dispatch = (label, value) => {
        void editInputComplete(label, value);
        bumpKey();
    };

    function duplicateRecipe() {
        // The recipe in hand, not its stored row. A recipe read from a card or
        // imported from a link has no row yet, so duplicating one used to
        // create nothing and navigate back as though it had; for a saved one it
        // copied the last save and dropped every unsaved edit.
        new RecipeDatabase().duplicateRecipe(recipe!);
        navigation.goBack();
    }

    function deleteRecipe() {
        new RecipeDatabase().deleteRecipe(recipe!.uuid);
        navigation.goBack();
    }

    return (
        <>
            {/* The NFC ceremony is a modal moment, and an absolutely positioned
                overlay only covers the screen visually. While it is up this
                subtree hides its own descendants from the screen reader, so
                TalkBack cannot reach and fire the controls behind it — the
                Android half of what `accessibilityViewIsModal` does on iOS. */}
            <ExitFade away={leaving}>
            <YStack flex={1} backgroundColor={palette.base}
                    accessibilityElementsHidden={showNfcOverlay}
                    importantForAccessibility={showNfcOverlay ? "no-hide-descendants" : "auto"}>
            {/* Outside the scroll view, so it is the screen's header rather
                than its first row. It collapses itself on scroll instead of
                scrolling away: it stays mounted and animates its height,
                because a subtree that has left layout cannot animate away and
                the list under it would snap up in one frame. The two-threshold
                hysteresis in `useCollapsibleHeader` keeps it from strobing when
                the list rests near the threshold. */}
            {/* The hero's own frame, measured. The morph has to know where it
                is travelling to, and the hero draws its own safe-area padding,
                so the height is not something the screen can work out. */}
            <View testID="hero-slot"
                  onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)}>
            <RecipeHero name={recipe.displayName()} named={recipe.hasName()}
                        xid={recipe.xid} accent={accent} collapsed={collapsed}
                        beverage={recipe.isTea() ? "TEA" : "COFFEE"} pours={recipe.pours}
                        onBack={goBack}
                        onMore={() => setOverflowOpen(true)}/>
            </View>

            {/* `stickyHeaderIndices` only sticks *direct* children, and it
                counts slots — so every slot below is always occupied, by an
                empty `YStack` when it has nothing to show. A conditional that
                renders `false` would be dropped from the array and shift the
                index onto the wrong child. Index 2 is the stage profile; on the
                brew deck nothing sticks. */}
            {/* React Native's own scroll view, not Tamagui's. Nothing here
                needs a style prop it would add, and `delaysContentTouches` --
                which the deck of tap-to-open tiles depends on -- is not in
                Tamagui's prop types. */}
            <ScrollView testID="editor-scroll" ref={scrollRef}
                        contentContainerStyle={{
                            padding:       16,
                            // Measured, not guessed: the bar's height depends on
                            // the OS text size and on the home indicator, and a
                            // fixed 120 was both too much on some phones and
                            // too little on others.
                            paddingBottom: actionBarHeight + 16
                        }}
                        stickyHeaderIndices={deck === "stages" ? [2] : undefined}
                        onScroll={onScroll} scrollEventThrottle={16}>
                {recipe.isTea() ? <TeaBanner accent={accent}/> : <YStack/>}

                <DeckSwitch deck={deck} stageCount={recipe.pours.length}
                            accent={accent} onChange={setDeck}/>

                {deck === "stages" ? (
                    <StageProfileCard pours={recipe.pours} target={balance.target}
                                      accent={accent} selected={openStage}
                                      collapsed={collapsed}
                                      onSelect={selectStage}
                                      onHeight={(height) => {
                                          profileHeight.current = height;
                                      }}/>
                ) : <YStack/>}

                {/* The deck is keyed on the counter, not the scroll container: the
                    model is mutated in place, so `recipe` keeps its identity
                    across an edit and the deck has to be told the value moved.
                    The key used to sit on the ScrollView, which sent the user
                    back to the top of the screen on every nudge. */}
                {deck === "brew" ? (
                    <BrewDeck recipe={recipe} accent={accent} balanceTarget={balance.target}
                              showHint={showHint} dispatch={dispatch}
                              onInputErrorChange={setInputError}/>
                ) : (
                    <View onLayout={(event) => {
                        deckOffset.current = event.nativeEvent.layout.y;
                    }}>
                    <StagesDeck recipe={recipe} balance={balance} accent={accent}
                                isTea={recipe.isTea()} openStage={openStage}
                                setOpenStage={setOpenStage} editStage={editStage}
                                onStageLayout={(index, y) => {
                                    stageOffsets.current[index] = y;
                                }}
                                addPour={addPour} deletePour={deletePour}
                                autoAdjustPourVolumes={autoAdjustPourVolumes}/>
                    </View>
                )}
            </ScrollView>

            <ActionBar accent={accent} canWrite={canWrite} canSave={canSave}
                       onWrite={() => writeCard(recipe)} onSave={saveRecipe}
                       onHeight={setActionBarHeight}/>

            <RecipeOverflowSheet open={overflowOpen} canRefreshName={recipe.xid.trim().length > 0}
                                 onOpenChange={setOverflowOpen}
                                 onDuplicate={duplicateRecipe}
                                 onRefreshName={handleReloadTitlePress}
                                 onRevert={() => setRevertOpen(true)}
                                 onHelp={() => setHelpOpen(true)}
                                 onDelete={deleteRecipe}/>

            <RevertSheet open={revertOpen} sources={revertSources}
                         onOpenChange={setRevertOpen} onReverted={bumpKey}/>

            <HelpSheet open={helpOpen} onOpenChange={setHelpOpen}/>
            </YStack>
            </ExitFade>

            <NfcOverlay visible={showNfcOverlay} mode="write"
                        progress={writeProgress} onCancel={onNFCDialogClose}/>

            {(showMorph || leaving) && morphFrom !== null && (
                <HeroMorph from={morphFrom} accent={accent}
                           direction={leaving ? "out" : "in"}
                           to={{x: 0, y: 0, width: windowWidth, height: heroHeight}}
                           onDone={leaving ? () => navigation.goBack() : () => setMorphed(true)}/>
            )}
        </>
    );
}
