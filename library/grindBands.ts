/**
 * What a grind number means.
 *
 * The bands are the official xBloom app's own guidance. They cover the
 * grinder's full 1-80 scale, not just the 40-80 a card can carry, because an
 * imported recipe can legitimately hold a finer value -- the cloud stores grind
 * on the grinder's scale (`XBloomRecipe.ts` copies it straight through) -- and
 * we have to be able to name what such a recipe was ground for before we can
 * explain why it will not write.
 *
 * This is the only place the band boundaries are written down. Grind size
 * already has four different encodings across card, cloud and BLE (see
 * `docs/machine-integration/roadmap.md`), every one of which fails silently
 * rather than erroring; letting a fifth interpretation spread across call sites
 * is not a risk worth taking for a table this small.
 */

import {GRIND_SIZE_OFFSET, GRINDER_OFF} from "./Recipe";

/** The finest grind a card can store. Below this, `grindSize - 40` goes negative. */
export const CARD_GRIND_MIN = 40;

/**
 * The value that means "grinder off" rather than a coarseness.
 *
 * `GRINDER_OFF` is the byte on the card; the number a user sees is that byte
 * plus the offset. Conflating the two is a mistake that has already been made
 * once, in the original text of #52.
 */
const GRINDER_OFF_VALUE = GRIND_SIZE_OFFSET + GRINDER_OFF;

export type GrindBand = {
    /** Short enough to sit on a row label beside the field's own name. */
    label: string;
    /** The unabbreviated form, for prose. */
    longLabel: string;
    /** Whether a recipe card can store a grind in this band at all. */
    onCard: boolean;
};

const BANDS: readonly {max: number; band: GrindBand}[] = [
    {max: 15, band: {label: "Espresso",     longLabel: "espresso",                  onCard: false}},
    {max: 30, band: {label: "Aeropress",    longLabel: "Aeropress",                 onCard: false}},
    {max: 55, band: {label: "Pourover",     longLabel: "pourover or a coffee maker", onCard: true}},
    {max: 80, band: {label: "French press", longLabel: "French press or cold brew", onCard: true}}
];

/**
 * The band a grind value falls in, or `undefined` if it names no coarseness.
 *
 * Undefined covers two cases the caller must not draw as a band: the
 * grinder-off sentinel, and anything off the ends of the grinder's scale.
 */
export function grindBand(value: number): GrindBand | undefined {
    if (value === GRINDER_OFF_VALUE) return undefined;
    if (!Number.isFinite(value) || value < 1 || value > 80) return undefined;

    const match = BANDS.find((entry) => value <= entry.max);
    if (match === undefined) return undefined;

    // The pourover band straddles the card's floor: 31-39 is pourover and
    // unreachable, 40-55 is pourover and fine. So reachability is decided by
    // the value, not by the band it landed in.
    return {...match.band, onCard: match.band.onCard && value >= CARD_GRIND_MIN};
}
