/**
 * Errors raised when we refuse to write a card, kept apart from `NFC` itself.
 *
 * `Recipe` only ever referenced `NFC` as a type, so TypeScript elided the import
 * and the model stayed free of the native NFC package. Importing a runtime value
 * from `NFC` would drag `react-native-nfc-manager` into every consumer — and into
 * every test that never goes near a card. These live here so both sides can use
 * them without that cost.
 */

/**
 * The 32 bytes xBloom derives from the card's serial and writes ahead of the
 * recipe. We never regenerate it — we read it off the card and put it back —
 * which is why only genuine cards work, and why overrunning it is fatal.
 *
 * It lives here rather than in `NFC` so that anything wanting to reason about
 * capacity can have it without importing a runtime value from `NFC`, which
 * would drag `react-native-nfc-manager` into every consumer and every test.
 */
export const SIGNATURE_BYTES = 32;

/**
 * The most stages the machine will read off a card, whatever the card holds.
 *
 * Measured, not derived. A 160-byte card has room for fourteen stages by the
 * byte arithmetic below, and the machine refuses the card outright at eleven --
 * not a truncated brew, a rejected card. Ten loads and brews normally.
 *
 * So capacity is the *lower* of two unrelated ceilings: what the tag can hold,
 * and what the firmware will accept. This is the second one, and on every card
 * seen so far it is the binding one.
 *
 * It is a card limit only. The same recipe sent over BLE brews seventeen stages
 * without complaint, which is why this is not a limit on the model or on the
 * editor -- see `MAX_POURS` in cardLimits.
 */
export const MACHINE_CARD_MAX_STAGES = 10;

/**
 * The most stages a given number of usable bytes could hold.
 *
 * `available` is already net of the signature: it is what a recipe may spend.
 *
 * Capped by what the firmware will accept, so a roomier card cannot advertise
 * a ceiling the machine would then reject the card for.
 */
export function maxStagesForBytes(available: number): number {
    return Math.min(
        Math.max(
            Math.floor((available - CARD_OVERHEAD_BYTES) / CARD_BYTES_PER_STAGE),
            0
        ),
        MACHINE_CARD_MAX_STAGES
    );
}

/** A write we refused to attempt, as opposed to one the tag rejected. */
export class CardWriteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CardWriteError";
    }
}

/**
 * The recipe is bigger than this particular card.
 *
 * Capacity is a property of the tag, not of the format: genuine cards have been
 * read at both 128 and 160 bytes. The numbers are carried on the error so the UI
 * can phrase the refusal in stages, which is what the user actually edits.
 */
export class CardCapacityError extends CardWriteError {
    readonly neededBytes: number;
    readonly availableBytes: number;

    constructor(neededBytes: number, availableBytes: number) {
        super(`The recipe needs ${neededBytes} bytes but this card has capacity for ${availableBytes}.`);
        this.name = "CardCapacityError";
        this.neededBytes = neededBytes;
        this.availableBytes = availableBytes;
    }

    /**
     * The most stages this card could hold. A recipe is 12 bytes of header and
     * trailer (XID, cup type, count, grind, ratio, checksum) plus 8 per stage.
     */
    maxStages(): number {
        return maxStagesForBytes(this.availableBytes);
    }
}

/** XID (7), cup type (1), stage count (1), grind (1), ratio (1), checksum (1). */
export const CARD_OVERHEAD_BYTES = 12;
/** Volume, temperature, pattern, agitation, pause, combined, RPM, flow rate. */
export const CARD_BYTES_PER_STAGE = 8;
