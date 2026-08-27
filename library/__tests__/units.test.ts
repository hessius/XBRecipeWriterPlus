import {
    asTemperatureUnit,
    CELSIUS_RANGE,
    displayRange,
    displayValues,
    fromDisplay,
    snapToStorable,
    toDisplay,
    unitSuffix,
    type TemperatureUnit
} from "@/library/units";
import {snapThrough} from "@/components/Stepper";
import {TEMPERATURE} from "@/library/cardLimits";

/**
 * `library/units` restates the card's temperature bounds rather than importing
 * them, so that it stays free of every other module. This test is what makes the
 * two move together: it fails loudly if they stop matching, instead of letting a
 * field clamp to a value the card would refuse at write time.
 */
describe("CELSIUS_RANGE", () => {
    it("matches what the card will accept", () => {
        expect(CELSIUS_RANGE.min).toBe(TEMPERATURE.min);
        expect(CELSIUS_RANGE.max).toBe(TEMPERATURE.max);
    });
});

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

    it("agrees with the stepper's rule everywhere on the dial", () => {
        // Two functions promising "the nearest" that disagree would give a
        // typed temperature one answer and a tapped one another. They did.
        const ladder = displayValues("F");
        for (let value = 100; value <= 212; value += 0.5) {
            expect(snapToStorable(value, "F")).toBe(snapThrough(value, ladder));
        }
    });

    it("is nearest by distance, not by a trip through Celsius", () => {
        // 104.5 is half a degree from 104 and a degree and a half from 106.
        expect(snapToStorable(104.5, "F")).toBe(104);
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

describe("asTemperatureUnit", () => {
    it("passes the two real units through unchanged", () => {
        expect(asTemperatureUnit("C")).toBe("C");
        expect(asTemperatureUnit("F")).toBe("F");
    });

    it("falls back to Celsius, the documented default, for anything else", () => {
        // `Settings.get` only checks `typeof value === "string"`, so a stray
        // key, an old value from a settings format that changed, or an empty
        // string can all reach here. `toDisplay`/`unitSuffix` treat anything
        // that is not literally "C" as Fahrenheit, so this is the one place
        // that has to refuse to let that happen by accident.
        expect(asTemperatureUnit(undefined)).toBe("C");
        expect(asTemperatureUnit(null)).toBe("C");
        expect(asTemperatureUnit("")).toBe("C");
        expect(asTemperatureUnit("f")).toBe("C");
        expect(asTemperatureUnit("Fahrenheit")).toBe("C");
        expect(asTemperatureUnit(0)).toBe("C");
    });
});
