/**
 * What the editor will let a bypass be.
 *
 * Deliberately not in `cardLimits`. Bypass water never reaches a card, so a
 * bypass value can never be a reason to refuse a write, and putting it there
 * would invite exactly that. The temperature range is imported rather than
 * restated: the machine has one kettle, so a bypass temperature outside the
 * range a stage may use is not a thing the hardware can do.
 */

import {TEMPERATURE, type Range} from "@/library/cardLimits";

/** 1 ml because zero water with bypass on is bypass off wearing a hat. */
export const BYPASS_VOLUME: Range = {min: 1, max: 500};

/** The range the temperature control offers. Shared with the stage tiles. */
export const BYPASS_TEMPERATURE: Range = TEMPERATURE;

/**
 * What a freshly enabled bypass starts at.
 *
 * 30 ml is roughly the smallest dilution anyone bothers with.
 *
 * The temperature is only a fallback. A seeded bypass copies the temperature of
 * the last stage instead, because the water goes into the cup straight after
 * that stage and a fixed constant would arrive hotter than a deliberately cool
 * finish; see `applyBypassEnabled`. This constant is what is left for a recipe
 * with no stages at all, and it is what `Recipe` already defaults an untouched
 * bypass temperature to.
 */
export const BYPASS_DEFAULT_VOLUME = 30;
export const BYPASS_DEFAULT_TEMPERATURE = 85;

export function clampBypassVolume(value: number): number {
    return Math.min(Math.max(Math.round(value), BYPASS_VOLUME.min), BYPASS_VOLUME.max);
}

/**
 * Whether a stored bypass temperature is one the kettle could have been asked for.
 *
 * `Pour.temperature` is -1 until someone sets it, and `??` only catches null
 * and undefined, so a sentinel copied from an unset stage used to survive every
 * guard between the editor and the BLE frame. Anything outside the range the
 * hardware can do is treated the same way whatever wrote it, because there is
 * no reading of an out-of-range number that is better than the default.
 */
export function isUsableBypassTemp(value: number | undefined | null): boolean {
    return typeof value === "number" && Number.isFinite(value)
        && value >= BYPASS_TEMPERATURE.min && value <= BYPASS_TEMPERATURE.max;
}

/**
 * The nearest temperature the kettle can do.
 *
 * The last line rather than the first: a caller that knows a value is unset
 * should reach for `BYPASS_DEFAULT_TEMPERATURE` instead, since an unset stage
 * has no setpoint and 39 C is a real instruction. A value that is not a number
 * at all cannot be clamped, so it answers the default; `Math.min` would
 * otherwise pass NaN straight through to a float32.
 */
export function clampBypassTemp(value: number): number {
    if (!Number.isFinite(value)) return BYPASS_DEFAULT_TEMPERATURE;
    return Math.min(Math.max(Math.round(value), BYPASS_TEMPERATURE.min), BYPASS_TEMPERATURE.max);
}
