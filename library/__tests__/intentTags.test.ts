import Recipe from "@/library/Recipe";
import intentTags from "@/library/intentTags";

function recipeWith(tags: string[]): Recipe {
    const recipe = new Recipe();
    recipe.setTags(tags);
    return recipe;
}

describe("intentTags", () => {
    it("reads a roast, a process and a fermentation as intent", () => {
        expect(intentTags(recipeWith(["Light", "Washed", "Anaerobic"])))
            .toEqual(["Light", "Washed", "Anaerobic"]);
    });

    it("ignores a word that is only the user's own", () => {
        expect(intentTags(recipeWith(["Morning", "Dad's"]))).toEqual([]);
    });

    it("reads a vocabulary term whatever case it was typed in", () => {
        expect(intentTags(recipeWith(["wAsHeD"]))).toEqual(["wAsHeD"]);
    });

    // The chip shows what the user typed, so the reading has to as well: a
    // reading that recased their word would disagree with the control that
    // produced it.
    it("keeps the user's own spelling rather than the vocabulary's", () => {
        expect(intentTags(recipeWith(["LIGHT"]))).toEqual(["LIGHT"]);
    });

    // Origin is free text in #100, so there is no closed list to match a tag
    // against and no way to tell a place from a mood. Guessing here is the
    // thing podCoffee.ts already refused to do.
    it("does not read a place name as intent", () => {
        expect(intentTags(recipeWith(["Huila", "Nyeri"]))).toEqual([]);
    });

    it("reads a multi-word fermentation", () => {
        expect(intentTags(recipeWith(["Carbonic maceration"])))
            .toEqual(["Carbonic maceration"]);
    });

    // Near misses are refused rather than repaired, the same rule beanTags
    // applies: isProcess("washed beans") is false, so this is too.
    it("does not read a near miss as intent", () => {
        expect(intentTags(recipeWith(["Washed beans", "Lightly roasted"])))
            .toEqual([]);
    });

    it("reports nothing for a recipe with no tags", () => {
        expect(intentTags(new Recipe())).toEqual([]);
    });

    it("keeps the order the tags are in on the recipe", () => {
        expect(intentTags(recipeWith(["Morning", "Natural", "Dad's", "Dark"])))
            .toEqual(["Natural", "Dark"]);
    });
});
