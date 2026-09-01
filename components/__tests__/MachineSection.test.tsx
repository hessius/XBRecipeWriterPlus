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

// The section now carries a preference row, and the shared settings store opens
// SQLite, which cannot run under Jest. A per-hook in-memory value at the real
// default is all these tests need — the same stand-in `brew.test.tsx` uses.
jest.mock("@/hooks/useSetting", () => {
    const React = require("react");
    const {DEFAULTS} = require("@/library/Settings");
    const useSetting = (key: string) => React.useState(DEFAULTS[key]);
    return {__esModule: true, default: useSetting, useSetting};
});

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
        expect(screen.getByLabelText(/^Connect to my machine/)).toBeTruthy();
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

    it("opens the console from the status line when there is no connection", async () => {
        // The console is the only place a failed connection can be read about,
        // and the firmware row it used to hide behind is not rendered when
        // there is no firmware to report — so the diagnostic was unreachable in
        // exactly the situation that needs it.
        await renderWithProviders(<MachineSection/>);
        const status = screen.getByLabelText("Not connected");

        for (let i = 0; i < 7; i++) await fireEvent.press(status);

        expect(mockPush).toHaveBeenCalledWith("/machine");
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

    it("offers auto-start, off, because committing is what starts a grinder", async () => {
        // The machine goes from committed to grinding with nothing in between
        // and no confirmation of its own, so the default has to be the one
        // where a curious first press does not leave somebody standing over a
        // running burr.
        await renderWithProviders(<MachineSection/>);

        const toggle = screen.getByLabelText(/start brewing automatically/i);
        expect(toggle).toBeTruthy();
        expect(toggle.props.accessibilityState?.checked ?? toggle.props.value).toBe(false);
    });
});
