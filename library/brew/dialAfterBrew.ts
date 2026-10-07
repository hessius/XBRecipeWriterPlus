import {grinderRan, type BrewRecord} from "./BrewRecord";
import {grindBand, grindValueMeansOff} from "@/library/grindBands";

/** The part of `Machine` this needs. Narrow, so a test can be a literal. */
export type DialMachine = {
    /** Refresh the vitals. Resolves to whether the machine actually answered. */
    askHowItIsDoing: () => Promise<boolean>;
    /** The vitals, as they stand after the request above. */
    info: {grindSize: number} | null;
};

/**
 * Read the machine's grind dial once a brew has finished, and keep it.
 *
 * The dial is an override: where it is set changes how the machine grinds
 * without the app being told, and setting it is how a recipe gets nudged to
 * suit a particular bean. It is turned before a brew and never during one, so
 * the position that matters is settled by the time the grinder starts.
 *
 * The reading taken before the recipe goes out can still be stale, which is
 * why this one is taken afterwards. The app asks for vitals at the moment it
 * is about to brew, and the hand that moved the dial was on it a second
 * earlier; the post-brew reading is the one the machine has certainly caught
 * up with.
 *
 * That is not free. Machine info only answers inside a live session and the
 * session expires, so renewing it sends a handshake, which beeps. The beep is
 * accepted: it happens once, after the brew is over, and it is a far smaller
 * cost than a recorded number that quietly contradicts what the machine did.
 *
 * Two rules keep it honest:
 *
 * - **Only on a brew that got as far as the pour.** `pouringAt` is set when
 *   the pour phase opens, which the machine announces on GRINDER_STOP, so it
 *   is exactly the record's own answer to "did this brew get past the grind".
 *   A brew cancelled before that, or refused for want of water, never beeps.
 * - **Only a reading the machine confirmed.** `askHowItIsDoing` returning
 *   false leaves `info` holding the pre-brew value, which is the one number
 *   this whole path exists to avoid recording. Nothing is written then, and
 *   an absent `dialAfter` is how the record says the reading was not taken.
 *
 * Deliberately not awaited by the brew: the record is written first and this
 * lands as an update to that row, so a reading that never arrives just leaves
 * the field absent instead of holding up the end of a brew.
 *
 * @param save called only with a confirmed reading.
 * @returns the reading that was saved, or null when none was.
 */
export async function readDialAfterBrew(
    machine: DialMachine,
    record: BrewRecord,
    save: (id: string, dial: number) => void
): Promise<number | null> {
    if (record.pouringAt === undefined || record.pouringAt === null
        || record.pouringAt <= 0) {
        return null;
    }
    const answered = await machine.askHowItIsDoing();
    if (!answered) return null;
    const dial = machine.info?.grindSize ?? 0;
    if (dial <= 0) return null;
    save(record.id, dial);
    return dial;
}

export type GrindFigure =
    | {kind: "off"}
    | {
        kind: "dial";
        dial: number;
        recipe: number | null;
    }
    | {
        /**
         * No dial reading arrived, so this is the recipe's own setting: what
         * was asked for rather than what was confirmed. Surfaces must draw it
         * in the dashed outline that already carries that distinction.
         */
        kind: "recipe";
        recipe: number;
    };

/**
 * The grind figure a surface may draw, or null when it may not say anything.
 *
 * Built here rather than in a component so the honesty rule is one testable
 * sentence rather than a condition spread across two screens and an export.
 *
 * Four rules:
 *
 * - **The grinder-off fact is first class.** If the record explicitly says
 *   `grinderUsed` was false, or the snapshotted recipe grind is the off
 *   sentinel owned by `grindBands`, the surface may draw GRIND OFF. The dial
 *   position is irrelevant then and the recipe badge is suppressed. If the two
 *   independent records disagree, this takes the same cautious reading as
 *   `grinderRan`: a brew that might have used beans ground elsewhere must not
 *   be dressed as a machine grind.
 * - It reports the confirmed dial as GRIND only when the record positively
 *   says the grinder ran. The dial proves where the dial was, not how the
 *   coffee was ground.
 * - **Only the post-brew reading may be reported as a dial.** The pre-send one
 *   may have been taken before the machine caught up with a dial that had just
 *   been moved, so a record holding only that cannot be presented as fact. A
 *   record with no post-brew reading falls back to the recipe's own grind as
 *   `recipe`, which is not a reading and must not be drawn as one.
 * - A recipe grind badge appears only when the recorded recipe asked for a
 *   different setting.
 */
export function dialNote(record: BrewRecord): GrindFigure | null {
    const recipeGrind = record.grindSize;
    const recipeSaysOff = typeof recipeGrind === "number"
        && grindValueMeansOff(recipeGrind);
    if (record.grinderUsed === false || recipeSaysOff) {
        return {kind: "off"};
    }
    if (!grinderRan(record)) return null;
    const after = record.dialAfter ?? 0;
    if (after <= 0) {
        // No confirmed reading. The post-brew rule still holds and this is not
        // being presented as one: the recipe's own setting is what was asked
        // for, drawn in an outline that says so. Reporting it is strictly more
        // than the silence this replaced, which threw away a fact we had.
        return typeof recipeGrind === "number" && grindBand(recipeGrind) !== undefined
            ? {kind: "recipe", recipe: recipeGrind}
            : null;
    }
    return {
        kind: "dial",
        dial: after,
        recipe: typeof recipeGrind === "number"
            && grindBand(recipeGrind) !== undefined
            && recipeGrind !== after
            ? recipeGrind
            : null
    };
}
