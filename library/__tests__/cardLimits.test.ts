/**
 * The bounds a recipe must satisfy to survive `Recipe.getData()`.
 *
 * These are the same numbers the editor's steppers enforce. They are asserted
 * here rather than trusted there because a recipe can arrive from an import, a
 * restore or Auto fix without passing through a stepper at all.
 */
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {canWriteToCard, cardWriteProblems} from "@/library/cardLimits";

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

describe("pour pattern and agitation", () => {
    it("rejects a pour pattern of -1 (the Pour default)", () => {
        const recipe = validRecipe();
        recipe.pours[0].pourPattern = -1;

        expect(cardWriteProblems(recipe)).toContain(
            "Stage 1 uses pour pattern -1. The range is 0-2."
        );
    });

    it("rejects an agitation of -1 (the Pour default)", () => {
        const recipe = validRecipe();
        recipe.pours[0].agitation = -1;

        expect(cardWriteProblems(recipe)).toContain(
            "Stage 1 uses agitation -1. The range is 0-3."
        );
    });

    it("accepts a valid pour pattern", () => {
        const recipe = validRecipe();
        recipe.pours[0].pourPattern = POUR_PATTERN.SPIRAL;

        expect(cardWriteProblems(recipe).some((p) => p.includes("pour pattern"))).toBe(false);
    });

    it("accepts a valid agitation", () => {
        const recipe = validRecipe();
        recipe.pours[0].agitation = AGITATION.BEFORE_ON_AFTER_ON;

        expect(cardWriteProblems(recipe).some((p) => p.includes("agitation"))).toBe(false);
    });
});

describe("fractional byte fields", () => {
    it("rejects a fractional stage volume — the 97.5 regression case", () => {
        // Recipe.volume.test.ts:83-93 documents a real case where autoFixPourVolumes
        // produced [30, 97.5, 97.5]: balanced, so isPourVolumeValid passed, but the
        // byte encoding silently truncates. The import path has no stepper to catch it.
        const recipe = validRecipe();
        recipe.dosage = 15;
        recipe.ratio = 15;
        recipe.pours = [
            new Pour(1, 30, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0),
            new Pour(2, 97.5, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0),
            new Pour(3, 97.5, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0),
        ];

        expect(recipe.isPourVolumeValid()).toBe(true);
        const problems = cardWriteProblems(recipe);
        expect(problems.some((p) => p.includes("97.5 ml") && p.includes("whole number"))).toBe(true);
    });

    it("rejects a non-integer ratio", () => {
        const recipe = validRecipe();
        recipe.ratio = 14.5;

        expect(cardWriteProblems(recipe)).toContain(
            "The ratio is 1:14.5. It has to be a whole number."
        );
    });

    it("rejects a fractional flow rate", () => {
        const recipe = validRecipe();
        recipe.pours[0].flowRate = 30.5;

        expect(cardWriteProblems(recipe).some((p) => p.includes("whole number"))).toBe(true);
    });

    it("rejects a fractional grind size", () => {
        const recipe = validRecipe();
        recipe.grindSize = 50.5;

        expect(cardWriteProblems(recipe).some((p) => p.includes("50.5") && p.includes("whole number"))).toBe(true);
    });

    it("rejects a fractional grind RPM", () => {
        const recipe = validRecipe();
        recipe.grindRPM = 90.5;

        expect(cardWriteProblems(recipe).some((p) => p.includes("90.5") && p.includes("whole number"))).toBe(true);
    });
});

describe("canWriteToCard", () => {
    it("returns true for a valid recipe", () => {
        expect(canWriteToCard(validRecipe())).toBe(true);
    });

    it("returns false when any problem exists", () => {
        const recipe = validRecipe();
        recipe.pours[0].pourPattern = -1;
        expect(canWriteToCard(recipe)).toBe(false);
    });

    it("returns false for a recipe with zero stages", () => {
        const recipe = validRecipe();
        recipe.pours = [];
        expect(canWriteToCard(recipe)).toBe(false);
    });

    it("returns false for a recipe with more than 31 stages", () => {
        const recipe = validRecipe();
        recipe.pours = Array.from({length: 32}, (_, i) =>
            new Pour(i + 1, 1, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)
        );
        expect(canWriteToCard(recipe)).toBe(false);
    });

    it("returns false for a flow rate out of range", () => {
        const recipe = validRecipe();
        recipe.pours[0].flowRate = 10;
        expect(canWriteToCard(recipe)).toBe(false);
    });

    it("returns false for a grind size out of range", () => {
        const recipe = validRecipe();
        recipe.grindSize = 20;
        expect(canWriteToCard(recipe)).toBe(false);
    });

    it("returns false for a grind RPM out of range", () => {
        const recipe = validRecipe();
        recipe.grindRPM = 200;
        expect(canWriteToCard(recipe)).toBe(false);
    });

    it("returns false for a non-integer ratio", () => {
        const recipe = validRecipe();
        recipe.ratio = 15.5;
        expect(canWriteToCard(recipe)).toBe(false);
    });
});
