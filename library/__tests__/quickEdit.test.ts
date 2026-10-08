import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE, GRINDER_OFF_VALUE} from "@/library/Recipe";
import {DOSE, GRIND_SIZE, RATIO, TEMPERATURE} from "@/library/cardLimits";
import {
    applyQuickEdit,
    cloneRecipe,
    describeAdjustment,
    describeTemperatureBaseline,
    quickEditBounds,
} from "@/library/quickEdit";

function coffeeRecipe(
    volumes: number[] = [30, 105, 105],
    temperatures: number[] = [92, 90, 88]
): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 15;
    recipe.ratio = 16;
    recipe.grinder = true;
    recipe.grindSize = 50;
    recipe.pours = volumes.map((volume, index) =>
        new Pour(
            index + 1,
            volume,
            temperatures[index] ?? temperatures[temperatures.length - 1],
            30,
            0,
            [POUR_PATTERN.CENTERED, POUR_PATTERN.CIRCULAR, POUR_PATTERN.SPIRAL][index] ??
                POUR_PATTERN.CENTERED,
            0
        )
    );
    recipe.backup = [1, 2, 3, 4];
    recipe.offline_backup = [5, 6, 7, 8];
    recipe.uid = [9, 10, 11, 12];
    return recipe;
}

function teaRecipe(): Recipe {
    const recipe = coffeeRecipe([50, 50, 50], [85, 84, 83]);
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.ratio = 20;
    return recipe;
}

describe("cloneRecipe", () => {
    it("round-trips to an independent recipe and preserves card restore bytes", () => {
        const original = coffeeRecipe();
        const clone = cloneRecipe(original);

        expect(clone).not.toBe(original);
        expect(clone.pours[0]).not.toBe(original.pours[0]);
        expect(clone.pours.map((pour) => pour.volume)).toEqual([30, 105, 105]);
        expect(clone.backup).toEqual([1, 2, 3, 4]);
        expect(clone.offline_backup).toEqual([5, 6, 7, 8]);
        expect(clone.uid).toEqual([9, 10, 11, 12]);

        clone.pours[0].volume = 40;
        clone.backup[0] = 99;

        expect(original.pours[0].volume).toBe(30);
        expect(original.backup).toEqual([1, 2, 3, 4]);
    });
});

describe("applyQuickEdit", () => {
    it("applies dose as an absolute value and rescales stages", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {dose: 20});

        expect(edited.dosage).toBe(20);
        expect(edited.ratio).toBe(16);
        expect(edited.getPourTotalVolume()).toBe(320);
        expect(edited.isPourVolumeValid()).toBe(true);
    });

    it("applies ratio as an absolute whole value and rescales stages", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {ratio: 18});

        expect(edited.dosage).toBe(15);
        expect(edited.ratio).toBe(18);
        expect(edited.getPourTotalVolume()).toBe(270);
        expect(edited.isPourVolumeValid()).toBe(true);
    });

    it("applies grind as an absolute value without changing volumes", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {grind: 62});

        expect(edited.grinder).toBe(true);
        expect(edited.grindSize).toBe(62);
        expect(edited.getPourTotalVolume()).toBe(240);
    });

    it("passes grinder off through unchanged", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {grind: GRINDER_OFF_VALUE});

        expect(edited.grinder).toBe(false);
        expect(edited.grindSize).toBe(GRINDER_OFF_VALUE);
    });

    it("applies a positive temperature offset to every stage", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {tempOffset: 3});

        expect(edited.pours.map((pour) => pour.temperature)).toEqual([95, 93, 91]);
        expect(edited.getPourTotalVolume()).toBe(240);
    });

    it("saturates a positive temperature offset at the upper bound", () => {
        const edited = applyQuickEdit(coffeeRecipe([80, 80, 80], [97, 98, 99]), {tempOffset: 5});

        expect(edited.pours.map((pour) => pour.temperature)).toEqual([99, 99, 99]);
    });

    it("saturates a negative temperature offset at the lower bound", () => {
        const edited = applyQuickEdit(coffeeRecipe([80, 80, 80], [39, 40, 41]), {tempOffset: -5});

        expect(edited.pours.map((pour) => pour.temperature)).toEqual([39, 39, 39]);
    });

    it("applies dose and ratio together once and rescales to their combined target", () => {
        const edited = applyQuickEdit(coffeeRecipe(), {dose: 20, ratio: 18});

        expect(edited.dosage).toBe(20);
        expect(edited.ratio).toBe(18);
        expect(edited.getPourTotalVolume()).toBe(360);
        expect(edited.isPourVolumeValid()).toBe(true);
    });

    it("returns an equal but distinct recipe for an empty adjustment", () => {
        const original = coffeeRecipe();
        const edited = applyQuickEdit(original, {});

        expect(edited).not.toBe(original);
        expect(edited.pours[0]).not.toBe(original.pours[0]);
        expect(edited).toEqual(original);
    });

    it("does not mutate its argument", () => {
        const original = coffeeRecipe();

        applyQuickEdit(original, {dose: 20, ratio: 18, grind: 65, tempOffset: 5});

        expect(original.dosage).toBe(15);
        expect(original.ratio).toBe(16);
        expect(original.grindSize).toBe(50);
        expect(original.pours.map((pour) => pour.temperature)).toEqual([92, 90, 88]);
        expect(original.pours.map((pour) => pour.volume)).toEqual([30, 105, 105]);
    });

    it("lets tea recompute the ratio after a requested ratio change", () => {
        const edited = applyQuickEdit(teaRecipe(), {ratio: 30});

        expect(edited.pours.map((pour) => pour.volume)).toEqual([90, 90, 90]);
        expect(edited.ratio).toBe(54);
        expect(edited.isPourVolumeValid()).toBe(true);
    });
});

