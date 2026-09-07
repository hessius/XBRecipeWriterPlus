/**
 * Errors raised when we refuse to write a card, kept apart from `NFC` itself.
 *
 * `Recipe` only ever referenced `NFC` as a type, so TypeScript elided the import
 * and the model stayed free of the native NFC package. Importing a runtime value
 * from `NFC` would drag `react-native-nfc-manager` into every consumer — and into
 * every test that never goes near a card. These live here so both sides can use
 * them without that cost.
 */

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
        return Math.floor((this.availableBytes - CARD_OVERHEAD_BYTES) / CARD_BYTES_PER_STAGE);
    }
}

/** XID (7), cup type (1), stage count (1), grind (1), ratio (1), checksum (1). */
export const CARD_OVERHEAD_BYTES = 12;
/** Volume, temperature, pattern, agitation, pause, combined, RPM, flow rate. */
export const CARD_BYTES_PER_STAGE = 8;
