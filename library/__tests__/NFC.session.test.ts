/**
 * The session flag, which is the whole of what Cancel depends on.
 *
 * `requestTechnology` does not settle until a tag arrives or the user gives up,
 * so the interesting window is the one *during* that await — which is exactly
 * when the user is looking at the overlay with a Cancel button on it.
 */
import NFC from "@/library/NFC";

jest.mock("react-native-nfc-manager", () => ({
    __esModule: true,
    default:    {
        start:                   jest.fn(),
        requestTechnology:       jest.fn(),
        cancelTechnologyRequest: jest.fn()
    },
    NfcTech:    {Iso15693IOS: "Iso15693IOS", NfcV: "NfcV"}
}));

const NfcManager = jest.requireMock("react-native-nfc-manager").default;

/** A `requestTechnology` that hangs until the test lets it go. */
function pending() {
    let settle!: (value?: unknown) => void;
    let fail!: (reason?: unknown) => void;
    const promise = new Promise((resolve, reject) => {
        settle = resolve;
        fail = reject;
    });
    NfcManager.requestTechnology.mockReturnValueOnce(promise);
    return {settle, fail, promise};
}

beforeEach(() => {
    NfcManager.requestTechnology.mockReset();
    NfcManager.cancelTechnologyRequest.mockReset();
});

describe("a session being opened", () => {
    it("can be cancelled before the request resolves", async () => {
        const nfc = new NFC();
        const request = pending();

        const opening = nfc.open();
        // Not awaited: the request is still outstanding, which is the state the
        // user is in while the overlay is up.
        expect(nfc.getIsClosed()).toBe(false);

        await nfc.close();

        expect(NfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
        expect(nfc.getIsClosed()).toBe(true);

        request.fail(new Error("cancelled"));
        await expect(opening).rejects.toThrow();
    });

    it("is closed again when the request fails on its own", async () => {
        // A failed open has always left the session closed, and callers read
        // `getIsClosed()` to tell a user cancellation from a real fault.
        const nfc = new NFC();
        NfcManager.requestTechnology.mockRejectedValueOnce(new Error("no tag"));

        await expect(nfc.open()).rejects.toThrow("no tag");

        expect(nfc.getIsClosed()).toBe(true);
    });

    it("is open once the request resolves", async () => {
        const nfc = new NFC();
        NfcManager.requestTechnology.mockResolvedValueOnce(undefined);

        await nfc.open();

        expect(nfc.getIsClosed()).toBe(false);
    });

    it("does not cancel a session that was never opened", async () => {
        const nfc = new NFC();

        await nfc.close();

        expect(NfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
    });
});
