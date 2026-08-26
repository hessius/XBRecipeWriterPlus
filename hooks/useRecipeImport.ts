import {useEffect, useRef, useState} from "react";

import {resolveOnOpen} from "@/library/duplicates";
import {parseImportInput, type ImportSource} from "@/library/importInput";
import type Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

/**
 * How long after a keystroke a parsing value is looked up.
 *
 * This cannot be a "finished typing" detector, and does not pretend to be. The
 * pod grammar is prefix-ambiguous -- `^[A-Za-z]{3}T?[0-9]{2,3}$` takes two or
 * three digits -- so `ETH12` and `ETH120` are both complete, and no timer can
 * tell "finished typing ETH12" from "paused halfway through ETH120". Pausing to
 * think is exactly when it fires.
 *
 * That is survivable only because a typed result does not navigate. A premature
 * resolve costs one wasted request and shows a name the user can see is wrong.
 * If typing is ever made to navigate, this constant becomes dangerous.
 */
const DEBOUNCE_MS = 600;

/**
 * How long a non-parsing value sits before the format is explained.
 *
 * Long, deliberately. Telling someone their half-typed code is invalid is
 * scolding them for not having finished.
 */
const ABANDONED_MS = 2500;

/**
 * Why a lookup failed.
 *
 * Three reasons rather than one, because "something went wrong" is not worth
 * writing. Each names the thing the reader can act on: their connection, their
 * input, or nothing at all.
 */
export type ImportErrorReason = "network" | "notFound" | "unusable";

/** What the found panel draws. Everything it needs, and nothing else. */
export type ImportPreview = {
    recipe: Recipe;
    /** The library already holds a recipe that would write the same card. */
    isExisting: boolean;
    name: string;
    subtitle: string;
    /** The pod photo, or `""`. Absent for every shared recipe. */
    imageURL: string;
};

export type ImportState =
    | {status: "idle"}
    | {status: "resolving"}
    | {status: "found"; preview: ImportPreview}
    | {status: "error"; reason: ImportErrorReason; message: string};

/**
 * Whether the value arrived whole, a character at a time, or as a shortcut.
 *
 * Atomic input navigates on its own; deliberate input waits to be asked. A
 * paste, a share intent and the tile's shortcut all deliver a complete value in
 * one event that the user chose. Typing delivers a value that is complete only
 * by guesswork.
 *
 * `"shortcut"` is the tile's paste shortcut: atomic, so it navigates on a fresh
 * recipe, but it must not re-open a recipe the sticky clipboard still points at.
 * Instead the shortcut degrades to the found panel *and* the field, so the user
 * can reach a different recipe -- which is what they opened the tile for.
 */
export type ImportIntent = "atomic" | "deliberate" | "shortcut";

type Options = {
    /** The library, for de-duplication. Passed in rather than re-opened here. */
    stored: Recipe[];
    /** Navigation belongs to the screen; the timing rule belongs here. */
    onOpenRecipe: (recipe: Recipe, isExisting: boolean) => void;
};

export type RecipeImport = {
    state: ImportState;
    /** The field's text. */
    value: string;
    /**
     * Whether the sheet should draw its input field.
     *
     * False while an atomic value (a paste or a share intent) or the tile's
     * shortcut resolves -- there is nothing to type -- and true otherwise,
     * including when a shortcut degrades to the found panel because the recipe
     * is already held, and whenever a lookup fails, so an error always leaves a
     * field to retry from. The rule lives here, the sole authority, not on the
     * screen: the degrade is discovered only after the fetch, so the sheet
     * cannot decide it from a prop set when it opened.
     */
    showField: boolean;
    /** Whether the "paste a link or a code" hint is showing. */
    hint: boolean;
    /** From the field. Decides paste versus typing from the size of the change. */
    onChangeText: (next: string) => void;
    /** From a paste affordance, a share intent, or the tile shortcut. */
    resolveNow: (source: ImportSource, intent: ImportIntent) => void;
    /** Text from a paste affordance, which may or may not parse. */
    onPastedText: (text: string) => void;
    /** Open the recipe the panel is showing. */
    openFound: () => void;
    /** Back to an empty field, cancelling anything in flight. */
    reset: () => void;
};

