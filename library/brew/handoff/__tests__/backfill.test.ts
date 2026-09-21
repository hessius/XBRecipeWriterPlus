import type {BrewRecord} from "@/library/brew/BrewRecord";
import {backfillFromRecipe, type BackfilledField} from "@/library/brew/handoff/backfill";
import {brew} from "@/library/brew/handoff/__tests__/fixtures";
import type {StoredBrew} from "@/library/BrewDatabase";
import Recipe from "@/library/Recipe";

function recipe(overrides: Partial<Pick<
    Recipe,
    "dosage" | "ratio" | "grindSize" | "grindRPM" | "grinder"
>> = {}): Recipe {
    const result = new Recipe();
    result.dosage = 18;
    result.ratio = 15;
    result.grindSize = 63;
    result.grindRPM = 90;
    result.grinder = true;
    Object.assign(result, overrides);
    return result;
}

const backfilledFields: BackfilledField[] = [
    "dose",
    "ratio",
    "grindSize",
    "grinderRpm",
    "grinderUsed"
];

function acceptsStored(_record: StoredBrew): void {}

describe("backfillFromRecipe", () => {
    it("fills absent brew figures from the recipe in stable order", () => {
        const old = brew({
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined
        });

        const backfill = backfillFromRecipe(old, recipe());

        expect(backfill.filled).toEqual(backfilledFields);
        expect(backfill.record).toMatchObject({
            dose: 18,
            ratio: 15,
            grindSize: 63,
            grinderRpm: 90,
            grinderUsed: true
        });
    });

    it.each([
        ["finite zeroes and false", {
            dose: 0,
            ratio: 0,
            grindSize: 0,
            grinderRpm: 0,
            grinderUsed: false
        }],
        ["captured positive values", {
            dose: 17,
            ratio: 14,
            grindSize: 58,
            grinderRpm: 80,
            grinderUsed: true
        }]
    ])("does not overwrite %s", (_name, captured) => {
        const recorded = brew(captured);

        const backfill = backfillFromRecipe(recorded, recipe());

        expect(backfill.filled).toEqual([]);
        expect(backfill.record).toStrictEqual(recorded);
        expect(backfill.record).not.toBe(recorded);
    });

    it("ignores recipe values that the recorder would not write", () => {
        const old = brew({
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined
        });

        const backfill = backfillFromRecipe(old, recipe({
            dosage: 0,
            ratio: 0,
            grindSize: 0,
            grindRPM: 0,
            grinder: true
        }));

        expect(backfill.filled).toEqual([]);
        expect(backfill.record).toStrictEqual(old);
        expect(backfill.record).not.toBe(old);
    });

    it("couples grinderUsed to the recipe grind-size sentinel", () => {
        const old = brew({
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined
        });

        const backfill = backfillFromRecipe(old, recipe({
            grindSize: -1,
            grindRPM: 90,
            grinder: true
        }));

        expect(backfill.filled).toEqual(["grinderRpm"]);
        expect(backfill.record).toMatchObject({grinderRpm: 90});
        expect(backfill.record.grindSize).toBeUndefined();
        expect(backfill.record.grinderUsed).toBeUndefined();
    });

    it("fills only grinderUsed when the recipe grinder is off", () => {
        const old = brew({
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined
        });

        const backfill = backfillFromRecipe(old, recipe({
            grindSize: 63,
            grindRPM: 90,
            grinder: false
        }));

        expect(backfill.filled).toEqual(["grinderUsed"]);
        expect(backfill.record).toMatchObject({grinderUsed: false});
        expect(backfill.record.grindSize).toBeUndefined();
        expect(backfill.record.grinderRpm).toBeUndefined();
    });

    it("keeps the record and recipe immutable", () => {
        const old = Object.freeze(brew({
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined
        })) as BrewRecord;
        const beforeRecord = {...old};
        const source = recipe();
        const beforeRecipe = {
            dosage: source.dosage,
            ratio: source.ratio,
            grindSize: source.grindSize,
            grindRPM: source.grindRPM,
            grinder: source.grinder
        };

        const backfill = backfillFromRecipe(old, source);

        expect(backfill.record).not.toBe(old);
        expect(old).toStrictEqual(beforeRecord);
        expect(source).toMatchObject(beforeRecipe);
    });

    it("keeps a StoredBrew as a StoredBrew through the backfill", () => {
        const stored = brew({
            dose: undefined,
            ratio: undefined,
            grindSize: undefined,
            grinderRpm: undefined,
            grinderUsed: undefined,
            hasStream: true
        });

        const backfill = backfillFromRecipe(stored, recipe());

        acceptsStored(backfill.record);
        expect(backfill.record.hasStream).toBe(true);
    });
});
