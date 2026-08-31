import {encodeCoffeeBlob, ratioByte} from "@/library/machine/protocol";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe from "@/library/Recipe";

import {coffeeBlob} from "./protocolFixtures";

/** A recipe with one pour of the given volume, and nothing else surprising. */
function recipeOf(volumes: number[], overrides: Partial<Recipe> = {}): Recipe {
    const recipe = new Recipe();
    recipe.dosage = 18;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.grinder = true;
    recipe.pours = volumes.map((volume, index) => new Pour(
        index + 1, volume, 93, 30, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 0
    ));
    Object.assign(recipe, overrides);
    return recipe;
}

describe("the ratio byte", () => {
    it("rounds up, because rounding down silently skips the grind", () => {
        // saya6k on hardware: 18 g / 250 ml truncates to 138, and the machine
        // never grinds — no error, no complaint. 139 grinds. A small overshoot
        // is tolerated; any undershoot is fatal and silent.
        expect(ratioByte(250, 18)).toBe(139);
        expect(ratioByte(250, 18)).not.toBe(138);
    });

    it("stays inside a byte", () => {
        expect(ratioByte(3000, 1)).toBe(255);
    });

    it("is exact when the division is", () => {
        expect(ratioByte(288, 18)).toBe(160);
    });
});

describe("the coffee blob", () => {
    it("encodes a single pour", () => {
        const recipe = recipeOf([100]);
        expect(Array.from(encodeCoffeeBlob(recipe))).toEqual(coffeeBlob({
            dose: 18, grindSize: 60, rpm: 90,
            pours: [{volume: 100, temperature: 93, pattern: 0, agitation: 0, pause: 0, flowRate: 30}]
        }));
    });

    it("chunks a pour above 127 ml", () => {
        // cardLimits allows 240 ml, so this is a recipe a user can actually
        // build, not a hypothetical.
        const blob = Array.from(encodeCoffeeBlob(recipeOf([240])));
        expect(blob).toEqual(coffeeBlob({
            dose: 18, grindSize: 60, rpm: 90,
            pours: [{volume: 240, temperature: 93, pattern: 0, agitation: 0, pause: 0, flowRate: 30}]
        }));
        // One 4-byte lead chunk of 127, then 113 in the trailing 8-byte segment.
        expect(blob.slice(1, 5)).toEqual([127, 93, 0, 0]);
        expect(blob[5]).toBe(113);
    });

    it("carries the grind speed in the first pour only", () => {
        const blob = Array.from(encodeCoffeeBlob(recipeOf([60, 60, 60])));
        // Segment n starts at 1 + n*8; the rpm is the seventh byte of each.
        expect(blob[1 + 6]).toBe(90);
        expect(blob[1 + 8 + 6]).toBe(0);
        expect(blob[1 + 16 + 6]).toBe(0);
    });

    it("says 0xFE for a recipe that does not grind, never 0x00", () => {
        // 0x00 is not "no grind" — it is "grind at the finest setting", which
        // is how brAzzi64's original script quietly ground every no-grind
        // recipe. The grinder byte is second from the end.
        const blob = Array.from(encodeCoffeeBlob(recipeOf([100], {grinder: false})));
        expect(blob[blob.length - 2]).toBe(0xFE);
    });

    it("encodes a pause as its two's complement, like the card does", () => {
        const recipe = recipeOf([100]);
        recipe.pours[0].pauseTime = 30;
        const blob = Array.from(encodeCoffeeBlob(recipe));
        expect(blob[5]).toBe(226); // 256 - 30
    });

    it("declares the length of the segment block, not of the whole blob", () => {
        const blob = Array.from(encodeCoffeeBlob(recipeOf([60, 60])));
        expect(blob[0]).toBe(16);
        expect(blob.length).toBe(1 + 16 + 2);
    });
});
