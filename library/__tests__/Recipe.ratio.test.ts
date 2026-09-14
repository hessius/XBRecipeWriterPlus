import Recipe from "@/library/Recipe";

/**
 * Half-point ratios, which the machine allows and a card cannot hold.
 *
 * xBloom's own share links carry them -- the recipe behind
 * `Wr8X9ShLh53zxRv/IOdvAw==` is 15 g at 1:15.5 with stages of 60, 60, 60 and 52
 * ml. That is a target of 232.5 ml against a pour total of 232, and since stage
 * volumes are whole millilitres no arrangement of them can ever equal 232.5. The
 * editor therefore reported an imbalance that could not be corrected: Auto fix
 * produced another integer, which was also not 232.5.
 *
 * So the invariant is met when the stages come within the rounding of one
 * millilitre. For the whole-number ratios that make up almost every recipe both
 * sides are integers and the test is unchanged -- a difference below 1 is a
 * difference of 0.
 */
function ratioRecipe(dose: number, ratio: number, volumes: number[]): Recipe {
    const recipe = new Recipe();
    recipe.dosage = dose;
    recipe.ratio  = ratio;
    recipe.addPour(0, false);
    for (let i = 1; i < volumes.length; i++) recipe.addPour(0);
    volumes.forEach((volume, index) => { recipe.pours[index].volume = volume; });
    return recipe;
}

describe("a ratio with a half in it", () => {
    it("accepts the shared recipe that cannot be balanced exactly", () => {
        const recipe = ratioRecipe(15, 15.5, [60, 60, 60, 52]);

        expect(recipe.getTotalVolume()).toBe(232.5);
        expect(recipe.getPourTotalVolume()).toBe(232);
        expect(recipe.isPourVolumeValid()).toBe(true);
    });

    it("accepts the rounding in the other direction too", () => {
        expect(ratioRecipe(15, 15.5, [60, 60, 60, 53]).isPourVolumeValid()).toBe(true);
    });

    it("still refuses a whole millilitre out", () => {
        // 231 and 234 are both a full millilitre or more from 232.5, so the
        // tolerance has not turned into a free pass.
        expect(ratioRecipe(15, 15.5, [60, 60, 60, 51]).isPourVolumeValid()).toBe(false);
        expect(ratioRecipe(15, 15.5, [60, 60, 60, 54]).isPourVolumeValid()).toBe(false);
    });

    it("is unchanged for the whole-number ratios almost every recipe uses", () => {
        expect(ratioRecipe(18, 16, [100, 100, 88]).isPourVolumeValid()).toBe(true);
        expect(ratioRecipe(18, 16, [100, 100, 87]).isPourVolumeValid()).toBe(false);
        expect(ratioRecipe(18, 16, [100, 100, 89]).isPourVolumeValid()).toBe(false);
    });

    it("balances a half-point recipe that auto fix has been run on", () => {
        // This test did not fail before the fix -- it hung, and took the whole
        // jest run with it. `autoFixPourVolumes` corrects its rounding error by
        // subtracting `Math.sign(remaining)` from the remainder until it reaches
        // zero, and against a target of 232.5 the remainder was 0.5: it went to
        // -0.5, back to 0.5, and never arrived. On a device that is the Auto fix
        // button freezing the app, on the JS thread, with no way out.
        //
        // So keep the assertion cheap and keep the call: what is being tested
        // here is as much that this returns at all as what it returns.
        const recipe = ratioRecipe(15, 15.5, [10, 10, 10, 10]);

        recipe.autoFixPourVolumes();

        expect(recipe.isPourVolumeValid()).toBe(true);
    });
});
