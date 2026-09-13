import Recipe from "@/library/Recipe";
import type NFC from "@/library/NFC";
import type {NfcSystemInfo} from "@/library/NFC";
import type {CardCapture} from "@/library/cardDiagnostics";

/**
 * A stand-in for the real transport. `Recipe.readCard` only ever calls these
 * methods on the NFC it is handed, so a fake keeps this test off the native
 * module while exercising the ordering the sink depends on.
 */
function fakeNfc(data: number[], systemInfo: NfcSystemInfo | null): NFC {
    const nfc = {
        init: jest.fn().mockResolvedValue(undefined),
        open: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        getUID: jest.fn().mockResolvedValue([0x04, 0xa1]),
        readCard: jest.fn().mockResolvedValue(data),
        getIsClosed: jest.fn().mockReturnValue(false),
        getLastSystemInfo: jest.fn().mockReturnValue(systemInfo)
    };
    return nfc as unknown as NFC;
}

/** Bytes a genuine card would carry, so `parseData` does not throw on them. */
function validCardBytes(): number[] {
    return new Recipe().getData(new Array(32).fill(0));
}

const noProgress = async () => undefined;
const sysInfo: NfcSystemInfo = {afi: 0, dsfid: 0, blockCount: 60, blockSize: 4};

describe("Recipe.readCard raw-capture sink", () => {
    it("hands the raw bytes and system info to the sink", async () => {
        const data = validCardBytes();
        const nfc = fakeNfc(data, sysInfo);
        let captured: CardCapture | null = null;

        await new Recipe().readCard(nfc, noProgress, (c) => {
            captured = c;
        });

        expect(captured).not.toBeNull();
        expect(captured!.data).toEqual(data);
        expect(captured!.systemInfo).toEqual(sysInfo);
        expect(captured!.uid).toEqual([0x04, 0xa1]);
        expect(typeof captured!.at).toBe("string");
    });

    it("fires the sink before parseData runs", async () => {
        // The reason the sink exists: `parseData` is the suspect for the
        // bypass-card crash, so the evidence must be persisted first.
        const nfc = fakeNfc(validCardBytes(), sysInfo);
        const recipe = new Recipe();
        const parseSpy = jest.spyOn(recipe as unknown as {parseData: (data: number[]) => void}, "parseData");
        let parseCallsAtSink = -1;

        await recipe.readCard(nfc, noProgress, () => {
            parseCallsAtSink = parseSpy.mock.calls.length;
        });

        expect(parseCallsAtSink).toBe(0);
        expect(parseSpy).toHaveBeenCalledTimes(1);
    });

    it("still reads the card when the sink throws", async () => {
        // A diagnostic is never worth a lost card read.
        const nfc = fakeNfc(validCardBytes(), sysInfo);
        const recipe = new Recipe();
        const parseSpy = jest.spyOn(recipe as unknown as {parseData: (data: number[]) => void}, "parseData");

        const ok = await recipe.readCard(nfc, noProgress, () => {
            throw new Error("sink blew up");
        });

        expect(ok).toBe(true);
        expect(parseSpy).toHaveBeenCalledTimes(1);
    });

    it("reads without a sink at all", async () => {
        const nfc = fakeNfc(validCardBytes(), sysInfo);
        expect(await new Recipe().readCard(nfc, noProgress)).toBe(true);
    });
});
