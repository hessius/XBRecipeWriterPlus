import React from "react";
import {AppState, type AppStateStatus} from "react-native";
import {act, fireEvent, renderHook, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import {FRAME_GAP_MS} from "@/constants/machine";
import {useMachine, sharedMachine, __resetSharedMachine} from "@/hooks/useMachine";
import {sharedSlotDatabase, useEasyModeSlots} from "@/hooks/useEasyModeSlots";
import {sharedSettings} from "@/hooks/useSetting";
import {LiveBrewProvider, useLiveBrew} from "@/hooks/useLiveBrew";
import BrewDatabase from "@/library/BrewDatabase";
import {unavailableSlotPort, writeSlots, recoverSlots} from "@/library/slots/slotWriter";
import {prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {appDatabase} from "@/library/appDatabase";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import {event, float32, kermit, notification, status} from "@/library/machine/__tests__/protocolFixtures";
import {buildType1, MACHINE_STATE} from "@/library/machine/protocol";
import {coffee} from "@/library/slots/__tests__/fixtures";
import EasyModeScreen from "@/app/easyMode";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/library/machine/Transport", () => ({
    ...jest.requireActual("@/library/machine/Transport"),
    BleTransport: jest.fn(() => mockRadio),
    ensureBluetoothPermission: async () => ({granted: true})
}));
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => jest.requireActual("@/test-utils/sqlite").createTestDatabase()
}));
jest.mock("@/hooks/useSetting", () => jest.requireActual("@/test-utils/settingsMock").settingsMock());
jest.mock("@/hooks/useRecipeLibrary", () => ({
    useRecipeLibrary: () => ({allRecipes: () => []})
}));
jest.mock("expo-router", () => ({
    useLocalSearchParams: () => mockRouteParams,
    router: {back: jest.fn(), canGoBack: () => true},
    useRouter: () => ({back: jest.fn()})
}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

function receipt() {
    const bytes = notification(0xF6, 0x2C, []);
    bytes[9] = 0xC2;
    const crc = kermit(bytes.slice(0, -2));
    bytes[bytes.length - 2] = crc & 255;
    bytes[bytes.length - 1] = crc >> 8;
    return bytes;
}

class RootRadio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
    missing = false;
    slots: Uint8Array[] = [];
    override async write(frame: Uint8Array) {
        await super.write(frame);
        if ((frame[3] | frame[4] << 8) !== 11510) return;
        this.slots.push(frame.slice());
        if (this.missing) return;
        this.emit(receipt());
        if (frame[10] === 2) {
            this.emit(status(0x25));
            this.emit(status(0x01));
        }
    }
}

let mockRadio: RootRadio;
let mockRouteParams: {recipeJSON?: string} = {};
let changes: Set<(state: AppStateStatus) => void>;
const initialState = AppState.currentState;
const flush = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };

beforeEach(() => {
    __resetSharedMachine();
    jest.useFakeTimers();
    mockRadio = new RootRadio();
    mockRouteParams = {};
    changes = new Set();
    AppState.currentState = "active";
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
        changes.add(handler);
        return {remove: () => { changes.delete(handler); }};
    });
    sharedSettings().set("machineDeviceId", "one");
    sharedSettings().set("machineAutoStart", false);
    sharedSettings().set("bypassTempEncoding", "scaled");
});

afterEach(async () => {
    await act(async () => { await sharedMachine().disconnect(); });
    __resetSharedMachine();
    expect(changes.size).toBe(0);
    AppState.currentState = initialState;
    jest.restoreAllMocks();
    jest.useRealTimers();
});

function draft() {
    const store = sharedSlotDatabase();
    for (const index of [0, 1, 2] as const) {
        const recipe = coffee(String(index), 14 + index);
        recipe.grinder = index !== 1;
        store.assign("one", index, snapshotRecipe(recipe));
    }
    return store;
}

function journal() {
    const store = draft();
    const saved = store.read("one").drafts;
    const slots = [saved[0]!, saved[1]!, saved[2]!] as const;
    store.begin("one", {
        id: "prior", serial: "J15ABC123456", slots: [...slots],
        frames: prepareSet([...slots]), acknowledged: 0, inFlight: null, error: null
    });
    return store;
}

