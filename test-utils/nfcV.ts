/**
 * A stand-in for a genuine xBloom card, answering both transports.
 *
 * `library/NFC.ts` has two complete implementations of the same job: iOS talks
 * to `iso15693HandlerIOS`, which takes objects and returns blocks, and Android
 * assembles raw ISO 15693 command frames and hands them to
 * `nfcVHandler.transceive`. Until the test suite grew an Android project, only
 * the first of those had ever run, and a suite that mocks `iso15693HandlerIOS`
 * alone passes on Android for the wrong reason: the Android branch reaches a
 * handler that is not there, the read returns null, and the assertion under
 * test is never reached.
 *
 * So the double is a card rather than a handler. One image of memory answers
 * both transports, which means a test written once can be run on both projects
 * and will fail if the two transports ever disagree about the same card. That
 * disagreement is the thing worth catching: nobody here has an Android phone to
 * notice it on.
 *
 * Command set, from ISO 15693 and what `NFC.ts` actually sends:
 *   0x2B  Get System Information
 *   0x23  Read Multiple Blocks
 *   0x20  Read Single Block
 *   0x21  Write Single Block
 * Every request is addressed (flag 0x22), so the eight UID bytes follow the
 * command byte. A response leads with a status byte: 0x00 is success.
 */

/** Which of the two transports a double should answer as. */
export type CardTransport = "ios" | "android";

export type FakeCardOptions = {
    /** Blocks on the card. Genuine cards have been seen at 32 and 40. */
    blockCount?: number;
    /** Bytes per block. Four on every card seen so far. */
    blockSize?: number;
    uid?: number[];
    afi?: number;
    dsfid?: number;
    /** The card's starting contents. Padded with zeroes, truncated if too long. */
    bytes?: number[];
    /**
     * Whether the card honours 0x23 Read Multiple Blocks.
     *
     * Not every ISO 15693 tag does, which is why `NFC.readMultipleBlocks` has a
     * 0x20 loop behind it. "no" makes the card answer 0x23 with a refusal
     * status; "throws" makes the transceive reject, which is what an Android
     * controller does when the reply would not fit its buffer.
     */
    readMultiple?: "yes" | "no" | "throws";
    /** Make Get System Information fail, as a tag that has left the field does. */
    systemInfoFails?: boolean;
};

export type FakeCard = {
    uid: number[];
    blockCount: number;
    blockSize: number;
    afi: number;
    dsfid: number;
    /** The card's memory, as one flat byte array. Reads and writes go here. */
    bytes: number[];
    /** Every block write in the order it was made, for both transports. */
    writes: {block: number; data: number[]}[];
    /** Every command byte the Android transport sent, in order. */
    commands: number[];
    /** The tag object `NfcManager.getTag` should resolve to. */
    tag: {id: string};
};

/** The ISO 15693 status byte meaning "done". */
const OK = 0x00;

export function makeCard(options: FakeCardOptions = {}): FakeCard & FakeCardOptions {
    const blockCount = options.blockCount ?? 32;
    const blockSize = options.blockSize ?? 4;
    const uid = options.uid ?? [0xe0, 0x04, 0x01, 0x50, 0x8a, 0x2b, 0x1c, 0x77];
    const bytes = new Array(blockCount * blockSize).fill(0);
    (options.bytes ?? []).slice(0, bytes.length).forEach((b, i) => (bytes[i] = b));

    return {
        ...options,
        uid,
        blockCount,
        blockSize,
        afi: options.afi ?? 0,
        dsfid: options.dsfid ?? 0,
        bytes,
        writes: [],
        commands: [],
        // `NFC.getUID` splits this into byte pairs, so it must be lower-case
        // hex with no separators, exactly as react-native-nfc-manager reports.
        tag: {id: uid.map(b => b.toString(16).padStart(2, "0")).join("")}
    };
}

function readBytes(card: FakeCard, block: number, count: number): number[] {
    return card.bytes.slice(block * card.blockSize, (block + count) * card.blockSize);
}

