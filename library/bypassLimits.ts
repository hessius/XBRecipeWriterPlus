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
 * 30 ml is roughly the smallest dilution anyone bothers with, and 85 C is what
 * `Recipe` already defaults an untouched bypass temperature to, so enabling
 * bypass on a recipe that has never had one does not move the number.
 */
export const BYPASS_DEFAULT_VOLUME = 30;
export const BYPASS_DEFAULT_TEMPERATURE = 85;

export function clampBypassVolume(value: number): number {
    return Math.min(Math.max(Math.round(value), BYPASS_VOLUME.min), BYPASS_VOLUME.max);
}
