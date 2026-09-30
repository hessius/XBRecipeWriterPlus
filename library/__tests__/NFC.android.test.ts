/**
 * The Android transport, which had never been executed.
 *
 * `library/NFC.ts` carries two full implementations of the same job, and until
 * the suite grew an Android project only the iOS one had ever run. These tests
 * drive the Android branch against `test-utils/nfcV.ts`, a card that answers
 * raw ISO 15693 frames, and then check the two transports against each other:
 * the same card image, read on both, must come back byte for byte the same.
 *
 * None of this is a substitute for a genuine card on a real phone. It cannot
 * be: there is no way to emulate an ISO 15693 tag on Android. What it does is
 * make the frames the app builds a decided thing rather than an assumed one,
 * so the hardware session can be spent on what only hardware can answer.
 */
import {Platform} from "react-native";

import NFC from "@/library/NFC";
import {installCard, makeCard} from "@/test-utils/nfcV";

jest.mock("react-native-nfc-manager", () =>
    // Reached inside the factory rather than imported: jest hoists this above
    // the import list, so a module-scope binding is not in place yet.
    jest.requireActual("@/test-utils/nfcV").nfcManagerMock());

const NfcManager = jest.requireMock("react-native-nfc-manager").default;
const raw = NfcManager.nfcVHandler;
const noProgress = async () => undefined;

/** A card whose every byte differs from its neighbours, so a misread shows. */
const patterned = (blockCount: number) =>
    new Array(blockCount * 4).fill(0).map((_, i) => (i * 7 + 3) & 0xff);

const asAndroid = () => {
    Platform.OS = "android";
};

const original = Platform.OS;
afterEach(() => {
    Platform.OS = original;
});

