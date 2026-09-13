import {act, renderHook} from "@testing-library/react-native";

import {useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";

jest.mock("@/library/RecipeDatabase");

async function editorFor(recipe: Recipe) {
    return renderHook(() => useRecipeEditor({
        recipeJSON:      JSON.stringify(recipe),
        temperatureUnit: "C",
        onSaved:         () => {}
    }));
}

/** 45 ml and 60 C on purpose: neither is a default, so a passing assertion
 *  proves a real binding rather than a constant that happens to agree. */
function recipeWithBypass(): Recipe {
    const recipe = new Recipe();
    recipe.bypassEnabled = true;
    recipe.bypassVolume  = 45;
    recipe.bypassTemp    = 60;
    return recipe;
}

/** Three stages ending at 88 C, so a seeded bypass has a last stage to copy. */
function recipeEndingAt(temperature: number): Recipe {
    const recipe = new Recipe();
    recipe.dosage = 18;
    recipe.ratio  = 16;
    recipe.addPour(0, false);
    recipe.addPour(0);
    recipe.addPour(0);
    recipe.autoFixPourVolumes();
    recipe.pours.forEach((pour, index) => {
        // A descending ramp, so copying the *last* stage is distinguishable
        // from copying the first or from averaging them.
        pour.temperature = temperature + (recipe.pours.length - 1 - index) * 4;
    });
    return recipe;
}

describe("useRecipeEditor bypass", () => {
    it("seeds a bypass at the temperature the brew finished on", async () => {
        // Bypass water is poured into the cup at the end, so the temperature
        // that makes sense to start from is the one the brew just ended at --
        // not a constant that has nothing to do with this recipe. A ramp is
        // used so this cannot pass by copying the first stage or by averaging.
        const {result} = await editorFor(recipeEndingAt(88));

        await act(async () => { result.current.setBypassEnabled(true); });

        expect(result.current.recipe?.bypassVolume).toBe(30);
        expect(result.current.recipe?.bypassTemp).toBe(88);
    });

    it("seeds volume and temperature when bypass is switched on from off", async () => {
        // No stages at all, so there is no last temperature to copy and the
        // constant is the only answer left.
        const {result} = await editorFor(new Recipe());

        await act(async () => { result.current.setBypassEnabled(true); });

        expect(result.current.recipe?.bypassEnabled).toBe(true);
        expect(result.current.recipe?.bypassVolume).toBe(30);
        expect(result.current.recipe?.bypassTemp).toBe(85);
    });

    it("keeps the existing values when bypass is switched on again", async () => {
        const {result} = await editorFor(recipeWithBypass());

        await act(async () => { result.current.setBypassEnabled(false); });
        await act(async () => { result.current.setBypassEnabled(true); });

        expect(result.current.recipe?.bypassVolume).toBe(45);
        expect(result.current.recipe?.bypassTemp).toBe(60);
    });

    it("leaves the volume and temperature alone when switching off", async () => {
        const {result} = await editorFor(recipeWithBypass());

        await act(async () => { result.current.setBypassEnabled(false); });

        expect(result.current.recipe?.bypassEnabled).toBe(false);
        expect(result.current.recipe?.bypassVolume).toBe(45);
        expect(result.current.recipe?.bypassTemp).toBe(60);
    });

    it("edits each field and publishes the change", async () => {
        const {result} = await editorFor(recipeWithBypass());
        const before = result.current.key;

        await act(async () => { result.current.editBypass("volume", 120); });
        await act(async () => { result.current.editBypass("temperature", 70); });

        expect(result.current.recipe?.bypassVolume).toBe(120);
        expect(result.current.recipe?.bypassTemp).toBe(70);
        expect(result.current.key).toBeGreaterThan(before);
    });

    it("clamps the volume to the bypass range", async () => {
        const {result} = await editorFor(recipeWithBypass());

        await act(async () => { result.current.editBypass("volume", 9000); });

        expect(result.current.recipe?.bypassVolume).toBe(500);
    });

    it("never lets bypass water enter the pour-sum invariant", async () => {
        // The machine refuses a recipe whose stages do not add up to
        // dose x ratio. Bypass is dispensed outside that sum, so turning it on
        // must not change the balance, the target, or the write gate.
        const {result} = await editorFor(new Recipe());
        const target = result.current.balance.target;
        const poured = result.current.balance.poured;
        const balanced = result.current.balance.balanced;
        const problemsBefore = result.current.writeProblems;

        await act(async () => { result.current.setBypassEnabled(true); });
        await act(async () => { result.current.editBypass("volume", 250); });

        expect(result.current.balance.target).toBe(target);
        expect(result.current.balance.poured).toBe(poured);
        expect(result.current.balance.balanced).toBe(balanced);
        expect(result.current.writeProblems).toEqual(problemsBefore);
    });
});
