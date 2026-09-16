import {useEffect, useRef, useState} from "react";

import {mergeRecipes, type BackupPayload} from "@/library/backup";
import {resolveStockFilter} from "@/library/libraryFilters";
import type {FilterResolver, LibraryQuery} from "@/library/libraryQuery";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

/**
 * The part of `RecipeDatabase` this hook uses.
 *
 * Narrow on purpose: it is the whole contract, so a test can supply a handful
 * of functions instead of a database, and a reader can see at a glance that the
 * home screen neither writes recipes nor reads settings.
 *
 * The list is a `queryRecipes`, not a `retrieveAllRecipes`: the library stopped
 * being "every recipe, sorted in JavaScript" and became the answer to the
 * rail's query, sorted and filtered in SQL. `retrieveAllRecipes` is a separate
 * question, not a second way to build the same list: `allRecipes()` uses it so a
 * backup can hold the whole table regardless of what the rail narrowed the list
 * to. The two never stand in for one another, so they cannot disagree.
 *
 * The restore/delete-all members are optional because not every caller reaches
 * for them: the home screen only reads, deletes one and clones one, and a test
 * store for that screen should not have to stub a transaction it never calls.
 * `retrieveAllRecipes` is optional on the same grounds, but `allRecipes()`
 * throws when it is missing rather than returning nothing, because the failure
 * it would otherwise cause is a backup file that is silently empty. The
 * production store (`RecipeDatabase`) provides all of them.
 */
export type RecipeStore = {
    queryRecipes: (query: LibraryQuery, resolveFilter?: FilterResolver) => Recipe[];
    deleteRecipe: (uuid: string) => void;
    cloneRecipe: (uuid: string) => void;
    updateRecipe: (uuid: string, recipe: Recipe) => void;
    retrieveAllRecipes?: () => Recipe[] | null;
    deleteAllRecipes?: () => void;
    insertRecipes?: (recipes: Recipe[]) => void;
    replaceAllRecipes?: (recipes: Recipe[]) => void;
};

/**
 * The query a library with no rail runs: the whole table in the default order.
 *
 * Kept at module scope so its identity is stable across renders. The wiring task
 * hands `useRecipeLibrary` the rail's live query instead; until then, and in the
 * tests that exercise the mutation paths, this is the standing question: name A
 * to Z, nothing searched, nothing filtered.
 *
 * This is close to but not exactly the order the hook used to produce in
 * JavaScript, and the difference is a one-time visible reorder for existing
 * users that is cosmetic and destroys nothing. The old order sorted on
 * `displayName().localeCompare(...)`; this sorts on `sortName COLLATE NOCASE
 * ASC`, and `COLLATE NOCASE` folds only ASCII case, so an accented name such as
 * "Etna" spelled with an accented E now sorts after "Zambia" rather than near
 * "E". True locale ordering is not simply available: SQLite ships no ICU
 * collation by default, and sorting in SQL is the whole point of this change --
 * the alternative is reading every recipe back to sort it in JavaScript, which
 * is what the library stopped doing. Unnamed recipes, once interspersed by their
 * formatted-date placeholder, now sink to the bottom; that is deliberate and
 * documented with the sort itself.
 */
