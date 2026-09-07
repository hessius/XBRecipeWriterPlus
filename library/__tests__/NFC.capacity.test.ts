/**
 * The capacity guard on `NFC.writeCard`.
 *
 * Card capacity is not a constant: genuine cards have been read at both 128 and
 * 160 bytes, so the only authority on whether a recipe fits is the card being
 * held against the phone. `writeCard` asks the tag for its size and must refuse
 * anything larger *before* it writes a single block — a partial write to a
 * genuine card is not trivially recoverable, and the 32-byte signature that makes
 * the card work cannot be regenerated if we trample it.
 */
import NFC from "@/library/NFC";

jest.mock("react-native-nfc-manager", () => ({
    __esModule: true,
    default: {
        start: jest.fn(),
        requestTechnology: jest.fn(),
        cancelTechnologyRequest: jest.fn(),
        getTag: jest.fn(),
        iso15693HandlerIOS: {
            getSystemInfo: jest.fn(),
            readMultipleBlocks: jest.fn(),
            writeSingleBlock: jest.fn()
        }
    },
    NfcTech: {Iso15693IOS: "Iso15693IOS", NfcV: "NfcV"}
}));

const NfcManager = jest.requireMock("react-native-nfc-manager").default;
const iso = NfcManager.iso15693HandlerIOS;
const noProgress = async () => undefined;

/** Mirrors real use: `Recipe.writeCard` always opens a session before writing. */
async function openNfc(): Promise<NFC> {
    const nfc = new NFC();
    await nfc.open();
    return nfc;
}

/** The smaller of the two genuine cards: 128 bytes total, 96 usable after the hash. */
const smallCard = {afi: 0, dsfid: 0, blockCount: 32, blockSize: 4};

beforeEach(() => {
    iso.getSystemInfo.mockReset();
    iso.writeSingleBlock.mockReset();
    iso.writeSingleBlock.mockResolvedValue(undefined);
});

describe("NFC.writeCard capacity guard", () => {
    it("writes a payload that fits, padded out to the card's capacity", async () => {
        iso.getSystemInfo.mockResolvedValue(smallCard);

        await (await openNfc()).writeCard(new Array(44).fill(1), noProgress);

        // 96 usable bytes / 4 per block = 24 blocks, starting at block 8.
        expect(iso.writeSingleBlock).toHaveBeenCalledTimes(24);
        expect(iso.writeSingleBlock.mock.calls[0][0].blockNumber).toBe(8);
        expect(iso.writeSingleBlock.mock.calls[23][0].blockNumber).toBe(31);
    });

    it("refuses a payload larger than the card without writing anything", async () => {
        iso.getSystemInfo.mockResolvedValue(smallCard);

        // 13 pours is 116 bytes: fits the 160-byte card, overruns this 128-byte one.
        await expect((await openNfc()).writeCard(new Array(116).fill(1), noProgress))
            .rejects.toThrow(/does not fit|too large|capacity/i);

        expect(iso.writeSingleBlock).not.toHaveBeenCalled();
    });

    it("names both sizes so the message can explain the refusal", async () => {
        iso.getSystemInfo.mockResolvedValue(smallCard);

        await expect((await openNfc()).writeCard(new Array(116).fill(1), noProgress))
            .rejects.toThrow(/116[\s\S]*96|96[\s\S]*116/);
    });

    it("refuses rather than silently doing nothing when the card cannot be sized", async () => {
        // A null system info means the tag never answered. Writing blind would be
        // reckless, but returning quietly is worse: the user sees a success flow
        // and walks away with an unwritten card.
        iso.getSystemInfo.mockResolvedValue(null);

        await expect((await openNfc()).writeCard(new Array(44).fill(1), noProgress))
            .rejects.toThrow();

        expect(iso.writeSingleBlock).not.toHaveBeenCalled();
    });

    it("writes a payload that exactly fills the card", async () => {
        iso.getSystemInfo.mockResolvedValue(smallCard);

        await (await openNfc()).writeCard(new Array(96).fill(1), noProgress);

        expect(iso.writeSingleBlock).toHaveBeenCalledTimes(24);
    });

    it("surfaces a refusal even when the session is already closed", async () => {
        // The catch-all treats a throw from a closed session as the user having
        // cancelled, which is right for tag faults and wrong for our own refusals:
        // swallowing one would restore the silent no-op this guard exists to stop.
        iso.getSystemInfo.mockResolvedValue(smallCard);
        const nfc = new NFC();
        expect(nfc.getIsClosed()).toBe(true);

        await expect(nfc.writeCard(new Array(116).fill(1), noProgress)).rejects.toThrow();

        expect(iso.writeSingleBlock).not.toHaveBeenCalled();
    });
});
