/**
 * `getLastSystemInfo`, the seam the card-read capture uses to report a card's
 * true capacity without interrogating a tag that is already closed.
 *
 * `readCard` fetches the system info once, while the tag is open; it remembers
 * it so the capture can read it afterwards, and clears it at the start of every
 * read so a failed read cannot leave the previous card's numbers behind.
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
            readMultipleBlocks: jest.fn()
        }
    },
    NfcTech: {Iso15693IOS: "Iso15693IOS", NfcV: "NfcV"}
}));

const NfcManager = jest.requireMock("react-native-nfc-manager").default;
const iso = NfcManager.iso15693HandlerIOS;
const noProgress = async () => undefined;
const sysInfoA = {afi: 0, dsfid: 0, blockCount: 60, blockSize: 4};

beforeEach(() => {
    NfcManager.getTag.mockReset();
    iso.getSystemInfo.mockReset();
    iso.readMultipleBlocks.mockReset();
});

describe("NFC.getLastSystemInfo", () => {
    it("is null before any read", () => {
        expect(new NFC().getLastSystemInfo()).toBeNull();
    });

    it("remembers the system info from a successful read", async () => {
        const nfc = new NFC();
        iso.getSystemInfo.mockResolvedValue(sysInfoA);
        NfcManager.getTag.mockResolvedValue({id: "04a1"});
        iso.readMultipleBlocks.mockResolvedValue([[0, 1, 2, 3]]);

        await nfc.readCard(noProgress);

        expect(nfc.getLastSystemInfo()).toEqual(sysInfoA);
    });

    it("does not leave a previous card's system info behind after a failed read", async () => {
        const nfc = new NFC();
        // A good read first.
        iso.getSystemInfo.mockResolvedValueOnce(sysInfoA);
        NfcManager.getTag.mockResolvedValueOnce({id: "04a1"});
        iso.readMultipleBlocks.mockResolvedValueOnce([[0, 1, 2, 3]]);
        await nfc.readCard(noProgress);
        expect(nfc.getLastSystemInfo()).toEqual(sysInfoA);

        // The next read fails before it can learn anything about the new card.
        iso.getSystemInfo.mockRejectedValueOnce(new Error("tag gone"));
        await nfc.readCard(noProgress);

        // Cleared at the start of the read, so the stale numbers cannot be
        // reported as if they belonged to the card that was just waved.
        expect(nfc.getLastSystemInfo()).toBeNull();
    });
});