async function connect() {
    const connecting = sharedMachine().connect("one");
    await jest.advanceTimersByTimeAsync(2000);
    await connecting;
}

it("installs the durable restart reservation before the shared owner can connect or mutate", async () => {
    const store = journal();
    await connect();
    await expect(sharedMachine().send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
    expect(store.read("one").journal?.id).toBe("prior");
    expect(mockRadio.slots).toEqual([]);
});

it.each([false, true])(
    "ends a refused app attempt without recording or replay, overflow configured: %s", async (configured) => {
        const store = journal();
        await connect();
        const machine = sharedMachine();
        const connectSpy = jest.spyOn(mockRadio, "connect");
        const disconnectSpy = jest.spyOn(mockRadio, "disconnect");
        const db = new BrewDatabase();
        const insert = jest.spyOn(db, "insert");
        const {result} = await renderHook(() => ({live: useLiveBrew(), link: useMachine()}), {
            wrapper: ({children}) => <LiveBrewProvider store={db}>{children}</LiveBrewProvider>
        });
        let unwatch!: () => void;
        await act(async () => { unwatch = result.current.live.watch(); });
        const intervals = jest.spyOn(global, "setInterval");
        const clearIntervals = jest.spyOn(global, "clearInterval");
        const frames = mockRadio.written.length;
        const recipe = coffee();
        recipe.cupType = 1;
        if (configured) recipe.overflowProtection = {retainedGrams: 50, checkSeconds: 15};
        await act(async () => { result.current.live.start(recipe); await flush(); });
        expect(result.current.live.error).toMatch(/incomplete Easy Mode/i);
        expect(result.current.live.run?.phase).toEqual({
            name: "failed", reason: "blocked", block: "busy",
            detail: result.current.live.error
        });
        expect(machine.phase).toEqual({name: "idle"});
        expect(store.read("one").journal?.id).toBe("prior");
        expect(store.read("one").written).toBeNull();
        expect(mockRadio.written).toHaveLength(frames);
        expect(connectSpy).not.toHaveBeenCalled();
        expect(disconnectSpy).not.toHaveBeenCalled();
        expect(insert).not.toHaveBeenCalled();
        for (const timer of intervals.mock.results) {
            expect(clearIntervals).toHaveBeenCalledWith(timer.value);
        }
        expect(changes.size).toBe(1);
        await expect(machine.send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);

        // Later machine telemetry is not the refused app attempt's brew.
        await act(async () => {
            mockRadio.emit(status(MACHINE_STATE.STARTING));
            mockRadio.emit(event(40510, 1));
            mockRadio.emit(notification(0x4B, 0x00, float32(100000)));
            mockRadio.emit(notification(0x15, 0x00, float32(0)));
            await jest.advanceTimersByTimeAsync(1000);
            mockRadio.emit(notification(0x4B, 0x00, float32(100000)));
            mockRadio.emit(notification(0x15, 0x00, float32(0)));
        });
        expect(result.current.live.run?.phase.name).toBe("failed");
        expect(mockRadio.sent).not.toContain(40518);
        expect(mockRadio.sent).not.toContain(40524);
        expect(insert).not.toHaveBeenCalled();
        const port = result.current.link.slotPort ?? unavailableSlotPort;
        await expect(port.acquire(machine.slotIdentity!)).rejects.toThrow(/brew|busy/i);
        await act(async () => { mockRadio.emit(status(0x01)); });
        expect(insert).not.toHaveBeenCalled();
        expect(db.all()).toEqual([]);

        await act(async () => {
            sharedSettings().set("machineAutoStart", true);
            sharedSettings().set("bypassTempEncoding", "plain");
        });
        await act(async () => {
            const recovering = recoverSlots(store, machine.slotIdentity!, port);
            await jest.advanceTimersByTimeAsync(4000);
            await recovering;
        });
        expect(store.read("one").journal).toBeNull();
        expect(new SlotDatabase(appDatabase()).read("one").written?.slots)
            .toEqual(store.read("one").drafts);
        expect(mockRadio.slots.map(frame => frame[10])).toEqual([0, 1, 2]);
        expect(mockRadio.sent).not.toContain(8001);
        expect(mockRadio.sent).not.toContain(8002);
        expect(machine.bypassTempEncoding).toBe("scaled");
        expect(result.current.live.run?.phase.name).toBe("failed");
        await act(async () => { result.current.live.start(recipe); });
        await act(async () => { await jest.advanceTimersByTimeAsync(6 * FRAME_GAP_MS); });
        expect(result.current.live.error).toBeNull();
        expect(mockRadio.sent.filter(code => code === 8001)).toHaveLength(1);
        expect(mockRadio.sent.filter(code => code === 8002)).toHaveLength(1);
        expect(machine.bypassTempEncoding).toBe("plain");
        expect(result.current.live.run?.phase.name).not.toBe("failed");
        await act(async () => {
            result.current.live.start(recipe);
            await jest.advanceTimersByTimeAsync(1000);
        });
        expect(mockRadio.sent.filter(code => code === 8001)).toHaveLength(1);
        expect(mockRadio.sent.filter(code => code === 8002)).toHaveLength(1);
        await act(async () => { unwatch(); });
    }
);

it.each([
    {configured: false, method: "start"},
    {configured: true, method: "start"},
    {configured: false, method: "startInPro"},
    {configured: true, method: "startInPro"}
] as const)(
    "dismisses only the refused $method owner, preserving a real busy machine, overflow configured: $configured",
    async ({configured, method}) => {
        draft();
        await connect();
        const machine = sharedMachine();
        const brewing = machine.brew(coffee("Already running"));
        await jest.advanceTimersByTimeAsync(6 * FRAME_GAP_MS);
        await brewing;
        mockRadio.emit(status(MACHINE_STATE.STARTING));
        expect(machine.phase.name).toBe("grinding");
        journal();
        const db = new BrewDatabase();
        const {result} = await renderHook(() => useLiveBrew(), {
            wrapper: ({children}) => <LiveBrewProvider store={db}>{children}</LiveBrewProvider>
        });
        const recipe = coffee();
        recipe.cupType = 1;
        if (configured) recipe.overflowProtection = {retainedGrams: 50, checkSeconds: 15};
        const frames = mockRadio.written.length;
        await act(async () => { result.current[method](recipe); await flush(); });
        expect(result.current.run?.phase.name).toBe("failed");
        expect(machine.phase).toEqual({name: "grinding"});
        await act(async () => {
            mockRadio.emit(event(40510, 0));
            mockRadio.emit(notification(0x4B, 0x00, float32(100000)));
            mockRadio.emit(notification(0x15, 0x00, float32(0)));
            await jest.advanceTimersByTimeAsync(1000);
            mockRadio.emit(notification(0x4B, 0x00, float32(100000)));
            mockRadio.emit(notification(0x15, 0x00, float32(0)));
        });
        expect(machine.phase).toEqual({name: "pouring", pour: 1, pours: 1});
        expect(result.current.run?.phase.name).toBe("failed");
        await act(async () => { result.current.dismiss(); });
        expect(result.current.run).toBeNull();
        expect(machine.phase).toEqual({name: "pouring", pour: 1, pours: 1});
        expect(mockRadio.written).toHaveLength(frames);
        expect(db.all()).toEqual([]);
        expect(sharedSlotDatabase().read("one").journal?.id).toBe("prior");
        await expect(machine.cancelBrew()).rejects.toThrow(/Easy Mode/i);
        await act(async () => { mockRadio.emit(event(40512)); });
        expect(db.all()).toEqual([]);
    }
);

it("wires the real route to the installed shared port, actual identity and atomic completion", async () => {
    const store = draft();
    await connect();
    // The remembered setting is not authority for the already connected peripheral.
    sharedSettings().set("machineDeviceId", "unrelated");
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getAllByText("Recipe removed from library. Snapshot kept.")).toHaveLength(3);
    const write = screen.getByRole("button", {name: "Write all three slots"});
    expect(write).toBeEnabled();
    await act(async () => {
        const pressed = fireEvent.press(write);
        await jest.advanceTimersByTimeAsync(4000);
        await pressed;
    });
    expect(mockRadio.slots.map((frame) => Array.from(frame.slice(10, 12))))
        .toEqual([[0, 2], [1, 2], [2, 2]]);
    expect(mockRadio.slots[1].at(-4)).toBe(0xFE);
    expect(mockRadio.slots.map((frame) => Array.from(frame.slice(12, -2))))
        .toEqual(store.read("one").drafts.map((slot) => slot!.blob));
    expect(store.read("one").journal).toBeNull();
    expect(new SlotDatabase(appDatabase()).read("one").written?.slots)
        .toEqual(store.read("one").drafts);
    expect(store.read("unrelated").journal).toBeNull();
    expect(mockRadio.sent).not.toContain(11512);
    expect(mockRadio.sent).not.toContain(8010);
});

