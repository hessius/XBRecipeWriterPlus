/**
 * Temperature import tests for XBloomRecipe.
 *
 * The official app's "BP" preset has reached us as a non-round value above
 * our 99 C ceiling (211 F = 99.4 C, see issue #199), rather than the clean
 * round number the app's own range implies. These pin that an imported
 * temperature outside the card's band is clamped and rounded at the door,
 * the same way an oversized tea pour volume already is.
 */
import {XBloomRecipe} from "@/library/XBloomRecipe";

/** Minimal valid recipeVo, cup type 1 (XPOD, not tea), one pour. */
function makeRecipeVo(temperature: number) {
    return {
        grandWater:          15,
        grinderSize:         45,
        isSetGrinderSize:    1,
        dose:                15,
        pourCount:           1,
        rpm:                 80,
        cupType:             1,
        isEnableBypassWater: 2,
        bypassVolume:        0,
        bypassTemp:          60,
        pourList:            [{
            flowRate:               1,
            isEnableVibrationAfter:  2,
            isEnableVibrationBefore: 2,
            pattern:                1,
            pausing:                0,
            volume:                 225,
            temperature
        }]
    };
}

/** Build an XBloomRecipe whose fetch has already been simulated. */
function buildRecipe(recipeVo: Record<string, unknown>) {
    const xb = new XBloomRecipe({kind: "share", id: "test123"}, "studio");
    (xb as any).xbRecipeJSON = {recipeVo};
    return xb.getRecipe();
}

it("clamps a BP-ish temperature above the card's ceiling down to 99 C", () => {
    const recipe = buildRecipe(makeRecipeVo(99.4));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(99);
});

it("clamps a temperature below the card's floor up to 39 C", () => {
    const recipe = buildRecipe(makeRecipeVo(20));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(39);
});

it("rounds a fractional temperature that is already in range", () => {
    const recipe = buildRecipe(makeRecipeVo(92.5));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(93);
});

it("leaves a whole in-range temperature untouched", () => {
    const recipe = buildRecipe(makeRecipeVo(93));

    expect(recipe).not.toBeNull();
    expect(recipe!.pours[0].temperature).toBe(93);
});
