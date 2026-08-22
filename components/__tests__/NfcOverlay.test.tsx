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
    it("renders nothing when it is not visible", async () => {
        await renderWithProviders(<NfcOverlay {...props({visible: false})}/>);
        expect(screen.queryByTestId("nfc-overlay")).toBeNull();
    });

    it("teaches placement without drawing an antenna position", async () => {
        // The antenna is not in the same place on every device, so a drawing
        // would be wrong on some of them. The copy is right everywhere.
        await renderWithProviders(<NfcOverlay {...props()}/>);
        expect(screen.getByText(/hold the card to the top of the phone/i)).toBeTruthy();
    });

    it("says which way the data is going", async () => {
        await renderWithProviders(<NfcOverlay {...props({mode: "read"})}/>);
        expect(screen.getByText(/reading/i)).toBeTruthy();

        await renderWithProviders(<NfcOverlay {...props({mode: "write"})}/>);
        expect(screen.getByText(/writing/i)).toBeTruthy();
    });

    it("reports progress to a screen reader, not only in dots", async () => {
        await renderWithProviders(<NfcOverlay {...props({progress: 50})}/>);
        expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(50);
    });

    it("can be cancelled", async () => {
        const handlers = props();
        await renderWithProviders(<NfcOverlay {...handlers}/>);
        await fireEvent.press(screen.getByLabelText("Cancel"));
        expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    });

    it("leaves the lower half of the screen alone on iOS", async () => {
        // CoreNFC's own sheet covers roughly the bottom 47% and cannot be drawn
        // over, so our content is staged above it rather than centred.
        Platform.OS = "ios";
        await renderWithProviders(<NfcOverlay {...props()}/>);
        expect(screen.getByTestId("nfc-overlay-stage").props.style.justifyContent)
            .toBe("flex-start");
        Platform.OS = "android";
    });
});
