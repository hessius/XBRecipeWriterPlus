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

/** The nearest value the field can settle on. For a typed entry. */
export function snapToStorable(value: number, unit: TemperatureUnit): number {
    return toDisplay(fromDisplay(Math.round(value), unit), unit);
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
