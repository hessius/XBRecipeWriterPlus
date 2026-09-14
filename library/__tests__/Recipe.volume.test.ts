import Recipe, {CUP_TYPE} from '../Recipe';
import Pour, {POUR_PATTERN, AGITATION} from '../Pour';
import {buildCard, TEA_CARD, XPOD_CARD} from './cardFixtures';

/**
 * The machine rejects any recipe where the sum of pour volumes does not exactly
 * equal dose x ratio, so these tests pin the volume reconciliation behaviour.
 */

function recipeWithPours(volumes: number[], dosage: number, ratio: number): Recipe {
    const recipe = new Recipe();
    recipe.dosage = dosage;
    recipe.ratio = ratio;
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.pours = volumes.map((volume, i) => new Pour(i + 1, volume, 93, 30, 0, 0, 0));
    return recipe;
}

describe('volume totals', () => {
    it('derives total volume from dose x ratio', () => {
        expect(recipeWithPours([], 15, 16).getTotalVolume()).toBe(240);
        expect(recipeWithPours([], 20, 15).getTotalVolume()).toBe(300);
    });

    it('sums only positive pour volumes', () => {
        const recipe = recipeWithPours([30, 105, 105], 15, 16);
        expect(recipe.getPourTotalVolume()).toBe(240);
    });

    it('validates a recipe only when pour total matches dose x ratio', () => {
        expect(recipeWithPours([30, 105, 105], 15, 16).isPourVolumeValid()).toBe(true);
        expect(recipeWithPours([30, 105, 100], 15, 16).isPourVolumeValid()).toBe(false);
    });
});

describe('autoFixPourVolumes', () => {
    it('assigns the whole total to a single pour', () => {
        const recipe = recipeWithPours([0], 15, 16);
        recipe.autoFixPourVolumes();

        expect(recipe.pours[0].volume).toBe(240);
        expect(recipe.isPourVolumeValid()).toBe(true);
    });

    it('blooms at double the dose and splits the remainder when all pours are empty', () => {
        const recipe = recipeWithPours([0, 0, 0], 15, 16);
        recipe.autoFixPourVolumes();

        expect(recipe.pours[0].volume).toBe(30); // 2 x 15g dose
        expect(recipe.pours.slice(1).map(p => p.volume)).toEqual([105, 105]);
        expect(recipe.isPourVolumeValid()).toBe(true);
    });

    it('rescales existing pours proportionally', () => {
        const recipe = recipeWithPours([30, 105, 105], 15, 16);
        recipe.ratio = 18; // total moves 240 -> 270
        recipe.autoFixPourVolumes();

        expect(recipe.getPourTotalVolume()).toBe(270);
        expect(recipe.isPourVolumeValid()).toBe(true);
    });

    it('redistributes rounding error so the total lands exactly', () => {
        // 100/3 per pour does not divide evenly; the remainder must still be absorbed.
        const recipe = recipeWithPours([33, 33, 34], 10, 10);
        recipe.ratio = 13; // total 130
        recipe.autoFixPourVolumes();

        expect(recipe.getPourTotalVolume()).toBe(130);
        expect(recipe.pours.every(p => Number.isInteger(p.volume))).toBe(true);
    });

    it('keeps every rescaled pour volume a whole number', () => {
        for (const ratio of [11, 13, 14, 17, 19]) {
            const recipe = recipeWithPours([30, 105, 105], 15, 16);
            recipe.ratio = ratio;
            recipe.autoFixPourVolumes();

            expect(recipe.pours.every(p => Number.isInteger(p.volume))).toBe(true);
            expect(recipe.getPourTotalVolume()).toBe(recipe.getTotalVolume());
        }
    });

    it('keeps whole-number volumes when the remainder does not divide evenly', () => {
        // Regression: `Math.round(total - bloom) / (n - 1)` rounded the numerator only,
        // so dose 15 / ratio 15 / 3 pours yielded [30, 97.5, 97.5]. Those fractional
        // volumes pass isPourVolumeValid() and get pushed straight into the card bytes.
        for (const [dosage, ratio, pourCount] of [[15, 15, 3], [15, 17, 3], [15, 13, 3], [12, 17, 4]]) {
            const recipe = recipeWithPours(new Array(pourCount).fill(0), dosage, ratio);
            recipe.autoFixPourVolumes();

            expect(recipe.pours.every(p => Number.isInteger(p.volume))).toBe(true);
            expect(recipe.getPourTotalVolume()).toBe(recipe.getTotalVolume());
        }
    });

    it('sets every tea pour to 90ml and recomputes the ratio', () => {
        const recipe = recipeWithPours([50, 50, 50], 5, 20);
        recipe.cupType = CUP_TYPE.TEA;
        recipe.autoFixPourVolumes();

        expect(recipe.pours.map(p => p.volume)).toEqual([90, 90, 90]);
        expect(recipe.ratio).toBe(54); // 270ml / 5g
        expect(recipe.isPourVolumeValid()).toBe(true);
    });
});

describe('fixRatio', () => {
    it('derives the ratio from pour total over dose', () => {
        const recipe = recipeWithPours([30, 105, 105], 15, 1);
        recipe.fixRatio();
        expect(recipe.ratio).toBe(16);
    });

    it('rounds to a whole number, since cards cannot store half ratios', () => {
        const recipe = recipeWithPours([100], 15, 1);
        recipe.fixRatio();
        expect(recipe.ratio).toBe(7); // 100/15 = 6.67
        expect(Number.isInteger(recipe.ratio)).toBe(true);
    });
});