function writeBlock(card: FakeCard, block: number, data: number[]) {
    card.writes.push({block, data: [...data]});
    data.forEach((b, i) => (card.bytes[block * card.blockSize + i] = b));
}

/**
 * The shape a `jest.mock("react-native-nfc-manager")` factory should return.
 *
 * Both handlers are always present, because the module they stand in for always
 * has both. Which one a test exercises is decided by `Platform.OS`, which is
 * the decision the code under test is making.
 */
export function nfcManagerMock() {
    const iso15693HandlerIOS = {
        getSystemInfo: jest.fn(),
        readMultipleBlocks: jest.fn(),
        writeSingleBlock: jest.fn()
    };
    const nfcVHandler = {transceive: jest.fn()};
    return {
        __esModule: true,
        default: {
            start: jest.fn(),
            requestTechnology: jest.fn(),
            cancelTechnologyRequest: jest.fn(),
            setAlertMessageIOS: jest.fn(),
            getTag: jest.fn(),
            iso15693HandlerIOS,
            nfcVHandler
        },
        NfcTech: {Iso15693IOS: "Iso15693IOS", NfcV: "NfcV"}
    };
}

type MockedManager = ReturnType<typeof nfcManagerMock>["default"];

/**
 * Point an already-mocked NfcManager at a card, on both transports.
 *
 * Resets the mocks first, so a test can install a second card without the
 * first one's queued answers leaking into it.
 */
export function installCard(NfcManager: MockedManager, card: FakeCard & FakeCardOptions) {
    const iso = NfcManager.iso15693HandlerIOS;
    const raw = NfcManager.nfcVHandler;

    NfcManager.getTag.mockReset();
    iso.getSystemInfo.mockReset();
    iso.readMultipleBlocks.mockReset();
    iso.writeSingleBlock.mockReset();
    raw.transceive.mockReset();

    NfcManager.getTag.mockImplementation(async () => card.tag);

    iso.getSystemInfo.mockImplementation(async () => {
        if (card.systemInfoFails) {
            throw new Error("tag gone");
        }
        return {
            afi: card.afi,
            dsfid: card.dsfid,
            blockCount: card.blockCount,
            blockSize: card.blockSize
        };
    });

    // The iOS handler returns blocks, not bytes; `readMultipleBlocks` flattens
    // them. Returning a flat array here would let a flattening bug pass.
    iso.readMultipleBlocks.mockImplementation(async ({blockNumber, blockCount}) => {
        const out: number[][] = [];
        for (let i = 0; i < blockCount; i++) {
            out.push(readBytes(card, blockNumber + i, 1));
        }
        return out;
    });

    iso.writeSingleBlock.mockImplementation(async ({blockNumber, dataBlock}) => {
        writeBlock(card, blockNumber, dataBlock);
    });

    raw.transceive.mockImplementation(async (frame: number[]) => {
        const command = frame[1];
        card.commands.push(command);
        // Flag byte, command byte, then the eight addressing UID bytes.
        const rest = frame.slice(2 + card.uid.length);

        if (command === 0x2b) {
            if (card.systemInfoFails) {
                throw new Error("tag gone");
            }
            // Status, info flags, eight UID bytes, then DSFID, AFI, the last
            // block number and the block size less one. `NFC.getSystemInfo`
            // reads indices 10 through 13 and adds one back to the last two.
            return [
                OK, 0x0f,
                ...card.uid,
                card.dsfid, card.afi,
                card.blockCount - 1, card.blockSize - 1
            ];
        }

        if (command === 0x23) {
            if (card.readMultiple === "throws") {
                throw new Error("Transceive failed");
            }
            if (card.readMultiple === "no") {
                // A refusal, not a throw: status 0x01 with no payload.
                return [0x01];
            }
            const [block, lastOffset] = rest;
            return [OK, ...readBytes(card, block, lastOffset + 1)];
        }

        if (command === 0x20) {
            return [OK, ...readBytes(card, rest[0], 1)];
        }

        if (command === 0x21) {
            writeBlock(card, rest[0], rest.slice(1));
            return [OK];
        }

        throw new Error(`Unexpected command 0x${command.toString(16)}`);
    });

    return card;
}
