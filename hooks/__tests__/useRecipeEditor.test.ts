import {act, renderHook} from "@testing-library/react-native";

import {useRecipeEditor, RECIPE_LABELS} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";

jest.mock("@/library/RecipeDatabase");

/**
 * 18 g at 1:16 over two equal pours: 288 ml, 144 each, in balance.
 *
 * `addPour` inserts after the index it is given and copies from it, so the
 * first one has to say `false` — there is nothing yet to copy from.
 */
async function renderEditor(overrides: {onSaved?: () => void} = {}) {
    const recipe = new Recipe();
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.addPour(0, false);
    recipe.addPour(0);
    recipe.autoFixPourVolumes();

    return renderHook(() => useRecipeEditor({
        recipeJSON:           JSON.stringify(recipe),
        initiallySaveEnabled: false,
        onSaved:              overrides.onSaved ?? jest.fn()
    }));
}

describe("the volume readout (#40)", () => {
    it("follows the ratio without being told to repaint", async () => {
        const {result} = await renderEditor();

        expect(result.current.balance.target).toBe(288);

        await act(async () => {
            await result.current.editInputComplete(RECIPE_LABELS.RATIO, "17");
        });

        expect(result.current.balance.target).toBe(result.current.recipe!.getTotalVolume());
        expect(result.current.balance.target).toBe(18 * 17);
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
