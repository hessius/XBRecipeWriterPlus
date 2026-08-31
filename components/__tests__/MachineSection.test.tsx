import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import MachineSection from "@/components/MachineSection";
import {renderWithProviders} from "@/test-utils/render";

// Jest forbids a `jest.mock` factory from closing over a variable unless its
// name is `mock`-prefixed, so the plan's `push`/`link` are named `mockPush` and
// `mockLink` here. The router's own method key stays `push` — the component
// calls `router.push`.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({router: {push: (...args: unknown[]) => mockPush(...args)}}));

const mockLink = {
    machine: {info: null},
    status: "disconnected",
    error: null,
    remembered: "",
    connect: jest.fn(),
    forget: jest.fn()
};

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    default: () => mockLink,
    useMachine: () => mockLink
}));

describe("the machine section", () => {
    beforeEach(() => {
        mockPush.mockClear();
        mockLink.status = "disconnected";
        mockLink.remembered = "";
        mockLink.machine = {info: null};
    });

    it("is there before a machine has ever been paired", async () => {
        // Otherwise nothing in the app tells a new owner that pairing exists:
        // BREW only appears once a machine is remembered.
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText(/not connected/i)).toBeTruthy();
        expect(screen.getByLabelText(/connect/i)).toBeTruthy();
    });

    it("shows what the machine says about itself once connected", async () => {
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        mockLink.machine = {info: {
            kind: "info", serial: "J15ABC123456", model: "J15",
            firmware: "V12.0D.500", waterEnough: true, waterFeed: "tank",
            grindSize: 62, mode: "PRO"
        }} as never;

        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("J15ABC123456")).toBeTruthy();
        expect(screen.getByText("V12.0D.500")).toBeTruthy();
    });

    it("opens the console after seven taps on the firmware, and not before", async () => {
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        mockLink.machine = {info: {
            kind: "info", serial: "J15ABC123456", model: "J15",
            firmware: "V12.0D.500", waterEnough: true, waterFeed: "tank",
            grindSize: 62, mode: "PRO"
        }} as never;

        await renderWithProviders(<MachineSection/>);
        const firmware = screen.getByLabelText(/firmware/i);

        for (let i = 0; i < 6; i++) await fireEvent.press(firmware);
        expect(mockPush).not.toHaveBeenCalled();

        await fireEvent.press(firmware);
        expect(mockPush).toHaveBeenCalledWith("/machine");
    });

    it("offers to forget a machine it remembers", async () => {
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";

        await renderWithProviders(<MachineSection/>);

        expect(screen.getByLabelText(/forget/i)).toBeTruthy();
    });
});
