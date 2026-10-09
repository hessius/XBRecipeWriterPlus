import {isOverflowProtection, OVERFLOW_INTERVALS, overflowFor} from "@/library/brew/overflowConfig";

const OTHER = 0x01;
const config = {retainedGrams: 40, checkSeconds: 30 as const};

describe("isOverflowProtection", () => {
    it("lists the three check intervals", () => {
        expect(OVERFLOW_INTERVALS).toEqual([15, 30, 45]);
    });

    it.each([15, 30, 45])("accepts a %i s interval with an explicit positive whole limit", (checkSeconds) => {
        expect(isOverflowProtection({retainedGrams: 1, checkSeconds})).toBe(true);
        expect(isOverflowProtection({retainedGrams: Number.MAX_SAFE_INTEGER, checkSeconds})).toBe(true);
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["an array", []],
        ["an empty object", {}],
        ["a string", "40"],
        ["zero", {retainedGrams: 0, checkSeconds: 30}],
        ["a negative", {retainedGrams: -5, checkSeconds: 30}],
        ["a fraction", {retainedGrams: 12.5, checkSeconds: 30}],
        ["NaN", {retainedGrams: NaN, checkSeconds: 30}],
        ["Infinity", {retainedGrams: Infinity, checkSeconds: 30}],
        ["above the safe integer range", {retainedGrams: Number.MAX_SAFE_INTEGER + 1, checkSeconds: 30}],
        ["a numeric string limit", {retainedGrams: "40", checkSeconds: 30}],
        ["a missing limit", {checkSeconds: 30}],
        ["a missing interval", {retainedGrams: 40}],
        ["an interval of 20", {retainedGrams: 40, checkSeconds: 20}],
        ["an interval of 0", {retainedGrams: 40, checkSeconds: 0}],
        ["a string interval", {retainedGrams: 40, checkSeconds: "30"}]
    ])("rejects %s", (_name, value) => {
        expect(isOverflowProtection(value)).toBe(false);
    });
});

describe("overflowFor", () => {
    it("applies to the Other dripper", () => {
        expect(overflowFor({cupType: OTHER, overflowProtection: config})).toEqual(config);
    });

    it.each([[0x00, "xPod"], [0x02, "Omni"], [0x03, "tea"]])(
        "is suppressed for cup type %i (%s) and does not touch the stored value", (cupType) => {
            const recipe = {cupType, overflowProtection: config};
            expect(overflowFor(recipe)).toBeUndefined();
            expect(recipe.overflowProtection).toBe(config);
        });

    it("is undefined when nothing is configured", () => {
        expect(overflowFor({cupType: OTHER})).toBeUndefined();
    });
});
