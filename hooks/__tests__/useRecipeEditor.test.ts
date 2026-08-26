import {act, renderHook} from "@testing-library/react-native";

import {useRecipeEditor, hasSource, RECIPE_LABELS} from "@/hooks/useRecipeEditor";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";

jest.mock("@/library/RecipeDatabase");

// `useSetting` reaches for the shared SQLite-backed settings store, which
// cannot open under jest — see the same mock in app/__tests__/editRecipe.test.tsx.
// This hook only reads `temperatureUnit`, and every test here is written
// against Celsius messages, so the mock is a constant rather than a store.
jest.mock("@/hooks/useSetting", () => ({
    useSetting: () => ["C", jest.fn()]
}));

/**
 * 15 g at 1:16 over two equal pours: 240 ml, 120 each, in balance.
 *
 * `addPour` inserts after the index it is given and copies from it, so the
 * first one has to say `false` — there is nothing yet to copy from.
 *
 * 15 × 16 = 240 ml total. When the "hand-fix" test edits stage 0 to 10, the
 * compensating edit brings stage 1 to 120 + 110 = 230 ml, keeping the recipe
 * within the per-stage maximum so it is writable after the fix.
 */
async function renderEditor(overrides: {onSaved?: () => void} = {}) {
    const recipe = new Recipe();
    recipe.dosage = 15;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.addPour(0, false);
    recipe.addPour(0);
    recipe.autoFixPourVolumes();
    recipe.pours.forEach(p => { p.flowRate = 30; });

    return renderHook(() => useRecipeEditor({
        recipeJSON:           JSON.stringify(recipe),
        onSaved:              overrides.onSaved ?? jest.fn()
    }));
}

describe("the volume readout (#40)", () => {
    it("follows the ratio without being told to repaint", async () => {
        const {result} = await renderEditor();

        expect(result.current.balance.target).toBe(240);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.RATIO, "17");
        });

        expect(result.current.balance.target).toBe(result.current.recipe!.getTotalVolume());
        expect(result.current.balance.target).toBe(15 * 17);
    });

    it("follows the dose too", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.DOSE, "20");
        });

        expect(result.current.balance.target).toBe(20 * 16);
    });

    it("counts what the stages actually pour", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });

        expect(result.current.balance.poured)
            .toBe(result.current.recipe!.getPourTotalVolume());
        expect(result.current.balance.balanced).toBe(false);
    });

    it("comes back into balance when the volumes are fixed by hand", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });
        expect(result.current.balance.balanced).toBe(false);

        const short = result.current.balance.target - result.current.balance.poured;
        const last = result.current.recipe!.pours.length - 1;
        const lastVolume = result.current.recipe!.pours[last].getVolume();

        await act(async () => {
            await result.current.editStage(last, "volume", lastVolume + short);
        });

        expect(result.current.balance.balanced).toBe(true);
        expect(result.current.canWrite).toBe(true);
    });
});

describe("the two gates", () => {
    it("saves a recipe that does not add up", async () => {
        const onSaved = jest.fn();
        const {result} = await renderEditor({onSaved});

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });

        await act(async () => {
            result.current.saveRecipe();
        });

        expect(onSaved).toHaveBeenCalled();
    });

    it("refuses to write one that does not", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            await result.current.editStage(0, "volume", 10);
        });

        expect(result.current.canWrite).toBe(false);
        expect(result.current.canSave).toBe(true);
    });

    it("refuses both while a field is invalid", async () => {
        const {result} = await renderEditor();

        await act(async () => {
            result.current.setInputError(true);
        });

        expect(result.current.canWrite).toBe(false);
        expect(result.current.canSave).toBe(false);
    });
});

describe("revert sources", () => {
    it("names all four whether or not it has them", async () => {
        const {result} = await renderEditor();

        expect(result.current.revertSources.map((s) => s.id))
            .toEqual(["card", "saved", "xid", "share"]);
    });

    it("marks the ones this recipe cannot use", async () => {
        const {result} = await renderEditor();
        const byId = Object.fromEntries(
            result.current.revertSources.map((s) => [s.id, s.available])
        );

        expect(byId.card).toBe(false);
        expect(byId.share).toBe(false);
    });
});

describe("hasSource", () => {
    it("does not count whitespace as an online identifier", async () => {
        // `isValidXID` and the refresh gate both read a blank ID as no ID.
        // Untrimmed, a recipe holding a single space offered an online revert
        // and then fetched with an identifier the endpoint cannot answer.
        const recipe = new Recipe();
        recipe.xid = "   ";
        recipe.shareId = "  ";

        expect(hasSource(recipe, "xid")).toBe(false);
        expect(hasSource(recipe, "share")).toBe(false);
    });

    it("still counts a real one", async () => {
        const recipe = new Recipe();
        recipe.xid = "CGL12";
        recipe.shareId = "abc123";

        expect(hasSource(recipe, "xid")).toBe(true);
        expect(hasSource(recipe, "share")).toBe(true);
    });
});

describe("the write gate", () => {
    it("is closed for a balanced recipe whose fields are out of range", async () => {
        // Balanced and unwritable at the same time: dose 31 at ratio 100 asks
        // for 3100 ml, and one stage can hold at most 240.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), onSaved: () => {}})
        );

        expect(result.current.balance.balanced).toBe(true);
        expect(result.current.canWrite).toBe(false);
    });

    it("is open for a recipe within range", async () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 15;
        recipe.ratio = 15;
        recipe.grindSize = 60;
        recipe.grindRPM = 90;
        recipe.pours = [new Pour(1, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), onSaved: () => {}})
        );

        expect(result.current.canWrite).toBe(true);
    });

    it("still allows saving a recipe that cannot be written", async () => {
        // Keeping a recipe and writing it are different permissions. A recipe
        // the machine would reject is still worth having in the library.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        const {result} = await renderHook(() =>
            useRecipeEditor({recipeJSON: JSON.stringify(recipe), onSaved: () => {}})
        );

        expect(result.current.canSave).toBe(true);
    });
});
