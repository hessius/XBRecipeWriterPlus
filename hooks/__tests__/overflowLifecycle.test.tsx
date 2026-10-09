import React, {useEffect} from "react";
import {act, cleanup} from "@testing-library/react-native";
import {AppState} from "react-native";

import BrewMiniBar from "@/components/BrewMiniBar";
import OverflowStatus from "@/components/OverflowStatus";
import {OVERFLOW_FOREGROUND_CAUTION, OVERFLOW_STATE_COPY,
    OVERFLOW_WAITING_FOR_READINGS} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {LiveBrewProvider, useLiveBrew} from "@/hooks/useLiveBrew";
import BrewDatabase from "@/library/BrewDatabase";
import {forgetAppDatabase} from "@/library/appDatabase";
import {buildBackup, parseBackup} from "@/library/backup";
import {stallsFromSamples} from "@/library/brew/BrewRecord";
import Machine from "@/library/machine/Machine";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import {event, float32, notification, status} from "@/library/machine/__tests__/protocolFixtures";
import Pour from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockMachine: Machine;
let mockBacking: FakeSQLiteDatabase;
jest.mock("@/hooks/useMachine", () => ({
    useMachine: () => ({machine: mockMachine, connect: async () => {}})
}));
jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => [key === "machineAutoStart", () => {}]
}));
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockBacking}));

const epoch = 1_000_000;
const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, "currentState")!;
let at: number;
let api: ReturnType<typeof useLiveBrew>;

function Presentation() {
    const live = useLiveBrew();
    useEffect(() => { api = live; }, [live]);
    const run = live.run;
    if (run === null) return null;
    return (
        <>
            {run.overflow && (
                <OverflowStatus status={run.overflow} now={run.overflowNow ?? epoch} />
            )}
            <BrewMiniBar recipeName={run.recipe.displayName()} dose={run.recipe.dosage}
                         pours={run.recipe.pours} samples={run.samples}
                         pauseIntervals={run.pauseIntervals} bypass={run.bypass}
                         accent={palette.brand} phase={run.phase} elapsed={run.elapsed}
                         holding={run.holding} heldSeconds={run.heldSeconds}
                         onOpen={() => {}} onDismiss={live.dismiss} />
        </>
    );
}

beforeEach(() => {
    jest.useFakeTimers();
    at = 0;
    jest.spyOn(Date, "now").mockImplementation(() => epoch + at);
    Object.defineProperty(AppState, "currentState", {configurable: true, value: "active"});
    mockBacking = createTestDatabase();
});

afterEach(async () => {
    await cleanup();
    jest.restoreAllMocks();
    Object.defineProperty(AppState, "currentState", appStateDescriptor);
    jest.useRealTimers();
});

