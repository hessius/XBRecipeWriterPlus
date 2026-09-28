/**
 * Putting catalogue rows into the library.
 *
 * A hub row carries a share link, and that is the whole mechanism: the link
 * goes through `parseImportInput` and `XBloomRecipe` exactly as a link pasted
 * into the import sheet does. Both work unmodified, because `parseImportInput`
 * checks neither host nor path, only that it is an http(s) URL with an `?id=`.
 *
 * Sequential on purpose. The catalogue endpoint is undocumented, its rate
 * limits are unknown and there is nobody to ask, so a batch of fifty parallel
 * requests is the single most likely way to get this app's traffic throttled.
 */
import {useRef, useState} from "react";

import {useSetting} from "@/hooks/useSetting";
import {assignAccent} from "@/library/accent";
import {resolveOnOpen} from "@/library/duplicates";
import type {HubRecipe} from "@/library/hub/hubRow";
import {parseImportInput} from "@/library/importInput";
import {asMachineModel} from "@/library/machine/machineModel";
import RecipeDatabase from "@/library/RecipeDatabase";
import type {Settings} from "@/library/Settings";
import {XBloomRecipe} from "@/library/XBloomRecipe";

export type HubSaveOutcome = {
    saved: number;
    alreadyHeld: number;
    /** The names of the rows that did not land, so the report can say which. */
    failed: string[];
    /** True when a batch was already running and this one was not started. */
    refused: boolean;
};

export type HubSave = {
    saving: boolean;
    progress: {done: number; total: number};
    save: (rows: readonly HubRecipe[]) => Promise<HubSaveOutcome>;
};

export function useHubSave(settings?: Settings): HubSave {
    const [storedModel] = useSetting("machineModel", settings);
    const model = asMachineModel(storedModel);
    const [progress, setProgress] = useState({done: 0, total: 0});
    const [saving, setSaving] = useState(false);
    const running = useRef(false);

    async function save(rows: readonly HubRecipe[]): Promise<HubSaveOutcome> {
        if (running.current) {
            return {saved: 0, alreadyHeld: 0, failed: [], refused: true};
        }

        running.current = true;
        setSaving(true);
        setProgress({done: 0, total: rows.length});

        const store = new RecipeDatabase();
        const outcome: HubSaveOutcome = {
            saved:        0,
            alreadyHeld:  0,
            failed:       [],
            refused:      false
        };

        for (const [index, row] of rows.entries()) {
            try {
                const source = parseImportInput(row.shareLink);
                if (source === null) {
                    throw new Error("The hub row did not carry a readable share link.");
                }

                const importer = new XBloomRecipe(source, model);
                await importer.fetchRecipeDetail();
                const candidate = importer.getRecipe();
                if (candidate === null) {
                    throw new Error("The share endpoint did not return a recipe.");
                }

                const stored = store.retrieveAllRecipes() ?? [];
                const {recipe, isExisting} = resolveOnOpen(stored, candidate, "brew");
                if (isExisting) {
                    outcome.alreadyHeld += 1;
                } else {
                    assignAccent(recipe, stored);
                    store.updateRecipe(recipe.uuid, recipe);
                    outcome.saved += 1;
                }
            } catch {
                outcome.failed.push(row.name);
            }
            setProgress({done: index + 1, total: rows.length});
        }

        running.current = false;
        setSaving(false);
        return outcome;
    }

    return {saving, progress, save};
}

export default useHubSave;
