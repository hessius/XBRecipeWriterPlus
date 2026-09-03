import React from "react";
import {act, render, renderHook} from "@testing-library/react-native";

import {LiveBrewProvider, useLiveBrew} from "@/hooks/useLiveBrew";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";

jest.mock("@/hooks/useBrew", () => ({
    useBrew: () => global.__brewer
}));

declare global {
    var __brewer: Omit<ReturnType<typeof import("@/hooks/useBrew").useBrew>, "machine">
        & {machine: import("@/library/brew/BrewRecorder").RecorderMachine
            & {phase: BrewPhase}};
}

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    r.pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];
    return r;
}

function harness() {
    const notifyListeners: ((n: Notification) => void)[] = [];
    const phaseListeners: ((p: BrewPhase) => void)[] = [];
    const written: {record: BrewRecord; samples: BrewSample[]}[] = [];
    global.__brewer = {
        phase: {name: "idle"} as BrewPhase,
        error: null,
        brew: jest.fn(async () => {}),
        startBrew: jest.fn(async () => {}),
        cancelBrew: jest.fn(async () => {}),
        canOfferProMode: () => false,
        switchToProAndRetry: jest.fn(async () => {}),
        machine: {
            phase: {name: "idle"} as BrewPhase,
            onNotification: (l: (n: Notification) => void) => {
                notifyListeners.push(l);
                return () => {
                    const i = notifyListeners.indexOf(l);
                    if (i !== -1) notifyListeners.splice(i, 1);
                };
            },
            onPhase: (l: (p: BrewPhase) => void) => {
                phaseListeners.push(l);
                return () => {
                    const i = phaseListeners.indexOf(l);
                    if (i !== -1) phaseListeners.splice(i, 1);
                };
            }
        }
    };
    return {
        written,
        water: (grams: number) => act(async () =>
            [...notifyListeners].forEach((l) => l({kind: "waterWeight", grams}))),
        setPhase: (p: BrewPhase) => act(async () => {
            global.__brewer.phase = p;
            global.__brewer.machine.phase = p;
            [...phaseListeners].forEach((l) => l(p));
        }),
        store: {insert: (record: BrewRecord, samples: BrewSample[]) =>
            written.push({record, samples})}
    };
}

