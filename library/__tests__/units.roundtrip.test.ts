import {toDisplay, fromDisplay, CELSIUS_RANGE} from "@/library/units";
import Recipe from "@/library/Recipe";

/**
 * The promise the units feature makes: switching to Fahrenheit and back must
 * produce a byte-identical card.
 *
 * Deliberately at the byte level rather than at the field. Every arithmetic
 * check in units.test.ts could pass while something converted twice, or
 * converted on save, and only the bytes would show it.
 *
 * Two deviations from the plan's sketch, both forced by the real signatures in
 * `library/Recipe.ts` rather than the plan's assumption:
 * - `getData` takes the 32-byte signature prefix as a plain `number[]`, not a
 *   `Uint8Array`, so `new Array(32).fill(0)` is used instead.
 * - `new Recipe()` starts with zero pours (`public pours: Pour[] = []`), so a
 *   loop over `recipe.pours` would silently do nothing and `recipe.pours[0]`
 *   would throw. A stage is added explicitly so the assertion is actually
 *   exercised.
 */
function recipeWithAStage(): Recipe {
    const recipe = new Recipe();
    recipe.addPour(0, false);
    return recipe;
}

describe("switching units and switching back", () => {
    it("leaves the card bytes untouched", () => {
        const recipe = recipeWithAStage();
        const before = JSON.stringify(recipe.getData(new Array(32).fill(0)));

        for (const pour of recipe.pours) {
            const shown = toDisplay(pour.temperature, "F");
            pour.temperature = fromDisplay(shown, "F");
        }

        expect(JSON.stringify(recipe.getData(new Array(32).fill(0)))).toBe(before);
    });

    it("survives a pass through every storable temperature", () => {
        const recipe = recipeWithAStage();
        for (let c = CELSIUS_RANGE.min; c <= CELSIUS_RANGE.max; c++) {
            recipe.pours[0].temperature = c;
            const before = JSON.stringify(recipe.getData(new Array(32).fill(0)));

            recipe.pours[0].temperature =
                fromDisplay(toDisplay(c, "F"), "F");

            expect(JSON.stringify(recipe.getData(new Array(32).fill(0)))).toBe(before);
        }
    });
});
