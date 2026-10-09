import {act, cleanup, renderHook} from "@testing-library/react-native";
import {AppState, type AppStateStatus} from "react-native";

import {useOverflowProtection} from "@/hooks/useOverflowProtection";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import type {OverflowProtection} from "@/library/brew/overflowConfig";

const config: OverflowProtection = {retainedGrams: 50, checkSeconds: 15};
const pouring: BrewPhase = {name: "pouring", pour: 1, pours: 2};
const paused: BrewPhase = {name: "paused", pour: 1, pours: 2, was: pouring,
    pauseKind: "overflow"};
const appStateDescriptor = Object.getOwnPropertyDescriptor(AppState, "currentState")!;

function machine() {
    const notifications = new Set<(n: Notification) => void>();
    const phases = new Set<(p: BrewPhase) => void>();
    const link = {
        phase: pouring,
        pauseBrew: jest.fn(async (_kind?: "overflow") => {}),
        resumeBrew: jest.fn(async () => {}),
        onNotification: (listener: (n: Notification) => void) => {
            notifications.add(listener);
            return () => { notifications.delete(listener); };
        },
        onPhase: (listener: (p: BrewPhase) => void) => {
            phases.add(listener);
            return () => { phases.delete(listener); };
        }
    };
    return {
        link, notifications, phases,
        pair: (water = 100, cup = 0) => act(async () => {
            notifications.forEach(l => l({kind: "waterWeight", grams: water}));
            notifications.forEach(l => l({kind: "cupWeight", grams: cup}));
        }),
        phase: (p: BrewPhase) => act(async () => {
            link.phase = p;
            phases.forEach(l => l(p));
        })
    };
}

async function advance(ms: number) {
    await act(async () => { jest.advanceTimersByTime(ms); });
}

let appListeners: Set<(state: AppStateStatus) => void>;
async function appState(state: AppStateStatus) {
    await act(async () => { appListeners.forEach(l => l(state)); });
}

beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(AppState, "currentState", {configurable: true, value: "active"});
    appListeners = new Set();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
        appListeners.add(listener);
        return {remove: () => { appListeners.delete(listener); }};
    });
});

afterEach(async () => {
    await cleanup();
    jest.restoreAllMocks();
    Object.defineProperty(AppState, "currentState", appStateDescriptor);
    jest.useRealTimers();
});

