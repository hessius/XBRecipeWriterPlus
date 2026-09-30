/**
 * Whether this phone can read a card at all.
 *
 * The clearest iOS assumption in the codebase was that it always can. A
 * supported iPhone always has NFC and the user cannot switch it off, so the app
 * never asked. On Android both halves of that are false, and the first signal
 * the user got was an opaque failure at `requestTechnology` well after the
 * ceremony had opened.
 */
import {Platform} from "react-native";

import {checkNfcAvailability, openNfcSettings} from "@/library/NFC";

jest.mock("react-native-nfc-manager", () => ({
    __esModule: true,
    default: {
        isSupported: jest.fn(),
        isEnabled: jest.fn(),
        goToNfcSetting: jest.fn()
    },
    NfcTech: {Iso15693IOS: "Iso15693IOS", NfcV: "NfcV"}
}));

const NfcManager = jest.requireMock("react-native-nfc-manager").default;

const original = Platform.OS;
beforeEach(() => {
    NfcManager.isSupported.mockReset().mockResolvedValue(true);
    NfcManager.isEnabled.mockReset().mockResolvedValue(true);
    NfcManager.goToNfcSetting.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
    Platform.OS = original;
});

describe("checkNfcAvailability on Android", () => {
    beforeEach(() => {
        Platform.OS = "android";
    });

    it("says a phone with a controller and the switch on is ready", async () => {
        expect(await checkNfcAvailability()).toBe("ready");
    });

    it("says a phone with no controller is unsupported", async () => {
        NfcManager.isSupported.mockResolvedValue(false);

        expect(await checkNfcAvailability()).toBe("unsupported");
    });

    it("does not ask whether a radio that is not there is switched on", async () => {
        NfcManager.isSupported.mockResolvedValue(false);

        await checkNfcAvailability();

        expect(NfcManager.isEnabled).not.toHaveBeenCalled();
    });

    it("tells a switched-off radio apart from a missing one", async () => {
        NfcManager.isEnabled.mockResolvedValue(false);

        expect(await checkNfcAvailability()).toBe("disabled");
    });

    it("treats a probe that throws as no radio rather than crashing the screen", async () => {
        NfcManager.isSupported.mockRejectedValue(new Error("no NFC service"));

        expect(await checkNfcAvailability()).toBe("unsupported");
    });

    it("treats a throw from the second probe the same way", async () => {
        NfcManager.isEnabled.mockRejectedValue(new Error("no NFC service"));

        expect(await checkNfcAvailability()).toBe("unsupported");
    });
});

describe("checkNfcAvailability on iOS", () => {
    beforeEach(() => {
        Platform.OS = "ios";
    });

    it("is ready whenever the phone supports NFC", async () => {
        expect(await checkNfcAvailability()).toBe("ready");
    });

    it("never reports disabled, because there is no switch to send anyone to", async () => {
        // Core NFC has no equivalent of the Android toggle. If this ever starts
        // answering "disabled", an iPhone user is sent looking for a control
        // that does not exist.
        NfcManager.isEnabled.mockResolvedValue(false);

        expect(await checkNfcAvailability()).toBe("ready");
        expect(NfcManager.isEnabled).not.toHaveBeenCalled();
    });

    it("still reports a phone with no NFC", async () => {
        NfcManager.isSupported.mockResolvedValue(false);

        expect(await checkNfcAvailability()).toBe("unsupported");
    });
});

describe("openNfcSettings", () => {
    it("opens the system NFC setting", async () => {
        await openNfcSettings();

        expect(NfcManager.goToNfcSetting).toHaveBeenCalled();
    });

    it("swallows a refusal rather than failing a press", async () => {
        // There is nothing useful to say if the system will not open its own
        // setting, and the user is already looking at copy telling them where
        // to go.
        NfcManager.goToNfcSetting.mockRejectedValue(new Error("no activity"));

        await expect(openNfcSettings()).resolves.toBeUndefined();
    });
});
