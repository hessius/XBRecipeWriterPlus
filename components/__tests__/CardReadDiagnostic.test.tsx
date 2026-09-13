import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import CardReadDiagnostic from "@/components/CardReadDiagnostic";
import {captureToText, serialiseCapture, type CardCapture} from "@/library/cardDiagnostics";
import {Settings, type SettingsStorage} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-clipboard", () => ({
    setStringAsync: jest.fn().mockResolvedValue(true)
}));

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    ...jest.requireActual("@/components/XbrwToast"),
    notify: (...args: unknown[]) => mockNotify(...args)
}));

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read: (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

function sampleCapture(): CardCapture {
    return {
        at: "2026-09-07T19:20:52.313Z",
        uid: [0x04, 0xa1, 0xb2, 0xc3],
        data: Array.from({length: 40}, (_, i) => i),
        systemInfo: {afi: 0, dsfid: 0, blockCount: 60, blockSize: 4}
    };
}

describe("CardReadDiagnostic", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("stays hidden until the machine console has been acknowledged", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("lastCardRead", serialiseCapture(sampleCapture()));

        await renderWithProviders(<CardReadDiagnostic settings={settings}/>);

        // Not gated, this section would clutter every user's screen. The gate is
        // the machine console's, reused rather than a second one invented.
        expect(screen.queryByText(/card diagnostics/i)).toBeNull();
    });

    it("says nothing has been read yet when acknowledged and empty", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("machineConsoleAcknowledged", true);

        await renderWithProviders(<CardReadDiagnostic settings={settings}/>);

        expect(screen.getByText(/card diagnostics/i)).toBeTruthy();
        expect(screen.getByText(/no card has been read yet/i)).toBeTruthy();
    });

    it("shows the timestamp and capacity once a card has been read", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("machineConsoleAcknowledged", true);
        settings.set("lastCardRead", serialiseCapture(sampleCapture()));

        await renderWithProviders(<CardReadDiagnostic settings={settings}/>);

        expect(screen.getByText(/2026-09-07T19:20:52.313Z/)).toBeTruthy();
        // 60 × 4 = 240 bytes of card.
        expect(screen.getByText(/240/)).toBeTruthy();
    });

    it("copies the full readable report to the clipboard", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("machineConsoleAcknowledged", true);
        settings.set("lastCardRead", serialiseCapture(sampleCapture()));

        await renderWithProviders(<CardReadDiagnostic settings={settings}/>);
        await fireEvent.press(screen.getByRole("button", {name: /copy/i}));

        expect(Clipboard.setStringAsync).toHaveBeenCalledWith(captureToText(sampleCapture()));
    });

    it("treats an unreadable stored capture as nothing read", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("machineConsoleAcknowledged", true);
        settings.set("lastCardRead", "{corrupt");

        await renderWithProviders(<CardReadDiagnostic settings={settings}/>);

        expect(screen.getByText(/no card has been read yet/i)).toBeTruthy();
    });
});