describe("the Android transport", () => {
    it("asks for NfcV rather than the iOS technology", async () => {
        asAndroid();
        installCard(NfcManager, makeCard());

        await new NFC().open();

        expect(NfcManager.requestTechnology).toHaveBeenCalledWith("NfcV");
    });

    it("reads a card's size out of a Get System Information frame", async () => {
        asAndroid();
        const card = installCard(NfcManager, makeCard({blockCount: 40, blockSize: 4, afi: 2, dsfid: 5}));

        const info = await new NFC().getSystemInfo();

        expect(info).toEqual({afi: 2, dsfid: 5, blockCount: 40, blockSize: 4});
        // The tag reports the *last* block number and the block size less one,
        // so both have to be read with an offset. Getting that wrong would put
        // the write one block past the end of a genuine card.
        expect(card.commands).toEqual([0x2b]);
    });

    it("addresses every frame to the tag it can see", async () => {
        asAndroid();
        const card = installCard(NfcManager, makeCard());

        await new NFC().getSystemInfo();

        const frame = raw.transceive.mock.calls[0][0];
        expect(frame[0]).toBe(0x22);
        expect(frame.slice(2, 2 + card.uid.length)).toEqual(card.uid);
    });

    it("cannot size a card it has no tag for", async () => {
        asAndroid();
        installCard(NfcManager, makeCard());
        NfcManager.getTag.mockResolvedValue(null);

        expect(await new NFC().getSystemInfo()).toBeNull();
        expect(raw.transceive).not.toHaveBeenCalled();
    });

    it("reads the whole card in one Read Multiple Blocks", async () => {
        asAndroid();
        const bytes = patterned(32);
        const card = installCard(NfcManager, makeCard({bytes}));

        const data = await new NFC().readMultipleBlocks(34, 0, 32);

        expect(data).toEqual(bytes);
        expect(card.commands).toEqual([0x23]);
    });

    it("counts blocks from zero in the frame it sends", async () => {
        asAndroid();
        installCard(NfcManager, makeCard());

        await new NFC().readMultipleBlocks(34, 4, 8);

        const frame = raw.transceive.mock.calls[0][0];
        // Block number, then *one less* than the count: the tag reads it as the
        // number of blocks after the first. Sending 8 would read nine blocks.
        expect(frame.slice(-2)).toEqual([4, 7]);
    });

    it("reads the card a block at a time when it will not answer 0x23", async () => {
        asAndroid();
        const bytes = patterned(32);
        const card = installCard(NfcManager, makeCard({bytes, readMultiple: "no"}));

        const data = await new NFC().readMultipleBlocks(34, 0, 32);

        expect(data).toEqual(bytes);
        expect(card.commands[0]).toBe(0x23);
        expect(card.commands.slice(1)).toEqual(new Array(32).fill(0x20));
    });

    it("falls back when the controller refuses the frame outright", async () => {
        asAndroid();
        // A controller whose transceive buffer is smaller than the reply
        // rejects rather than answering with a status byte. Before this was
        // handled the rejection escaped the read and the card looked unreadable,
        // which is the failure a 40-block card is most likely to produce.
        const bytes = patterned(40);
        const card = installCard(NfcManager, makeCard({blockCount: 40, bytes, readMultiple: "throws"}));

        const data = await new NFC().readMultipleBlocks(34, 0, 40);

        expect(data).toEqual(bytes);
        expect(card.commands.slice(1)).toEqual(new Array(40).fill(0x20));
    });

    it("gives up on a block that will not read rather than returning a hole", async () => {
        asAndroid();
        installCard(NfcManager, makeCard({readMultiple: "no"}));
        raw.transceive.mockImplementation(async (frame: number[]) => {
            if (frame[1] === 0x23) {
                return [0x01];
            }
            // Block 3 answers with an error status; the rest read cleanly.
            return frame[frame.length - 1] === 3 ? [0x0f] : [0x00, 0, 0, 0, 0];
        });

        await expect(new NFC().readMultipleBlocks(34, 0, 8))
            .rejects.toThrow(/block 3/);
    });

    it("writes four bytes at a time, starting past the signature", async () => {
        asAndroid();
        const card = installCard(NfcManager, makeCard());

        await new NFC().writeCard(new Array(96).fill(1), noProgress);

        expect(card.writes.map(w => w.block)).toEqual(
            new Array(24).fill(0).map((_, i) => i + 8));
        expect(card.writes.every(w => w.data.length === 4)).toBe(true);
    });

    it("leaves the signature the card came with untouched", async () => {
        asAndroid();
        // The 32 bytes xBloom derives from the serial cannot be recomputed, so
        // a write that reached them would ruin a genuine card for good.
        const signature = patterned(8);
        const card = installCard(NfcManager, makeCard({bytes: signature}));

        await new NFC().writeCard(new Array(96).fill(0xaa), noProgress);

        expect(card.bytes.slice(0, 32)).toEqual(signature);
    });

    it("hands the hash back exactly as the card gave it", async () => {
        asAndroid();
        const signature = patterned(8);
        installCard(NfcManager, makeCard({bytes: signature}));

        expect(await new NFC().readHash()).toEqual(signature);
    });
});

describe("the two transports against the same card", () => {
    const bytes = patterned(32);

    /** Reads the same card image through whichever transport is in force. */
    const readOn = async (os: "ios" | "android", options = {}) => {
        Platform.OS = os;
        installCard(NfcManager, makeCard({bytes, ...options}));
        const nfc = new NFC();
        const data = await nfc.readCard(noProgress);
        return {data, info: nfc.getLastSystemInfo()};
    };

    it("agree about the bytes", async () => {
        const ios = await readOn("ios");
        const android = await readOn("android");

        expect(android.data).toEqual(ios.data);
        expect(android.data).toEqual(bytes);
    });

    it("agree about the size", async () => {
        const ios = await readOn("ios");
        const android = await readOn("android");

        expect(android.info).toEqual(ios.info);
    });

    it("agree even when the card has to be read a block at a time", async () => {
        const ios = await readOn("ios");
        const android = await readOn("android", {readMultiple: "no"});

        expect(android.data).toEqual(ios.data);
    });

    it("agree about what they leave on a card after a write", async () => {
        const payload = new Array(96).fill(0).map((_, i) => (i * 5 + 11) & 0xff);

        Platform.OS = "ios";
        const onIos = installCard(NfcManager, makeCard({bytes}));
        await new NFC().writeCard(payload, noProgress);

        Platform.OS = "android";
        const onAndroid = installCard(NfcManager, makeCard({bytes}));
        await new NFC().writeCard(payload, noProgress);

        expect(onAndroid.bytes).toEqual(onIos.bytes);
        expect(onAndroid.writes).toEqual(onIos.writes);
    });
});
