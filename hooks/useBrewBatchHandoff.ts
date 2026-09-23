import {useRef, useState} from "react";
import {Linking} from "react-native";

import {notify} from "@/components/XbrwToast";
import {backfillFromRecipe} from "@/library/brew/handoff/backfill";
import {buildEnvelope, type HandoffEnvelope} from "@/library/brew/handoff/envelope";
import {batchFits, encodeHandoffBatch} from "@/library/brew/handoff/encode";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";

export const BATCH_HANDOFF_OPEN_FAILED =
    "Could not open Beanconqueror. Make sure it is installed and try again.";
export const BATCH_HANDOFF_TOO_LARGE =
    "That selection is too large to send to Beanconqueror at once.";
export const BATCH_HANDOFF_EMPTY =
    "No selected brews could be sent. They may have been deleted.";

type BatchSource = {record: StoredBrew; samples: BrewSample[]};

/**
 * Hands several finished brews to Beanconqueror over one deep link.
 *
 * `load` is resolved at press time so a stale selection can be trimmed if a
 * record was deleted underneath it. Missing records are skipped; an entirely
 * stale selection is the only empty case surfaced to the user.
 */
export function useBrewBatchHandoff(load: (id: string) => BatchSource | null) {
    const isSendingRef = useRef(false);
    const [busy, setBusy] = useState(false);
    // Envelopes already built during this selection, keyed by brew id.
    //
    // Only `fits` reads it. Building one envelope reads that brew's whole
    // stream out of SQLite, some two and a half thousand rows, so without this
    // every tick of a box re-reads and re-encodes every brew already ticked and
    // the work grows with the square of the selection. `send` deliberately
    // ignores the cache and builds afresh, so what is actually handed over is
    // always the database as it stands at the press.
    const builtRef = useRef(new Map<string, HandoffEnvelope>());
    // One database for the life of the hook, opened on the first lookup.
    //
    // The constructor opens SQLite and replays table setup, so a database per
    // brew made a fifty-brew batch do that work fifty times to tick the boxes
    // and fifty more to send. Lazy so a history screen nobody selects on never
    // opens it at all.
    const recipesRef = useRef<RecipeDatabase | null>(null);

    function recipes(): RecipeDatabase {
        recipesRef.current ??= new RecipeDatabase();
        return recipesRef.current;
    }

    function build(id: string): HandoffEnvelope | null {
        const opened = load(id);
        if (opened === null) return null;
        const recipe = recipes().getRecipe(opened.record.recipeUuid);
        const backfill = recipe === null
            ? {record: opened.record, filled: []}
            : backfillFromRecipe(opened.record, recipe);
        return buildEnvelope(backfill.record, opened.samples, backfill.filled);
    }

    function envelopes(ids: string[]): HandoffEnvelope[] {
        const built: HandoffEnvelope[] = [];
        ids.forEach((id) => {
            const envelope = build(id);
            if (envelope !== null) built.push(envelope);
        });
        return built;
    }

    function fits(ids: string[]): boolean {
        const cache = builtRef.current;
        const built: HandoffEnvelope[] = [];

        ids.forEach((id) => {
            const cached = cache.get(id);
            if (cached !== undefined) {
                built.push(cached);
                return;
            }
            const envelope = build(id);
            if (envelope === null) return;
            cache.set(id, envelope);
            built.push(envelope);
        });

        if (built.length === 0) return false;
        return batchFits(built);
    }

    /** Drops the `fits` cache, for a screen entering or leaving selection. */
    function reset(): void {
        builtRef.current = new Map();
    }

    async function send(ids: string[]): Promise<void> {
        if (isSendingRef.current) return;
        isSendingRef.current = true;
        setBusy(true);
        try {
            const built = envelopes(ids);
            if (built.length === 0) {
                notify({tone: "error", message: BATCH_HANDOFF_EMPTY});
                return;
            }

            let url: string;
            try {
                ({url} = encodeHandoffBatch(built));
            } catch {
                notify({tone: "error", message: BATCH_HANDOFF_TOO_LARGE});
                return;
            }

            // No canOpenURL preflight, for the reason useBrewHandoff gives: on
            // iOS it answers false without LSApplicationQueriesSchemes even
            // when Beanconqueror is installed.
            try {
                await Linking.openURL(url);
            } catch {
                notify({tone: "error", message: BATCH_HANDOFF_OPEN_FAILED});
            }
        } finally {
            isSendingRef.current = false;
            setBusy(false);
        }
    }

    return {send, busy, fits, reset};
}

export default useBrewBatchHandoff;
