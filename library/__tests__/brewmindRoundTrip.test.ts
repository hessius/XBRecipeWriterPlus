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

        // This expectation used to be the stored `PodCoffee` verbatim, which
        // is what the envelope carried and is why the chain was thought whole.
        // It was not: the names here are Beanconqueror's, and `processing`,
        // `country`, `roast`, `fermentation`, `cupping_points` and `url` are
        // not among them, so everything this test claimed to prove arrived was
        // discarded on receipt. The test asserted the bug.
        expect(envelope.bean).toEqual({
            name:         "Finca La Esperanza",
            roaster:      "Some Roastery",
            roastingDate: "2026-09-01",
            // `country` is what BC calls the contract's `origin`.
            origin:       "Colombia",
            region:       "Huila",
            farm:         "La Esperanza",
            farmer:       "Ana Ruiz",
            // Text, because BC stores elevation as a string.
            elevation:    "1750",
            process:      "Washed",
            variety:      "Pink Bourbon",
            beanMix:      "Single Origin",
            aromatics:    "Peach, jasmine",
            decaffeinated:  false
        });
    });

    it("keeps what Beanconqueror cannot take in the recipe instead", () => {
        // The four fields the contract has no home for are not silently lost
        // to the user: the roast level, process and fermentation become tags
        // on the recipe, which is where this app shows them.
        const {recipe} = imported();
        const reloaded = stored(recipe);

        expect(reloaded.tags).toEqual(["Medium", "Washed", "Anaerobic"]);
        expect(reloaded.coffee?.cupping_points).toBe(86.5);
        expect(reloaded.coffee?.url).toBe("https://example.com/coffee");
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
