import {act, renderHook} from "@testing-library/react-native";

// The `mock` prefix is what lets the jest.mock factory below close over this
// binding: the factory is hoisted above every import, so Jest rejects an
// out-of-scope reference that is not named as a mock.
import {createTestDatabase as mockCreateTestDatabase} from "@/test-utils/sqlite";
import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import RecipeDatabase from "@/library/RecipeDatabase";
import Recipe from "@/library/Recipe";

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockCreateTestDatabase()
}));

/**
 * The library hook driven against a real SQLite database rather than a stub.
 *
 * The rest of the suite mocks one side or the other: `useRecipeLibrary.test.ts`
 * hands the hook a `stubDb` whose `deleteAllRecipes` is a `jest.fn()`, and
 * `app/__tests__/settings.test.tsx` mocks `deleteAll` on the hook itself. Both
 * would keep passing if the store's delete silently removed nothing, because
 * neither ever asks the database what it still holds. This file does.
 */
function named(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

describe("useRecipeLibrary against a real database", () => {
    it("empties the library and reports the count it removed", async () => {
        const db = new RecipeDatabase();
        db.insertRecipe(named("Morning"));
        db.insertRecipe(named("Evening"));

        const {result} = await renderHook(() => useRecipeLibrary(db));
        expect(result.current.recipes).toHaveLength(2);

        let outcome;
        await act(async () => {
            outcome = result.current.deleteAll();
        });

        expect(outcome).toEqual({status: "deleted", deleted: 2});
        // The hook's own state...
        expect(result.current.recipes).toHaveLength(0);
        // ...and, the part a stub cannot check, the database itself.
        // retrieveAllRecipes returns null, not [], for an empty library.
        expect(db.retrieveAllRecipes()).toBeNull();
    });

    it("empties a library that carries tags", async () => {
        const db = new RecipeDatabase();
        const tagged = named("Tagged");
        tagged.setTags(["espresso", "kenya"]);
        db.insertRecipe(tagged);

        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => {
            result.current.deleteAll();
        });

        // retrieveAllRecipes returns null, not [], for an empty library.
        expect(db.retrieveAllRecipes()).toBeNull();
    });

    it("leaves nothing behind that a later insert would collide with", async () => {
        const db = new RecipeDatabase();
        const first = named("Morning");
        db.insertRecipe(first);

        const {result} = await renderHook(() => useRecipeLibrary(db));
        await act(async () => {
            result.current.deleteAll();
        });

        // Re-inserting the same uuid must work: insertRecipe throws on a
        // duplicate, so a row that survived the delete would surface here.
        expect(() => db.insertRecipe(first)).not.toThrow();
        expect(db.retrieveAllRecipes()).toHaveLength(1);
    });

    it("survives a round trip through SQLite when toggled", async () => {
        const db = new RecipeDatabase();
        db.insertRecipe(named("Morning"));

        const {result} = await renderHook(() => useRecipeLibrary(db));
        await act(async () => {
            result.current.toggleFavourite(result.current.recipes[0]);
        });

        // Read straight off the database rather than the hook's own state, so
        // this actually exercises updateRecipe's write path and not just the
        // in-memory mutation toggleFavourite makes before it writes.
        expect(db.retrieveAllRecipes()?.[0].favourite).toBe(true);
    });
});

describe("a tag shelf against a real database", () => {
    function tagged(name: string, tags: string[]): Recipe {
        const recipe = named(name);
        recipe.tags = tags;
        return recipe;
    }

    // The EXISTS fragment is SQL text that no stub can check. Every other test
    // of a tag shelf runs against a JavaScript stand-in, which would keep
    // passing if the subquery named a column SQLite does not have.
    it("narrows the library to the tagged recipes", async () => {
        const db = new RecipeDatabase();
        db.insertRecipe(tagged("Ethiopia", ["morning"]));
        db.insertRecipe(tagged("Kenya", ["morning"]));
        db.insertRecipe(tagged("Colombia", ["evening"]));

        const {result} = await renderHook(() => useRecipeLibrary(db, {
            search: "", filters: ["tag:morning"], sort: "name",
            direction: "asc", favouritesFirst: false
        }));

        expect(result.current.recipes.map((r) => r.displayName()))
            .toEqual(["Ethiopia", "Kenya"]);
    });

    // The shelf is grouped by the folded key, so it must open on the folded key
    // too. Matching the display text would open a shelf holding half of what
    // its own count promised.
    it("holds every spelling the shelf was counted from", async () => {
        const db = new RecipeDatabase();
        db.insertRecipe(tagged("Ethiopia", ["Morning"]));
        db.insertRecipe(tagged("Kenya", ["morning"]));

        const {result} = await renderHook(() => useRecipeLibrary(db, {
            search: "", filters: ["tag:Morning"], sort: "name",
            direction: "asc", favouritesFirst: false
        }));

        expect(result.current.recipes).toHaveLength(2);
    });

    it("counts the shelf at the size the list turns out to be", async () => {
        const db = new RecipeDatabase();
        db.insertRecipe(tagged("Ethiopia", ["Morning"]));
        db.insertRecipe(tagged("Kenya", ["morning"]));

        const {result} = await renderHook(() => useRecipeLibrary(db));

        expect(result.current.tagCounts[0].count).toBe(2);
    });
});

describe("setShelfMembers against a real database", () => {
    it("writes a shelf's whole membership in one pass", async () => {
        const db = new RecipeDatabase();
        db.insertRecipe(named("Morning"));
        db.insertRecipe(named("Evening"));
        const all = db.retrieveAllRecipes() ?? [];

        const {result} = await renderHook(() => useRecipeLibrary(db));
        await act(async () => {
            result.current.setShelfMembers("Mornings", [all[0].uuid]);
        });

        // The count is the shelf query's own answer, not the hook's state, so
        // this fails if the tag reached the object but never the tag table.
        expect(result.current.tagCounts).toEqual([
            {tag: "Mornings", count: 1}
        ]);
    });

    it("takes a member off a shelf without touching its other tags", async () => {
        const db = new RecipeDatabase();
        const recipe = named("Morning");
        recipe.setTags(["Mornings", "Kenya"]);
        db.insertRecipe(recipe);

        const {result} = await renderHook(() => useRecipeLibrary(db));
        // Emptied by the folded key rather than the spelling: the tile the user
        // pressed carries MIN(tag), which need not be the spelling this recipe
        // happens to hold, and a removal that missed would leave a member on a
        // shelf the user had just emptied.
        await act(async () => {
            result.current.setShelfMembers("mornings", []);
        });

        expect(result.current.tagCounts).toEqual([
            {tag: "Kenya", count: 1}
        ]);
    });

    it("does not give a recipe two spellings of one shelf", async () => {
        // The folded key is what matching is on, so adding "Morning" to a
        // recipe that already carries "morning" leaves the one tag it had.
        // Recipe.normaliseTags folds the duplicate out on the way back through
        // SQLite as well, so this is defended twice on purpose: the spelling a
        // shelf is counted under decides which tile is drawn.
        const db = new RecipeDatabase();
        const recipe = named("Morning");
        recipe.setTags(["morning"]);
        db.insertRecipe(recipe);
        const uuid = (db.retrieveAllRecipes() ?? [])[0].uuid;

        const {result} = await renderHook(() => useRecipeLibrary(db));
        await act(async () => {
            result.current.setShelfMembers("Morning", [uuid]);
        });

        expect(result.current.tagCounts).toEqual([
            {tag: "morning", count: 1}
        ]);
    });
});
