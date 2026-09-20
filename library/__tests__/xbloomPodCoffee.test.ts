import Recipe from "@/library/Recipe";
import {applyPodCoffee, XBloomRecipe} from "@/library/XBloomRecipe";

function recipeVo(overrides: Record<string, unknown> = {}) {
    return {
        grandWater:       16,
        grinderSize:      55,
        isSetGrinderSize: 1,
        dose:             18,
        pourCount:        2,
        rpm:              90,
        cupType:          1,
        pourList:         [
            {
                volume: 144, temperature: 93, pattern: 1, flowRate: 3,
                pausing: 30, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
            },
            {
                volume: 144, temperature: 93, pattern: 2, flowRate: 3,
                pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
            }
        ],
        ...overrides
    };
}

function importedRecipe(response: Record<string, unknown>): Recipe {
    const xb = XBloomRecipe.fromAccountRow({}) as unknown as {
        xbRecipeJSON: unknown; getRecipe(): Recipe | null;
    };
    xb.xbRecipeJSON = response;
    const recipe = xb.getRecipe();
    expect(recipe).not.toBeNull();
    return recipe!;
}

describe("applyPodCoffee", () => {
    it("attaches the coffee a pod response named", () => {
        const recipe = new Recipe(undefined, undefined);

        applyPodCoffee(recipe, {
            theName:   "Kenya Sakami Gloria Natural Batian",
            origin:    "Nabiswa, Kenya",
            process:   "Natural",
            varietal:  "Batian",
            flavor:    "Cherry・strawberry・blueberry",
            introduce: "A producer narrative.",
            type:      "Single Origin",
            imagePath: "https://example.com/pod.jpg"
        });

        expect(recipe.coffee).toEqual({
            name:      "Kenya Sakami Gloria Natural Batian",
            origin:    "Nabiswa, Kenya",
            process:   "Natural",
            variety:   "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            note:      "A producer narrative.",
            beanMix:   "Single Origin",
            imageUrl:  "https://example.com/pod.jpg"
        });
    });

    it("leaves the recipe alone when the response carries no usable coffee", () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.coffee = {name: "Already chosen"};

        applyPodCoffee(recipe, {origin: "Kenya", imagePath: "https://example.com/pod.jpg"});

        expect(recipe.coffee).toEqual({name: "Already chosen"});
    });
});

describe("xBloom pod coffee import", () => {
    it("comes back without coffee when the response has no podsVo", () => {
        const recipe = importedRecipe({recipeVo: recipeVo()});

        expect(recipe.coffee).toBeUndefined();
        expect(recipe.imageURL).toBeUndefined();
        expect(recipe.pours).toHaveLength(2);
    });

    it("validates the attached coffee rather than trusting the pod response", () => {
        const recipe = importedRecipe({
            recipeVo: recipeVo({
                podsVo: {
                    id:        "NLC001",
                    theName:   "Kenya Sakami Gloria Natural Batian",
                    imagePath: "http://example.com/pod.jpg"
                }
            })
        });

        expect(recipe.coffee).toEqual({name: "Kenya Sakami Gloria Natural Batian"});
        expect(recipe.imageURL).toBeUndefined();
    });

    it("uses the coffee image as the recipe artwork when a pod names its coffee", () => {
        const recipe = importedRecipe({
            recipeVo: recipeVo({
                podsVo: {
                    id:        "NLC001",
                    theName:   "Kenya Sakami Gloria Natural Batian",
                    imagePath: "https://example.com/pod.jpg"
                }
            })
        });

        expect(recipe.coffee?.imageUrl).toBe("https://example.com/pod.jpg");
        expect(recipe.imageURL).toBe(recipe.coffee?.imageUrl);
    });

    it("rejects a plain-HTTP artwork fallback when a pod has no coffee name", () => {
        const recipe = importedRecipe({
            recipeVo: recipeVo({
                podsVo: {
                    id:        "NLC001",
                    imagePath: "http://example.com/pod.jpg"
                }
            })
        });

        expect(recipe.coffee).toBeUndefined();
        expect(recipe.imageURL).toBeUndefined();
    });

    it("keeps an HTTPS artwork fallback when a pod has no coffee name", () => {
        const recipe = importedRecipe({
            recipeVo: recipeVo({
                podsVo: {
                    id:        "NLC001",
                    imagePath: "https://example.com/pod.jpg"
                }
            })
        });

        expect(recipe.coffee).toBeUndefined();
        expect(recipe.imageURL).toBe("https://example.com/pod.jpg");
    });
});
