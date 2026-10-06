import {useRef, useState} from "react";
import {Linking} from "react-native";

import {notify} from "@/components/XbrwToast";
import {buildEnvelope, type HandoffEnvelope} from "@/library/brew/handoff/envelope";
import {encodeHandoff} from "@/library/brew/handoff/encode";
import {backfillFromRecipe} from "@/library/brew/handoff/backfill";
import {handoffLinkFilename, shareHandoffLink} from "@/library/brew/handoff/shareLink";
import RecipeDatabase from "@/library/RecipeDatabase";
import type {BrewExportSource} from "@/hooks/useBrewExport";
import {sharedBrewDatabase} from "@/hooks/useBrewHistory";

export const HANDOFF_OPEN_FAILED = "Could not open Beanconqueror. Make sure it is installed and try again.";
export const HANDOFF_TOO_LARGE = "This brew is too large to hand over to Beanconqueror.";

export type HandoffStore = {markSent: (id: string, at: number) => void};

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
 *
 * `shareLink` is the Labs link export: the same URL, written to a file for the
 * share sheet instead of opened. It is a debugging aid and a temporary one.
 */
export function useBrewHandoff(
    source: () => BrewExportSource | null,
    store?: HandoffStore
) {
    // Guards against a second press while the deep link is still opening.
    const isSendingRef = useRef(false);
    // Separate from the send guard, so the two actions cannot clear each
    // other's busy flag; `busy` below is their union, as in useBrewExport.
    const isSharingLinkRef = useRef(false);
    const [busy, setBusy] = useState(false);

    /**
     * The envelope for the brew as it stands, built fresh at press time.
     *
     * Shared by the send and by the Labs link export so the file a tester
     * hands over is byte for byte what the deep link would have carried.
     */
    function envelopeFor(opened: BrewExportSource, beanName?: string): HandoffEnvelope {
        const recipe = new RecipeDatabase().getRecipe(opened.record.recipeUuid);
        const backfill = recipe === null
            ? {record: opened.record, filled: []}
            : backfillFromRecipe(opened.record, recipe);
        return buildEnvelope(backfill.record, opened.samples, backfill.filled, beanName);
    }

    /**
     * Writes the handoff URL to a file and offers it to the share sheet.
     *
     * A Labs debugging aid: it exists so sample links can be given to
     * Beanconqueror's maintainer, and it should go once they have them. It
     * deliberately does not `markSent` — nothing was handed over — and it
     * deliberately does not open Beanconqueror.
     */
    async function shareLink(beanName?: string): Promise<boolean> {
        if (isSharingLinkRef.current) return false;
        const opened = source();
        if (opened === null) return false;
        isSharingLinkRef.current = true;
        setBusy(true);
        try {
            let url: string;
            try {
                ({url} = encodeHandoff(envelopeFor(opened, beanName)));
            } catch {
                notify({tone: "error", message: HANDOFF_TOO_LARGE});
                return false;
            }
            await shareHandoffLink(url, handoffLinkFilename(opened.record));
            return true;
        } finally {
            isSharingLinkRef.current = false;
            setBusy(isSendingRef.current);
        }
    }

    async function send(beanName?: string): Promise<number | null> {
        if (isSendingRef.current) return null;
        const opened = source();
        if (opened === null) return null;
        isSendingRef.current = true;
        setBusy(true);
        try {
            let url: string;
            try {
                // Our side has no fidelity copy: `flow.fidelity` stays inside
                // the envelope so Beanconqueror knows whether a trace was thinned.
                ({url} = encodeHandoff(envelopeFor(opened, beanName)));
            } catch {
                notify({tone: "error", message: HANDOFF_TOO_LARGE});
                return null;
            }
            // Do not preflight with canOpenURL: on iOS it returns false without
            // LSApplicationQueriesSchemes, even when Beanconqueror is installed.
            try {
                await Linking.openURL(url);
            } catch {
                // A share sheet can be cancelled; a deep link has no cancel
                // outcome, so a rejection here is a real failure to surface.
                notify({tone: "error", message: HANDOFF_OPEN_FAILED});
                return null;
            }
            // Recorded after the link opened, not before: a failure to open is
            // the one case where nothing can have been received, and a brew
            // marked sent that never left would make the warning on the record
            // screen a lie.
            const sentAt = Date.now();
            (store ?? sharedBrewDatabase()).markSent(opened.record.id, sentAt);
            return sentAt;
        } finally {
            // The compiler bailout costs nothing measurable on a hook this
            // small, and one reset point is safer than duplicating it across
            // success and failure branches.
            isSendingRef.current = false;
            // The Labs link export is the sibling that can still hold the
            // button busy; without it this would simply be false.
            setBusy(isSharingLinkRef.current);
        }
    }

    return {send, shareLink, busy};
}

export default useBrewHandoff;