describe('pour list editing', () => {
    it('renumbers pours after an insert', () => {
        const recipe = recipeWithPours([30, 105, 105], 15, 16);
        recipe.addPour(0);

        expect(recipe.pours).toHaveLength(4);
        expect(recipe.pours.map(p => p.pourNumber)).toEqual([1, 2, 3, 4]);
    });

    it('copies the previous pour parameters by default', () => {
        const recipe = recipeWithPours([30, 105, 105], 15, 16);
        recipe.pours[0].temperature = 88;
        recipe.addPour(0);

        expect(recipe.pours[1].temperature).toBe(88);
        expect(recipe.pours[1].volume).toBe(30);
    });

    it('renumbers pours after a delete', () => {
        const recipe = recipeWithPours([30, 105, 105], 15, 16);
        recipe.deletePour(1);

        expect(recipe.pours).toHaveLength(2);
        expect(recipe.pours.map(p => p.pourNumber)).toEqual([1, 2]);
        expect(recipe.pours.map(p => p.volume)).toEqual([30, 105]);
    });

    it("leaves the placeholder pour idiom alone", () => {
        // addPour(0, false) is how the test suite builds a pour it is about to
        // fill in. It must keep yielding the minimum-valued placeholder.
        const recipe = new Recipe();
        recipe.addPour(0, false);

        expect(recipe.pours[0].volume).toBe(1);
        expect(recipe.pours[0].temperature).toBe(39);
    });
});

describe('tea decoding', () => {
    it('clamps tea pour volumes above 90ml when reading a card', () => {
        const overfilled = buildCard({
            ...TEA_CARD,
            pours: TEA_CARD.pours.map(p => ({...p, volume: 120}))
        });
        const recipe = new Recipe(overfilled);

        expect(recipe.pours.map(p => p.volume)).toEqual([90, 90, 90]);
        expect(recipe.ratio).toBe(54); // ratio re-derived after the clamp
    });

    it('defaults the tea dose to 5g', () => {
        const card = buildCard(TEA_CARD);
        expect(new Recipe(card).dosage).toBe(5);
    });

    it('leaves non-tea recipes at the encoded dose', () => {
        expect(new Recipe(buildCard(XPOD_CARD)).dosage).toBe(15);
    });
});

describe("addOpeningPour", () => {
    it("opens a coffee recipe with a stage that satisfies the balance", () => {
        // dose x ratio is the sum the machine demands, and a single-pour recipe
        // is what autoFixPourVolumes would produce anyway. Matching it means one
        // tap of ADD STAGE carries a new recipe from invalid to writable.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.OMNI;
        recipe.dosage = 15;
        recipe.ratio = 16;
        recipe.grindSize = 65;

        recipe.addOpeningPour();

        expect(recipe.pours).toHaveLength(1);
        expect(recipe.pours[0].volume).toBe(240);
        expect(recipe.pours[0].temperature).toBe(93);
        expect(recipe.pours[0].flowRate).toBe(30);
        expect(recipe.pours[0].pourPattern).toBe(POUR_PATTERN.CENTERED);
        expect(recipe.pours[0].agitation).toBe(AGITATION.ALL_OFF);
        expect(recipe.pours[0].pauseTime).toBe(0);
        expect(recipe.pours[0].pourNumber).toBe(1);
        expect(recipe.isPourVolumeValid()).toBe(true);
    });

    it("opens a tea recipe at 90 ml and 85 degrees", () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;

        recipe.addOpeningPour();

        expect(recipe.pours).toHaveLength(1);
        expect(recipe.pours[0].volume).toBe(90);
        expect(recipe.pours[0].temperature).toBe(85);
    });

    it("fixes a tea recipe's ratio, which is derived rather than chosen", () => {
        // Coffee's volume comes from its ratio. Tea is the other way round:
        // fixRatio derives the ratio from the volumes, and without this call a
        // new tea recipe sits at ratio 0 -- below RATIO.min -- and would need a
        // second, unexplained tap on auto-adjust to reach the state coffee
        // reaches in one.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage = 5;

        recipe.addOpeningPour();

        expect(recipe.ratio).toBe(18);
    });

    it("rounds a fractional coffee target to a whole millilitre", () => {
        // A fractional ratio is not a contrivance: xBloom's own share links
        // carry ratios like 1:15.5, and importing one lands 15 g at 1:15.5,
        // whose dose-times-ratio target is 232.5 ml. A fractional stage volume
        // once hung the app's redistribution loop, which is why the opening
        // pour goes through getStageTargetVolume's rounding rather than taking
        // getTotalVolume raw: the raw 232.5 passes isPourVolumeValid but
        // cardWriteProblems then rejects it for not being a whole number.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.OMNI;
        recipe.dosage = 15;
        recipe.ratio = 15.5;

        recipe.addOpeningPour();

        expect(Number.isInteger(recipe.pours[0].volume)).toBe(true);
        expect(recipe.pours[0].volume).toBe(233); // Math.round(232.5) rounds half up
    });

    it("refuses to open a recipe that already has a stage", () => {
        // An opening pour is by definition the first. Called on a non-empty
        // recipe it would append a second stage numbered 1 -- corrupting the
        // numbering that BrewRecord copies into stored history -- so it is a
        // no-op that leaves the existing stage exactly as it was.
        const recipe = recipeWithPours([240], 15, 16);
        const existing = recipe.pours[0];

        recipe.addOpeningPour();

        expect(recipe.pours).toHaveLength(1);
        expect(recipe.pours[0]).toBe(existing);
        expect(recipe.pours[0].volume).toBe(240);
        expect(recipe.pours[0].pourNumber).toBe(1);
    });
});
