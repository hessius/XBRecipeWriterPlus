import {useEffect, useRef, useState} from "react";

import {useBrew} from "@/hooks/useBrew";
import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import BrewRecorder from "@/library/brew/BrewRecorder";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import type {BrewPhase} from "@/library/machine/Machine";
import type Recipe from "@/library/Recipe";

/** The part of `BrewDatabase` a run writes to. Injected, so tests need no SQLite. */
export type BrewStore = {insert: (record: BrewRecord, samples: BrewSample[]) => void};

/** Four times a second: smooth for a four-minute line, cheap for layout. */
const PUBLISH_MS = 250;

export function useBrewRun(recipe: Recipe, store?: BrewStore) {
    const brewer = useBrew();
    const {machine} = brewer;
    const [samples, setSamples] = useState<BrewSample[]>([]);
    const [elapsed, setElapsed] = useState(0);
    // Track phase locally so React re-renders when it changes. The machine it
    // was heard from is remembered alongside it: a reconnect hands us a new
    // machine with a new recorder, and the phase the old one was left in
    // describes a brew that is no longer ours. Falling back to the new
    // machine's own phase is how that stale reading is dropped.
    const [heard, setHeard] = useState<{from: unknown; phase: BrewPhase} | null>(null);
    const phase = heard !== null && heard.from === machine ? heard.phase : machine.phase;
    const recorder = useRef<BrewRecorder | null>(null);
    const database = useRef<BrewStore | null>(null);
    // A brew's recipe is fixed at start. Hold the latest value in a ref so
    // the start effect (keyed on machine) sees the right recipe without being
    // re-triggered by a new Recipe object on every render.
    const recipeRef = useRef(recipe);

    // Opened once and lazily: constructing a BrewDatabase at module scope would
    // open SQLite in every test that imports this file, whether or not it
    // brews.
    if (database.current === null) database.current = store ?? new BrewDatabase();

    // Keep the ref current so a recipe change before the brew starts is not
    // lost. Declared before the start effect so that on the initial render
    // the ref is set before the recorder reads it.
    useEffect(() => {
        recipeRef.current = recipe;
    }, [recipe]);

    useEffect(() => {
        const active = new BrewRecorder({
            machine,
            recipe: recipeRef.current,
            onRecord: (record, taken) => database.current?.insert(record, taken)
        });
        recorder.current = active;
        active.start();
        return () => active.stop();
        // recipe via ref: a brew's recipe is fixed at start, and the identity
        // of the object should not restart the recorder on every render.
    }, [machine]);

    // Subscribe to machine.onPhase so React re-renders when the phase changes.
    // The recorder has its own subscription (registered inside start()); the
    // real Machine keeps listeners in a Set so both are called independently.
    useEffect(() => {
        return machine.onPhase((p) => { setHeard({from: machine, phase: p}); });
    }, [machine]);

    const pouring = phase.name === "pouring";
    const over = ["done", "cancelled", "failed", "lostContact"].includes(phase.name);

    useEffect(() => {
        if (!pouring) return;
        const tick = setInterval(() => {
            const taken = recorder.current?.samples ?? [];
            setSamples([...taken]);
            setElapsed(taken.length > 0 ? taken[taken.length - 1].at / 1000 : 0);
        }, PUBLISH_MS);
        return () => clearInterval(tick);
    }, [pouring]);

    // One last copy on the way out, so the finished chart is the whole brew and
    // not whatever the last tick happened to catch.
    useEffect(() => {
        if (!over) return;
        setSamples([...(recorder.current?.samples ?? [])]);
    }, [over]);

    const activeIndex = pouring
        ? (phase as {name: "pouring"; pour: number; pours: number}).pour - 1
        : over ? recipe.pours.length : null;

    const stageStart = recipe.pours
        .slice(0, Math.max(0, activeIndex ?? 0))
        .reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
    const stageElapsed = pouring ? Math.max(0, elapsed - stageStart) : 0;
    const live = activeIndex !== null ? recipe.pours[activeIndex] : undefined;
    const stageSpan = live === undefined ? 0 : pourSeconds(live) + pauseSeconds(live);
    // The stage has run past its own plan, which is what an overflow-protection
    // hold looks like and what a planned pause never does.
    const holding = pouring && stageSpan > 0 && stageElapsed > stageSpan;
    // Per-stage arithmetic: the over-run on this pour, not elapsed-vs-total.
    // Using total elapsed here would clamp to 0 for every pour except the last.
    const heldSeconds = holding ? stageElapsed - stageSpan : 0;

    return {...brewer, samples, elapsed, stageElapsed, activeIndex, holding, heldSeconds};
}

export default useBrewRun;
