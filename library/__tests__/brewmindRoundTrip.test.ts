import Recipe from "@/library/Recipe";
import {parseBrewMindLink} from "@/library/brewmindLink";
import {decorateImport} from "@/library/importDecoration";
import {buildEnvelope} from "@/library/brew/handoff/envelope";
import {brew, samples} from "@/library/brew/handoff/__tests__/fixtures";

/**
 * The whole point of #159, end to end.
 *
 * A coffee stated in a link has to survive being stored, read back, and put
 * into a handoff envelope, because the envelope is what Beanconqueror reads.
 * Each of those steps is covered on its own elsewhere; this is the one test
 * that fails if the chain comes apart between them.
 */
const LINK = "xbrw://import?v=1&source=brewmind"
    + "&share=" + encodeURIComponent("https://share-h5.xbloom.com/r?id=abc123")
    + "&bean.name=" + encodeURIComponent("Finca La Esperanza")
    + "&bean.roaster=" + encodeURIComponent("Some Roastery")
    + "&bean.roastingDate=2026-09-01"
    + "&bean.roast=Medium"
    + "&bean.country=Colombia"
    + "&bean.region=Huila"
    + "&bean.farm=" + encodeURIComponent("La Esperanza")
    + "&bean.farmer=" + encodeURIComponent("Ana Ruiz")
    + "&bean.elevation=1750"
    + "&bean.processing=Washed"
    + "&bean.fermentation=Anaerobic"
    + "&bean.variety=" + encodeURIComponent("Pink Bourbon")
    + "&bean.beanMix=" + encodeURIComponent("Single Origin")
    + "&bean.aromatics=" + encodeURIComponent("Peach, jasmine")
    + "&bean.cupping_points=86.5"
    + "&bean.decaffeinated=0"
    + "&bean.url=" + encodeURIComponent("https://example.com/coffee")
    + "&recipe.url=" + encodeURIComponent("https://brewmind.coffee/recipe/esperanza");

/** Persist and read back, the way `RecipeDatabase` actually does it. */
const stored = (recipe: Recipe) => new Recipe(undefined, JSON.stringify(recipe));

describe("a BrewMind coffee, end to end", () => {
    const imported = () => {
        const link = parseBrewMindLink(LINK);
        if (link === null) throw new Error("the fixture link should parse");
        const recipe = new Recipe();
        recipe.name = "Finca La Esperanza";
        return {
            recipe: decorateImport(recipe, {
                coffee:    link.coffee,
                recipeUrl: link.recipeUrl,
                source:    "brewmind"
            }),
            link
        };
    };

    it("survives being stored and read back", () => {
        const {recipe} = imported();

        // Through JSON, which is how a recipe is actually persisted: the
        // database keeps a whole blob rather than columns.
        const reloaded = stored(recipe);

        expect(reloaded.coffee).toEqual(recipe.coffee);
        expect(reloaded.recipeUrl).toBe("https://brewmind.coffee/recipe/esperanza");
        expect(reloaded.source).toBe("brewmind");
        expect(reloaded.tags).toEqual(["Medium", "Washed", "Anaerobic"]);
    });

    it("reaches the envelope Beanconqueror reads", () => {
        const {recipe} = imported();
        const reloaded = stored(recipe);

        const envelope = buildEnvelope(
            brew({recipeName: reloaded.name, coffee: reloaded.coffee}),
            samples
        );

        expect(envelope.bean).toEqual({
            name:         "Finca La Esperanza",
            roaster:      "Some Roastery",
            roastingDate: "2026-09-01",
            roast:        "Medium",
            country:      "Colombia",
            region:       "Huila",
            farm:         "La Esperanza",
            farmer:       "Ana Ruiz",
            elevation:    1750,
            processing:   "Washed",
            fermentation: "Anaerobic",
            variety:      "Pink Bourbon",
            beanMix:      "Single Origin",
            aromatics:    "Peach, jasmine",
            cupping_points: 86.5,
            decaffeinated:  false,
            url:          "https://example.com/coffee"
        });
    });

    it("names the producer's page in the note Beanconqueror files", () => {
        // The page is the reasoning behind the numbers, which is the part a
        // recipe loses coming through xBloom. It reaches Beanconqueror in the
        // note rather than the bean block, because it is about the recipe.
        const {recipe} = imported();
        const reloaded = stored(recipe);
        const envelope = buildEnvelope(
            brew({recipeUrl: reloaded.recipeUrl, coffee: reloaded.coffee}),
            samples
        );

        expect(envelope.brew.note)
            .toContain("Recipe: https://brewmind.coffee/recipe/esperanza");
    });

    it("keeps a stated false through every step", () => {
        // The step most likely to be lost quietly: `decaffeinated: false`
        // is the roaster saying caffeinated, and any link in this chain that
        // treats it as falsy turns a stated fact into an unknown.
        const {recipe} = imported();
        const reloaded = stored(recipe);
        const envelope = buildEnvelope(brew({coffee: reloaded.coffee}), samples);

        expect(reloaded.coffee?.decaffeinated).toBe(false);
        expect(envelope.bean).toHaveProperty("decaffeinated", false);
    });
});
