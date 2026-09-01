import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";

import Console from "@/app/machine";
import {sharedSettings} from "@/hooks/useSetting";
import {renderWithProviders} from "@/test-utils/render";

// Prefixed with `mock` so babel-jest lets the hoisted factory reference them.
const mockSend = jest.fn();
let frameListener: ((direction: "sent" | "received", frame: Uint8Array, parsed: unknown) => void) | null = null;
const mockMachine = {
    info: null,
    isConnected: () => true,
    send: mockSend,
    onFrame: (listener: typeof frameListener) => {
        frameListener = listener;
        return () => {
            frameListener = null;
        };
    },
    scan: jest.fn(),
    connect: jest.fn(),
    linkHistory: [] as {at: number; text: string}[]
};
const send = mockSend;

function emitFrame(direction: "sent" | "received", parsed: unknown, frame = Uint8Array.from([0x58])) {
    if (frameListener === null) throw new Error("No frame listener registered");
    frameListener(direction, frame, parsed);
}

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    default: () => ({machine: mockMachine, status: "connected", error: null, remembered: "AA:BB",
                     connect: jest.fn(), forget: jest.fn()}),
    useMachine: () => ({machine: mockMachine, status: "connected", error: null, remembered: "AA:BB",
                        connect: jest.fn(), forget: jest.fn()})
}));

// `useSetting` reaches for the shared SQLite-backed store, which cannot open
// under Jest. The plan's test drove state through `sharedSettings().set(...)`,
// so the mock exposes a single in-memory `Settings` stand-in behind both
// `useSetting` and `sharedSettings`, starting every key at its real default.
jest.mock("@/hooks/useSetting", () => {
    const React = require("react");
    const {DEFAULTS} = require("@/library/Settings");
    const store: Record<string, unknown> = {...DEFAULTS};
    const listeners = new Set<() => void>();
    const settings = {
        get: (key: string) => store[key],
        set: (key: string, value: unknown) => {
            store[key] = value;
            listeners.forEach((notify) => notify());
        },
        subscribe: (notify: () => void) => {
            listeners.add(notify);
            return () => listeners.delete(notify);
        }
    };
    const sharedSettings = () => settings;
    const useSetting = (key: string) => {
        const value = React.useSyncExternalStore(settings.subscribe, () => settings.get(key));
        return [value, (next: unknown) => settings.set(key, next)];
    };
    return {__esModule: true, default: useSetting, useSetting, sharedSettings};
});

jest.mock("expo-router", () => ({
    router: {back: jest.fn()},
    useNavigation: () => ({setOptions: jest.fn()})
}));

