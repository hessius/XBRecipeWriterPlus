import type {BrewRecord} from "./BrewRecord";

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

/**
 * Whether the two readings disagree.
 *
 * They normally agree, because the dial is set before a brew and cannot be
 * moved during one. A difference means the pre-send reading was taken before
 * the machine had caught up with the hand that had just moved it, so the
 * post-brew number is the true one and the earlier one is worth showing
 * beside it.
 *
 * Both readings have to exist for the question to have an answer: one reading
 * alone is a position, not a difference.
 */
export function dialWasMoved(record: BrewRecord): boolean {
    const before = record.dialBefore ?? 0;
    const after = record.dialAfter ?? 0;
    return before > 0 && after > 0 && before !== after;
}

/**
 * How a surface says what the dial read, or null when it may not say anything.
 *
 * Built here rather than in a component so the honesty rule is one testable
 * sentence rather than a condition spread across two screens and an export.
 *
 * Three rules, all of them the issue's:
 *
 * - It reports the dial and stops. "Machine dial" rather than "ground at",
 *   because the dial proves where the dial was and nothing more: somebody
 *   using a hand grinder has one sitting wherever it was last left. The same
 *   discipline `endedOnMachine` already follows, which records that a brew
 *   came up short and declines to say why.
 * - **Only the post-brew reading may be reported.** The pre-send one may have
 *   been taken before the machine caught up with a dial that had just been
 *   moved, so a record holding only that cannot be presented as fact.
 * - A difference between the two is worth saying, because it is the positive
 *   observation that the dial was turned for this brew rather than left where
 *   the last one put it.
 */
export function dialNote(record: BrewRecord): string | null {
    const after = record.dialAfter ?? 0;
    if (after <= 0) return null;
    if (!dialWasMoved(record)) return `MACHINE DIAL ${after}`;
    return `MACHINE DIAL ${after}, MOVED FROM ${record.dialBefore}`;
}