describe("quickEditBounds", () => {
    it("returns the card-derived quick edit bounds for coffee", () => {
        expect(quickEditBounds(coffeeRecipe())).toEqual({
            dose: DOSE,
            ratio: RATIO,
            grind: {...GRIND_SIZE, off: GRINDER_OFF_VALUE},
            tempOffset: {min: TEMPERATURE.min - 92, max: TEMPERATURE.max - 88},
        });
    });

    it("narrows tea dose to ten grams", () => {
        expect(quickEditBounds(teaRecipe()).dose).toEqual({min: DOSE.min, max: 10});
    });
});

describe("describeAdjustment", () => {
    it("explains the downstream total when dose changes", () => {
        expect(describeAdjustment(coffeeRecipe(), {dose: 20}))
            .toBe("Stage volumes rescale to 320 ml to match the new dose.");
    });

    it("explains the downstream total when ratio changes", () => {
        expect(describeAdjustment(coffeeRecipe(), {ratio: 18}))
            .toBe("Stage volumes rescale to 270 ml to match the new ratio.");
    });

    it("explains dose and ratio together once", () => {
        expect(describeAdjustment(coffeeRecipe(), {dose: 20, ratio: 18}))
            .toBe("Stage volumes rescale to 360 ml to match the new dose and ratio.");
    });

    it("does not explain grind or temperature changes", () => {
        expect(describeAdjustment(coffeeRecipe(), {grind: 60, tempOffset: 2})).toBeNull();
    });

    it("does not explain an empty adjustment", () => {
        expect(describeAdjustment(coffeeRecipe(), {})).toBeNull();
    });
});

describe("describeTemperatureBaseline", () => {
    it("lists a single stage with the recipe prefix below the font cap", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([240], [88]), 1.3)).toBe("recipe 88");
    });

    it("lists three stages from the short side of the boundary", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 88, 90]), 1.3))
            .toBe("recipe 88, 88, 90");
    });

    it("keeps repeated values in a three-stage list", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 88, 88]), 1.3))
            .toBe("recipe 88");
    });

    it("drops the recipe prefix for a three-stage list at the font cap", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([80, 80, 80], [88, 88, 90]), 1.4))
            .toBe("88, 88, 90");
    });

    it("collapses four stages to a range from the long side of the boundary", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([60, 60, 60, 60], [80, 85, 88, 90]), 1.4))
            .toBe("recipe 80 to 90");
    });

    it("uses one value when every stage shares a temperature", () => {
        expect(describeTemperatureBaseline(coffeeRecipe([60, 60, 60, 60], [88, 88, 88, 88]), 1.4))
            .toBe("88");
    });
});
