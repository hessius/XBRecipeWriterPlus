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
    + "&bean.roastDate=2026-09-01"
    + "&bean.roastLevel=Medium"
    + "&bean.country=Colombia"
    + "&bean.region=Huila"
    + "&bean.farm=" + encodeURIComponent("La Esperanza")
    + "&bean.farmer=" + encodeURIComponent("Ana Ruiz")
    + "&bean.elevation=1750"
    + "&bean.process=Washed"
    + "&bean.fermentation=Anaerobic"
    + "&bean.variety=" + encodeURIComponent("Pink Bourbon")
    + "&bean.beanMix=" + encodeURIComponent("Single Origin")
    + "&bean.aromatics=" + encodeURIComponent("Peach, jasmine")
    + "&bean.cuppingScore=86.5"
    + "&bean.decaf=0"
    + "&bean.url=" + encodeURIComponent("https://example.com/coffee");

/** Persist and read back, the way `RecipeDatabase` actually does it. */
const stored = (recipe: Recipe) => new Recipe(undefined, JSON.stringify(recipe));

describe("a BrewMind coffee, end to end", () => {
    const imported = () => {
        const link = parseBrewMindLink(LINK);
        if (link === null) throw new Error("the fixture link should parse");
        const recipe = new Recipe();
        recipe.name = "Finca La Esperanza";
        return {recipe: decorateImport(recipe, {coffee: link.coffee, source: "brewmind"}), link};
    };

    it("survives being stored and read back", () => {
        const {recipe} = imported();

        // Through JSON, which is how a recipe is actually persisted: the
        // database keeps a whole blob rather than columns.
        const reloaded = stored(recipe);

        expect(reloaded.coffee).toEqual(recipe.coffee);
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
            roastDate:    "2026-09-01",
            roastLevel:   "Medium",
            country:      "Colombia",
            region:       "Huila",
            farm:         "La Esperanza",
            farmer:       "Ana Ruiz",
            elevation:    1750,
            process:      "Washed",
            fermentation: "Anaerobic",
            variety:      "Pink Bourbon",
            beanMix:      "Single Origin",
            aromatics:    "Peach, jasmine",
            cuppingScore: 86.5,
            decaf:        false,
            url:          "https://example.com/coffee"
        });
    });

    it("keeps a stated false through every step", () => {
        // The step most likely to be lost quietly: `decaf: false` is the
        // roaster saying caffeinated, and any link in this chain that treats it
        // as falsy turns a stated fact into an unknown.
        const {recipe} = imported();
        const reloaded = stored(recipe);
        const envelope = buildEnvelope(brew({coffee: reloaded.coffee}), samples);

        expect(reloaded.coffee?.decaf).toBe(false);
        expect(envelope.bean).toHaveProperty("decaf", false);
    });
});
