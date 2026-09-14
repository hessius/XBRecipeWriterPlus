import Recipe from "@/library/Recipe";

function withTags(tags: unknown): Recipe {
    const recipe = new Recipe();
    const json = JSON.parse(JSON.stringify(recipe));
    json.tags = tags;
    return new Recipe(undefined, JSON.stringify(json));
}

describe("Recipe tags", () => {
    it("defaults to an empty list", () => {
        expect(new Recipe().tags).toEqual([]);
    });

    it("survives a JSON round trip", () => {
        const recipe = new Recipe();
        recipe.setTags(["morning", "filter"]);
        const copy = new Recipe(undefined, JSON.stringify(recipe));
        expect(copy.tags).toEqual(["morning", "filter"]);
    });

    it("trims whitespace and drops empties", () => {
        const recipe = new Recipe();
        recipe.setTags(["  morning  ", "   ", ""]);
        expect(recipe.tags).toEqual(["morning"]);
    });

    it("dedupes case-insensitively, keeping the first spelling", () => {
        const recipe = new Recipe();
        recipe.setTags(["Espresso", "espresso", "ESPRESSO"]);
        expect(recipe.tags).toEqual(["Espresso"]);
    });

    it("drops tags longer than the limit rather than truncating them", () => {
        // A truncated tag is a plausible-looking wrong tag.
        const recipe = new Recipe();
        recipe.setTags(["a".repeat(33), "ok"]);
        expect(recipe.tags).toEqual(["ok"]);
    });

    it("keeps a tag of exactly the limit", () => {
        const recipe = new Recipe();
        recipe.setTags(["a".repeat(32)]);
        expect(recipe.tags).toEqual(["a".repeat(32)]);
    });

    it("caps the number of tags per recipe", () => {
        const recipe = new Recipe();
        recipe.setTags(Array.from({length: 40}, (_, i) => `t${i}`));
        expect(recipe.tags).toHaveLength(20);
        expect(recipe.tags[0]).toBe("t0");
    });

    it("reads a record saved before tags existed", () => {
        const recipe = new Recipe();
        const json = JSON.parse(JSON.stringify(recipe));
        delete json.tags;
        expect(new Recipe(undefined, JSON.stringify(json)).tags).toEqual([]);
    });

    it("ignores a tags field that is not an array", () => {
        expect(withTags("morning").tags).toEqual([]);
        expect(withTags(null).tags).toEqual([]);
        expect(withTags(7).tags).toEqual([]);
    });

    it("drops non-string entries", () => {
        expect(withTags(["morning", 7, null, {}, "filter"]).tags)
            .toEqual(["morning", "filter"]);
    });
});
