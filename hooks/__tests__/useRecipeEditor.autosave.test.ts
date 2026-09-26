import {act, renderHook} from "@testing-library/react-native";

import {RECIPE_LABELS, useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

// Copied from library/__tests__/RecipeDatabase.index.test.ts: one shared real
// SQLite database per test, so every RecipeDatabase instance sees the same row.
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

const mockNotify = jest.fn();

jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    notify:     (notice: unknown) => mockNotify(notice)
}));

/**
 * Make every write fail, the way a full or unwritable database would.
 *
 * Reads are left alone: `saveMetadata` has to find the row before it can fail
 * to write it, and a test where it never got that far would pass for the
 * wrong reason.
 */
function breakWrites() {
    const real = mockBacking.runSync;
    mockBacking.runSync = (source: string, params?: unknown[]) => {
        if (/^\s*(INSERT|UPDATE|DELETE)/i.test(source)) {
            throw new Error("database is locked");
        }
        return real(source, params);
    };
}

function open(recipe: Recipe) {
    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         jest.fn()
    }));
}

function stored(): Recipe {
    const row = new RecipeDatabase().getRecipe("u1");
    if (!row) throw new Error("the recipe was not in the library");
    return row;
}

function saved(): Recipe {
    const r = new Recipe();
    r.uuid = "u1";
    r.dosage = 18;
    r.ratio = 16;
    r.addOpeningPour();
    new RecipeDatabase().insertRecipe(r);
    return r;
}

describe("useRecipeEditor autosave", () => {
    beforeEach(() => {
        mockBacking = createTestDatabase();
    });

    it("writes a committed note without waiting for SAVE", async () => {
        saved();
        const {result} = await open(stored());

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(stored().description).toBe("Sweet");
    });

    it("writes tags without waiting for SAVE", async () => {
        saved();
        const {result} = await open(stored());

        await act(async () => {
            result.current.editTags(["morning"]);
        });

        expect(stored().tags).toEqual(["morning"]);
    });

    it("does not carry an unsaved dose along with the note", async () => {
        // The whole reason this does not go through `persistRecipe`. A user who
        // changes the dose, types a note and then backs out must find the note
        // kept and the dose as it was.
        saved();
        const {result} = await open(stored());

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.DOSE, "22");
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(stored().description).toBe("Sweet");
        expect(stored().dosage).toBe(18);
    });

    it("adds nothing to the library for a recipe that is not in it", async () => {
        // `updateRecipe` inserts when there is no row, so an unguarded autosave
        // would put a card read or a half-finished import into the library
        // behind the user's back. On those, metadata travels with SAVE.
        const fresh = new Recipe();
        fresh.uuid = "never-saved";
        fresh.addOpeningPour();
        const {result} = await open(fresh);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(new RecipeDatabase().getRecipe("never-saved")).toBeNull();
    });

    it("reports a pending note for a recipe that is not in the library", async () => {
        const fresh = new Recipe();
        fresh.uuid = "never-saved";
        fresh.addOpeningPour();
        const {result} = await open(fresh);

        expect(result.current.hasPendingEdits()).toBe(false);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(new RecipeDatabase().getRecipe("never-saved")).toBeNull();
        expect(result.current.hasPendingEdits()).toBe(true);
    });

    it("reports a pending card edit, and stops reporting it after a save", async () => {
        saved();
        const {result} = await open(stored());

        expect(result.current.hasPendingEdits()).toBe(false);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.DOSE, "22");
        });
        expect(result.current.hasPendingEdits()).toBe(true);

        await act(async () => {
            result.current.persistRecipe();
        });
        expect(result.current.hasPendingEdits()).toBe(false);
    });

    it("does not report a note as a pending edit", async () => {
        saved();
        const {result} = await open(stored());

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(result.current.hasPendingEdits()).toBe(false);
    });
});

describe("useRecipeEditor autosave when the write fails", () => {
    beforeEach(() => {
        mockBacking = createTestDatabase();
        mockNotify.mockClear();
    });

    it("says so rather than throwing into a promise nobody awaits", async () => {
        // The dispatcher calls this from a `.then` it does not await, so a
        // throw here is an unhandled rejection and the user is told nothing.
        saved();
        const {result} = await open(stored());
        breakWrites();

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error"})
        );
    });

    it("leaves the edit pending, so the leave guard still asks", async () => {
        // Metadata is left out of the dirty projection because it writes
        // itself. That is only true while the write works: a failed one lives
        // on the bench and nowhere else.
        saved();
        const {result} = await open(stored());
        result.current.hasPendingEdits();
        breakWrites();

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        expect(result.current.hasPendingEdits()).toBe(true);
    });

    it("stops asking once a later write lands", async () => {
        saved();
        const {result} = await open(stored());
        result.current.hasPendingEdits();
        const real = mockBacking.runSync;
        breakWrites();

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.NOTE, "Sweet");
            result.current.saveMetadata();
        });

        mockBacking.runSync = real;
        await act(async () => {
            result.current.saveMetadata();
        });

        expect(result.current.hasPendingEdits()).toBe(false);
        expect(stored().description).toBe("Sweet");
    });
});
