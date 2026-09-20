import Recipe from "@/library/Recipe";

function recipeJsonWith(coffee: unknown): string {
    const recipe = JSON.parse(JSON.stringify(new Recipe())) as Record<string, unknown>;
    recipe.coffee = coffee;
    return JSON.stringify(recipe);
}

describe("Recipe.coffee", () => {
    it("is undefined on a recipe that never had a pod", () => {
        expect(new Recipe().coffee).toBeUndefined();
    });

    it("round-trips through JSON", () => {
        const recipe = new Recipe();
        recipe.coffee = {name: "Kenya Sakami", origin: "Nabiswa, Kenya"};

        const back = new Recipe(undefined, JSON.stringify(recipe));

        expect(back.coffee).toEqual({name: "Kenya Sakami", origin: "Nabiswa, Kenya"});
    });

    it("ignores a coffee block that is not an object with a name", () => {
        expect(new Recipe(undefined, recipeJsonWith("Kenya")).coffee).toBeUndefined();

        const raw = JSON.parse(recipeJsonWith({origin: "Kenya"})) as Record<string, unknown>;
        raw.ratio = 17;
        raw.pours = [{
            pourNumber: 0,
            volume: 100,
            temperature: 93,
            flowRate: 4,
            agitation: 0,
            pourPattern: 0,
            pauseTime: 30
        }];

        const back = new Recipe(undefined, JSON.stringify(raw));

        expect(back.coffee).toBeUndefined();
        // A corrupt coffee block must not abort loading the rest of the recipe.
        expect(back.pours).toHaveLength(1);
        expect(back.ratio).toBe(17);
    });

    it("drops unknown stored fields rather than trusting them", () => {
        const back = new Recipe(undefined, recipeJsonWith({
            name: "Kenya Sakami",
            origin: "Nabiswa, Kenya",
            roast: 1
        }));

        expect(back.coffee).toEqual({
            name: "Kenya Sakami",
            origin: "Nabiswa, Kenya"
        });
    });

    it("drops a stored image URL that is not https", () => {
        const back = new Recipe(undefined, recipeJsonWith({
            name: "Kenya Sakami",
            imageUrl: "http://example.com/pod.png"
        }));

        expect(back.coffee).toEqual({name: "Kenya Sakami"});
    });

    it("round-trips every optional field", () => {
        const coffee = {
            name: "Kenya Sakami",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            note: "A producer narrative.",
            beanMix: "Single Origin",
            imageUrl: "https://example.com/pod.png"
        };
        const recipe = new Recipe();
        recipe.coffee = coffee;

        const back = new Recipe(undefined, JSON.stringify(recipe));

        expect(back.coffee).toEqual(coffee);
    });
});