it("runs two confirmed protection intervals through the real machine, owner, recorder, UI and SQLite backup", async () => {
    const transport = new FakeTransport();
    mockMachine = new Machine(transport, {frameGapMs: 0});
    await mockMachine.connect("AA:BB");
    const database = new BrewDatabase();
    const insert = jest.spyOn(database, "insert");
    const brew = jest.spyOn(mockMachine, "brew");
    const r = new Recipe();
    r.name = "Protected Other";
    r.cupType = CUP_TYPE.OTHER;
    r.dosage = 15;
    r.ratio = 16;
    r.grindSize = 60;
    r.pours = [new Pour(1, 240, 93, 30, 0, 0, 0)];
    r.overflowProtection = {retainedGrams: 50, checkSeconds: 15};
    const view = await renderWithProviders(
        <LiveBrewProvider store={database}><Presentation key="brew" /></LiveBrewProvider>
    );
    await act(async () => { api.start(r); });
    expect(brew).toHaveBeenCalledTimes(1);
    // A tick publishes the initial armed snapshot, without inventing telemetry.
    await act(async () => { await jest.advanceTimersByTimeAsync(250); });
    expect(view.getByText(OVERFLOW_FOREGROUND_CAUTION)).toBeTruthy();
    await view.rerender(
        <LiveBrewProvider store={database}><Presentation key="library" /></LiveBrewProvider>
    );
    await act(async () => {
        api.start(r);
        transport.emit(status(0x22));
        transport.emit(event(40507));
    });
    expect(brew).toHaveBeenCalledTimes(1);

    async function time(next: number) {
        const elapsed = next - at;
        at = next;
        // Pump a host tick at the scripted epoch even at a sub-250ms boundary.
        await act(async () => { await jest.advanceTimersByTimeAsync(Math.max(250, elapsed)); });
    }
    async function pair(water: number, cup: number) {
        await act(async () => {
            transport.emit(notification(0x4B, 0x9E, float32(water * 1000)));
            transport.emit(notification(0x15, 0x9E, float32(cup)));
        });
    }
    async function frame(code: number) {
        await act(async () => { transport.emit(event(code)); });
    }
    const pauses = () => transport.sent.filter(code => code === 40518);
    const resumes = () => transport.sent.filter(code => code === 40524);

    await time(1000);
    await pair(100, 0);
    await time(1500);
    await pair(120, 0);
    expect(pauses()).toHaveLength(1);
    expect(api.run?.overflow?.mode).toBe("requesting");
    expect(view.getByText(OVERFLOW_STATE_COPY.requesting)).toBeTruthy();
    expect(api.run?.pauseIntervals).toEqual([]);
    await time(1700);
    await frame(40515);
    expect(api.run?.overflow?.nextCheckAt).toBe(epoch + 16_700);
    expect(view.getByText(OVERFLOW_STATE_COPY.holding)).toBeTruthy();

    await time(16_200);
    await pair(120, 0);
    await time(16_700);
    expect(api.run?.overflow?.nextCheckAt).toBe(epoch + 31_700);
    expect(pauses()).toHaveLength(1);
    expect(resumes()).toHaveLength(0);
    await time(31_700);
    expect(api.run?.overflow).toMatchObject({
        mode: "holding", telemetryAvailable: false, nextCheckAt: epoch + 46_700
    });
    expect(view.getByTestId("overflow-status-figures").props.children)
        .toContain(OVERFLOW_WAITING_FOR_READINGS);
    expect(api.run?.samples).toHaveLength(2);
    expect(view.getByTestId("trace-pause-overflow-0")).toBeTruthy();

    await time(46_000);
    await pair(120, 100);
    await time(46_500);
    await pair(120, 100);
    await time(46_700);
    expect(resumes()).toHaveLength(1);
    expect(api.run?.overflow?.mode).toBe("armed");
    expect(api.run?.phase.name).toBe("pouring");
    await pair(121, 100);
    await time(50_000);
    await pair(140, 80);
    await time(50_500);
    await pair(160, 80);
    expect(pauses()).toHaveLength(2);
    await time(50_700);
    await frame(40515);
    expect(api.run?.overflow?.nextCheckAt).toBe(epoch + 65_700);
    await time(52_000);
    await act(async () => { await api.resumeBrew(); });
    expect(resumes()).toHaveLength(2);
    expect(api.run?.overflow?.disabledReason).toBe("manualOverride");
    expect(view.getByText(OVERFLOW_STATE_COPY.manualOverride)).toBeTruthy();
    await pair(161, 80);
    await time(53_000);
    await frame(40516);
    await pair(240, 180);
    expect(pauses()).toHaveLength(2);
    expect(resumes()).toHaveLength(2);
    await frame(40512);

    expect(insert).toHaveBeenCalledTimes(1);
    const [record, samples] = insert.mock.calls[0];
    // The first water moved at 1 s; confirmed epochs are converted only at publication.
    const intervals = [
        {from: 700, to: 45_700, pour: 1, reason: "overflow"},
        {from: 49_700, to: 51_000, pour: 1, reason: "overflow"}
    ];
    expect(record).toMatchObject({
        outcome: "done", pouringAt: epoch + 1000, pausedSeconds: 46,
        pauseIntervals: intervals, heldSeconds: 0
    });
    expect(stallsFromSamples(samples, r.pours.map(pour => pour.volume), record.pauseIntervals))
        .toEqual([[]]);
    expect(database.get(record.id)?.pauseIntervals).toEqual(intervals);
    expect(database.samples(record.id)).toEqual(samples);
    database.sweep(0);
    expect(database.get(record.id)).toMatchObject({pauseIntervals: intervals, hasStream: false});
    const backup = parseBackup(buildBackup([r], {}, "2.1.0", database.all()));
    expect(backup.ok).toBe(true);
    if (!backup.ok) throw new Error(backup.reason);
    expect(backup.payload.skippedBrews).toBe(0);
    expect(backup.payload.brews[0].pauseIntervals).toEqual(intervals);
    forgetAppDatabase();
    mockBacking = createTestDatabase();
    const restored = new BrewDatabase();
    expect(restored.restore(backup.payload.brews)).toBe(1);
    expect(restored.get(record.id)).toMatchObject({pauseIntervals: intervals, hasStream: false});
    expect(restored.samples(record.id)).toEqual([]);
    await time(70_000);
    expect(pauses()).toHaveLength(2);
    expect(resumes()).toHaveLength(2);
    expect(insert).toHaveBeenCalledTimes(1);
});
