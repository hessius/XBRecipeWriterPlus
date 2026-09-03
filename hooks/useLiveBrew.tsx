import React, {createContext, useContext, useRef, useState} from "react";

import {OVER} from "@/constants/brewCopy";
import {useBrewRun} from "@/hooks/useBrewRun";
import type {BrewStore} from "@/hooks/useBrewRun";
import type {BrewSample} from "@/library/brew/BrewRecord";
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
    // `runId` is bumped for every run so a second brew remounts RunOwner and
    // starts from nothing rather than inheriting the last run's samples.
    const [current, setCurrent] = useState<{recipe: Recipe; runId: number} | null>(null);

    function begin(recipe: Recipe): void {
        setCurrent((was) => ({recipe, runId: (was?.runId ?? 0) + 1}));
    }

    if (current === null) {
        return (
            <Context.Provider value={{...defaultValue, start: begin}}>
                {children}
            </Context.Provider>
        );
    }

    return (
        <RunOwner
            key={current.runId}
            recipe={current.recipe}
            store={store}
            onStart={begin}
            onDismiss={() => setCurrent(null)}
        >
            {children}
        </RunOwner>
    );
}

/**
 * The part that actually holds `useBrewRun`.
 *
 * Extracted because hooks cannot be called conditionally: without this split
 * the provider would have to call `useBrewRun` with a null recipe (and every
 * line of it would need a null check) or skip the hook entirely (illegal).
 */
function RunOwner({recipe, store, onStart, onDismiss, children}: {
    recipe: Recipe;
    store?: BrewStore;
    onStart: (recipe: Recipe) => void;
    onDismiss: () => void;
    children: React.ReactNode;
}) {
    const result = useBrewRun(recipe, store);
    const {phase, error, samples, elapsed, stageElapsed, activeIndex, holding,
           heldSeconds, brew, startBrew, cancelBrew, canOfferProMode,
           switchToProAndRetry} = result;

    // Command the machine exactly once, on the first mount of this RunOwner.
    // `start` in the Context is replaced with a no-op while RunOwner is
    // rendered, so a re-mount of the brew screen cannot call `start` and reach
    // this effect a second time.
    const brewFiredRef = useRef(false);
    React.useEffect(() => {
        if (!brewFiredRef.current) {
            brewFiredRef.current = true;
            void brew(recipe);
        }
        // recipe and brew are fixed for the lifetime of this RunOwner.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const snapshot: LiveBrewSnapshot = {
        recipe, samples, elapsed, stageElapsed, activeIndex, phase,
        holding, heldSeconds,
    };

    return (
        <Context.Provider value={{
            run: snapshot,
            // While the machine is still working, a second start is refused:
            // there is one machine and it is busy. Once the run is over the
            // bar is only a record, so a new recipe replaces it.
            start: (next: Recipe) => {
                if (OVER.has(phase.name) && next !== recipe) onStart(next);
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
