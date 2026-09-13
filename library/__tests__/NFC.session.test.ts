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
    NfcManager.start.mockReset();
    NfcManager.start.mockResolvedValue(undefined);
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

describe("cancellation versus teardown", () => {
    it("does not record a cancellation for a plain close", async () => {
        // `close()` is our own teardown -- it runs from every `finally` on the
        // way out of a read or write. Reading it as a Cancel is the whole bug:
        // it made a genuine read failure look like the user walking away, so
        // the error vanished. Teardown must leave `wasCancelled()` false.
        const nfc = new NFC();
        NfcManager.requestTechnology.mockResolvedValueOnce(undefined);
        await nfc.open();

        await nfc.close();

        expect(nfc.wasCancelled()).toBe(false);
    });

    it("records a cancellation when the user cancels", async () => {
        const nfc = new NFC();
        NfcManager.requestTechnology.mockResolvedValueOnce(undefined);
        await nfc.open();

        await nfc.cancel();

        expect(nfc.wasCancelled()).toBe(true);
        expect(nfc.getIsClosed()).toBe(true);
        expect(NfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    });

    it("treats a failed open as a cancellation, so an iOS sheet dismissal is silent", async () => {
        // The iOS system NFC sheet is Apple's, not ours: the user tapping its
        // Cancel button, or a scan timing out with no tag, rejects
        // `requestTechnology`. No card was produced and there is nothing to
        // report, so a failed open counts as a cancellation and stays silent.
        const nfc = new NFC();
        NfcManager.requestTechnology.mockRejectedValueOnce(new Error("no tag"));

        await expect(nfc.open()).rejects.toThrow("no tag");

        expect(nfc.wasCancelled()).toBe(true);
    });
});

describe("a session being cancelled before it opens", () => {
    it("does not start a request when Cancel arrives during init", async () => {
        // The overlay is up and cancellable while `init()` is still awaiting
        // `NfcManager.start()`. A Cancel then found `isClosed` true, returned
        // without doing anything, and `open()` went on to start a native
        // session behind an overlay that was already gone.
        const nfc = new NFC();

        let releaseStart!: () => void;
        NfcManager.start.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                releaseStart = resolve;
            })
        );

        const starting = nfc.init();
        await nfc.cancel();
        releaseStart();
        await starting;

        await expect(nfc.open()).rejects.toThrow();
        expect(NfcManager.requestTechnology).not.toHaveBeenCalled();
        expect(nfc.getIsClosed()).toBe(true);
    });

    it("forgets the cancellation when a new session is started", async () => {
        const nfc = new NFC();

        await nfc.init();
        await nfc.cancel();

        await nfc.init();
        NfcManager.requestTechnology.mockResolvedValueOnce(undefined);
        await nfc.open();

        expect(nfc.getIsClosed()).toBe(false);
        expect(nfc.wasCancelled()).toBe(false);
    });
});
