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
