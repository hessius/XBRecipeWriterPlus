import Recipe from "@/library/Recipe";
import {decorateImport} from "@/library/importDecoration";

const recipe = () => new Recipe();

describe("decorateImport", () => {
    it("records the provenance", () => {
        expect(decorateImport(recipe(), {source: "brewmind"}).source).toBe("brewmind");
    });

    it("attaches the coffee whole", () => {
        const coffee = {name: "Finca La Esperanza", roaster: "Some Roastery"};

        expect(decorateImport(recipe(), {coffee}).coffee).toEqual(coffee);
    });

    it("derives a tag only from the closed vocabularies", () => {
        const decorated = decorateImport(recipe(), {
            coffee: {
                name: "X",
                roast: "Medium",
                processing: "Washed",
                fermentation: "Anaerobic",
                roaster: "Some Roastery",
                country: "Colombia"
            }
        });

        // Roaster and country are absent on purpose: per #159 the tag list
        // must not become a second copy of the bean record.
        expect(decorated.tags).toEqual(["Medium", "Washed", "Anaerobic"]);
    });

    it("tags the hyphenated roast levels BrewMind sends", () => {
        const decorated = decorateImport(recipe(), {
            coffee: {name: "X", roast: "Medium-Dark"}
        });

        expect(decorated.tags).toEqual(["Medium-Dark"]);
    });

    it("leaves a value outside the vocabulary untagged", () => {
        // A miss is unset rather than invented, which is what those predicates
        // are for. "Medium-dark" is a near miss for a level this app does
        // know, and a near miss is still a miss: repairing the casing here
        // would mean deciding where the repairing stops.
        const decorated = decorateImport(recipe(), {
            coffee: {name: "X", roast: "Medium-dark", processing: "Carbonic maceration"}
        });

        expect(decorated.tags).toEqual([]);
    });

    it("keeps the tags the recipe already had", () => {
        const existing = recipe();
        existing.setTags(["Morning"]);

        expect(decorateImport(existing, {coffee: {name: "X", processing: "Natural"}}).tags)
            .toEqual(["Morning", "Natural"]);
    });

    it("does not tag a recipe twice for the same coffee", () => {
        const coffee = {name: "X", processing: "Natural"};
        const once = decorateImport(recipe(), {coffee});

        expect(decorateImport(once, {coffee}).tags).toEqual(["Natural"]);
    });

    it("changes nothing when there is nothing to apply", () => {
        const plain = recipe();
        const before = plain.source;

        const decorated = decorateImport(plain, {});

        expect(decorated.coffee).toBeUndefined();
        expect(decorated.tags).toEqual([]);
        expect(decorated.source).toBe(before);
    });
});