const WHOLE_LIBRARY: LibraryQuery = {
    search: "",
    filters: [],
    sort: "name",
    direction: "asc",
    favouritesFirst: false
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
    allRecipes: () => Recipe[];
    refresh: () => void;
    deleteRecipe: (recipe: Recipe) => void;
    duplicateRecipe: (recipe: Recipe) => void;
    toggleFavourite: (recipe: Recipe) => void;
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
 * @param query The rail's question -- what to search, filter and sort by. The
 *   wiring task hands the live query in; the default is the whole library in
 *   name order, which is what the mutation-path tests run against.
 * @param db Injected by tests. Production call sites omit it.
 */
export function useRecipeLibrary(
    db?: RecipeStore,
    query: LibraryQuery = WHOLE_LIBRARY
): RecipeLibrary {
    // One store for the hook's lifetime. As a default parameter this ran on
    // every render, and every `new RecipeDatabase()` opens SQLite and replays
    // the table setup — on a screen that re-renders for scrolling, for the
    // settings sheet and for NFC progress.
    const [store] = useState<RecipeStore>(() => db ?? new RecipeDatabase());

    // A counter the mutations bump to force a fresh read. The list is a pure
    // read of the query and this counter: the query says what to ask, the
    // counter forces a re-ask after a write the query cannot see -- a delete or
    // a restore changes the answer without changing the question. Deriving the
    // list at render rather than seeding it into state and resetting from an
    // effect is the house pattern (`useTraceAnimation`): the compiler forbids
    // seeding state from an effect, and a synchronous SQLite read needs no
    // effect. It also closes the stale-result race by construction: a
    // synchronous read taken at render is always the answer to the query being
    // rendered, so a slower older query can never land after a newer one.
    const [revision, setRevision] = useState(0);
    const recipes = readLibrary(store, query, revision);

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
        setRevision((r) => r + 1);
    }

    /**
     * The whole table, not the current view.
     *
     * `recipes` is the answer to `query`, so once a caller hands the rail's live
     * query in, it is only what a search and a filter left on screen. A backup
     * must not inherit that narrowing: a file that says it holds your recipes and
     * silently holds the seven you last filtered to is data loss wearing the
     * costume of an export. This reads the table directly, so what the backup
     * contains never depends on what the library was last filtered by. Kept as a
     * function, not a field, so the read happens when the backup is taken rather
     * than on every render of a screen that never exports.
     */
    function allRecipes(): Recipe[] {
        // Throws rather than falling back to an empty list. A store that cannot
        // answer this is a programmer error, and the alternative is a backup
        // file that is silently empty, which the user only discovers on the day
        // they have nothing else left.
        if (!store.retrieveAllRecipes) {
            throw new Error("This store cannot read the whole library");
        }
        return store.retrieveAllRecipes() ?? [];
    }

    function deleteRecipe(recipe: Recipe) {
        store.deleteRecipe(recipe.uuid);
        reload();
    }

    function duplicateRecipe(recipe: Recipe) {
        store.cloneRecipe(recipe.uuid);
        reload();
    }

    /**
     * Mark or unmark a recipe.
     *
     * Mutates in place and writes through, which is the house pattern: the
     * editor does the same and bumps a key counter. Here the reload does that
     * job, so no counter is needed.
     *
     * The mutation happens before the write, so a failed write must still
     * reload: `reload()` reads a fresh Recipe back from the store, which
     * restores the true, unwritten value. Skipping it on the throw path (as a
     * bare call would) leaves the mutated object in state with nothing to put
     * it right, since nothing else refreshes the library on its own.
     */
    function toggleFavourite(recipe: Recipe) {
        recipe.favourite = !recipe.favourite;
        try {
            store.updateRecipe(recipe.uuid, recipe);
        } catch {
            // Deliberately empty: reload() below restores the true value.
        }
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

    return {recipes, allRecipes, refresh: reload, deleteRecipe, duplicateRecipe, toggleFavourite, deleteAll, applyRestore};
}

/**
 * The library list for a query.
 *
 * `resolveStockFilter` is what turns the query's filter ids into WHERE
 * fragments; the ids reaching here have already been narrowed to the ones this
 * build knows (`asStockFilters`, in `useLibraryQuery`), so the resolver's null
 * -- which makes `buildLibraryQuery` throw -- stays reserved for a genuine
 * in-code disagreement rather than firing on stale persisted state.
 *
 * `revision` does not shape the query. It is a cache key the mutations bump so
 * a delete or a restore forces a fresh read the unchanged query object would
 * otherwise let the compiler skip; naming it in this computation is what ties
 * the recompute to it.
 */
function readLibrary(db: RecipeStore, query: LibraryQuery, revision: number): Recipe[] {
    void revision;
    return db.queryRecipes(query, resolveStockFilter);
}

export default useRecipeLibrary;
