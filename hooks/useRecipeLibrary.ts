import {useEffect, useRef, useState} from "react";

import {mergeRecipes, type BackupPayload} from "@/library/backup";
import {
    resolveLibraryFilter, resolveStockFilter, STOCK_FILTER_ORDER
} from "@/library/libraryFilters";
import type {FilterResolver, LibraryQuery} from "@/library/libraryQuery";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {tagKey} from "@/library/tagKey";

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
 * `retrieveAllRecipes` and `countRecipesByFilter` are optional on the same
 * grounds, but their callers throw when either is missing rather than returning
 * nothing, because the failures they would otherwise cause are plausible
 * success-shaped lies: an empty backup, or a rail whose filters silently
 * vanished. The production store (`RecipeDatabase`) provides all of them.
 */
export type RecipeStore = {
    queryRecipes: (query: LibraryQuery, resolveFilter?: FilterResolver) => Recipe[];
    countRecipes?: () => number;
    countRecipesByFilter?: (
        ids: readonly string[],
        resolveFilter?: FilterResolver
    ) => Record<string, number>;
    countRecipesByTag?: () => {tag: string; count: number}[];
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
 * ASC`, where `sortName` is a diacritic-folded key (see `foldSortKey`), so an
 * accented name such as "Étna" now sorts as "Etna" near "E" rather than after
 * "Zambia" as a raw NOCASE comparison of its code points would place it. The
 * Nordic letters `Å Ä Ö Æ Ø` are deliberately not folded and still sort after
 * "Z", which is correct in their alphabets. True locale ordering is not simply
 * available: SQLite ships no ICU collation by default, and sorting in SQL is
 * the whole point of this change -- the alternative is reading every recipe
 * back to sort it in JavaScript, which is what the library stopped doing.
 * Unnamed recipes, once interspersed by their formatted-date placeholder, now
 * sink to the bottom; that is deliberate and documented with the sort itself.
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
    /** The whole table size, read without hydrating every recipe. */
    librarySize: number;
    /** Whole-table counts for stock filters, keyed by filter id. */
    filterCounts: Record<string, number>;
    /** Whole-table counts for every tag, largest shelf first. */
    tagCounts: {tag: string; count: number}[];
    allRecipes: () => Recipe[];
    refresh: () => void;
    deleteRecipe: (recipe: Recipe) => void;
    duplicateRecipe: (recipe: Recipe) => void;
    toggleFavourite: (recipe: Recipe) => void;
    /** Make exactly these recipes the members of a shelf. */
    setShelfMembers: (tag: string, uuids: readonly string[]) => void;
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
    const librarySize = readLibrarySize(store, revision);
    const filterCounts = readFilterCounts(store, revision);
    const tagCounts = readTagCounts(store, revision);

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

    /**
     * Put a shelf's tag on exactly these recipes, and take it off the rest.
     *
     * The whole membership in one call rather than an add and a remove, because
     * a shelf is defined by who is on it: the picker hands over a final answer,
     * and working out which recipes changed is this function's job, not the
     * screen's. Members are looked up from the whole table (`allRecipes`) and
     * not from the list, so a recipe ticked under one filter and then filtered
     * away still gets the tag.
     *
     * Existing tags are preserved and the case the user typed is kept. Matching
     * is on the folded key, so renaming is not possible by accident: tagging
     * with "Morning" a recipe that already carries "morning" leaves the one tag
     * it had rather than giving it two spellings of one shelf.
     */
    function setShelfMembers(tag: string, uuids: readonly string[]) {
        const key = tagKey(tag);
        const wanted = new Set(uuids);
        for (const recipe of allRecipes()) {
            const tags = recipe.tags ?? [];
            const has = tags.some((existing) => tagKey(existing) === key);
            const should = wanted.has(recipe.uuid);
            if (has === should) continue;
            recipe.tags = should
                ? [...tags, tag]
                : tags.filter((existing) => tagKey(existing) !== key);
            try {
                store.updateRecipe(recipe.uuid, recipe);
            } catch {
                // Deliberately empty, as toggleFavourite above: reload() puts
                // the true value back on screen rather than leaving the list
                // showing a membership the database refused.
            }
        }
        reload();
    }

    function deleteAll(): DeleteAllOutcome {
        // The whole-table size, not `recipes.length`: this deletes the table, so
        // reporting the length of a filtered view would tell the user a smaller
        // number than the one they just lost.
        const removed = librarySize;
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
        // a merge starts from what is already there. "There" is the whole table,
        // not `recipes`: that list is the answer to a query, and deduping a
        // restore against a filtered view would re-insert every recipe the view
        // happened to hide.
        const {toAdd} = mergeRecipes(choice.replace ? [] : allRecipes(), payload.recipes);

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

    return {
        recipes,
        librarySize,
        filterCounts,
        tagCounts,
        allRecipes,
        refresh: reload,
        deleteRecipe,
        duplicateRecipe,
        toggleFavourite,
        deleteAll,
        setShelfMembers,
        applyRestore
    };
}

/**
 * The library list for a query.
 *
 * `resolveLibraryFilter` is what turns the query's filter ids into WHERE
 * fragments; the ids reaching here have already been narrowed to the ones this
 * build knows (`asLibraryFilters`, in `useLibraryQuery`), so the resolver's null
 * -- which makes `buildLibraryQuery` throw -- stays reserved for a genuine
 * in-code disagreement rather than firing on stale persisted state.
 *
 * It resolves tag shelves as well as stock ones, because the list must be able
 * to answer a manual shelf. The count below stays on `resolveStockFilter`: it
 * asks only about the stock vocabulary, and tags are counted by their own
 * query.
 *
 * `revision` does not shape the query. It is a cache key the mutations bump so
 * a delete or a restore forces a fresh read the unchanged query object would
 * otherwise let the compiler skip; naming it in this computation is what ties
 * the recompute to it.
 */
function readLibrary(db: RecipeStore, query: LibraryQuery, revision: number): Recipe[] {
    void revision;
    return db.queryRecipes(query, resolveLibraryFilter);
}

function readLibrarySize(db: RecipeStore, revision: number): number {
    void revision;
    if (db.countRecipes) return db.countRecipes();
    // The test is whether the store can answer, not what it answered. This
    // figure is what the screen asks "is the library empty?", so a store that
    // can count neither way must not be allowed to say "no recipes" -- that
    // hides the rail and the list over a store that may hold every recipe the
    // user has. A thrown error is recoverable and a silent empty library is
    // not, which is why `readFilterCounts` below throws for the same reason.
    if (!db.retrieveAllRecipes) throw new Error("This store cannot count its recipes");
    // `?? 0` is right here and nowhere else: `retrieveAllRecipes` returns null
    // for an empty table, so from a store that has the method, null is the
    // answer "none" rather than the absence of one.
    return db.retrieveAllRecipes()?.length ?? 0;
}

function readFilterCounts(db: RecipeStore, revision: number): Record<string, number> {
    void revision;
    if (!db.countRecipesByFilter) {
        throw new Error("This store cannot count stock filters");
    }
    return db.countRecipesByFilter(STOCK_FILTER_ORDER, resolveStockFilter);
}

/**
 * Every tag and how many recipes carry it: the manual half of the shelf grid.
 *
 * Throws rather than returning nothing, for the reason `readFilterCounts` does.
 * A store that cannot answer would otherwise report a library with no tags,
 * and every shelf the user built by hand would be missing from the grid with
 * nothing on screen to say so. A shelf a person made is the one thing here the
 * app cannot reconstruct if it quietly drops it.
 */
function readTagCounts(db: RecipeStore, revision: number): {tag: string; count: number}[] {
    void revision;
    if (!db.countRecipesByTag) {
        throw new Error("This store cannot count tags");
    }
    return db.countRecipesByTag();
}

export default useRecipeLibrary;
