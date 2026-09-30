/**
 * The capacity guard on `NFC.writeCard`.
 *
 * Card capacity is not a constant: genuine cards have been read at both 128 and
 * 160 bytes, so the only authority on whether a recipe fits is the card being
 * held against the phone. `writeCard` asks the tag for its size and must refuse
 * anything larger *before* it writes a single block -- a partial write to a
 * genuine card is not trivially recoverable, and the 32-byte signature that makes
 * the card work cannot be regenerated if we trample it.
 *
 * Run on both transports, because the guard is worth exactly as much as the
 * transport underneath it honours. Asserting on the card rather than on a
 * handler's arguments is what lets one set of tests cover both: iOS passes an
 * object to `writeSingleBlock`, Android builds a 0x21 frame, and the only thing
 * that matters is which blocks changed.
 */
import {Platform} from "react-native";

import NFC from "@/library/NFC";
import {installCard, makeCard, type FakeCard} from "@/test-utils/nfcV";

jest.mock("react-native-nfc-manager", () =>
    jest.requireActual("@/test-utils/nfcV").nfcManagerMock());

const NfcManager = jest.requireMock("react-native-nfc-manager").default;
const noProgress = async () => undefined;

/** Mirrors real use: `Recipe.writeCard` always opens a session before writing. */
async function openNfc(): Promise<NFC> {
    const nfc = new NFC();
    await nfc.open();
    return nfc;
}

const original = Platform.OS;
afterEach(() => {
    Platform.OS = original;
});

describe.each(["ios", "android"] as const)("NFC.writeCard capacity guard on %s", os => {
    /** The smaller of the two genuine cards: 128 bytes total, 96 usable after the hash. */
    let card: FakeCard;

    beforeEach(() => {
        Platform.OS = os;
        card = installCard(NfcManager, makeCard({blockCount: 32, blockSize: 4}));
    });

    it("writes a payload that fits, padded out to the card's capacity", async () => {
        await (await openNfc()).writeCard(new Array(44).fill(1), noProgress);

        // 96 usable bytes / 4 per block = 24 blocks, starting at block 8.
        expect(card.writes).toHaveLength(24);
        expect(card.writes[0].block).toBe(8);
        expect(card.writes[23].block).toBe(31);
    });

    it("refuses a payload larger than the card without writing anything", async () => {
        // 13 pours is 116 bytes: fits the 160-byte card, overruns this 128-byte one.
        await expect((await openNfc()).writeCard(new Array(116).fill(1), noProgress))
            .rejects.toThrow(/does not fit|too large|capacity/i);

        expect(card.writes).toHaveLength(0);
    });

    it("names both sizes so the message can explain the refusal", async () => {
        await expect((await openNfc()).writeCard(new Array(116).fill(1), noProgress))
            .rejects.toThrow(/116[\s\S]*96|96[\s\S]*116/);
    });

    it("refuses rather than silently doing nothing when the card cannot be sized", async () => {
        // A tag that never answers means we do not know how big it is. Writing
        // blind would be reckless, but returning quietly is worse: the user sees
        // a success flow and walks away with an unwritten card.
        card = installCard(NfcManager, makeCard({blockCount: 32, systemInfoFails: true}));

        await expect((await openNfc()).writeCard(new Array(44).fill(1), noProgress))
            .rejects.toThrow();

        expect(card.writes).toHaveLength(0);
    });

    it("writes a payload that exactly fills the card", async () => {
        await (await openNfc()).writeCard(new Array(96).fill(1), noProgress);

        expect(card.writes).toHaveLength(24);
    });

    it("surfaces a refusal even when the session is already closed", async () => {
        // The catch-all treats a throw from a closed session as the user having
        // cancelled, which is right for tag faults and wrong for our own refusals:
        // swallowing one would restore the silent no-op this guard exists to stop.
        const nfc = new NFC();
        expect(nfc.getIsClosed()).toBe(true);

        await expect(nfc.writeCard(new Array(116).fill(1), noProgress)).rejects.toThrow();

        expect(card.writes).toHaveLength(0);
    });
});
