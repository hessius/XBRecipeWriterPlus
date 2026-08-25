import React from "react";
import {Platform} from "react-native";
import {screen, fireEvent} from "@testing-library/react-native";

import NfcOverlay from "@/components/NfcOverlay";
import {renderWithProviders} from "@/test-utils/render";

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
            // everywhere.
            await renderWithProviders(<NfcOverlay {...props()}/>);
            expect(screen.getByText(/hold the card to the top of the phone/i)).toBeTruthy();
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
