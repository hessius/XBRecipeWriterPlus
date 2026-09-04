import {useEffect, useRef, useState} from "react";

import {useBrew} from "@/hooks/useBrew";
import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import BrewRecorder from "@/library/brew/BrewRecorder";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import {NOISE_FLOOR_ML, stageOriginMl, stallsInStage, type Stall}
    from "@/library/brew/stalls";
import type {BrewPhase} from "@/library/machine/Machine";
import type Recipe from "@/library/Recipe";

/** The part of `BrewDatabase` a run writes to. Injected, so tests need no SQLite. */
export type BrewStore = {insert: (record: BrewRecord, samples: BrewSample[]) => void};

/** Four times a second: smooth for a four-minute line, cheap for layout. */
const PUBLISH_MS = 250;

/** One empty array, so "no samples yet" is a stable identity across renders. */
const NO_SAMPLES: BrewSample[] = [];

/**
 * Millilitres delivered in one stage.
 *
 * The machine reports a running total for the whole brew -- `water` is a scale
 * reading, ~10 a second, never re-tared between stages -- so a stage's own
 * share is its last reading minus the total as it stood *before the stage
 * began*.
 *
 * Not "minus the first reading of the stage": frames are event-driven, so
 * water arrives between the boundary and the stage's first sample, and that
 * water would simply vanish. It would vanish at every boundary, so the
 * per-stage figures would not sum to the brew total, a rung would never
 * quite fill, and -- worst -- a stage would never register as having met its
 * target, which is the clause that stops a planned rest being called a stall.
 * The #87 defect would come back through the side door.
 *
 * Exported so the arithmetic can be tested without a renderer.
 *
 * @param stage 1-based, matching `BrewSample.pour`
 */
export function stageWaterFrom(samples: BrewSample[], stage: number): number {
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length === 0) return 0;
    const origin = stageOriginMl(samples, stage);
    return Math.max(0, mine[mine.length - 1].water - origin);
}

/** Seconds into the brew at which a stage first reached its target volume. */
function reachedAt(samples: BrewSample[], stage: number, targetMl: number): number | null {
    if (targetMl <= 0) return null;
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length === 0) return null;
    const startMl = stageOriginMl(samples, stage);
    const hit = mine.find((s) => s.water - startMl >= targetMl);
    return hit === undefined ? null : hit.at / 1000;
}

/** Whether the most recent sample of a stage is part of a stall still open. */
function stillStalled(samples: BrewSample[], stage: number): boolean {
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length < 2) return false;
    const last = mine[mine.length - 1];
    const before = mine[mine.length - 2];
    return last.water - before.water <= NOISE_FLOOR_ML;
}

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

    // Where this stage was *planned* to begin. Still plan-relative, and still
    // only a time source: nothing that is persisted or exported passes through
    // here, and the rung's fill is millilitres now rather than seconds.
    const stageStart = pours
        .slice(0, Math.max(0, activeIndex ?? 0))
        .reduce((total, pour) => total + pourSeconds(pour) + pauseSeconds(pour), 0);
    const stageElapsed = pouring ? Math.max(0, elapsed - stageStart) : 0;

    // Per stage, 1-based on the machine's numbering. Computed for every stage
    // and not just the live one, because a stall stays visible after the stage
    // that suffered it is finished.
    const stalls: Stall[][] = pours.map((pour, i) =>
        stallsInStage(samples, i + 1, Math.max(pour.volume, 0))
    );
    const stageWater: number[] = pours.map((_, i) => stageWaterFrom(samples, i + 1));

    const live = activeIndex !== null ? pours[activeIndex] : undefined;
    const liveTarget = live === undefined ? 0 : Math.max(live.volume, 0);
    const liveWater = activeIndex !== null ? (stageWater[activeIndex] ?? 0) : 0;
    // The rest has not begun until the water is in. Measured from the moment
    // the stage reached its target rather than from the plan, so an early or
    // late pour does not shift the countdown.
    const pouredAt = activeIndex !== null
        ? reachedAt(samples, activeIndex + 1, liveTarget)
        : null;
    const pauseElapsed = pouredAt === null ? 0 : Math.max(0, elapsed - pouredAt);

    // Holding is now a fact about the water, not a comparison against the
    // plan: the live stage has an unfinished stall. A planned rest cannot
    // produce one, which is what the old `stageElapsed > stageSpan` test got
    // wrong and then never recovered from.
    const liveStalls = activeIndex !== null ? (stalls[activeIndex] ?? []) : [];
    const heldSeconds = liveStalls.reduce((sum, s) => sum + s.seconds, 0);
    // `activeIndex !== null` leads the chain so TypeScript narrows it for the
    // `activeIndex + 1` below; `pouring` alone does not tell it anything.
    const holding = activeIndex !== null && pouring
        && liveWater < liveTarget && liveStalls.length > 0
        && stillStalled(samples, activeIndex + 1);

    return {
        ...brewer, samples, elapsed, stageElapsed, activeIndex, holding, heldSeconds,
        stalls, stageWater, pauseElapsed
    };
}

export default useBrewRun;
