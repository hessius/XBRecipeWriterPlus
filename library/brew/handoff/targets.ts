import type {BrewOutcome} from "@/library/brew/BrewRecord";

// Describes where a finished brew can be sent from the record screen. The URL
// scheme stays in encode.ts because it is transport, while this module is the
// product gate and the user-facing target list.
export type HandoffTarget = {
    id: string;
    name: string;
    buttonLabel: string;
};

/**
 * Handoff destinations. The record screen currently renders the first entry;
 * adding another consumer is data, but each caller still has to decide how to
 * present more than one target.
 */
export const HANDOFF_TARGETS: readonly HandoffTarget[] = [
    {
        id:          "beanconqueror",
        name:        "Beanconqueror",
        buttonLabel: "Send to Beanconqueror"
    }
];

// The Record shape is the exhaustiveness check: adding a BrewOutcome must break
// compilation here until the handoff rule for that outcome is decided.
const CAN_HAND_OFF: Record<BrewOutcome, boolean> = {
    done:           true,
    endedOnMachine: true,
    cancelled:      false,
    lostContact:    false,
    failed:         false
};

/**
 * Only a brew that produced a drink is safe to hand over: anything else would
 * create a row in someone's coffee diary for coffee they never drank.
 *
 * `endedOnMachine` passes. It is a brew the machine called complete that
 * delivered materially less water than the plan asked for, which is what a
 * ratio or dose change on the machine looks like from here. The cup was still
 * poured and still drunk, and the record carries the water that actually came
 * out rather than the water that was planned, so the diary row it writes is
 * true. The three that fail are the ones where nothing was drunk or where the
 * app stopped watching and cannot say what happened.
 */
export function canHandOff(outcome: BrewOutcome): boolean {
    return CAN_HAND_OFF[outcome];
}