describe("the machine console", () => {
    beforeEach(() => {
        send.mockClear();
        frameListener = null;
        sharedSettings().set("machineConsoleAcknowledged", false);
        sharedSettings().set("machineConsoleConfirmations", true);
        mockMachine.linkHistory.length = 0;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("shows what the link has been doing, so a failed connection leaves a trace", async () => {
        // The frame log starts empty every time this screen mounts, so it can
        // say nothing about a connection that never came up — there is no
        // screen open to log it and no frame to log.
        sharedSettings().set("machineConsoleAcknowledged", true);
        mockMachine.linkHistory.push({at: Date.now(), text: "refused — connection failed"});

        await renderWithProviders(<Console/>);

        expect(screen.getByLabelText("Connection log").props.value)
            .toMatch(/refused — connection failed/);
    });

    it("makes you read the warning once before it will do anything", async () => {
        await renderWithProviders(<Console/>);
        expect(screen.getByText(/nothing here is verified/i)).toBeTruthy();
        expect(screen.queryByLabelText(/send/i)).toBeNull();
    });

    it("sends an inert command without asking twice", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Scale tare"));

        expect(send).toHaveBeenCalled();
    });

    it("confirms before anything that moves the hardware", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Grinder start"));

        expect(send).not.toHaveBeenCalled();
        expect(screen.getByText(/grinder start/i)).toBeTruthy();
    });

    it("shows the actual disagreement before sending an unresolved command", async () => {
        // A generic warning teaches nothing. Somebody about to fire 40518 has
        // to be reading what the sources actually observed.
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Start / confirm / pause"));

        expect(screen.getByText(/bounce the state backwards|backwards/i)).toBeTruthy();
        expect(screen.getByText(/aborts that brew|aborts a running brew/i)).toBeTruthy();
        expect(send).not.toHaveBeenCalled();
    });

    it("still confirms an unresolved command when routine confirmations are off", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        sharedSettings().set("machineConsoleConfirmations", false);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Start / confirm / pause"));

        expect(screen.getByText(/Nobody agrees what this does/i)).toBeTruthy();
        expect(send).not.toHaveBeenCalled();
    });

    it("sends the confirmed PRO and EASY mode strings as fixed payloads", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        sharedSettings().set("machineConsoleConfirmations", false);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Switch to PRO"));
        await fireEvent.press(screen.getByLabelText("Send Switch to EASY"));

        expect(send).toHaveBeenNthCalledWith(
            1,
            Uint8Array.from([0x58, 0x01, 0x02, 0xF7, 0x2C, 0x14, 0x00, 0x00, 0x00, 0x01,
                0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x8E, 0xA9])
        );
        expect(send).toHaveBeenNthCalledWith(
            2,
            Uint8Array.from([0x58, 0x01, 0x02, 0xF7, 0x2C, 0x14, 0x00, 0x00, 0x00, 0x01,
                0x39, 0x31, 0x33, 0x32, 0x37, 0x38, 0x35, 0x36, 0xC0, 0x0A])
        );
    });

    it("accepts decimal entry for float arguments", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        expect(screen.getByLabelText("Bypass and dose — bypass volume").props.keyboardType)
            .toBe("decimal-pad");
        expect(screen.getByLabelText("Bypass and dose — dose g").props.keyboardType)
            .toBe("numeric");
    });

    it("takes a raw frame, because an undocumented code is a paste away", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        const field = screen.getByLabelText("Raw frame");
        await fireEvent.changeText(field, "580101421F0C000000017FCF");
        await fireEvent.press(screen.getByLabelText("Send raw frame"));

        expect(send).toHaveBeenCalledWith(
            Uint8Array.from([0x58, 0x01, 0x01, 0x42, 0x1F, 0x0C, 0x00, 0x00, 0x00, 0x01, 0x7F, 0xCF])
        );
    });

    it("refuses a raw frame that is not hex", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.changeText(screen.getByLabelText("Raw frame"), "not hex");
        await fireEvent.press(screen.getByLabelText("Send raw frame"));

        expect(send).not.toHaveBeenCalled();
    });

    it("lets the tea steep encoding be switched, because a stopwatch settles it", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        expect(screen.getByLabelText(/tea steep encoding/i)).toBeTruthy();
    });

    it("summarises weight telemetry instead of appending log entries while telemetry is hidden", async () => {
        jest.useFakeTimers();
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await act(async () => {
            emitFrame("received", {kind: "waterWeight", grams: 1.2});
            emitFrame("received", {kind: "cupWeight", grams: 3.4});
            emitFrame("received", {kind: "cupWeight", grams: 3.5});
            jest.advanceTimersByTime(250);
        });

        expect(screen.getByLabelText("Telemetry summary").props.children).toEqual(
            expect.stringContaining("suppressed 3")
        );
        expect(screen.getByLabelText("Telemetry summary").props.children).toEqual(
            expect.stringContaining("water 1.2 g")
        );
        expect(screen.getByLabelText("Telemetry summary").props.children).toEqual(
            expect.stringContaining("cup 3.5 g")
        );
        expect(screen.queryByLabelText("Frame log")).toBeNull();
    });

    it("keeps status frames and sent commands in the log while telemetry is hidden", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await act(async () => {
            emitFrame("received", {kind: "cupWeight", grams: 9.1}, Uint8Array.from([0x15]));
            emitFrame("received", {kind: "status", state: 0x1F}, Uint8Array.from([0x57, 0x1F]));
            emitFrame("sent", {kind: "unknown", raw: Uint8Array.from([])}, Uint8Array.from([0x58, 0x01]));
        });

        const value = screen.getByLabelText("Frame log").props.value;
        expect(value).toContain("←  57 1F  state 0x1f armed");
        expect(value).toContain("→  58 01");
        expect(value).not.toContain("cup 9.1 g");
    });

    it("shows no machine state until a status frame arrives, then decodes the state name", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        expect(screen.getByLabelText("Machine state").props.children).toEqual(
            expect.stringContaining("none yet")
        );

        await act(async () => {
            emitFrame("received", {kind: "status", state: 0x24}, Uint8Array.from([0x57, 0x24]));
        });

        expect(screen.getByLabelText("Machine state").props.children).toEqual(
            expect.stringContaining("0x24 ready")
        );
    });

    it("logs telemetry frames after the telemetry toggle is turned on", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Show telemetry"));
        await act(async () => {
            emitFrame("received", {kind: "cupWeight", grams: 7.8}, Uint8Array.from([0x15]));
        });

        expect(screen.getByLabelText("Frame log").props.value).toContain("cup 7.8 g");
    });
});