it.each(["readyToStart", "grinding", "paused", "settling"] as const)(
    "explains BUSY and disables WRITE for the real owner's %s phase", async (name) => {
        const store = draft();
        await connect();
        sharedMachine().phase = name === "paused"
            ? {name, pour: 1, pours: 1, was: {name: "grinding"}} : {name};
        await renderWithProviders(<EasyModeScreen/>);
        expect(screen.getByText(/busy.*brew/i)).toBeOnTheScreen();
        expect(screen.getByRole("button", {name: "Write all three slots"})).toBeDisabled();
        expect(store.read("one").journal).toBeNull();
        expect(mockRadio.slots).toEqual([]);
    }
);

it("disables known-boundary recovery during a held brew, rather than waiting or queueing", async () => {
    journal();
    await connect();
    sharedMachine().phase = {name: "readyToStart"};
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText(/busy.*brew/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Recover incomplete write"})).toBeDisabled();
    expect(mockRadio.slots).toEqual([]);
});

it("blocks recovery in the route when the connected serial conflicts with its saved journal", async () => {
    const store = journal();
    await connect();
    const machine = sharedMachine();
    machine.info = {...machine.info!, serial: "different"};
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText(/different machine serial/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Recover incomplete write"})).toBeDisabled();
    expect(store.read("one").journal?.serial).toBe("J15ABC123456");
    expect(mockRadio.slots).toEqual([]);
});

it.each([undefined, null, 0])("rejects raw incoming dosage %p through the installed route without inventing assignments", async (dosage) => {
    const raw = JSON.parse(JSON.stringify(coffee()));
    raw.dosage = dosage;
    mockRouteParams = {recipeJSON: JSON.stringify(raw)};
    await connect();
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText(/Incoming recipe could not be opened:.*dose/i)).toBeOnTheScreen();
    expect(screen.queryByText(/Choose a slot for/i)).toBeNull();
    expect(sharedSlotDatabase().read("one").drafts).toEqual([null, null, null]);
    expect(sharedSlotDatabase().read("one").journal).toBeNull();
    expect(mockRadio.slots).toEqual([]);
});

it("shows last-known assignments offline but cannot send to them or transplant a journal after scanning", async () => {
    const store = journal();
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByRole("button", {name: "Recover incomplete write"})).toBeDisabled();
    await act(async () => {
        const connecting = sharedMachine().connect("two");
        await jest.advanceTimersByTimeAsync(2000);
        await connecting;
    });
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeDisabled();
    expect(store.read("one").journal?.id).toBe("prior");
    expect(store.read("two").journal).toBeNull();
    expect(mockRadio.slots).toEqual([]);
});