describe("useOverflowProtection", () => {
    it("replaces preflight ownership synchronously with the fixed run config and no stale phase", async () => {
        const h = machine();
        const intervals = jest.spyOn(global, "setInterval");
        const {result, rerender} = await renderHook(
            (props: {config: OverflowProtection}) =>
                useOverflowProtection({machine: h.link, ...props, runId: 1}),
            {initialProps: {config}}
        );
        await h.phase({name: "failed", reason: "blocked", block: "noVitals"});
        expect(result.current.overflow?.mode).toBe("ended");
        await rerender({config: {retainedGrams: 200, checkSeconds: 45}});
        h.link.phase = pouring;
        await act(async () => { result.current.preflightRetry(); });
        expect(result.current.overflow).toEqual({
            mode: "armed", retainedGrams: null, nextCheckAt: null, telemetryAvailable: false
        });
        expect(h.notifications.size).toBe(1);
        expect(h.phases.size).toBe(1);
        expect(appListeners.size).toBe(1);
        expect(intervals).toHaveBeenCalledTimes(1);
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).not.toHaveBeenCalled();
        await h.phase(pouring);
        await advance(250);
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(1);
        await h.phase(paused);
        expect(result.current.overflow?.nextCheckAt).toBe(Date.now() + 15_000);
    });

    it("does not let an earlier attempt's retry reset a newer disabled run", async () => {
        const h = machine();
        const {result, rerender} = await renderHook(
            ({runId}: {runId: number}) => useOverflowProtection({machine: h.link, config, runId}),
            {initialProps: {runId: 1}}
        );
        const earlierRetry = result.current.preflightRetry;
        await rerender({runId: 2});
        await h.phase(pouring);
        await appState("inactive");
        await appState("active");
        await act(async () => { earlierRetry(); });
        expect(result.current.overflow?.disabledReason).toBe("background");
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).not.toHaveBeenCalled();
    });

    it("uses raw pairs, waits for confirmation, then resumes only on fresh sustained drainage", async () => {
        const h = machine();
        const {result} = await renderHook(() => useOverflowProtection({
            machine: h.link, config, runId: 1
        }));
        await h.phase(pouring);
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).toHaveBeenCalledWith("overflow");
        expect(result.current.overflow?.mode).toBe("requesting");
        expect(result.current.overflow?.nextCheckAt).toBeNull();
        await h.phase(paused);
        expect(result.current.overflow?.nextCheckAt).toBe(Date.now() + 15_000);
        await advance(15_000);
        expect(h.link.resumeBrew).not.toHaveBeenCalled();
        await advance(14_250);
        await h.pair(100, 90);
        await advance(500);
        await h.pair(100, 90);
        await advance(250);
        expect(h.link.resumeBrew).toHaveBeenCalledTimes(1);
    });

    it("registers no listeners or timer without configuration", async () => {
        const h = machine();
        const intervals = jest.spyOn(global, "setInterval");
        const {result} = await renderHook(() => useOverflowProtection({
            machine: h.link, config: undefined, runId: 1
        }));
        expect(result.current.overflow).toBeUndefined();
        expect(h.notifications.size).toBe(0);
        expect(h.phases.size).toBe(0);
        expect(appListeners.size).toBe(0);
        expect(intervals).not.toHaveBeenCalled();
    });

    it.each(["inactive", "background", null] as const)(
        "disables before telemetry when the initial app state is %s", async state => {
            Object.defineProperty(AppState, "currentState", {configurable: true, value: state});
            const h = machine();
            const {result} = await renderHook(() => useOverflowProtection({
                machine: h.link, config, runId: 1
            }));
            await h.phase(pouring);
            await h.pair();
            await advance(500);
            await h.pair();
            expect(result.current.overflow?.disabledReason).toBe("background");
            expect(h.link.pauseBrew).not.toHaveBeenCalled();
        }
    );

    it.each(["background", "lostContact"] as const)(
        "invalidates %s for the rest of the run without foreground restoration", async reason => {
            const h = machine();
            const {result} = await renderHook(() => useOverflowProtection({
                machine: h.link, config, runId: 1
            }));
            await h.phase(pouring);
            await h.pair();
            await advance(500);
            await h.pair();
            await h.phase(paused);
            if (reason === "background") await appState("inactive");
            else await h.phase({name: "lostContact"});
            await appState("active");
            await h.phase(pouring);
            await h.pair(100, 90);
            await advance(500);
            await h.pair(100, 90);
            await advance(30_000);
            expect(result.current.overflow?.disabledReason).toBe(reason);
            expect(h.link.resumeBrew).not.toHaveBeenCalled();
        }
    );

    it("never automatically resumes an ordinary manual pause", async () => {
        const h = machine();
        const {result} = await renderHook(() => useOverflowProtection({
            machine: h.link, config, runId: 1
        }));
        await h.phase(pouring);
        await act(async () => { result.current.manualPause(); });
        await h.phase({name: "paused", pour: 1, pours: 2, was: pouring});
        await h.pair(100, 90);
        await advance(500);
        await h.pair(100, 90);
        await advance(30_000);
        expect(h.link.resumeBrew).not.toHaveBeenCalled();
        expect(h.link.pauseBrew).not.toHaveBeenCalled();
    });

    it("manual override prevents any later automatic commands", async () => {
        const h = machine();
        const {result} = await renderHook(() => useOverflowProtection({
            machine: h.link, config, runId: 1
        }));
        await h.phase(pouring);
        await h.pair();
        await advance(500);
        await h.pair();
        await h.phase(paused);
        await act(async () => { result.current.manualResume(); });
        await h.phase(pouring);
        await h.pair();
        await advance(500);
        await h.pair();
        await advance(30_000);
        expect(result.current.overflow?.disabledReason).toBe("manualOverride");
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(1);
        expect(h.link.resumeBrew).not.toHaveBeenCalled();
    });

    it.each(["pause", "resume"] as const)("publishes direct %s command rejection", async command => {
        const h = machine();
        if (command === "pause") h.link.pauseBrew.mockRejectedValue(new Error("native pause"));
        else h.link.resumeBrew.mockRejectedValue(new Error("native resume"));
        const {result} = await renderHook(() => useOverflowProtection({
            machine: h.link, config, runId: 1
        }));
        await h.phase(pouring);
        await h.pair();
        await advance(500);
        await h.pair();
        if (command === "resume") {
            await h.phase(paused);
            await advance(14_250);
            await h.pair(100, 90);
            await advance(500);
            await h.pair(100, 90);
            await advance(250);
        }
        expect(result.current.overflow?.mode).toBe("error");
        expect(result.current.overflow?.error).toContain(`Could not ${command}`);
    });

    it("keeps configuration fixed but creates fresh ownership for another run", async () => {
        const h = machine();
        const {result, rerender} = await renderHook(
            (props: {config: OverflowProtection; runId: number}) =>
                useOverflowProtection({machine: h.link, ...props}),
            {initialProps: {config, runId: 1}}
        );
        await h.phase(pouring);
        await rerender({config: {...config, retainedGrams: 200}, runId: 1});
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(1);
        await h.phase(paused);
        await rerender({config: {retainedGrams: 200, checkSeconds: 45}, runId: 2});
        expect(result.current.overflow?.mode).not.toBe("holding");
        expect(h.notifications.size).toBe(1);
        await h.phase(pouring);
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(1);
        await advance(250);
        await h.pair(250);
        await advance(500);
        await h.pair(250);
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(2);
        await h.phase(paused);
        expect(result.current.overflow?.nextCheckAt).toBe(Date.now() + 45_000);
    });

    it("disposes pending native work, timers and even queued callbacks on unmount", async () => {
        const h = machine();
        const intervals = jest.spyOn(global, "setInterval");
        const clear = jest.spyOn(global, "clearInterval");
        let reject!: (error: Error) => void;
        h.link.pauseBrew.mockImplementation(() => new Promise<void>((_resolve, fail) => {
            reject = fail;
        }));
        const {unmount} = await renderHook(() => useOverflowProtection({
            machine: h.link, config, runId: 1
        }));
        await h.phase(pouring);
        const oldNotifications = [...h.notifications];
        const oldPhases = [...h.phases];
        await h.pair();
        await advance(500);
        await h.pair();
        await act(async () => { await unmount(); });
        expect(h.notifications.size).toBe(0);
        expect(h.phases.size).toBe(0);
        expect(appListeners.size).toBe(0);
        expect(intervals).toHaveBeenCalledTimes(1);
        expect(clear).toHaveBeenCalledWith(intervals.mock.results[0].value);
        await act(async () => {
            oldPhases.forEach(l => l(paused));
            oldNotifications.forEach(l => l({kind: "cupWeight", grams: 100}));
            reject(new Error("late failure"));
        });
        await advance(60_000);
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(1);
        expect(h.link.resumeBrew).not.toHaveBeenCalled();
    });

    it("discards the old machine snapshot and asynchronous generation on replacement", async () => {
        const first = machine();
        const next = machine();
        let reject!: (error: Error) => void;
        first.link.pauseBrew.mockImplementation(() => new Promise<void>((_resolve, fail) => {
            reject = fail;
        }));
        const {result, rerender} = await renderHook(
            (props: {machine: typeof first.link}) => useOverflowProtection({...props, config, runId: 1}),
            {initialProps: {machine: first.link}}
        );
        await first.phase(pouring);
        await first.pair();
        await advance(500);
        await first.pair();
        await rerender({machine: next.link});
        await next.phase(pouring);
        expect(result.current.overflow?.mode).not.toBe("requesting");
        await act(async () => { reject(new Error("old failure")); });
        await next.pair();
        await advance(500);
        await next.pair();
        expect(result.current.overflow?.mode).toBe("requesting");
        expect(next.link.pauseBrew).toHaveBeenCalledTimes(1);
    });

    it("does not inherit an earlier run's machine phase before fresh phase telemetry", async () => {
        const h = machine();
        const {result} = await renderHook(() => useOverflowProtection({
            machine: h.link, config, runId: 2
        }));
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).not.toHaveBeenCalled();
        expect(result.current.overflow?.mode).toBe("armed");
        await h.phase(pouring);
        await advance(250);
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(1);
    });

    it("does not turn a raw telemetry gap or repeated timer ticks into sustained evidence", async () => {
        const h = machine();
        const {result} = await renderHook(() => useOverflowProtection({
            machine: h.link, config, runId: 1
        }));
        await h.phase(pouring);
        await h.pair();
        await advance(2000);
        expect(result.current.overflow?.telemetryAvailable).toBe(false);
        expect(h.link.pauseBrew).not.toHaveBeenCalled();
        await h.pair();
        expect(h.link.pauseBrew).not.toHaveBeenCalled();
        await advance(250);
        await h.pair();
        expect(h.link.pauseBrew).not.toHaveBeenCalled();
        await advance(250);
        await h.pair();
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(1);
    });

    it("ignores queued callbacks and pending rejections from an earlier runId", async () => {
        const h = machine();
        let reject!: (error: Error) => void;
        h.link.pauseBrew.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => {
            reject = fail;
        }));
        const {result, rerender} = await renderHook(
            ({runId}: {runId: number}) => useOverflowProtection({machine: h.link, config, runId}),
            {initialProps: {runId: 1}}
        );
        await h.phase(pouring);
        const oldNotifications = [...h.notifications];
        const oldPhases = [...h.phases];
        await h.pair();
        await advance(500);
        await h.pair();
        await rerender({runId: 2});
        await act(async () => {
            oldPhases.forEach(l => l(paused));
            oldNotifications.forEach(l => l({kind: "cupWeight", grams: 100}));
            reject(new Error("earlier run"));
        });
        await advance(30_000);
        expect(result.current.overflow?.mode).toBe("armed");
        expect(h.link.resumeBrew).not.toHaveBeenCalled();
        await h.phase(pouring);
        await h.pair();
        await advance(500);
        await h.pair();
        expect(h.link.pauseBrew).toHaveBeenCalledTimes(2);
    });
});
