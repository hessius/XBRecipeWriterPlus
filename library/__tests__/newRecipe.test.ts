import {accentGroupFor} from "@/library/accent";
import {cardWriteProblems} from "@/library/cardLimits";
import {blankRecipe} from "@/library/newRecipe";
import {CUP_TYPE} from "@/library/Recipe";

describe("blankRecipe", () => {
    it("builds a coffee recipe on the agreed presets", () => {
        const recipe = blankRecipe("coffee");

        expect(recipe.ratio).toBe(16);
        expect(recipe.dosage).toBe(15);
        expect(recipe.grindSize).toBe(65);
        expect(recipe.grindRPM).toBe(120);
        expect(recipe.cupType).toBe(CUP_TYPE.OMNI);
        expect(recipe.grinder).toBe(true);
    });

    it("builds a tea recipe at a 5 g dose", () => {
        const recipe = blankRecipe("tea");

        expect(recipe.dosage).toBe(5);
        expect(recipe.cupType).toBe(CUP_TYPE.TEA);
        // Tea's ratio is seeded at the value fixRatio derives from the 90 ml
        // opening stage, so it is never the -1 "not set" sentinel the editor
        // would render as a -5 ml target. The grind fields are deliberately
        // left at their class defaults -- every call site that draws grind
        // gates on !isTea, so grindSize's -1 is invisible on tea.
        expect(recipe.ratio).toBe(18);
        expect(recipe.grindSize).toBe(-1);
        expect(recipe.grindRPM).toBe(120);
        expect(recipe.grinder).toBe(true);
    });

    it("starts with no stages, for either beverage", () => {
        expect(blankRecipe("coffee").pours).toHaveLength(0);
        expect(blankRecipe("tea").pours).toHaveLength(0);
    });

    it("records that the user wrote it", () => {
        expect(blankRecipe("coffee").source).toBe("manual");
    });

    it("shows a placeholder name until the user types one", () => {
        expect(blankRecipe("coffee").displayName()).toBe("Untitled Brew");
        expect(blankRecipe("coffee").hasName()).toBe(false);
    });

    it("gives every recipe its own identity", () => {
        expect(blankRecipe("coffee").uuid).not.toBe(blankRecipe("coffee").uuid);
    });

    it("cannot be written to a card until it has a stage", () => {
        // The gate already exists; this pins the whole problem list a blank
        // recipe trips, rather than that it merely includes one line -- the
        // loose form once hid the -1 ratio sentinel's nonsense on tea. Both
        // problems are truthful: no stages, and 0 ml poured against the target.
        expect(cardWriteProblems(blankRecipe("coffee"))).toEqual([
            "The recipe has no stages.",
            "The stages pour 0 ml, but the dose and ratio ask for 240 ml.",
        ]);
        expect(cardWriteProblems(blankRecipe("tea"))).toEqual([
            "The recipe has no stages.",
            "The stages pour 0 ml, but the dose and ratio ask for 90 ml.",
        ]);
    });

    it("is one tap from writable, for either beverage", () => {
        const coffee = blankRecipe("coffee");
        coffee.addOpeningPour();
        expect(cardWriteProblems(coffee)).toEqual([]);

        const tea = blankRecipe("tea");
        tea.addOpeningPour();
        expect(cardWriteProblems(tea)).toEqual([]);
    });

    it("lands in the half of the palette its beverage owns", () => {
        // Not a colour assertion for its own sake: the chooser shows these
        // swatches on the door, so the door and the recipe must agree about
        // which half the new recipe will draw from.
        expect(accentGroupFor(blankRecipe("coffee"))).toBe("coffee");
        expect(accentGroupFor(blankRecipe("tea"))).toBe("tea");
    });
});
