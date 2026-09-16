import {act, renderHook} from "@testing-library/react-native";

import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import type {BackupPayload} from "@/library/backup";
import Recipe from "@/library/Recipe";

jest.mock("@/library/RecipeDatabase");

function stubDb(recipes: Recipe[]) {
    return {
        retrieveAllRecipes: jest.fn(() => recipes),
        deleteRecipe:       jest.fn(),
        cloneRecipe:        jest.fn(),
        // Writes through to the backing array so a reload after the write
        // returns the changed recipe, the same as the real database does.
        updateRecipe:       jest.fn((uuid: string, updated: Recipe) => {
            const index = recipes.findIndex((r) => r.uuid === uuid);
            if (index !== -1) recipes[index] = updated;
        }),
        deleteAllRecipes:   jest.fn(),
        insertRecipes:      jest.fn(),
        replaceAllRecipes:  jest.fn()
    };
}

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

function plainRecipe(): Recipe {
    return named("Ethiopia");
}

function favouriteRecipe(): Recipe {
    const r = named("Ethiopia");
    r.favourite = true;
    return r;
}

function payloadOf(recipes: Recipe[]): BackupPayload {
    return {recipes, settings: {}, skipped: 0, appVersion: "2.6.0", exportedAt: ""};
}

describe("useRecipeLibrary", () => {
    it("sorts by display name so the list order does not depend on insertion order", async () => {
        const db = stubDb([named("Zambia"), named("Ethiopia"), named("Kenya")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));
        expect(result.current.recipes.map((r) => r.displayName()))
            .toEqual(["Ethiopia", "Kenya", "Zambia"]);
    });

    it("reports an empty library as an empty list, not as null", async () => {
        // retrieveAllRecipes returns null when the table is empty. Every caller
        // leaking that null is how the old screen ended up with `recipesJSON ? ... : ""`.
        const db = {...stubDb([]), retrieveAllRecipes: jest.fn(() => null)};
        const {result} = await renderHook(() => useRecipeLibrary(db));
        expect(result.current.recipes).toEqual([]);
    });

    it("deletes through the database and re-reads", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.deleteRecipe(result.current.recipes[0]));

        expect(db.deleteRecipe).toHaveBeenCalledTimes(1);
        expect(db.retrieveAllRecipes).toHaveBeenCalledTimes(2);
    });

    it("duplicates through the database and re-reads", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.duplicateRecipe(result.current.recipes[0]));

        expect(db.cloneRecipe).toHaveBeenCalledTimes(1);
        expect(db.retrieveAllRecipes).toHaveBeenCalledTimes(2);
    });

    it("toggles a favourite and persists it", async () => {
        const db = stubDb([plainRecipe()]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => {
            result.current.toggleFavourite(result.current.recipes[0]);
        });

        expect(db.updateRecipe).toHaveBeenCalledTimes(1);
        expect(result.current.recipes[0].favourite).toBe(true);
    });

    it("toggles back off", async () => {
        const db = stubDb([favouriteRecipe()]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => {
            result.current.toggleFavourite(result.current.recipes[0]);
        });

        expect(result.current.recipes[0].favourite).toBe(false);
    });

    it("reloads to the true value instead of throwing when the write fails", async () => {
        // toggleFavourite mutates before it writes, so a throw here must not
        // skip the reload. stubDb's retrieveAllRecipes hands back the same
        // live object every call, which would hide this bug (the mutation
        // would just look "restored" because it never left in the first
        // place), so this store keeps its own serialized copy and rebuilds a
        // fresh Recipe on every read, the way the real database does.
        const original = plainRecipe();
        const stored = JSON.stringify(original);
        const db = {
            retrieveAllRecipes: jest.fn(() => [new Recipe(undefined, stored)]),
            deleteRecipe:       jest.fn(),
            cloneRecipe:        jest.fn(),
            updateRecipe:       jest.fn(() => {
                throw new Error("database is locked");
            })
        };
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => {
            expect(() => {
                result.current.toggleFavourite(result.current.recipes[0]);
            }).not.toThrow();
        });

        expect(result.current.recipes[0].favourite).toBe(false);
    });

    it("re-reads on refresh", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.refresh());

        expect(db.retrieveAllRecipes).toHaveBeenCalledTimes(2);
    });

    it("deletes the whole library and reports how many went", async () => {
        const db = stubDb([named("Ethiopia"), named("Kenya")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        let outcome;
        await act(async () => {
            outcome = result.current.deleteAll();
        });

        expect(outcome).toEqual({status: "deleted", deleted: 2});
        expect(db.deleteAllRecipes).toHaveBeenCalledTimes(1);
    });

    it("reports a failed delete instead of throwing into the screen", async () => {
        // The one irreversible action in the app, and the only destructive path
        // that had no outcome to report. A `runSync` that threw escaped into the
        // press handler, where nothing caught it and nothing could tell the user
        // their recipes were still there.
        const db = stubDb([named("Ethiopia"), named("Kenya")]);
        db.deleteAllRecipes = jest.fn(() => {
            throw new Error("database is locked");
        });
        const {result} = await renderHook(() => useRecipeLibrary(db));

        let outcome;
        await act(async () => {
            expect(() => {
                outcome = result.current.deleteAll();
            }).not.toThrow();
        });

        expect(outcome).toEqual({status: "failed"});
    });

    it("merges a restore through insertRecipes, skipping what is already present", async () => {
        const present = named("Ethiopia");
        const db = stubDb([present]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        const incoming = named("Kenya");
        let outcome;
        await act(async () => {
            outcome = result.current.applyRestore(
                payloadOf([present, incoming]), {replace: false}
            );
        });

        expect(outcome).toEqual({status: "restored", added: 1});
        expect(db.insertRecipes).toHaveBeenCalledTimes(1);
        expect(db.insertRecipes.mock.calls[0][0].map((r: Recipe) => r.name)).toEqual(["Kenya"]);
        expect(db.replaceAllRecipes).not.toHaveBeenCalled();
    });

    it("replaces a restore through the transactional replaceAllRecipes", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        const incoming = named("Kenya");
        await act(async () => {
            result.current.applyRestore(payloadOf([incoming]), {replace: true});
        });

        expect(db.replaceAllRecipes).toHaveBeenCalledTimes(1);
        expect(db.replaceAllRecipes.mock.calls[0][0].map((r: Recipe) => r.name)).toEqual(["Kenya"]);
        expect(db.insertRecipes).not.toHaveBeenCalled();
    });

    it("reports a failed restore rather than throwing when the store rejects", async () => {
        const db = stubDb([]);
        db.insertRecipes.mockImplementation(() => {
            throw new Error("DB: Recipe already exists");
        });
        const {result} = await renderHook(() => useRecipeLibrary(db));

        let outcome;
        await act(async () => {
            outcome = result.current.applyRestore(payloadOf([named("Kenya")]), {replace: false});
        });

        expect(outcome).toEqual({status: "failed"});
    });

    it("ignores a second restore that re-enters before the first has repainted", async () => {
        // Two taps in one React batch, with no render between them, would both
        // read the same pre-reload snapshot and insert the same uuids. The
        // in-flight flag lets only the first through.
        const db = stubDb([]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        const incoming = named("Kenya");
        let first;
        let second;
        await act(async () => {
            first = result.current.applyRestore(payloadOf([incoming]), {replace: false});
            second = result.current.applyRestore(payloadOf([incoming]), {replace: false});
        });

        expect(first).toEqual({status: "restored", added: 1});
        expect(second).toEqual({status: "busy"});
        expect(db.insertRecipes).toHaveBeenCalledTimes(1);
    });
});

describe("the store it reads through", () => {
    it("is built once, not on every render", async () => {
        // The default used to be a default parameter, so every render of Home
        // ran `new RecipeDatabase()` — and each of those opens SQLite and
        // replays the table setup. Home re-renders for scrolling, for the
        // settings sheet and for NFC progress.
        const RecipeDatabase = jest.requireMock("@/library/RecipeDatabase").default;
        RecipeDatabase.mockClear();

        const {rerender} = await renderHook(() => useRecipeLibrary());
        await rerender(undefined);
        await rerender(undefined);

        expect(RecipeDatabase).toHaveBeenCalledTimes(1);
    });
});
