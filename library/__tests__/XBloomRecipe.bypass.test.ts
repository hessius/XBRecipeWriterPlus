/**
 * Bypass water import tests for XBloomRecipe.
 *
 * xBloom's scheme inverts the obvious sense: `isEnableBypassWater: 1` is ON
 * and `2` is OFF. These tests pin that inversion so a "fix" cannot flip it
 * silently, and pin every edge case that must be rejected so a schema change
 * does not silently brew someone a strange dilution.
 */
import {XBloomRecipe} from "@/library/XBloomRecipe";
import {CUP_TYPE} from "@/library/Recipe";

/** Minimal valid recipeVo that has bypass disabled by default. */
function makeRecipeVo(overrides: Record<string, unknown> = {}) {
    return {
        grandWater:          15,
        grinderSize:         45,
        isSetGrinderSize:    1,
        dose:                15,
        pourCount:           1,
        rpm:                 80,
        cupType:             1,
        isEnableBypassWater: 2, // 2 = OFF in xBloom's inverted scheme
        bypassVolume:        0,
        bypassTemp:          60,
        pourList:            [{
            flowRate:               1,
            isEnableVibrationAfter:  2,
            isEnableVibrationBefore: 2,
            pattern:                1,
            pausing:                0,
            volume:                 225,
            temperature:            93
        }],
        ...overrides
    };
}

/** Build an XBloomRecipe whose fetch has already been simulated. */
function buildRecipe(recipeVo: Record<string, unknown>) {
    const xb = new XBloomRecipe({kind: "share", id: "test123"});
    // Inject the payload as though fetchRecipeDetail completed.
    (xb as any).xbRecipeJSON = {recipeVo};
    return xb.getRecipe();
}

it("imports bypass enabled when isEnableBypassWater is 1 with valid volume and temp", () => {
    const recipe = buildRecipe(makeRecipeVo({
        isEnableBypassWater: 1,
        bypassVolume:        50,
        bypassTemp:          60,
    }));

    expect(recipe).not.toBeNull();
    expect(recipe!.bypassEnabled).toBe(true);
    expect(recipe!.bypassVolume).toBe(50);
    expect(recipe!.bypassTemp).toBe(60);
});

it("imports bypass disabled when isEnableBypassWater is 2 (xBloom OFF value)", () => {
    // isEnableBypassWater: 2 is xBloom's OFF, not an implausible value.
    const recipe = buildRecipe(makeRecipeVo({
        isEnableBypassWater: 2,
        bypassVolume:        50,
        bypassTemp:          60,
    }));

    expect(recipe).not.toBeNull();
    expect(recipe!.bypassEnabled).toBe(false);
});

it("falls back to bypass off when bypass fields are missing", () => {
    const vo = makeRecipeVo();
    delete (vo as any).isEnableBypassWater;
    delete (vo as any).bypassVolume;
    delete (vo as any).bypassTemp;
    const recipe = buildRecipe(vo);

    expect(recipe).not.toBeNull();
    expect(recipe!.bypassEnabled).toBe(false);
    expect(recipe!.bypassVolume).toBe(0);
    expect(recipe!.bypassTemp).toBe(85);
});

it("falls back to bypass off when bypassVolume is out of range", () => {
    // 501 exceeds the 0–500 limit in api/_lib/payload.ts — not a real volume.
    const recipe = buildRecipe(makeRecipeVo({
        isEnableBypassWater: 1,
        bypassVolume:        501,
        bypassTemp:          60,
    }));

    expect(recipe).not.toBeNull();
    expect(recipe!.bypassEnabled).toBe(false);
});

it("falls back to 85 C when bypassTemp is out of range, but keeps the bypass", () => {
    // 101 exceeds the 0–100 limit, but temperature has a safe default (85 C)
    // so the bypass is kept rather than dropped entirely.
    const recipe = buildRecipe(makeRecipeVo({
        isEnableBypassWater: 1,
        bypassVolume:        50,
        bypassTemp:          101,
    }));

    expect(recipe).not.toBeNull();
    expect(recipe!.bypassEnabled).toBe(true);
    expect(recipe!.bypassTemp).toBe(85);
});

it("falls back to bypass off when bypassVolume is not a finite number", () => {
    const recipe = buildRecipe(makeRecipeVo({
        isEnableBypassWater: 1,
        bypassVolume:        NaN,
        bypassTemp:          60,
    }));

    expect(recipe).not.toBeNull();
    expect(recipe!.bypassEnabled).toBe(false);
});

it("sets bypass off when volume is 0, even if isEnableBypassWater is 1", () => {
    // A recipe with the bypass flag on but zero water is off in every practical
    // sense — the machine would dispense nothing.
    const recipe = buildRecipe(makeRecipeVo({
        isEnableBypassWater: 1,
        bypassVolume:        0,
        bypassTemp:          60,
    }));

    expect(recipe).not.toBeNull();
    expect(recipe!.bypassEnabled).toBe(false);
    // Volume and temp are still imported so the user can edit and re-enable.
    expect(recipe!.bypassVolume).toBe(0);
});

it("forces bypass off for tea recipes regardless of cloud value", () => {
    // Tea is special-cased throughout the app; bypass is out of scope for it.
    const recipe = buildRecipe(makeRecipeVo({
        cupType:             4, // CUP_TYPE.TEA
        isEnableBypassWater: 1,
        bypassVolume:        50,
        bypassTemp:          60,
        // Tea requires at least one pour within the 90 ml clamping logic
    }));

    expect(recipe).not.toBeNull();
    expect(recipe!.cupType).toBe(CUP_TYPE.TEA);
    expect(recipe!.bypassEnabled).toBe(false);
});

describe("bypass import, relaxed temperature", () => {
    /** Convenience wrapper matching the helper already in this file. */
    function importWithBypass(bypass: {
        isEnableBypassWater: number | undefined;
        bypassVolume: number | undefined;
        bypassTemp: number | undefined;
    }) {
        const recipe = buildRecipe(makeRecipeVo({
            isEnableBypassWater: bypass.isEnableBypassWater,
            bypassVolume:        bypass.bypassVolume,
            bypassTemp:          bypass.bypassTemp,
        }));
        return recipe!;
    }

    it("falls back to 85 C when the temperature is missing", () => {
        const recipe = importWithBypass({
            isEnableBypassWater: 1, bypassVolume: 45, bypassTemp: undefined
        });

        expect(recipe.bypassEnabled).toBe(true);
        expect(recipe.bypassVolume).toBe(45);
        expect(recipe.bypassTemp).toBe(85);
    });

    it("falls back to 85 C when the temperature is out of range", () => {
        const recipe = importWithBypass({
            isEnableBypassWater: 1, bypassVolume: 45, bypassTemp: 4000
        });

        expect(recipe.bypassEnabled).toBe(true);
        expect(recipe.bypassTemp).toBe(85);
    });

    it("still refuses an implausible volume outright", () => {
        // There is no safe default for volume: guessing would brew someone an
        // unexpected dilution, which is the one failure worth being loud about.
        const recipe = importWithBypass({
            isEnableBypassWater: 1, bypassVolume: 9000, bypassTemp: 60
        });

        expect(recipe.bypassEnabled).toBe(false);
        expect(recipe.bypassVolume).toBe(0);
    });
});
