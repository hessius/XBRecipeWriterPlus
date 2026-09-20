import type {BrewOutcome} from "@/library/brew/BrewRecord";

// Describes where a finished brew can be sent from the record screen. The URL
// scheme stays in encode.ts because it is transport, while this module is the
// product gate and the user-facing target list.
export type HandoffTarget = {
    id: string;
    name: string;
    buttonLabel: string;
    credit: string;
    siteUrl: string;
    siteAccessibilityLabel: string;
};

/**
 * Off until Beanconqueror can read the link upstream. Before that PR lands, a
 * visible action would open Beanconqueror only to produce "unrecognised link".
 *
 * Flip this to true only after the upstream reader is available to users; the
 * follow-up release should also decide whether the temporary gate can be
 * deleted entirely.
 */
export const HANDOFF_ENABLED = false;

/**
 * Handoff destinations. The record screen currently renders the first entry;
 * adding another consumer is data, but each caller still has to decide how to
 * present more than one target.
 */
export const HANDOFF_TARGETS: readonly HandoffTarget[] = [
    {
        id:          "beanconqueror",
        name:        "Beanconqueror",
        buttonLabel: "Send to Beanconqueror",
        credit:      "Beanconqueror keeps the brew diary.",
        siteUrl:     "https://beanconqueror.com",
        siteAccessibilityLabel: "Open Beanconqueror website"
    }
];

// The Record shape is the exhaustiveness check: adding a BrewOutcome must break
// compilation here until the handoff rule for that outcome is decided.
const CAN_HAND_OFF: Record<BrewOutcome, boolean> = {
    done:           true,
    endedOnMachine: false,
    cancelled:      false,
    lostContact:    false,
    failed:         false
};

/**
 * Only a finished brew is safe to hand over: anything else would create a row
 * in someone's coffee diary for coffee they never drank.
 *
 * `endedOnMachine` is intentionally still false even though it can produce a
 * real cup when the user stops the machine. Widening that later is plausible,
 * and this predicate is the single edit point if the product decision changes.
 */
export function canHandOff(outcome: BrewOutcome): boolean {
    return CAN_HAND_OFF[outcome];
}
