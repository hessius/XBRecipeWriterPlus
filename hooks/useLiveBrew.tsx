import React, {createContext, useContext, useRef, useState} from "react";

import {OVER} from "@/constants/brewCopy";
import {useBrewRun} from "@/hooks/useBrewRun";
import type {BrewStore} from "@/hooks/useBrewRun";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {Stall} from "@/library/brew/stalls";
import type {BrewPhase} from "@/library/machine/Machine";
import type Recipe from "@/library/Recipe";

/** The brew-state snapshot the bar and the screen both read from. */
export type LiveBrewSnapshot = {
    recipe: Recipe;
    samples: BrewSample[];
    elapsed: number;
    stageElapsed: number;
    activeIndex: number | null;
    phase: BrewPhase;
    holding: boolean;
    heldSeconds: number;
    /** Per stage, index-aligned with `recipe.pours`. Millilitres delivered. */
    stageWater: number[];
    /** Per stage, index-aligned with `recipe.pours`. */
    stalls: Stall[][];
    /** Seconds into the live stage's planned rest. Zero while it is pouring. */
    pauseElapsed: number;
};

type LiveBrew = {
    /** The current run, or null when nothing is brewing. */
    run: LiveBrewSnapshot | null;
    /**
     * Register a recipe as the one to brew.  Idempotent: once a RunOwner is
     * mounted this becomes a no-op so re-mounting the brew screen cannot start
     * a second brew.
     */
    start: (recipe: Recipe) => void;
    /**
     * Start this recipe again, switching the machine to PRO mode first.
     *
     * A retry has to come through here rather than calling `brew` directly.
     * The recorder emits once and is spent, so a second attempt on the old run
     * would collect no samples and write no history row: the run must be a new
     * run, and only `start`/`startInPro` make one.
     */
    startInPro: (recipe: Recipe) => void;
    /** Dismiss a finished or stopped bar. Has no effect while actively brewing. */
    dismiss: () => void;
    /** Command the machine to brew this recipe.  Only meaningful after `start`. */
    brew: (recipe: Recipe) => Promise<void>;
    startBrew: () => Promise<void>;
    cancelBrew: () => Promise<void>;
    canOfferProMode: () => boolean;
    switchToProAndRetry: (recipe: Recipe) => Promise<void>;
    error: string | null;
};

const noop = async () => {};

const defaultValue: LiveBrew = {
    run: null,
    start: () => {},
    startInPro: () => {},
    dismiss: () => {},
    brew: noop,
    startBrew: noop,
    cancelBrew: noop,
    canOfferProMode: () => false,
    switchToProAndRetry: noop,
    error: null,
};

const Context = createContext<LiveBrew>(defaultValue);

/**
 * The single owner of a running brew, above every screen.
 *
 * `app/brew.tsx` calls `start(recipe)` once on mount; the provider mounts a
 * `RunOwner` that calls `useBrewRun` (one recorder, one database write) and
 * auto-commands the machine.  Navigating away from the brew screen does not
 * unmount `RunOwner` — it lives here, above the navigator — so the bar on the
 * home screen keeps receiving samples until the machine reaches a terminal
 * phase.  The `dismiss` call is the only thing that tears the run down.
 *
 * Injecting `store` lets tests avoid touching SQLite.
 */
export function LiveBrewProvider({children, store}: {
    children: React.ReactNode;
    store?: BrewStore;
}) {
    // `runId` is bumped for every run so a second brew starts from nothing
    // rather than inheriting the last one's samples and spent recorder.
    const [current, setCurrent] = useState<
        {recipe: Recipe | null; runId: number; pro: boolean}
    >({recipe: null, runId: 0, pro: false});

    function begin(recipe: Recipe, pro: boolean = false): void {
        setCurrent((was) => ({recipe, runId: was.runId + 1, pro}));
    }

    // One element, always, wrapping `children`. `children` here is the whole
    // navigator: swapping the component above it — or re-keying it for a new
    // run, which is what this used to do — unmounts and remounts every screen
    // in the app, so starting a brew would throw away the navigation stack it
    // was started from.
    return (
        <RunOwner
            recipe={current.recipe}
            runId={current.runId}
            pro={current.pro}
            store={store}
            onStart={begin}
            onDismiss={() => setCurrent((was) => ({...was, recipe: null}))}
        >
            {children}
        </RunOwner>
    );
}

/**
 * The part that actually holds `useBrewRun`, and the only one in the tree.
 *
 * Always mounted, with a null recipe until something is asked for, so the
 * shape of the tree never depends on whether a brew is running.
 */
function RunOwner({recipe, runId, pro, store, onStart, onDismiss, children}: {
    recipe: Recipe | null;
    runId: number;
    pro: boolean;
    store?: BrewStore;
    onStart: (recipe: Recipe, pro?: boolean) => void;
    onDismiss: () => void;
    children: React.ReactNode;
}) {
    const result = useBrewRun(recipe, store, runId);
    const {phase, error, samples, elapsed, stageElapsed, activeIndex, holding,
           heldSeconds, stalls, stageWater, pauseElapsed, brew, startBrew,
           cancelBrew, canOfferProMode, switchToProAndRetry} = result;

    // Command the machine exactly once, on the first mount of this RunOwner.
    // `start` in the Context is replaced with a no-op while RunOwner is
    // rendered, so a re-mount of the brew screen cannot call `start` and reach
    // this effect a second time.
    // Command the machine once per run. Keyed on `runId` rather than a bare
    // mount, because this component is never remounted any more.
    const brewFiredRef = useRef<number | null>(null);
    React.useEffect(() => {
        if (recipe === null || brewFiredRef.current === runId) return;
        brewFiredRef.current = runId;
        void (pro ? switchToProAndRetry(recipe) : brew(recipe));
        // recipe and pro are fixed for the life of a run; runId is what changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runId]);

    const snapshot: LiveBrewSnapshot | null = recipe === null ? null : {
        recipe, samples, elapsed, stageElapsed, activeIndex, phase,
        holding, heldSeconds, stalls, stageWater, pauseElapsed,
    };

    return (
        <Context.Provider value={{
            run: snapshot,
            // While the machine is still working, a second start is refused:
            // there is one machine and it is busy. Once the run is over the
            // bar is only a record, so anything asked for next replaces it.
            //
            // Opening a finished brew to look at it must not come through
            // here — `app/brew.tsx` skips `start` in view mode — or tapping
            // the bar to see the brew you just made would make it again.
            start: (next: Recipe) => {
                if (recipe === null || OVER.has(phase.name)) onStart(next);
            },
            startInPro: (next: Recipe) => {
                if (recipe === null || OVER.has(phase.name)) onStart(next, true);
            },
            dismiss: onDismiss,
            brew, startBrew, cancelBrew, canOfferProMode, switchToProAndRetry, error,
        }}>
            {children}
        </Context.Provider>
    );
}

export function useLiveBrew(): LiveBrew {
    return useContext(Context);
}

export default useLiveBrew;