export function useRecipeImport({stored, onOpenRecipe}: Options): RecipeImport {
    const [value, setValue] = useState("");
    const [state, setState] = useState<ImportState>({status: "idle"});
    const [hint, setHint] = useState(false);
    /**
     * Whether the sheet draws its field. See `showField` on `RecipeImport`. The
     * default is true (a plain tile tap opens an empty field); `resolve` hides
     * it for atomic and shortcut input and restores it when a shortcut degrades
     * or when a lookup fails.
     */
    const [showField, setShowField] = useState(true);

    /**
     * The last text seen, tracked synchronously.
     *
     * The paste heuristic compares against the previous value, and reading that
     * from `value` state is a trap: two `onChangeText` calls in one React batch
     * would both see the pre-batch value, so the second computes a delta of 2
     * and is misread as a paste -- which *navigates* without asking, yanking the
     * user into the editor mid-keystroke. A ref updated inside the handler sees
     * the true previous character, so batched typing stays typing.
     */
    const lastValue = useRef("");

    /**
     * Which request is the newest.
     *
     * The `AbortSignal` is not enough on its own: a request can already have
     * resolved and be queued as a microtask when it is superseded.
     */
    const generation = useRef(0);
    const inFlight = useRef<AbortController | null>(null);

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * The library, read at the moment a result lands rather than captured when
     * the lookup started -- a save can happen in between.
     */
    const storedRef = useRef(stored);
    useEffect(() => {
        storedRef.current = stored;
    }, [stored]);

    const onOpenRef = useRef(onOpenRecipe);
    useEffect(() => {
        onOpenRef.current = onOpenRecipe;
    }, [onOpenRecipe]);

    useEffect(() => () => {
        clearTimers();
        generation.current++;
        inFlight.current?.abort();
    }, []);

    function clearTimers() {
        if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
        if (hintTimer.current !== null) clearTimeout(hintTimer.current);
        debounceTimer.current = null;
        hintTimer.current = null;
    }

    async function resolve(source: ImportSource, intent: ImportIntent) {
        clearTimers();
        setHint(false);
        // Atomic and shortcut input carry a whole value, so there is nothing to
        // type: hide the field while the lookup runs. Only deliberate typing
        // keeps the field. A degrading shortcut restores it below, after the
        // fetch, once the recipe turns out to be already held.
        setShowField(intent === "deliberate");
        const mine = ++generation.current;
        inFlight.current?.abort();
        const controller = new AbortController();
        inFlight.current = controller;
        setState({status: "resolving"});

        const xb = new XBloomRecipe(source);

        // A failed lookup always restores the field, whatever the intent. An
        // atomic or shortcut value hid it while resolving, but an error has
        // nothing to navigate to, so the field must come back as the way to
        // retry or correct -- otherwise the sheet strands the user on an error
        // line with no input and no button.
        function fail(reason: ImportErrorReason, message: string) {
            setShowField(true);
            setState({status: "error", reason, message});
        }

        try {
            await xb.fetchRecipeDetail(controller.signal);
        } catch {
            // An abort lands here too, and is caught by the generation check --
            // a superseded lookup has nothing to say.
            if (mine !== generation.current) return;
            fail("network", "Couldn't reach xBloom. Check your connection.");
            return;
        }

        if (mine !== generation.current) return;

        const candidate = xb.getRecipe();
        if (!candidate) {
            // Named after the input rather than the server: this is where a
            // typo lands, and it is far more likely than an outage.
            fail("notFound", "No recipe with that code.");
            return;
        }

        try {
            candidate.fingerprint();
        } catch {
            // A recipe that cannot produce card bytes must not go any further.
            // `findDuplicate` treats one whose fingerprint throws as
            // identity-less, so it would slip past de-duplication and land in
            // the library as a permanent unwritable copy.
            fail("unusable", "That recipe can't be used here.");
            return;
        }

        const {recipe, isExisting} = resolveOnOpen(storedRef.current, candidate);

        // Atomic always navigates. A shortcut navigates only for a recipe not
        // already held: the tile's paste shortcut degrades, rather than
        // re-opening a recipe the sticky clipboard still points at, so the user
        // can reach a different one.
        if (intent === "atomic" || (intent === "shortcut" && !isExisting)) {
            handOff(recipe, isExisting);
            return;
        }

        // A degrading shortcut restores the field the atomic path hid, so the
        // found panel and an input to type something else are shown together --
        // which is the whole point of the degrade.
        if (intent === "shortcut") setShowField(true);

        setState({
            status:  "found",
            preview: {
                recipe,
                isExisting,
                name:     xb.getName(),
                subtitle: xb.getSubtitle(),
                imageURL: xb.getImageURL()
            }
        });
    }

    function resolveNow(source: ImportSource, intent: ImportIntent) {
        void resolve(source, intent);
    }

    function onChangeText(next: string) {
        const previous = lastValue.current;
        lastValue.current = next;
        setValue(next);
        clearTimers();
        setHint(false);

        // React Native 0.86 has no `onPaste` on `TextInput`, so a paste is
        // inferred from the size of the change: more than one character at a
        // time is a paste. A pasted link is dozens of characters and a pasted
        // pod code five or six, so the inference is never close in practice.
        // The one miss -- pasting a single character -- is treated as typing
        // and merely waits, which is why a heuristic is acceptable here.
        const pasted = next.length - previous.length > 1;
        const source = parseImportInput(next);

        if (pasted && source) {
            void resolve(source, "atomic");
            return;
        }

        // Any edit invalidates a result or an error on screen.
        generation.current++;
        inFlight.current?.abort();
        setState({status: "idle"});

        if (source) {
            debounceTimer.current = setTimeout(() => {
                void resolve(source, "deliberate");
            }, DEBOUNCE_MS);
            return;
        }

        // Nothing to look up. If they have also stopped, explain the format --
        // the sheet has no button to press and would otherwise sit in silence.
        if (next.trim().length > 0) {
            hintTimer.current = setTimeout(() => setHint(true), ABANDONED_MS);
        }
    }

    function onPastedText(text: string) {
        // `getStringAsync` answers `''` for an empty clipboard and for a paste
        // the user denied, and iOS offers no way to tell them apart. Treated as
        // nothing having happened: reporting "your clipboard is empty" to
        // someone who has just denied permission would be a lie.
        if (text.trim().length === 0) return;

        // A paste is an edit, so it invalidates whatever is on screen *before*
        // the parse attempt. Without this, a debounce armed by earlier typing
        // could fire after the paste and show a panel for text no longer in the
        // field. Unconditional and first, for the same reason `onChangeText`
        // clears state on every keystroke.
        clearTimers();
        setHint(false);
        generation.current++;
        inFlight.current?.abort();
        setState({status: "idle"});

        lastValue.current = text;
        setValue(text);
        const source = parseImportInput(text);
        if (source) {
            void resolve(source, "atomic");
            return;
        }

        // A paste that does not parse gets the hint immediately, not after
        // `ABANDONED_MS`. That delay exists to avoid scolding someone still
        // typing; a paste is finished by definition, so there is no half-typed
        // state to be polite about, and silence here would be the only feedback.
        setHint(true);
    }

    /**
     * Hand the recipe to the screen and clear this interaction in one act.
     *
     * The reset belongs here, in the authority, not on the screen. Opening a
     * recipe closes the sheet by navigating (`onOpenRecipe` -> `router.push`),
     * which never re-fires the sheet's `onOpenChange` -- so a reset wired only
     * to that close path (see `app/index.tsx`) would leave the found panel and
     * the typed value alive under the pushed editor, and the next time the tile
     * opened the sheet they would still be there. Resetting the moment the
     * recipe is handed over means every close path is covered, and a fourth one
     * added later cannot forget.
     */
    function handOff(recipe: Recipe, isExisting: boolean) {
        onOpenRef.current(recipe, isExisting);
        reset();
    }

    function openFound() {
        if (state.status !== "found") return;
        handOff(state.preview.recipe, state.preview.isExisting);
    }

    function reset() {
        clearTimers();
        generation.current++;
        inFlight.current?.abort();
        lastValue.current = "";
        setValue("");
        setHint(false);
        setShowField(true);
        setState({status: "idle"});
    }

    return {state, value, showField, hint, onChangeText, resolveNow, onPastedText, openFound, reset};
}