it("keeps the same port and one global listener across navigation and a live write", async () => {
    const store = draft();
    function useScreen() {
        const link = useMachine();
        const slots = useEasyModeSlots(link.machine.slotIdentity
            ?? {deviceId: link.remembered, serial: null}, link.slotPort);
        return {link, slots};
    }
    const first = await renderHook(useScreen);
    const owner = first.result.current.link.machine;
    const port = first.result.current.link.slotPort ?? unavailableSlotPort;
    expect(port.available).toBe(true);
    await act(connect);
    mockRadio.missing = true;
    let result!: Promise<void>;
    await act(async () => {
        result = first.result.current.slots.write();
        await flush();
    });
    await first.unmount();
    const second = await renderHook(useScreen);
    expect(second.result.current.link.machine).toBe(owner);
    expect(second.result.current.link.slotPort).toBe(port);
    expect(changes.size).toBe(1);
    expect(store.read("one").journal?.inFlight).toBe(0);
    await act(async () => {
        mockRadio.emit(receipt());
        mockRadio.missing = false;
        await jest.advanceTimersByTimeAsync(4000);
        await result;
    });
    expect(await result).toBeUndefined();
    expect(mockRadio.slots.map((frame) => frame[10])).toEqual([0, 1, 2]);
});

it.each(["inactive", "background", null] as const)(
    "forwards initial AppState %p and prevents an attempt before any slot traffic", async (state) => {
        Object.defineProperty(AppState, "currentState", {configurable: true, writable: true, value: state});
        const store = draft();
        const link = await renderHook(() => useMachine());
        await act(connect);
        const port = link.result.current.slotPort ?? unavailableSlotPort;
        await expect(writeSlots(store, sharedMachine().slotIdentity!, port)).rejects.toThrow(/background|active/i);
        expect(store.read("one").journal).toBeNull();
        expect(mockRadio.slots).toEqual([]);
    }
);

