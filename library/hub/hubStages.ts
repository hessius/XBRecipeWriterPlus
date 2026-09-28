/**
 * A catalogue stage plan, as pours the brew ladder can draw.
 *
 * The only file under `library/hub/` that imports a domain type, and it imports
 * `Pour` alone. A hub row is something you are looking at; it becomes a
 * `Recipe` only at save, through the share-link importer, which is also the
 * only thing that knows how to fill in everything this drawing does not need.
 */
import Pour, {POUR_PATTERN} from "@/library/Pour";

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
 * Flow rate and agitation are deliberately left at `Pour`'s defaults. The
 * catalogue does not carry either, `pourSeconds` already falls back to the
 * default flow for a pour that has no rate, and a number written in here would
 * be drawn as though the recipe had asked for it.
 */
export function hubPours(plan: readonly HubPour[] | null | undefined): Pour[] {
    if (!plan) return [];
    return plan.map((stage, index) => new Pour(
        index + 1,
        stage.volume,
        stage.temperature,
        undefined,
        undefined,
        patternOf(stage.pattern),
        stage.pausing
    ));
}
