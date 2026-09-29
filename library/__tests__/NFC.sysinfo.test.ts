/**
 * `getLastSystemInfo`, the seam the card-read capture uses to report a card's
 * true capacity without interrogating a tag that is already closed.
 *
 * `readCard` fetches the system info once, while the tag is open; it remembers
 * it so the capture can read it afterwards, and clears it at the start of every
 * read so a failed read cannot leave the previous card's numbers behind.
 *
 * Run on both transports. Mocking `iso15693HandlerIOS` alone made this suite
 * pass on Android for the wrong reason: the Android branch found no handler,
 * the read returned null, and "remembers the system info" was never tested.
 */
import {Platform} from "react-native";

import NFC from "@/library/NFC";
import {installCard, makeCard} from "@/test-utils/nfcV";

jest.mock("react-native-nfc-manager", () =>
    jest.requireActual("@/test-utils/nfcV").nfcManagerMock());

const NfcManager = jest.requireMock("react-native-nfc-manager").default;
const noProgress = async () => undefined;
const sysInfoA = {afi: 0, dsfid: 0, blockCount: 60, blockSize: 4};

const original = Platform.OS;
afterEach(() => {
    Platform.OS = original;
});

describe.each(["ios", "android"] as const)("NFC.getLastSystemInfo on %s", os => {
    beforeEach(() => {
        Platform.OS = os;
        installCard(NfcManager, makeCard({blockCount: 60}));
    });

    it("is null before any read", () => {
        expect(new NFC().getLastSystemInfo()).toBeNull();
    });

    it("remembers the system info from a successful read", async () => {
        const nfc = new NFC();

        await nfc.readCard(noProgress);

        expect(nfc.getLastSystemInfo()).toEqual(sysInfoA);
    });

    it("does not leave a previous card's system info behind after a failed read", async () => {
        const nfc = new NFC();
        await nfc.readCard(noProgress);
        expect(nfc.getLastSystemInfo()).toEqual(sysInfoA);

        // The next read fails before it can learn anything about the new card.
        installCard(NfcManager, makeCard({blockCount: 60, systemInfoFails: true}));
        await nfc.readCard(noProgress);

        // Cleared at the start of the read, so the stale numbers cannot be
        // reported as if they belonged to the card that was just waved.
        expect(nfc.getLastSystemInfo()).toBeNull();
    });
});
