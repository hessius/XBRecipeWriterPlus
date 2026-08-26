import {
    CELSIUS_RANGE,
    displayRange,
    displayValues,
    fromDisplay,
    snapToStorable,
    toDisplay,
    unitSuffix,
    type TemperatureUnit
} from "@/library/units";

describe("toDisplay", () => {
    it("leaves Celsius alone", () => {
        expect(toDisplay(93, "C")).toBe(93);
        expect(toDisplay(39, "C")).toBe(39);
    });

    it("converts to whole Fahrenheit", () => {
        expect(toDisplay(0, "F")).toBe(32);
        expect(toDisplay(100, "F")).toBe(212);
        expect(toDisplay(93, "F")).toBe(199);
    });

    it("converts both ends of the card's range", () => {
        expect(toDisplay(CELSIUS_RANGE.min, "F")).toBe(102);
        expect(toDisplay(CELSIUS_RANGE.max, "F")).toBe(210);
    });
});

describe("fromDisplay", () => {
    it("leaves Celsius alone", () => {
        expect(fromDisplay(93, "C")).toBe(93);
    });

    it("converts back to whole Celsius", () => {
        expect(fromDisplay(199, "F")).toBe(93);
        expect(fromDisplay(102, "F")).toBe(39);
        expect(fromDisplay(210, "F")).toBe(99);
    });

    it("clamps to what the card can hold", () => {
        expect(fromDisplay(500, "F")).toBe(CELSIUS_RANGE.max);
        expect(fromDisplay(-40, "F")).toBe(CELSIUS_RANGE.min);
        expect(fromDisplay(200, "C")).toBe(CELSIUS_RANGE.max);
        expect(fromDisplay(0, "C")).toBe(CELSIUS_RANGE.min);
    });

    it("refuses a value that is not a number", () => {
        expect(fromDisplay(Number.NaN, "F")).toBe(CELSIUS_RANGE.min);
    });
});

describe("the round trip", () => {
    // The property that makes this feature safe: a user who switches to
    // Fahrenheit and back must get the identical card. Every storable Celsius
    // value is checked, not a sample, because one that failed would silently
    // rewrite a recipe.
    it("is the identity for every storable Celsius value", () => {
        for (let c = CELSIUS_RANGE.min; c <= CELSIUS_RANGE.max; c++) {
            expect(fromDisplay(toDisplay(c, "F"), "F")).toBe(c);
        }
    });
});

describe("displayValues", () => {
    it("lists every storable value, in order, without repeats", () => {
        for (const unit of ["C", "F"] as TemperatureUnit[]) {
            const values = displayValues(unit);
            expect(values.length).toBe(CELSIUS_RANGE.max - CELSIUS_RANGE.min + 1);
            expect(new Set(values).size).toBe(values.length);
            for (let i = 1; i < values.length; i++) {
                expect(values[i]).toBeGreaterThan(values[i - 1]);
            }
        }
    });

    it("skips the Fahrenheit values the card cannot hold", () => {
        // 1 °C is 1.8 °F, so a stepper that moved by one would sometimes not
        // move the stored value at all — a control that visibly does nothing.
        const values = displayValues("F");
        const at194 = values.indexOf(194);
        expect(at194).toBeGreaterThan(0);
        expect(values[at194 + 1]).toBe(196);
        expect(values[at194 + 2]).toBe(198);
        expect(values).not.toContain(195);
    });

    it("is the plain Celsius run", () => {
        expect(displayValues("C")[0]).toBe(39);
        expect(displayValues("C")[1]).toBe(40);
    });
});

describe("snapToStorable", () => {
    it("moves a typed value to the nearest one the card can hold", () => {
        expect(snapToStorable(195, "F")).toBe(196);
        expect(snapToStorable(194.4, "F")).toBe(194);
        expect(snapToStorable(93, "C")).toBe(93);
    });

    it("clamps out-of-range input rather than extrapolating", () => {
        expect(snapToStorable(400, "F")).toBe(210);
        expect(snapToStorable(0, "F")).toBe(102);
    });
});

describe("displayRange", () => {
    it("is the card's range, in the unit asked for", () => {
        expect(displayRange("C")).toEqual({min: 39, max: 99});
        expect(displayRange("F")).toEqual({min: 102, max: 210});
    });
});

describe("unitSuffix", () => {
    it("names the unit", () => {
        expect(unitSuffix("C")).toBe("°C");
        expect(unitSuffix("F")).toBe("°F");
    });
});
