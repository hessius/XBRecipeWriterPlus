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

/** One empty array, so "no samples yet" is a stable identity across renders. */
const NO_SAMPLES: BrewSample[] = [];

/**
 * One brew, from the command to the record.
 *
 * `recipe` is null when nothing has been asked for yet: the hook is mounted for
 * the life of the app so the tree above it never has to change shape, and a
 * provider that swapped its own children in and out would remount the whole
 * navigator every time a brew began.
 *
 * `runId` identifies the run. Bumping it recreates the recorder and drops the
 * last run's published state, which is what a `key` used to do. Every piece of
 * published state carries the id it was produced under and is discarded at
 * render when they no longer match — an effect cannot reset it, because
 * `react-hooks/set-state-in-effect` is an error here.
 */
export function useBrewRun(recipe: Recipe | null, store?: BrewStore, runId: number = 0) {
    const brewer = useBrew();
    const {machine} = brewer;
    const [published, setPublished] = useState<
        {runId: number; samples: BrewSample[]; elapsed: number}
    >({runId, samples: NO_SAMPLES, elapsed: 0});
    const current = published.runId === runId;
    const samples = current ? published.samples : NO_SAMPLES;
    const elapsed = current ? published.elapsed : 0;
    // Track phase locally so React re-renders when it changes. The machine it
    // was heard from is remembered alongside it: a reconnect hands us a new
    // machine with a new recorder, and the phase the old one was left in
    // describes a brew that is no longer ours. Falling back to the new
    // machine's own phase is how that stale reading is dropped.
    const [heard, setHeard] = useState<
        {from: unknown; runId: number; phase: BrewPhase} | null
    >(null);
    const phase = heard !== null && heard.from === machine && heard.runId === runId
        ? heard.phase
        : machine.phase;
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
        const started = recipeRef.current;
        if (started === null) return;
        const active = new BrewRecorder({
            machine,
            recipe: started,
            onRecord: (record, taken) => database.current?.insert(record, taken)
        });
        recorder.current = active;
        active.start();
        return () => active.stop();
        // recipe via ref: a brew's recipe is fixed at start, and the identity
        // of the object should not restart the recorder on every render.
        // `runId` is what deliberately does restart it, for a second brew or a
        // retry: a recorder emits once and is spent afterwards.
    }, [machine, runId]);

    // Subscribe to machine.onPhase so React re-renders when the phase changes.
    // The recorder has its own subscription (registered inside start()); the
    // real Machine keeps listeners in a Set so both are called independently.
    useEffect(() => {
        return machine.onPhase((p) => { setHeard({from: machine, runId, phase: p}); });
    }, [machine, runId]);

    const pouring = phase.name === "pouring";
    const over = ["done", "cancelled", "failed", "lostContact"].includes(phase.name);

    useEffect(() => {
        if (!pouring) return;
        const tick = setInterval(() => {
            const taken = recorder.current?.samples ?? [];
            setPublished({
                runId,
                samples: [...taken],
                elapsed: taken.length > 0 ? taken[taken.length - 1].at / 1000 : 0
            });
        }, PUBLISH_MS);
        return () => clearInterval(tick);
    }, [pouring, runId]);

    // One last copy on the way out, so the finished chart is the whole brew and
    // not whatever the last tick happened to catch.
    useEffect(() => {
        if (!over) return;
        const taken = recorder.current?.samples ?? [];
        setPublished({
            runId,
            samples: [...taken],
            elapsed: taken.length > 0 ? taken[taken.length - 1].at / 1000 : 0
        });
    }, [over, runId]);

    const pours = recipe?.pours ?? [];
    const activeIndex = pouring
        ? (phase as {name: "pouring"; pour: number; pours: number}).pour - 1
        : over ? pours.length : null;

    const stageStart = pours
        .slice(0, Math.max(0, activeIndex ?? 0))
        .reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
    const stageElapsed = pouring ? Math.max(0, elapsed - stageStart) : 0;
    const live = activeIndex !== null ? pours[activeIndex] : undefined;
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
