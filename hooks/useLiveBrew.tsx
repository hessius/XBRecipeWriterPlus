import React, {createContext, useContext, useState} from "react";

import type {BrewSample} from "@/library/brew/BrewRecord";
import type {BrewPhase} from "@/library/machine/Machine";
import type Recipe from "@/library/Recipe";

/** The snapshot the brew screen pushes on every meaningful state change. */
export type LiveBrewSnapshot = {
    recipe: Recipe;
    samples: BrewSample[];
    elapsed: number;
    phase: BrewPhase;
    holding: boolean;
    heldSeconds: number;
};

type LiveBrew = {
    /** The most recent push from the brew screen, or null when nothing is brewing. */
    run: LiveBrewSnapshot | null;
    /**
     * Called by the brew screen on every meaningful state change (phase, samples,
     * elapsed). The provider freezes the last snapshot after the screen unmounts,
     * so the mini-bar on the home screen keeps showing the finished trace.
     */
    push: (snapshot: LiveBrewSnapshot) => void;
    /** Dismiss a finished or stopped bar. Has no effect while actively brewing. */
    dismiss: () => void;
};

const Context = createContext<LiveBrew>({run: null, push: () => {}, dismiss: () => {}});

/**
 * The live brew, above every screen.
 *
 * The brew screen pushes its state here so it survives navigation back. A
 * finished run is kept until dismissed, because the finished trace is the
 * record and the bar is the way into it.
 */
export function LiveBrewProvider({children}: {children: React.ReactNode}) {
    const [run, setRun] = useState<LiveBrewSnapshot | null>(null);

    return (
        <Context.Provider
            value={{
                run,
                push: setRun,
                dismiss: () => setRun(null)
            }}
        >
            {children}
        </Context.Provider>
    );
}

export function useLiveBrew(): LiveBrew {
    return useContext(Context);
}

export default useLiveBrew;
