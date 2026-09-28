/**
 * A catalogue stage plan, as pours the brew ladder can draw.
 *
 * The only file under `library/hub/` that imports a domain type, and it imports
 * `Pour` alone. A hub row is something you are looking at; it becomes a
 * `Recipe` only at save, through the share-link importer, which is also the
 * only thing that knows how to fill in everything this drawing does not need.
 */
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";

import type {HubPour} from "./hubApi";

/**
 * The catalogue's pattern numbering is not the app's.
 *
 * `POUR_PATTERN` is CENTERED 0, CIRCULAR 1, SPIRAL 2, and the wire sends
 * 1 centered, 2 spiral, 3 circular. `library/XBloomRecipe.ts` maps the share
 * endpoint's plans with the same table. Circular is the fallback there too.
 */
function patternOf(wire: number): number {
    switch (wire) {
        case 1: return POUR_PATTERN.CENTERED;
        case 2: return POUR_PATTERN.SPIRAL;
        case 3: return POUR_PATTERN.CIRCULAR;
        default: return POUR_PATTERN.CIRCULAR;
    }
}

/**
 * Build the pours.
 *
 * Flow rate is deliberately left at `Pour`'s default. The catalogue does not
 * carry one, `pourSeconds` already falls back to the default flow for a pour
 * that has no rate, and a number written in here would be drawn as though the
 * recipe had asked for it.
 *
 * Agitation is set to ALL_OFF rather than left alone, and that difference
 * matters. `Pour.agitation` defaults to -1, and every bit of -1 is set, so
 * `getAgitationBefore` and `getAgitationAfter` both answer true on a pour
 * nobody set. `BrewStageRung` reads exactly those two, so an unset stage would
 * draw a shake before and a shake after on every catalogue recipe in the list.
 * The detail endpoint sends no vibration flags at all, so off is the only
 * honest reading, and it is what the share-link importer writes too.
 */
export function hubPours(plan: readonly HubPour[] | null | undefined): Pour[] {
    if (!plan) return [];
    return plan.map((stage, index) => new Pour(
        index + 1,
        stage.volume,
        stage.temperature,
        undefined,
        AGITATION.ALL_OFF,
        patternOf(stage.pattern),
        stage.pausing
    ));
}
