import React from "react";
import {Platform} from "react-native";
import {screen, fireEvent} from "@testing-library/react-native";

import NfcOverlay from "@/components/NfcOverlay";
import {HOLD_CARD} from "@/constants/copy";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("react-native-nfc-manager", () => ({
    __esModule: true,
    default: {goToNfcSetting: jest.fn().mockResolvedValue(undefined)},
    NfcTech: {Iso15693IOS: "Iso15693IOS", NfcV: "NfcV"}
}));

const NfcManager = jest.requireMock("react-native-nfc-manager").default;

function props(overrides = {}) {
    return {
        visible:  true,
        mode:     "read" as const,
        progress: 0,
        onCancel: jest.fn(),
        ...overrides
    };
}

describe("NfcOverlay", () => {
    afterEach(() => {
        Platform.OS = "android";
    });

    it("renders nothing when it is not visible", async () => {
        await renderWithProviders(<NfcOverlay {...props({visible: false})}/>);
        expect(screen.queryByTestId("nfc-overlay")).toBeNull();
    });

    it("says which way the data is going", async () => {
        const read = await renderWithProviders(<NfcOverlay {...props({mode: "read"})}/>);
        expect(read.getByText(/reading/i)).toBeTruthy();

        const write = await renderWithProviders(<NfcOverlay {...props({mode: "write"})}/>);
        expect(write.getByText(/writing/i)).toBeTruthy();
    });

    it("reports progress to a screen reader, not only in dots", async () => {
        await renderWithProviders(<NfcOverlay {...props({progress: 50})}/>);
        expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(50);
    });

    describe("on Android, where it is the whole experience", () => {
        it("teaches placement without drawing an antenna position", async () => {
            // The antenna is not in the same place on every device, so a
            // drawing would be wrong on some of them. The copy is right
            // everywhere -- and it is not the same sentence on both platforms,
            // which is why this asserts the constant rather than the words.
            await renderWithProviders(<NfcOverlay {...props()}/>);
            expect(screen.getByText(HOLD_CARD)).toBeTruthy();
        });

        it("can be cancelled", async () => {
            // There is no system sheet here, so this is the only way out.
            const handlers = props();
            await renderWithProviders(<NfcOverlay {...handlers}/>);
            await fireEvent.press(screen.getByLabelText("Cancel"));
            expect(handlers.onCancel).toHaveBeenCalledTimes(1);
        });

        it("counts a write, which really does report block by block", async () => {
            await renderWithProviders(<NfcOverlay {...props({mode: "write", progress: 42})}/>);
            expect(screen.getByText(/42%/)).toBeTruthy();
        });

        it("does not count a read, which does not", async () => {
            // NFC.readCard reports 30, then 50, then 80. A percentage built
            // from three coarse jumps around blocking awaits is a number that
            // looks precise and is not; the bloom's own pulse is the honest
            // signal that something is happening.
            await renderWithProviders(<NfcOverlay {...props({mode: "read", progress: 50})}/>);
            expect(screen.queryByText(/%/)).toBeNull();
        });
    });

    describe("on iOS, where CoreNFC owns the lower half", () => {
        beforeEach(() => {
            Platform.OS = "ios";
        });

        it("leaves the lower half of the screen alone", async () => {
            // CoreNFC's own sheet covers roughly the bottom 47% and cannot be
            // drawn over, so our content is staged above it rather than centred.
            await renderWithProviders(<NfcOverlay {...props()}/>);
            expect(screen.getByTestId("nfc-overlay-stage").props.style.justifyContent)
                .toBe("flex-start");
        });

        it("still stages the bloom and the verb", async () => {
            await renderWithProviders(<NfcOverlay {...props({mode: "write"})}/>);
            expect(screen.getByTestId("dot-bloom")).toBeTruthy();
            expect(screen.getByText(/writing/i)).toBeTruthy();
        });

        it("offers no Cancel of its own", async () => {
            // The system sheet has one. A second one directly above it is two
            // controls for one job, and the one the user is likelier to reach
            // for is not ours.
            await renderWithProviders(<NfcOverlay {...props()}/>);
            expect(screen.queryByLabelText("Cancel")).toBeNull();
        });

        it("does not repeat the placement copy the system sheet carries", async () => {
            // That one line is mirrored into setAlertMessageIOS, which puts it
            // on the system's half where the user is already looking.
            await renderWithProviders(<NfcOverlay {...props()}/>);
            expect(screen.queryByText(/hold the card to the top of the phone/i)).toBeNull();
        });

        it("shows no percentage, even for a write", async () => {
            // The strip above the sheet is for the ceremony, not for telemetry.
            await renderWithProviders(<NfcOverlay {...props({mode: "write", progress: 42})}/>);
            expect(screen.queryByText(/%/)).toBeNull();
        });
    });
});

