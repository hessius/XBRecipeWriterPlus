import {accents} from "@/constants/colors";
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
        expect(recipe.isTea()).toBe(true);
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
        // The gate already exists; this pins that a blank recipe trips it
        // rather than reaching a card half-formed.
        expect(cardWriteProblems(blankRecipe("coffee")))
            .toContain("The recipe has no stages.");
        expect(cardWriteProblems(blankRecipe("tea")))
            .toContain("The recipe has no stages.");
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
        expect(accents.coffee.length).toBeGreaterThan(accents.tea.length);
    });
});
