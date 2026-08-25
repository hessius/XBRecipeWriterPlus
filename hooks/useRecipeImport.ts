import {useEffect, useRef, useState} from "react";

import {resolveOnOpen} from "@/library/duplicates";
import {parseImportInput, type ImportSource} from "@/library/importInput";
import type Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

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
 * Whether the value arrived whole or a character at a time.
 *
 * Atomic input navigates on its own; deliberate input waits to be asked. A
 * paste, a share intent and the tile's shortcut all deliver a complete value in
 * one event that the user chose. Typing delivers a value that is complete only
 * by guesswork.
 */
export type ImportIntent = "atomic" | "deliberate";

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
     * Which request is the newest.
     *
     * The `AbortSignal` is not enough on its own: a request can already have
     * resolved and be queued as a microtask when it is superseded.
     */
    const generation = useRef(0);
    const inFlight = useRef<AbortController | null>(null);

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
        generation.current++;
        inFlight.current?.abort();
    }, []);

    async function resolve(source: ImportSource, intent: ImportIntent) {
        setHint(false);
        const mine = ++generation.current;
        inFlight.current?.abort();
        const controller = new AbortController();
        inFlight.current = controller;
        setState({status: "resolving"});

        const xb = new XBloomRecipe(source);

        try {
            await xb.fetchRecipeDetail(controller.signal);
        } catch {
            // An abort lands here too, and is caught by the generation check --
            // a superseded lookup has nothing to say.
            if (mine !== generation.current) return;
            setState({
                status:  "error",
                reason:  "network",
                message: "Couldn't reach xBloom. Check your connection."
            });
            return;
        }

        if (mine !== generation.current) return;

        const candidate = xb.getRecipe();
        if (!candidate) {
            // Named after the input rather than the server: this is where a
            // typo lands, and it is far more likely than an outage.
            setState({
                status:  "error",
                reason:  "notFound",
                message: "No recipe with that code."
            });
            return;
        }

        try {
            candidate.fingerprint();
        } catch {
            // A recipe that cannot produce card bytes must not go any further.
            // `findDuplicate` treats one whose fingerprint throws as
            // identity-less, so it would slip past de-duplication and land in
            // the library as a permanent unwritable copy.
            setState({
                status:  "error",
                reason:  "unusable",
                message: "That recipe can't be used here."
            });
            return;
        }

        const {recipe, isExisting} = resolveOnOpen(storedRef.current, candidate);

        if (intent === "atomic") {
            setState({status: "idle"});
            onOpenRef.current(recipe, isExisting);
            return;
        }

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
        const previous = value;
        setValue(next);
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
    }

    function onPastedText(text: string) {
        // `getStringAsync` answers `''` for an empty clipboard and for a paste
        // the user denied, and iOS offers no way to tell them apart. Treated as
        // nothing having happened: reporting "your clipboard is empty" to
        // someone who has just denied permission would be a lie.
        if (text.trim().length === 0) return;

        setValue(text);
        const source = parseImportInput(text);
        if (source) {
            void resolve(source, "atomic");
        }
    }

    function openFound() {
        if (state.status !== "found") return;
        onOpenRef.current(state.preview.recipe, state.preview.isExisting);
    }

    function reset() {
        generation.current++;
        inFlight.current?.abort();
        setValue("");
        setHint(false);
        setState({status: "idle"});
    }

    return {state, value, hint, onChangeText, resolveNow, onPastedText, openFound, reset};
}