describe("the ceremony's hold on the screen", () => {
    it("claims to be modal to the screen reader", async () => {
        // Absolute positioning covers the host visually and nothing more:
        // without this, VoiceOver walks straight past the overlay to the header
        // and the recipe controls behind it, and can fire them mid-write.
        await renderWithProviders(<NfcOverlay {...props()}/>);

        const overlay = screen.getByTestId("nfc-overlay");
        expect(overlay.props.accessibilityViewIsModal).toBe(true);
    });
});

/**
 * The two Android-only dead ends.
 *
 * Neither reaches an iPhone, so both are driven by the prop rather than by
 * `Platform.OS`: the decision of whether a phone has a usable radio belongs to
 * the handler that asked, and the overlay's job is only to say what it was
 * told. A reason means there is no ceremony underneath, so the bloom goes and
 * an explanation takes its place.
 */
describe("NfcOverlay with nothing to scan with", () => {
    beforeEach(() => {
        NfcManager.goToNfcSetting.mockClear();
    });

    // The iOS case below leaves the platform behind it, the same way the
    // suite above does.
    afterEach(() => {
        Platform.OS = "android";
    });

    it("explains a radio that is switched off", async () => {
        await renderWithProviders(<NfcOverlay {...props({unavailable: "disabled" as const})}/>);

        expect(screen.getByText(/NFC is switched off/)).toBeTruthy();
    });

    it("offers the switch, because that one is something the user can fix", async () => {
        await renderWithProviders(<NfcOverlay {...props({unavailable: "disabled" as const})}/>);

        await fireEvent.press(screen.getByLabelText("Open NFC settings"));

        expect(NfcManager.goToNfcSetting).toHaveBeenCalled();
    });

    it("explains a phone with no radio at all", async () => {
        await renderWithProviders(<NfcOverlay {...props({unavailable: "unsupported" as const})}/>);

        expect(screen.getByText(/no NFC/)).toBeTruthy();
    });

    it("says the rest of the app still works", async () => {
        // Without this clause the message reads as "this app does not work on
        // your phone", which is not true: the library, editor, import and hub
        // all work without a radio.
        await renderWithProviders(<NfcOverlay {...props({unavailable: "unsupported" as const})}/>);

        expect(screen.getByText(/Everything else works/)).toBeTruthy();
    });

    it("offers no settings button when there is no setting behind it", async () => {
        await renderWithProviders(<NfcOverlay {...props({unavailable: "unsupported" as const})}/>);

        expect(screen.queryByLabelText("Open NFC settings")).toBeNull();
    });

    it("draws no progress, because nothing is happening", async () => {
        await renderWithProviders(
            <NfcOverlay {...props({unavailable: "disabled" as const, progress: 50})}/>);

        expect(screen.queryByRole("progressbar")).toBeNull();
    });

    it("offers a way out even on iOS, where there is no system sheet to carry one", async () => {
        Platform.OS = "ios";

        await renderWithProviders(<NfcOverlay {...props({unavailable: "unsupported" as const})}/>);

        expect(screen.getByLabelText("Close")).toBeTruthy();
    });

    it("closes when it is taken", async () => {
        const onCancel = jest.fn();

        await renderWithProviders(
            <NfcOverlay {...props({unavailable: "unsupported" as const, onCancel})}/>);
        await fireEvent.press(screen.getByLabelText("Close"));

        expect(onCancel).toHaveBeenCalled();
    });

    it("still says Cancel when there is a ceremony to cancel", async () => {
        await renderWithProviders(<NfcOverlay {...props()}/>);

        expect(screen.getByLabelText("Cancel")).toBeTruthy();
        expect(screen.queryByLabelText("Close")).toBeNull();
    });
});
