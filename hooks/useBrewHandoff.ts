import {useRef, useState} from "react";
import {Linking} from "react-native";

import {notify} from "@/components/XbrwToast";
import {buildEnvelope} from "@/library/brew/handoff/envelope";
import {encodeHandoff} from "@/library/brew/handoff/encode";
import {backfillFromRecipe} from "@/library/brew/handoff/backfill";
import RecipeDatabase from "@/library/RecipeDatabase";
import type {BrewExportSource} from "@/hooks/useBrewExport";

export const HANDOFF_OPEN_FAILED = "Could not open Beanconqueror. Make sure it is installed and try again.";
export const HANDOFF_TOO_LARGE = "This brew is too large to hand over to Beanconqueror.";

/**
 * Hands a finished brew to Beanconqueror over its deep link.
 *
 * The caller hands `source` as a thunk resolved at press time, mirroring
 * `useBrewExport`, so a screen can defer reading the final persisted brew
 * until somebody actually asks to send it.
 *
 * `send` takes an optional bean name, which a screen collects from the user
 * before calling. It is a hint, not a requirement: with none, the envelope
 * falls back to a name derived from the recipe, and Beanconqueror falls back
 * again from there. The batch path passes nothing, because asking once per
 * brew across a selection would be a questionnaire.
 *
 * The handoff is guarded against a second press while the deep link is still in
 * flight: the guard is a ref, set synchronously before the first `await`, so a
 * double tap cannot open Beanconqueror twice. `busy` is the same fact as state,
 * for a caller that wants to disable a button.
 */
export function useBrewHandoff(source: () => BrewExportSource | null) {
    // Guards against a second press while the deep link is still opening.
    const isSendingRef = useRef(false);
    const [busy, setBusy] = useState(false);

    async function send(beanName?: string) {
        if (isSendingRef.current) return;
        const opened = source();
        if (opened === null) return;
        isSendingRef.current = true;
        setBusy(true);
        try {
            const recipe = new RecipeDatabase().getRecipe(opened.record.recipeUuid);
            const backfill = recipe === null
                ? {record: opened.record, filled: []}
                : backfillFromRecipe(opened.record, recipe);
            const envelope = buildEnvelope(backfill.record, opened.samples, backfill.filled, beanName);
            let url: string;
            try {
                // Our side has no fidelity copy: `flow.fidelity` stays inside
                // the envelope so Beanconqueror knows whether a trace was thinned.
                ({url} = encodeHandoff(envelope));
            } catch {
                notify({tone: "error", message: HANDOFF_TOO_LARGE});
                return;
            }
            // Do not preflight with canOpenURL: on iOS it returns false without
            // LSApplicationQueriesSchemes, even when Beanconqueror is installed.
            try {
                await Linking.openURL(url);
            } catch {
                // A share sheet can be cancelled; a deep link has no cancel
                // outcome, so a rejection here is a real failure to surface.
                notify({tone: "error", message: HANDOFF_OPEN_FAILED});
            }
        } finally {
            // The compiler bailout costs nothing measurable on a hook this
            // small, and one reset point is safer than duplicating it across
            // success and failure branches.
            isSendingRef.current = false;
            // Unlike useBrewExport, this hook has one action, so there is no
            // sibling export that could still keep the button busy.
            setBusy(false);
        }
    }

    return {send, busy};
}

export default useBrewHandoff;
