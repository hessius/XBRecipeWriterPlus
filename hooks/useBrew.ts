import {useEffect, useState} from "react";

import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import type Machine from "@/library/machine/Machine";
import type {BrewPhase} from "@/library/machine/Machine";
import type {TeaSteepEncoding} from "@/library/machine/protocol";
import type Recipe from "@/library/Recipe";

export type Brewer = {
    phase: BrewPhase;
    error: string | null;
    /** The link itself, for a recorder that needs the raw notification stream. */
    machine: Machine;
    brew: (recipe: Recipe) => Promise<void>;
    /**
     * Commit a recipe that was uploaded but held back, because the user has
     * auto-start off. Only meaningful in the `readyToStart` phase.
     */
    startBrew: () => Promise<void>;
    cancelBrew: () => Promise<void>;
    /**
     * Whether offering a switch to PRO mode would be a reasonable thing to do.
     * Only true after a send went nowhere on a machine that says it is in EASY,
     * and only once — the app never changes a machine's mode without asking.
     */
    canOfferProMode: () => boolean;
    switchToProAndRetry: (recipe: Recipe) => Promise<void>;
};

/**
 * One brew, as React state.
 *
 * The phase lives on the `Machine`, not here: the link outlives the route, and
 * a copy in component state would go stale the moment the user navigated away
 * and back. This subscribes rather than owns.
 */
export function useBrew(injected?: Machine): Brewer {
    const {machine, connect} = useMachine(injected);
    const [teaSteepEncoding] = useSetting("teaSteepEncoding");
    const [autoStart] = useSetting("machineAutoStart");
    const [phase, setPhase] = useState<BrewPhase>(machine.phase);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => machine.onPhase(setPhase), [machine]);
    // The setting lives up here and the machine holds the value, so that
    // `library/` never has to reach up into `hooks/` to read a preference.
    useEffect(() => {
        // `useSetting` widens the stored union to `string`, so it is narrowed
        // back to the encoding the machine expects on the way in.
        machine.setTeaSteepEncoding(teaSteepEncoding as TeaSteepEncoding);
    }, [machine, teaSteepEncoding]);
    useEffect(() => {
        machine.setAutoStart(autoStart);
    }, [machine, autoStart]);

    async function brew(recipe: Recipe): Promise<void> {
        setError(null);
        try {
            // Lazy connect: this is the first moment the user has actually
            // reached for the machine, and it is the beep they are expecting.
            if (!machine.isConnected()) await connect();
            await machine.brew(recipe);
        } catch (e) {
            setError((e as Error).message);
        }
    }

    /** Commit a recipe that was uploaded and held back. See `machineAutoStart`. */
    async function startBrew(): Promise<void> {
        setError(null);
        try {
            await machine.startBrew();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function cancelBrew(): Promise<void> {
        try {
            await machine.cancelBrew();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    // Read through to the machine rather than cached: `canOfferProMode` turns on
    // the moment the acknowledgement timer fires, which arrives as a phase change
    // that has already re-rendered this hook's consumers.
    function canOfferProMode(): boolean {
        return machine.canOfferProMode();
    }

    async function switchToProAndRetry(recipe: Recipe): Promise<void> {
        setError(null);
        try {
            await machine.switchToProAndRetry(recipe);
        } catch (e) {
            setError((e as Error).message);
        }
    }

    return {phase, error, machine, brew, startBrew, cancelBrew, canOfferProMode, switchToProAndRetry};
}

export default useBrew;
