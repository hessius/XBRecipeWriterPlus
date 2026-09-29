/**
 * The card placement line, which is not the same sentence on both platforms.
 *
 * One string, and it carries more than its size suggests. The iPhone's antenna
 * is at the very top edge of the front; an Android one is usually in the upper
 * middle of the back. On Android `NfcOverlay` is the entire ceremony, so this
 * is the only guidance the user gets, and a card held against the wrong part of
 * the phone fails in exactly the way an unsupported card does.
 *
 * The suite runs on both projects, so each assertion below is checked against
 * the platform it describes rather than against a `Platform.OS` this file sets.
 */
import {Platform} from "react-native";

import {HOLD_CARD, NFC_DISABLED, NFC_UNSUPPORTED} from "@/constants/copy";

describe("where to hold the card", () => {
    it("names a part of the phone", () => {
        expect(HOLD_CARD).toMatch(/phone/);
    });

    it("sends an Android user to the back of the phone", () => {
        if (Platform.OS !== "android") {
            return;
        }
        expect(HOLD_CARD).toMatch(/back of the phone/);
    });

    it("sends an iPhone user to the top", () => {
        if (Platform.OS !== "ios") {
            return;
        }
        expect(HOLD_CARD).toMatch(/top of the phone/);
        expect(HOLD_CARD).not.toMatch(/back/);
    });
});

describe("the card copy generally", () => {
    // Dashes read as machine-written, which is the one thing copy in a
    // hand-made app should not read as.
    it.each([
        ["HOLD_CARD", HOLD_CARD],
        ["NFC_DISABLED", NFC_DISABLED],
        ["NFC_UNSUPPORTED", NFC_UNSUPPORTED]
    ])("%s carries no dashes", (_name, line) => {
        expect(line).not.toMatch(/[\u2014\u2013]/);
    });

    it("tells somebody with no radio that the rest of the app still works", () => {
        expect(NFC_UNSUPPORTED).toMatch(/Everything else works/);
    });
});