describe("LiveBrewProvider", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    /**
     * The provider sits above the whole navigator. If starting a brew changes
     * the shape of the tree — a new element type above `children`, or a new
     * `key` on it — React unmounts and remounts every screen in the app and
     * the navigation stack the brew was started from is thrown away.
     */
    it("does not remount its children when a run starts, or when a second one does", async () => {
        const h = harness();
        let mounts = 0;
        function Child() {
            React.useEffect(() => { mounts += 1; }, []);
            return null;
        }

        let api: ReturnType<typeof useLiveBrew> | null = null;
        function Reader() {
            api = useLiveBrew();
            return null;
        }

        await render(
            <LiveBrewProvider store={h.store}>
                <Reader />
                <Child />
            </LiveBrewProvider>
        );
        expect(mounts).toBe(1);

        await act(async () => { api!.start(recipe()); });
        expect(mounts).toBe(1);

        await h.setPhase({name: "done"});
        await act(async () => { api!.start(recipe()); });
        expect(mounts).toBe(1);
    });

    /**
     * A retry has to be a new run. The recorder emits once and unsubscribes
     * itself, so a second attempt on the spent run collected no samples and
     * wrote no history row — a coffee was made that nothing ever recorded.
     */
    it("re-arms the recorder when a refused brew is retried", async () => {
        const h = harness();
        const {result} = await renderHook(() => useLiveBrew(), {
            wrapper: ({children}) => (
                <LiveBrewProvider store={h.store}>{children}</LiveBrewProvider>
            )
        });

        const r = recipe();
        await act(async () => { result.current.start(r); });
        await h.setPhase({
            name: "failed", reason: "blocked", block: "notEnoughWater",
            detail: "The tank is low."
        } as BrewPhase);
        expect(h.written).toHaveLength(0);

        await act(async () => { result.current.start(r); });
        expect(global.__brewer.brew).toHaveBeenCalledTimes(2);

        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.setPhase({name: "done"});

        expect(h.written).toHaveLength(1);
        expect(h.written[0].samples.length).toBeGreaterThan(0);
    });

    /**
     * The PRO retry is a retry too, and went the same way as the plain one.
     */
    it("starts a PRO retry as a new run, through the mode switch", async () => {
        const h = harness();
        const {result} = await renderHook(() => useLiveBrew(), {
            wrapper: ({children}) => (
                <LiveBrewProvider store={h.store}>{children}</LiveBrewProvider>
            )
        });

        const r = recipe();
        await act(async () => { result.current.start(r); });
        await h.setPhase({name: "failed", reason: "rejected"} as BrewPhase);

        await act(async () => { result.current.startInPro(r); });
        expect(global.__brewer.switchToProAndRetry).toHaveBeenCalledTimes(1);
        // Not brewed twice: PRO replaces the plain command, it does not join it.
        expect(global.__brewer.brew).toHaveBeenCalledTimes(1);

        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.setPhase({name: "done"});
        // Two rows, and that is right: `rejected` is a mid-brew failure, which
        // is kept. What matters is that the retry was recorded at all.
        expect(h.written).toHaveLength(2);
        expect(h.written[1].record.outcome).toBe("done");
        expect(h.written[1].samples.length).toBeGreaterThan(0);
    });

    /**
     * Finding 2: a second call to `start` while RunOwner is already mounted
     * must be a no-op — the machine must be commanded exactly once.
     */
    it("ignores a second start call while a run is in flight", async () => {
        const h = harness();
        const {result} = await renderHook(() => useLiveBrew(), {
            wrapper: ({children}) => (
                <LiveBrewProvider store={h.store}>{children}</LiveBrewProvider>
            )
        });

        // First start: RunOwner mounts and auto-brews.
        await act(async () => { result.current.start(recipe()); });
        expect(global.__brewer.brew).toHaveBeenCalledTimes(1);

        // Second start: simulating a re-mount of the brew screen while the run
        // is live. The provider's `start` is a no-op when RunOwner is rendered,
        // so the machine must not be commanded a second time.
        await act(async () => { result.current.start(recipe()); });
        expect(global.__brewer.brew).toHaveBeenCalledTimes(1);
    });

    /**
     * A finished bar is only a record. Brewing a second recipe while it is
     * still on screen must start a new run rather than silently reopening the
     * old one.
     */
    it("lets a new recipe replace a run that is over", async () => {
        const h = harness();
        const {result} = await renderHook(() => useLiveBrew(), {
            wrapper: ({children}) => (
                <LiveBrewProvider store={h.store}>{children}</LiveBrewProvider>
            )
        });

        const first = recipe();
        await act(async () => { result.current.start(first); });
        await h.setPhase({name: "pouring", pour: 1, pours: 2});
        await h.water(40);
        await act(async () => { jest.advanceTimersByTime(250); });
        await h.setPhase({name: "done"});

        const second = recipe();
        second.name = "Kenya Nyeri";
        await act(async () => { result.current.start(second); });

        expect(global.__brewer.brew).toHaveBeenCalledTimes(2);
        expect(result.current.run?.recipe.name).toBe("Kenya Nyeri");
        // A new run starts from nothing: the old run's samples must not carry.
        expect(result.current.run?.samples).toHaveLength(0);
    });

    /**
     * Finding 1: after the brew screen unmounts the run must continue, samples
     * must keep arriving, and the DB record must be written exactly once when
     * the machine reaches a terminal phase.
     */
    it("keeps running and writes history exactly once after the brew screen unmounts", async () => {
        const h = harness();

        // Phase name and sample count visible to the "bar reader" outside the
        // brew screen, so they can be asserted after the screen is gone.
        let lastPhaseName: string | null = null;
        let lastSamplesLength = 0;

        // The reader component: always mounted, reads the live run.
        function BarReader() {
            const {run} = useLiveBrew();
            lastPhaseName = run?.phase.name ?? null;
            lastSamplesLength = run?.samples.length ?? 0;
            return null;
        }

        // The screen component: calls `start` on mount.
        const r = recipe();
        function BrewScreen() {
            const {start} = useLiveBrew();
            React.useEffect(() => {
                start(r);
                // r and start are stable for this RunOwner's lifetime.
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, []);
            return null;
        }

        // showScreen controls whether the brew screen is in the tree.
        // Exposed via a ref so the test can trigger a re-render through state.
        const setShowScreenRef: {current: ((v: boolean) => void) | null} = {current: null};
        function Tree() {
            const [show, setShow] = React.useState(true);
            React.useEffect(() => {
                setShowScreenRef.current = setShow;
            }, [setShow]);
            return (
                <LiveBrewProvider store={h.store}>
                    {show && <BrewScreen />}
                    <BarReader />
                </LiveBrewProvider>
            );
        }

        await render(<Tree />);
        await act(async () => {}); // flush effects (RunOwner mounts, auto-brews)
        await h.setPhase({name: "pouring", pour: 1, pours: 2});

        // The brew screen navigates away — RunOwner is inside the provider and
        // stays mounted. The bar reader must keep seeing updates.
        await act(async () => { setShowScreenRef.current?.(false); });
        await act(async () => {});

        // Samples arrive after the screen unmounted.
        await h.water(40);
        await act(async () => { jest.advanceTimersByTime(250); });
        expect(lastSamplesLength).toBeGreaterThan(0);

        // Machine reaches a terminal phase.
        await h.setPhase({name: "done"});
        expect(lastPhaseName).toBe("done");

        // History is written exactly once — no double-write from a second recorder.
        expect(h.written).toHaveLength(1);
        expect(h.written[0].record.recipeName).toBe("Ethiopia Guji");
    });
});
