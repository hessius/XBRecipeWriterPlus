/**
 * The bounds a recipe must satisfy to survive `Recipe.getData()`.
 *
 * These are the same numbers the editor's steppers enforce. They are asserted
 * here rather than trusted there because a recipe can arrive from an import, a
 * restore or Auto fix without passing through a stepper at all.
 */
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {cardWriteProblems} from "@/library/cardLimits";

/** A recipe the machine would accept, as the baseline every case perturbs. */
function validRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 15;
    recipe.ratio = 15;
    recipe.grinder = true;
    recipe.grindSize = 50;
    recipe.grindRPM = 120;
    recipe.pours = [new Pour(1, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return recipe;
}

describe("a recipe the machine would accept", () => {
    it("has no problems", () => {
        expect(cardWriteProblems(validRecipe())).toEqual([]);
    });
});

describe("a recipe outside the machine's bounds", () => {
    it("rejects a stage volume above 240 ml, even when the sum balances", () => {
        // The reviewer's example: dose 31 at ratio 100 balances at 3100 ml, so
        // the volume sum is valid and the byte is still nonsense.
        const recipe = validRecipe();
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        expect(recipe.isPourVolumeValid()).toBe(true);
        expect(cardWriteProblems(recipe)).toContain("Stage 1 pours 3100 ml. The most is 240 ml.");
    });

    it("rejects a dose above 31 g", () => {
        const recipe = validRecipe();
        recipe.dosage = 40;

        expect(cardWriteProblems(recipe)).toContain("The dose is 40 g. The most is 31 g.");
    });

    it("rejects a temperature below 39 C", () => {
        const recipe = validRecipe();
        recipe.pours[0].temperature = 20;

        expect(cardWriteProblems(recipe))
            .toContain("Stage 1 brews at 20 C. The range is 39-99 C.");
    });

    it("reports an unbalanced recipe too, so one call answers the whole question", () => {
        const recipe = validRecipe();
        recipe.pours[0].volume = 100;

        expect(cardWriteProblems(recipe))
            .toContain("The stages pour 100 ml, but the dose and ratio ask for 225 ml.");
    });

    it("collects every problem rather than stopping at the first", () => {
        const recipe = validRecipe();
        recipe.dosage = 40;
        recipe.pours[0].temperature = 20;

        expect(cardWriteProblems(recipe).length).toBeGreaterThanOrEqual(2);
    });
});

describe("a tea recipe", () => {
    it("takes the tea bounds, not the coffee ones", () => {
        const recipe = validRecipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;
        recipe.pours = [new Pour(1, 200, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
        recipe.fixRatio();

        expect(cardWriteProblems(recipe)).toContain("Stage 1 pours 200 ml. The most is 90 ml.");
    });

    it("allows a pause longer than a coffee card would", () => {
        const recipe = validRecipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;
        recipe.pours = [new Pour(1, 90, 93, 30, 0, POUR_PATTERN.CIRCULAR, 300)];
        recipe.fixRatio();

        expect(cardWriteProblems(recipe).some((p) => p.includes("waits"))).toBe(false);
    });
});
