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

function importedRecipe(row: Record<string, unknown>): Recipe {
    const xb = XBloomRecipe.fromAccountRow(row);
    const recipe = xb.getRecipe();
    if (recipe === null) throw new Error("Expected account row to import");
    return recipe;
}

describe("applyPodCoffee", () => {
    it("attaches the coffee a pod response named", () => {
        const recipe = new Recipe(undefined, undefined);

        applyPodCoffee(recipe, {
            theName:   "Kenya Sakami Gloria Natural Batian",
            imagePath: "https://example.com/pod.jpg"
        });

        expect(recipe.coffee).toEqual({
            name:     "Kenya Sakami Gloria Natural Batian",
            imageUrl: "https://example.com/pod.jpg"
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
        const recipe = importedRecipe(recipeVo());

        expect(recipe.coffee).toBeUndefined();
        expect(recipe.imageURL).toBeUndefined();
        expect(recipe.pours).toHaveLength(2);
    });

    it("validates the attached coffee rather than trusting the pod response", () => {
        const recipe = importedRecipe(recipeVo({
            podsVo: {
                id:        "NLC001",
                theName:   "Kenya Sakami Gloria Natural Batian",
                imagePath: "http://example.com/pod.jpg"
            }
        }));

        expect(recipe.coffee).toEqual({name: "Kenya Sakami Gloria Natural Batian"});
        expect(recipe.imageURL).toBeUndefined();
    });

    it("uses the coffee image as the recipe artwork when a pod names its coffee", () => {
        const recipe = importedRecipe(recipeVo({
            podsVo: {
                id:        "NLC001",
                theName:   "Kenya Sakami Gloria Natural Batian",
                imagePath: "https://example.com/pod.jpg"
            }
        }));

        expect(recipe.coffee?.imageUrl).toBe("https://example.com/pod.jpg");
        expect(recipe.imageURL).toBe(recipe.coffee?.imageUrl);
    });

    it("rejects a plain-HTTP artwork fallback when a pod has no coffee name", () => {
        const recipe = importedRecipe(recipeVo({
            podsVo: {
                id:        "NLC001",
                imagePath: "http://example.com/pod.jpg"
            }
        }));

        expect(recipe.coffee).toBeUndefined();
        expect(recipe.imageURL).toBeUndefined();
    });

    it("keeps an HTTPS artwork fallback when a pod has no coffee name", () => {
        const recipe = importedRecipe(recipeVo({
            podsVo: {
                id:        "NLC001",
                imagePath: "https://example.com/pod.jpg"
            }
        }));

        expect(recipe.coffee).toBeUndefined();
        expect(recipe.imageURL).toBe("https://example.com/pod.jpg");
    });
});

describe("xBloom pod preview artwork", () => {
    async function fetchedPreviewImage(imagePath: string) {
        global.fetch = jest.fn(async () => ({
            ok:     true,
            status: 200,
            json:   async () => ({
                recipeVo: {
                    theName: "Preview recipe",
                    podsVo:  {
                        subtitle: "Preview pod",
                        imagePath
                    }
                }
            })
        })) as unknown as typeof fetch;

        const xb = new XBloomRecipe({kind: "xid", xid: "NLC001"});
        await xb.fetchRecipeDetail();
        return xb.getImageURL();
    }

    it("rejects plain-HTTP preview artwork", async () => {
        await expect(fetchedPreviewImage("http://example.com/pod.jpg")).resolves.toBe("");
    });

    it("keeps HTTPS preview artwork", async () => {
        await expect(fetchedPreviewImage("https://example.com/pod.jpg"))
            .resolves.toBe("https://example.com/pod.jpg");
    });
});