it("invalidates before background disconnect and never replays on foreground reconnect", async () => {
    const store = draft();
    const link = await renderHook(() => useMachine());
    await act(connect);
    mockRadio.missing = true;
    const port = link.result.current.slotPort ?? unavailableSlotPort;
    let result!: Promise<void | Error>;
    await act(async () => {
        result = writeSlots(store, sharedMachine().slotIdentity!, port).catch((error: Error) => error);
        await flush();
    });

    await act(async () => { changes.forEach((change) => change("background")); await flush(); });
    expect(await result).toBeInstanceOf(Error);
    expect(store.read("one").journal?.inFlight).toBe(0);
    await act(async () => {
        changes.forEach((change) => change("active"));
        await jest.advanceTimersByTimeAsync(2000);
    });
    expect(mockRadio.slots).toHaveLength(1);
    await expect(sharedMachine().send(buildType1(3500))).rejects.toThrow(/Easy Mode/i);
    expect(store.read("one").written).toBeNull();
});

it("refuses settings-forget with an explicit error and retains the journal through restart", async () => {
    const store = journal();
    const link = await renderHook(() => useMachine());
    await act(connect);
    await act(async () => { await link.result.current.forget(); });
    expect(link.result.current.error).toMatch(/incomplete Easy Mode/i);
    expect(sharedSettings().get("machineDeviceId")).toBe("one");
    expect(sharedMachine().isConnected()).toBe(true);
    expect(new SlotDatabase(appDatabase()).read("one").journal).toEqual(store.read("one").journal);
});

it("recovers only the stored known-boundary frames and stops a changed serial", async () => {
    const store = journal();
    store.dispatching("one", "prior", 0);
    store.acknowledge("one", "prior", 0);
    const link = await renderHook(() => useMachine());
    await act(connect);
    const machine = sharedMachine();
    const port = link.result.current.slotPort ?? unavailableSlotPort;
    await expect(recoverSlots(store, {deviceId: "one", serial: "different"}, port))
        .rejects.toThrow(/serial|different/i);
    expect(mockRadio.slots).toEqual([]);
    const stored = store.read("one").journal!.frames;
    await act(async () => {
        const recovering = recoverSlots(store, machine.slotIdentity!, port);
        await jest.advanceTimersByTimeAsync(2000);
        await recovering;
    });
    expect(mockRadio.slots.map((frame) => Array.from(frame))).toEqual(stored.slice(1));
    expect(store.read("one").journal).toBeNull();
});

it.each(["inactive", "drop"] as const)("retains uncertain writes after %s without foreground replay", async (event) => {
    const store = draft();
    const link = await renderHook(() => useMachine());
    await act(connect);
    mockRadio.missing = true;
    let result!: Promise<void | Error>;
    await act(async () => {
        result = writeSlots(store, sharedMachine().slotIdentity!,
            link.result.current.slotPort ?? unavailableSlotPort).catch((error: Error) => error);
        await flush();
        if (event === "drop") mockRadio.drop();
        else changes.forEach((change) => change("inactive"));
        await flush();
    });
    expect(await result).toBeInstanceOf(Error);
    expect(store.read("one").journal?.inFlight).toBe(0);
    await act(async () => { changes.forEach((change) => change("active")); await flush(); });
    expect(mockRadio.slots).toHaveLength(1);
    expect(new SlotDatabase(appDatabase()).read("one").journal?.inFlight).toBe(0);
    expect(store.read("one").written).toBeNull();
});
