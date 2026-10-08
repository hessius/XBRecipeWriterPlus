import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import Console from "@/app/machine";
import {sharedSettings} from "@/hooks/useSetting";
import {formatBrewDate, formatBrewTime} from "@/library/brew/brewFormat";
import {renderWithProviders} from "@/test-utils/render";

// Prefixed with `mock` so babel-jest lets the hoisted factory reference them.
const mockSend = jest.fn();
const mockLatestFrameLogSummary = jest.fn();
const mockStoredFrames = jest.fn();
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
    frameHistory: [] as {
        at: number; direction: "sent" | "received"; frame: Uint8Array;
        parsed: unknown; source?: string;
    }[],
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
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

jest.mock("expo-router", () => ({
    router: {back: jest.fn()},
    useNavigation: () => ({setOptions: jest.fn()})
}));

jest.mock("expo-clipboard", () => ({
    setStringAsync: jest.fn().mockResolvedValue(true)
}));

jest.mock("@/library/BrewDatabase", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        latestFrameLogSummary: mockLatestFrameLogSummary,
        frames: mockStoredFrames
    }))
}));

describe("the machine console", () => {
    beforeEach(() => {
        send.mockClear();
        mockLatestFrameLogSummary.mockReset();
        mockLatestFrameLogSummary.mockReturnValue(null);
        mockStoredFrames.mockReset();
        mockStoredFrames.mockReturnValue("");
        frameListener = null;
        sharedSettings().set("machineConsoleAcknowledged", false);
        sharedSettings().set("machineConsoleConfirmations", true);
        mockMachine.linkHistory.length = 0;
        mockMachine.frameHistory.length = 0;
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
        mockMachine.linkHistory.push({at: Date.now(), text: "refused: connection failed"});

        await renderWithProviders(<Console/>);

        expect(screen.getByLabelText("Connection log").props.value)
            .toMatch(/refused: connection failed/);
    });

    it("makes you read the warning once before it will do anything", async () => {
        await renderWithProviders(<Console/>);
        expect(screen.getByText(/nothing here is verified/i)).toBeTruthy();
        expect(screen.queryByLabelText(/send/i)).toBeNull();
    });

    it("does not offer the stored brew log before the diagnostics gate opens", async () => {
        mockLatestFrameLogSummary.mockReturnValue({
            brewId: "brew-1", recipeName: "Ethiopia Guji", startedAt: 1_000_000
        });

        await renderWithProviders(<Console/>);

        expect(screen.queryByRole("button", {name: "Copy last recorded brew log"})).toBeNull();
    });

    it("does not offer a stored brew log when no stored log exists", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);

        await renderWithProviders(<Console/>);

        expect(screen.queryByRole("button", {name: "Copy last recorded brew log"})).toBeNull();
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
        // A generic warning teaches nothing. Somebody about to fire 8019 has to
        // be reading what the machine actually did, which is not what the
        // command's own name says.
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(
            screen.getByLabelText("Send FreeSolo pour (named Brewer pause)"));

        expect(screen.getByText(/This is not a pause/i)).toBeTruthy();
        expect(screen.getByText(/abandoned the recipe/i)).toBeTruthy();
        expect(send).not.toHaveBeenCalled();
    });

    it("still confirms an unresolved command when routine confirmations are off", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        sharedSettings().set("machineConsoleConfirmations", false);
        await renderWithProviders(<Console/>);

        await fireEvent.press(
            screen.getByLabelText("Send FreeSolo pour (named Brewer pause)"));

        expect(screen.getByText(/costs something, or nobody agrees/i)).toBeTruthy();
        expect(send).not.toHaveBeenCalled();
    });

    /*
     * The spike buttons reach the same machine as the catalogue rows, so they
     * ask the same question. They were added sending straight out, which put
     * the one frame that abandons a running brew behind a single tap.
     */
    it("confirms a spike frame rather than sending it straight out", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Pause this brew (40518)"));

        expect(send).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Confirm send Pause this brew (40518)")).toBeTruthy();
    });

    it("still confirms a hazardous spike frame when confirmations are off", async () => {
        // The toggle silences the routine nagging. It is not a way to switch
        // off the warning on the frame that overwrites all three Easy slots.
        sharedSettings().set("machineConsoleAcknowledged", true);
        sharedSettings().set("machineConsoleConfirmations", false);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Easy slot A only (15 g / 225 ml)"));

        expect(send).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Confirm send Easy slot A only (15 g / 225 ml)"))
            .toBeTruthy();
        // Twice: once on the row, and again in the sheet, which is the half
        // somebody who already decided to tap is actually going to read.
        expect(screen.getAllByText(/overwrites all three/i)).toHaveLength(2);
    });

    it("lets an ordinary spike frame through when confirmations are off", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        sharedSettings().set("machineConsoleConfirmations", false);
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Send Resume this brew (40524)"));

        expect(send).toHaveBeenCalledWith(
            Uint8Array.from([0x58, 0x01, 0x01, 0x4C, 0x9E, 0x10, 0x00, 0x00, 0x00, 0x01,
                0x01, 0x00, 0x00, 0x00, 0xED, 0xCC])
        );
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

        expect(screen.getByLabelText("Bypass and dose, bypass volume").props.keyboardType)
            .toBe("decimal-pad");
        expect(screen.getByLabelText("Bypass and dose, dose g").props.keyboardType)
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

    it("announces a refused raw frame to a screen reader", async () => {
        // Without the alert role an iOS VoiceOver user meets a button that
        // does nothing, which is the defect the message was added to fix.
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.changeText(screen.getByLabelText("Raw frame"), "zz");
        await fireEvent.press(screen.getByLabelText("Send raw frame"));

        const problem = screen.getByTestId("raw-frame-problem");
        expect(problem.props.accessibilityRole).toBe("alert");
        expect(problem.props.accessibilityLiveRegion).toBe("polite");
    });

    it("refuses a raw frame that is not hex", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.changeText(screen.getByLabelText("Raw frame"), "not hex");
        await fireEvent.press(screen.getByLabelText("Send raw frame"));

        expect(send).not.toHaveBeenCalled();
        // A silent refusal reads as a dead button, which is how a hardware
        // session was spent typing a frame that was never going anywhere.
        expect(screen.getByTestId("raw-frame-problem")).toHaveTextContent(/not hex/);
    });

    it("names an odd digit count rather than refusing in silence", async () => {
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await fireEvent.changeText(screen.getByLabelText("Raw frame"), "58 01 0");
        await fireEvent.press(screen.getByLabelText("Send raw frame"));

        expect(send).not.toHaveBeenCalled();
        expect(screen.getByTestId("raw-frame-problem")).toHaveTextContent(/odd number of digits/);

        await fireEvent.changeText(screen.getByLabelText("Raw frame"), "58 01 01");

        expect(screen.queryByTestId("raw-frame-problem")).toBeNull();
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

    it("counts the info frames, to show whether the blob arrives unasked", async () => {
        // The open question is whether the machine volunteers its info blob or
        // only answers when asked. A count that stays at one while the summary
        // is on screen settles it either way, and a reading with no count
        // behind it cannot.
        //
        // There is deliberately no tank counterpart. The console used to carry
        // one, fed by an `{kind: "event", code: 40523}` that `parseNotification`
        // cannot produce -- it matches the water stream on the type byte `0x4B`
        // first -- so the readout was dead in the field while a test that hand
        // built that shape kept it looking alive. See `protocol.test.ts`.
        jest.useFakeTimers();
        sharedSettings().set("machineConsoleAcknowledged", true);
        await renderWithProviders(<Console/>);

        await act(async () => {
            emitFrame("received", {...someInfo, waterEnough: false});
            jest.advanceTimersByTime(250);
        });

        const summary = screen.getByLabelText("Telemetry summary").props.children;
        expect(summary).not.toEqual(expect.stringContaining("tank"));
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

    it("copies the machine's retained history, so a log covers a brew this screen missed", async () => {
        // The point of the buffer: a brew is watched from the brew sheet with
        // the console closed, so its frames never reach the live `log`. Copy
        // must draw on the machine's always-on history instead, which spans the
        // brew even when nothing on this screen saw it arrive.
        (Clipboard.setStringAsync as jest.Mock).mockClear();
        sharedSettings().set("machineConsoleAcknowledged", true);
        mockMachine.frameHistory.push({
            at:        Date.parse("2026-09-06T13:00:00.000Z"),
            direction: "received",
            frame:     Uint8Array.from([0x58, 0x02, 0x07, 0x57]),
            parsed:    {kind: "status", state: 0x22}
        });
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByLabelText("Copy session log"));

        const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0];
        expect(copied).toContain("This session machine log");
        expect(copied).toContain("13:00:00.000  ←  58 02 07 57  state 0x22 starting");
    });

    it("copies the stored brew log instead of the session log", async () => {
        (Clipboard.setStringAsync as jest.Mock).mockClear();
        sharedSettings().set("machineConsoleAcknowledged", true);
        mockLatestFrameLogSummary.mockReturnValue({
            brewId: "brew-1", recipeName: "Ethiopia Guji", startedAt: 1_000_000
        });
        mockStoredFrames.mockReturnValue(
            "stored 18:51:44.123  ←  58 02 07 0C  state 0x0c no_water"
        );
        mockMachine.frameHistory.push({
            at:        Date.parse("2026-09-06T13:00:00.000Z"),
            direction: "received",
            frame:     Uint8Array.from([0x58, 0x02, 0x07, 0x57]),
            parsed:    {kind: "status", state: 0x22}
        });
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByRole("button", {name: "Copy last recorded brew log"}));

        const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0];
        expect(mockStoredFrames).toHaveBeenCalledWith("brew-1");
        expect(copied).toContain("stored 18:51:44.123");
        expect(copied).not.toContain("13:00:00.000");
    });

    it("names the brew that supplied the stored log", async () => {
        (Clipboard.setStringAsync as jest.Mock).mockClear();
        sharedSettings().set("machineConsoleAcknowledged", true);
        const startedAt = Date.parse("2026-09-06T13:05:00.000");
        mockLatestFrameLogSummary.mockReturnValue({
            brewId: "brew-9", recipeName: "Colombia Pink Bourbon", startedAt
        });
        mockStoredFrames.mockReturnValue("stored frames");
        await renderWithProviders(<Console/>);

        await fireEvent.press(screen.getByRole("button", {name: "Copy last recorded brew log"}));

        const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls[0][0];
        expect(copied).toContain("Brew: Colombia Pink Bourbon");
        expect(copied).toContain(`When: ${formatBrewDate(startedAt)} · ${formatBrewTime(startedAt)}`);
        expect(copied).toContain("Record: brew-9");
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
