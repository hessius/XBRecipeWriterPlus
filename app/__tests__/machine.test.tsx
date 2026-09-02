import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";

import Console from "@/app/machine";
import {sharedSettings} from "@/hooks/useSetting";
import {renderWithProviders} from "@/test-utils/render";

// Prefixed with `mock` so babel-jest lets the hoisted factory reference them.
const mockSend = jest.fn();
let frameListener: ((
    direction: "sent" | "received", frame: Uint8Array, parsed: unknown, source?: string
) => void) | null = null;
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
    linkHistory: [] as {at: number; text: string}[],
    describeRadio: jest.fn().mockResolvedValue(undefined)
};
const send = mockSend;

function emitFrame(
    direction: "sent" | "received", parsed: unknown,
    frame = Uint8Array.from([0x58]), source?: string
) {
    if (frameListener === null) throw new Error("No frame listener registered");
    frameListener(direction, frame, parsed, source);
}

/** A 40523 frame carrying a tank reading where `waterVolumeOf` looks for it. */
function tankFrame(ml: number): Uint8Array<ArrayBuffer> {
    const buffer = new ArrayBuffer(16);
    new DataView(buffer).setFloat32(10, ml, true);
    return new Uint8Array(buffer);
}

const someInfo = {
    kind: "info" as const, serial: "J15ABC123456", model: "J15",
    firmware: "V12.0D.500", waterEnough: true, waterFeed: "tank" as const,
    grindSize: 60, mode: "PRO" as const
};

// The console is written for a link that is already up, but the link is
// exactly what fails in the sessions the console exists for -- so its own
// state is a test fixture, not a constant.
let mockStatus = "connected";
const mockConnect = jest.fn();
const machineLink = () => ({
    machine: mockMachine, status: mockStatus, error: null, remembered: "AA:BB",
    connect: mockConnect, forget: jest.fn()
});
jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    default: () => machineLink(),
    useMachine: () => machineLink()
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
        mockStatus = "connected";
        mockConnect.mockClear();
    });

    it("offers to connect when the link is down", async () => {
        // The console is the screen a user is sent to when the link is the
        // problem, and it had no way to make one: every other screen owned a
        // connect control and this one assumed the link was already up, so a
        // disconnected user could read a log and send nothing.
        mockStatus = "disconnected";
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByRole("button", {name: /connect/i}));

        expect(mockConnect).toHaveBeenCalled();
    });

    it("does not offer to connect when the link is already up", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        expect(screen.queryByRole("button", {name: /^connect/i})).toBeNull();
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

    it("says which channel a frame arrived on, when the radio names one", async () => {
        // The machine notifies on two characteristics. A log that does not say
        // which one a frame came in on cannot answer whether the second is
        // ever used, which is the open question about `ffe3`.
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await act(async () => {
            emitFrame("received", {kind: "status", state: 1}, Uint8Array.from([0x58]), "ffe3");
        });

        expect(screen.getByLabelText("Frame log").props.value).toContain("ffe3");
    });

    it("can ask the radio what the machine offers, since we listen to one channel", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Describe the radio"));

        expect(mockMachine.describeRadio).toHaveBeenCalled();
    });

    it("counts the tank and info frames, to show whether either arrives unasked", async () => {
        // The open question is whether the machine volunteers its tank level
        // and its info blob, or only answers when asked. A count that stays at
        // one while the summary is on screen settles it either way, and a
        // reading with no count behind it cannot.
        jest.useFakeTimers();
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await act(async () => {
            emitFrame("received", {kind: "event", code: 40523}, tankFrame(742));
            emitFrame("received", {kind: "event", code: 40523}, tankFrame(510));
            emitFrame("received", {...someInfo, waterEnough: false});
            jest.advanceTimersByTime(250);
        });

        const summary = screen.getByLabelText("Telemetry summary").props.children;
        expect(summary).toEqual(expect.stringContaining("tank 510.0 ml ×2"));
        expect(summary).toEqual(expect.stringContaining("×1"));
        expect(summary).toEqual(expect.stringContaining("water low"));
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
