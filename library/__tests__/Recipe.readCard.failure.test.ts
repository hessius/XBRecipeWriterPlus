import Recipe from "@/library/Recipe";
import type NFC from "@/library/NFC";
import type {NfcSystemInfo} from "@/library/NFC";

/**
 * A transport fake that models the two facts `Recipe.readCard` actually leans
 * on: a session is closed once teardown has run, and a session was only
 * *cancelled* if the user asked for it. `Recipe.readCard` closes the tag
 * *before* it parses (so the raw bytes reach the diagnostic before a parse can
 * crash), which is why a parse failure must be told apart from a Cancel by
 * `wasCancelled()` and not by `getIsClosed()` -- the latter is always true by
 * then.
 */
function statefulNfc(opts: {
    data: number[] | null;
    systemInfo?: NfcSystemInfo | null;
    openThrows?: Error;
    readThrows?: Error;
    cancelledOnOpenFailure?: boolean;
}): NFC {
    let isClosed = true;
    let cancelled = false;
    const systemInfo = opts.systemInfo ?? {afi: 0, dsfid: 0, blockCount: 60, blockSize: 4};

    const nfc = {
        init: jest.fn().mockResolvedValue(undefined),
        open: jest.fn(async () => {
            if (opts.openThrows) {
                isClosed = true;
                // A real failed open marks the session cancelled, which is what
                // keeps an iOS system-sheet dismissal silent.
                if (opts.cancelledOnOpenFailure) {
                    cancelled = true;
                }
                throw opts.openThrows;
            }
            isClosed = false;
        }),
        close: jest.fn(async () => {
            isClosed = true;
        }),
        cancel: jest.fn(async () => {
            cancelled = true;
            isClosed = true;
        }),
        getUID: jest.fn().mockResolvedValue([0x04, 0xa1]),
        readCard: jest.fn(async () => {
            if (opts.readThrows) {
                throw opts.readThrows;
            }
            return opts.data;
        }),
        getIsClosed: jest.fn(() => isClosed),
        wasCancelled: jest.fn(() => cancelled),
        getLastSystemInfo: jest.fn(() => systemInfo)
    };
    return nfc as unknown as NFC;
}

/** Bytes a genuine card would carry, so `parseData` does not throw on them. */
function validCardBytes(): number[] {
    return new Recipe().getData(new Array(32).fill(0));
}

const noProgress = async () => undefined;

describe("Recipe.readCard failure reporting", () => {
    it("rethrows when parseData cannot handle the card", async () => {
        // The user's exact bug: a card whose bytes `parseData` chokes on used to
        // be swallowed, because the tag is closed before the parse runs and the
        // old guard asked `getIsClosed()`, which is always true by then. The
        // failure must now reach the caller.
        const nfc = statefulNfc({data: validCardBytes()});
        const recipe = new Recipe();
        jest.spyOn(
            recipe as unknown as {parseData: (data: number[]) => void},
            "parseData"
        ).mockImplementation(() => {
            throw new Error("bypass card");
        });

        await expect(recipe.readCard(nfc, noProgress)).rejects.toThrow(/bypass card/);
    });

    it("rethrows when the card yields no data", async () => {
        const nfc = statefulNfc({data: null});

        await expect(new Recipe().readCard(nfc, noProgress)).rejects.toThrow(/No data read/);
    });

    it("stays silent when the user cancels our overlay", async () => {
        // A Cancel through our overlay routes to `cancel()`, which aborts the
        // in-flight read: the transceive rejects, but `wasCancelled()` is true,
        // so `readCard` swallows it and returns false without a word.
        const nfc = statefulNfc({data: null, readThrows: new Error("aborted")});
        await nfc.cancel();

        await expect(new Recipe().readCard(nfc, noProgress)).resolves.toBe(false);
    });

    it("stays silent when the iOS system sheet is dismissed", async () => {
        // A failed open marks the session cancelled, so the throw out of
        // `open()` is read as the user walking away and nothing is reported.
        const nfc = statefulNfc({
            data: validCardBytes(),
            openThrows: new Error("no tag"),
            cancelledOnOpenFailure: true
        });

        await expect(new Recipe().readCard(nfc, noProgress)).resolves.toBe(false);
    });
});
