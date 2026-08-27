import {useEffect, useRef, useState} from "react";

import {mergeRecipes, type BackupPayload} from "@/library/backup";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

/**
 * The part of `RecipeDatabase` this hook uses.
 *
 * Narrow on purpose: it is the whole contract, so a test can supply a handful
 * of functions instead of a database, and a reader can see at a glance that the
 * home screen neither writes recipes nor reads settings.
 *
 * The restore/delete-all members are optional because not every caller reaches
 * for them — the home screen only reads, deletes one and clones one — and a
 * test store for that screen should not have to stub a transaction it never
 * calls. The production store (`RecipeDatabase`) provides all of them.
 */
export type RecipeStore = {
    retrieveAllRecipes: () => Recipe[] | null;
    deleteRecipe: (uuid: string) => void;
    cloneRecipe: (uuid: string) => void;
    deleteAllRecipes?: () => void;
    insertRecipes?: (recipes: Recipe[]) => void;
    replaceAllRecipes?: (recipes: Recipe[]) => void;
};

/** Whether a choice replaces the library or only adds to it. */
export type RestoreChoice = {
    replace: boolean;
};

/**
 * The result of a restore.
 *
 * `busy` is not an error the user should see: it is a second press of the same
 * button arriving before the first repaint, which the caller ignores. `failed`
 * is the transaction rolling back, which the caller reports.
 */
/**
 * The result of emptying the library.
 *
 * `failed` is the delete throwing, which leaves the library as it was and which
 * the caller reports. There is no `busy`: unlike a restore, a second press has
 * nothing left to delete and no uuid to collide with.
 */
export type DeleteAllOutcome =
    | {status: "deleted"; deleted: number}
    | {status: "failed"};

export type RestoreOutcome =
    | {status: "restored"; added: number}
    | {status: "failed"}
    | {status: "busy"};

export type RecipeLibrary = {
    recipes: Recipe[];
    refresh: () => void;
    deleteRecipe: (recipe: Recipe) => void;
    duplicateRecipe: (recipe: Recipe) => void;
    deleteAll: () => DeleteAllOutcome;
    applyRestore: (payload: BackupPayload, choice: RestoreChoice) => RestoreOutcome;
};

/**
 * The saved recipes, and everything the screens do to the whole library.
 *
 * Lifted out of `app/index.tsx`, which was loading, sorting, deleting and
 * duplicating as well as laying the screen out, and now out of `app/settings`,
 * which was constructing its own second `RecipeDatabase` to restore and delete.
 * A route file should stay close to layout — the same reasoning that produced
 * `useRecipeEditor`. The store lives here once, so a screen never opens SQLite
 * a second time.
 *
 * @param db Injected by tests. Production call sites omit it.
 */
export function useRecipeLibrary(db?: RecipeStore): RecipeLibrary {
    // One store for the hook's lifetime. As a default parameter this ran on
    // every render, and every `new RecipeDatabase()` opens SQLite and replays
    // the table setup — on a screen that re-renders for scrolling, for the
    // settings sheet and for NFC progress.
    const [store] = useState<RecipeStore>(() => db ?? new RecipeDatabase());
    const [recipes, setRecipes] = useState<Recipe[]>(() => read(store));

    // A restore that a second tap re-enters before the first has repainted
    // would read the same pre-`reload()` snapshot of `recipes`, compute the same
    // `toAdd`, and try to insert uuids the first tap just wrote — which now
    // throws. The flag is held until the reload lands (the effect below), so two
    // presses in one React batch, with no render between them, cannot both run.
    const inFlight = useRef(false);
    useEffect(() => {
        inFlight.current = false;
    }, [recipes]);

    function reload() {
        setRecipes(read(store));
    }

    function deleteRecipe(recipe: Recipe) {
        store.deleteRecipe(recipe.uuid);
        reload();
    }

    function duplicateRecipe(recipe: Recipe) {
        store.cloneRecipe(recipe.uuid);
        reload();
    }

    function deleteAll(): DeleteAllOutcome {
        const removed = recipes.length;
        // The same shape as `applyRestore` below, and for the same reason: a
        // `runSync` that throws used to escape into the settings screen's press
        // handler, where there was no outcome to branch on and nothing to catch
        // it -- so the one irreversible action in the app was the one that
        // crashed instead of explaining itself. Plain try/catch rather than
        // try/finally, which makes the compiler bail out of the whole hook.
        try {
            store.deleteAllRecipes?.();
        } catch {
            reload();
            return {status: "failed"};
        }
        reload();
        return {status: "deleted", deleted: removed};
    }

    function applyRestore(payload: BackupPayload, choice: RestoreChoice): RestoreOutcome {
        if (inFlight.current) return {status: "busy"};
        inFlight.current = true;

        // Replace starts from an empty library so the dedupe is against nothing;
        // a merge starts from what is already there. Either way the recipes that
        // reach the store are the ones the preview promised.
        const {toAdd} = mergeRecipes(choice.replace ? [] : recipes, payload.recipes);

        // Plain try/catch rather than try/finally: a finally in a React file
        // makes the compiler bail out of the whole hook. The flag is cleared on
        // both paths by hand instead, and the reload reflects either the new
        // library or the rolled-back one.
        try {
            if (choice.replace) store.replaceAllRecipes?.(toAdd);
            else store.insertRecipes?.(toAdd);
        } catch {
            inFlight.current = false;
            reload();
            return {status: "failed"};
        }

        reload();
        return {status: "restored", added: toAdd.length};
    }

    return {recipes, refresh: reload, deleteRecipe, duplicateRecipe, deleteAll, applyRestore};
}

/**
 * `retrieveAllRecipes` answers `null` for an empty table. Absorbed here rather
 * than leaked to callers: the old screen checked for it at every use, and one
 * of those checks conflated "no recipes" with "not loaded yet".
 */
function read(db: RecipeStore): Recipe[] {
    const stored = db.retrieveAllRecipes() ?? [];
    return [...stored].sort((a, b) => a.displayName().localeCompare(b.displayName()));
}

export default useRecipeLibrary;
