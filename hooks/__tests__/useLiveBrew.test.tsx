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
