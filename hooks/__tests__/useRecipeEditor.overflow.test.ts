import {act, renderHook} from "@testing-library/react-native";

import {RECIPE_LABELS, useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe, {CUP_TYPE} from "@/library/Recipe";

jest.mock("@/library/RecipeDatabase");

function recipeWith(config?: {retainedGrams: number; checkSeconds: 15 | 30 | 45}): Recipe {
    const recipe = new Recipe();
    recipe.dosage = 15;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.cupType = CUP_TYPE.OTHER;
    recipe.addPour(0, false);
    recipe.autoFixPourVolumes();
    recipe.pours.forEach(p => { p.flowRate = 30; });
    if (config) recipe.overflowProtection = config;
    return recipe;
}

async function editorFor(recipe: Recipe) {
    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         jest.fn()
    }));
}

describe("useRecipeEditor setOverflowProtection", () => {
    it("opens with whatever the stored recipe carries", async () => {
        const {result} = await editorFor(recipeWith({retainedGrams: 70, checkSeconds: 30}));
        expect(result.current.recipe?.overflowProtection).toEqual({retainedGrams: 70, checkSeconds: 30});
    });

    it("writes a valid config onto the recipe in place and bumps the key", async () => {
        const {result} = await editorFor(recipeWith());
        const target = result.current.recipe;
        const before = result.current.key;

        await act(async () => {
            result.current.setOverflowProtection({retainedGrams: 90, checkSeconds: 45});
        });

        expect(result.current.recipe).toBe(target);
        expect(result.current.recipe?.overflowProtection).toEqual({retainedGrams: 90, checkSeconds: 45});
        expect(result.current.key).toBeGreaterThan(before);
    });

    it("copies what it is given, so a later edit of the caller's object cannot reach the recipe", async () => {
        const {result} = await editorFor(recipeWith());
        const given = {retainedGrams: 90, checkSeconds: 15 as const};

        await act(async () => { result.current.setOverflowProtection(given); });
        given.retainedGrams = 1;

        expect(result.current.recipe?.overflowProtection?.retainedGrams).toBe(90);
    });

    it("removes the property, not a disabled shape, when asked for none", async () => {
        const {result} = await editorFor(recipeWith({retainedGrams: 70, checkSeconds: 30}));

        await act(async () => { result.current.setOverflowProtection(undefined); });

        expect(result.current.recipe?.overflowProtection).toBeUndefined();
        expect("overflowProtection" in (result.current.recipe ?? {})).toBe(false);
        expect(JSON.parse(JSON.stringify(result.current.recipe))).not.toHaveProperty("overflowProtection");
    });

    it.each([
        {retainedGrams: 0, checkSeconds: 15},
        {retainedGrams: 12.5, checkSeconds: 15},
        {retainedGrams: 50, checkSeconds: 20},
        {retainedGrams: Number.MAX_SAFE_INTEGER + 1, checkSeconds: 15}
    ])("refuses %j and leaves the recipe and key alone", async (bad) => {
        const {result} = await editorFor(recipeWith({retainedGrams: 70, checkSeconds: 30}));
        const before = result.current.key;

        await act(async () => {
            result.current.setOverflowProtection(bad as never);
        });

        expect(result.current.recipe?.overflowProtection).toEqual({retainedGrams: 70, checkSeconds: 30});
        expect(result.current.key).toBe(before);
    });

    it("keeps the config when the brewer changes away from Other, and when it returns", async () => {
        const {result} = await editorFor(recipeWith({retainedGrams: 70, checkSeconds: 30}));

        await act(async () => {
            result.current.editInputComplete(RECIPE_LABELS.CUP, String(CUP_TYPE.OMNI));
        });
        expect(result.current.recipe?.overflowProtection).toEqual({retainedGrams: 70, checkSeconds: 30});

        await act(async () => {
            result.current.editInputComplete(RECIPE_LABELS.CUP, String(CUP_TYPE.OTHER));
        });
        expect(result.current.recipe?.overflowProtection).toEqual({retainedGrams: 70, checkSeconds: 30});
    });

    it("counts a config change as unsaved work", async () => {
        const {result} = await editorFor(recipeWith());
        expect(result.current.hasPendingEdits()).toBe(false);

        await act(async () => {
            result.current.setOverflowProtection({retainedGrams: 90, checkSeconds: 15});
        });

        expect(result.current.hasPendingEdits()).toBe(true);
    });

    it("keeps the config through a revert, which restores the card's parameters only", async () => {
        const recipe = recipeWith({retainedGrams: 70, checkSeconds: 30});
        recipe.offline_backup = recipe.getData([]);
        recipe.overflowProtection = {retainedGrams: 95, checkSeconds: 45};
        const {result} = await editorFor(recipe);
        const saved = result.current.revertSources.find((s) => s.id === "saved");

        await act(async () => { await saved!.action(); });

        expect(result.current.recipe?.overflowProtection).toEqual({retainedGrams: 95, checkSeconds: 45});
    });
});
