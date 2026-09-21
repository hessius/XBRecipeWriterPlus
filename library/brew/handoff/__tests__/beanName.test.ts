import {beanNameFromRecipe} from "@/library/brew/handoff/beanName";

describe("beanNameFromRecipe", () => {
    it("keeps everything in front of a spaced hyphen", () => {
        expect(beanNameFromRecipe("Ethiopia Guji Natural - Drop Coffee"))
            .toBe("Ethiopia Guji Natural");
    });

    it("keeps everything in front of an en dash", () => {
        expect(beanNameFromRecipe("Kenya Nyeri \u2013 v2")).toBe("Kenya Nyeri");
    });

    it("cuts a hyphen that is spaced on one side only", () => {
        expect(beanNameFromRecipe("Kenya Nyeri -v2")).toBe("Kenya Nyeri");
    });

    it("leaves a hyphenated word alone", () => {
        expect(beanNameFromRecipe("Long-Berry Harrar Lot 4")).toBe("Long-Berry Harrar");
    });

    it("takes the first two words when there is no dash", () => {
        expect(beanNameFromRecipe("Ethiopia Guji Natural v3 hotter"))
            .toBe("Ethiopia Guji");
    });

    it("takes a one-word name whole", () => {
        expect(beanNameFromRecipe("Decaf")).toBe("Decaf");
    });

    it("collapses the whitespace it was given", () => {
        expect(beanNameFromRecipe("  Ethiopia   Guji  Natural ")).toBe("Ethiopia Guji");
    });

    it("has nothing to offer for an empty name", () => {
        expect(beanNameFromRecipe("   ")).toBeUndefined();
    });

    it("has nothing to offer for a name that is only a dash", () => {
        expect(beanNameFromRecipe(" - ")).toBeUndefined();
    });
});
