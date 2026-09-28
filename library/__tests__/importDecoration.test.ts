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
                roastLevel: "Medium",
                process: "Washed",
                fermentation: "Anaerobic",
                roaster: "Some Roastery",
                country: "Colombia"
            }
        });

        // Roaster and country are absent on purpose: per #159 the tag list
        // must not become a second copy of the bean record.
        expect(decorated.tags).toEqual(["Medium", "Washed", "Anaerobic"]);
    });

    it("leaves a value outside the vocabulary untagged", () => {
        // A miss is unset rather than invented, which is what those predicates
        // are for. "Medium-dark" is not a roast this app knows.
        const decorated = decorateImport(recipe(), {
            coffee: {name: "X", roastLevel: "Medium-dark", process: "Carbonic maceration"}
        });

        expect(decorated.tags).toEqual([]);
    });

    it("keeps the tags the recipe already had", () => {
        const existing = recipe();
        existing.setTags(["Morning"]);

        expect(decorateImport(existing, {coffee: {name: "X", process: "Natural"}}).tags)
            .toEqual(["Morning", "Natural"]);
    });

    it("does not tag a recipe twice for the same coffee", () => {
        const coffee = {name: "X", process: "Natural"};
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
