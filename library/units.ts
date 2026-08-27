/**
 * Temperature, in the unit the user asked to see it in.
 *
 * The card stores one byte of whole Celsius, so Celsius is canonical everywhere
 * behind this module: `Recipe`, `Pour`, the byte format and every stored value.
 * Conversion happens at the field boundary and nowhere else, which is what makes
 * switching units and switching back produce a byte-identical card.
 *
 * Pure, and free of React, so the arithmetic can be tested as arithmetic.
 */

export type TemperatureUnit = "C" | "F";

/**
 * Narrows an unchecked stored value to a `TemperatureUnit`.
 *
 * `Settings.get` only checks `typeof value === "string"`, so anything —
 * an old key, a corrupted store, a stray `""` — can come back as the
 * "temperatureUnit" setting. `toDisplay` and `unitSuffix` both read
 * `unit === "C"` and treat every other string as Fahrenheit, so an
 * unrecognised value would silently mean °F. This is the one place that
 * decides otherwise: only the literal `"F"` means Fahrenheit, and everything
 * else — including garbage — falls back to the documented default, Celsius.
 */
export function asTemperatureUnit(value: unknown): TemperatureUnit {
    return value === "F" ? "F" : "C";
}

/** What the card can hold, in whole Celsius. Mirrors `cardLimits`. */
export const CELSIUS_RANGE = {min: 39, max: 99} as const;

function clampCelsius(celsius: number): number {
    if (!Number.isFinite(celsius)) return CELSIUS_RANGE.min;
    return Math.min(Math.max(celsius, CELSIUS_RANGE.min), CELSIUS_RANGE.max);
}

/** Canonical Celsius to the number the user is shown. */
export function toDisplay(celsius: number, unit: TemperatureUnit): number {
    if (unit === "C") return celsius;
    return Math.round(celsius * 9 / 5 + 32);
}

/**
 * A number the user was shown, back to canonical Celsius.
 *
 * Rounded and clamped, so this is the only door a temperature enters the model
 * through and nothing past it has to defend itself.
 */
export function fromDisplay(value: number, unit: TemperatureUnit): number {
    if (!Number.isFinite(value)) return CELSIUS_RANGE.min;
    const celsius = unit === "C" ? value : (value - 32) * 5 / 9;
    return clampCelsius(Math.round(celsius));
}

/**
 * Every value the field can settle on, in order.
 *
 * The card's resolution is one Celsius degree, so in Fahrenheit the ladder has
 * gaps: 194, 196, 198. That is the honest rendering. Stepping by one Fahrenheit
 * degree instead would sometimes land on the same stored Celsius and leave the
 * user tapping a control that visibly does nothing, which is indistinguishable
 * from a frozen screen.
 */
export function displayValues(unit: TemperatureUnit): readonly number[] {
    const values: number[] = [];
    for (let c = CELSIUS_RANGE.min; c <= CELSIUS_RANGE.max; c++) {
        values.push(toDisplay(c, unit));
    }
    return values;
}

/**
 * The nearest value the field can settle on. For a typed entry.
 *
 * Walks the ladder rather than converting and converting back. Rounding through
 * Celsius is not "nearest": 104.5 °F is half a degree from 104 and a degree and
 * a half from 106, but the round trip lands on 106. It also resolved the exact
 * midpoints in whichever direction the Celsius arithmetic happened to fall,
 * which disagreed with the stepper's rule on half the reachable inputs. There is
 * one definition of nearest, and this and `snapThrough` both use it.
 */
export function snapToStorable(value: number, unit: TemperatureUnit): number {
    if (!Number.isFinite(value)) return toDisplay(CELSIUS_RANGE.min, unit);
    return displayValues(unit).reduce((best, candidate) =>
        Math.abs(candidate - value) <= Math.abs(best - value) ? candidate : best);
}

/** The bounds to hand a stepper. */
export function displayRange(unit: TemperatureUnit): {min: number; max: number} {
    return {
        min: toDisplay(CELSIUS_RANGE.min, unit),
        max: toDisplay(CELSIUS_RANGE.max, unit)
    };
}

export function unitSuffix(unit: TemperatureUnit): string {
    return unit === "C" ? "°C" : "°F";
}
