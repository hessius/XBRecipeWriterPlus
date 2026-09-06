import {resolveAccent} from "@/library/accent";
import type {BrewFailure, BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import type Recipe from "@/library/Recipe";
import {SETTLE_CAP_MS, SETTLE_FLAT_MS} from "@/constants/machine";

import type {BrewOutcome, BrewRecord, BrewSample} from "./BrewRecord";
import {planFromPours, stageWaterFromSamples, stallsFromSamples, summarise} from "./BrewRecord";
import {plannedSeconds} from "./brewShape";
import {NOISE_FLOOR_ML} from "./stalls";

/** The part of `Machine` a recorder needs. Narrow, so a test can be a literal. */
export type RecorderMachine = {
    onNotification: (listener: (parsed: Notification) => void) => () => void;
    onPhase: (listener: (phase: BrewPhase) => void) => () => void;
};

export type RecorderOptions = {
    machine: RecorderMachine;
    recipe: Recipe;
    onRecord: (record: BrewRecord, samples: BrewSample[]) => void;
    /** Injected so a test can advance time by hand rather than by waiting. */
    now?: () => number;
    newId?: () => string;
};

const TERMINAL: ReadonlySet<BrewPhase["name"]> =
    new Set(["done", "cancelled", "lostContact", "failed"]);

function defaultId(): string {
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Watches one brew and writes down what happened.
 *
 * Subscribes rather than being called: the weights arrive ten times a second
 * from a machine that knows nothing about screens, and a recorder that had to
 * be pumped by a component would stop the moment the user dismissed the sheet.
 */
export default class BrewRecorder {
    private readonly options: RecorderOptions;
    private readonly collected: BrewSample[] = [];
    private unsubscribers: (() => void)[] = [];

    private startedAt = 0;
    /** Wall clock of the first drop, or 0 before it. The samples' zero. */
    private pouringAt = 0;
    private pour = 0;
    private pours = 0;
    private cup = 0;
    private emitted = false;

    /** True while draining after the pour: still sampling, not yet a record. */
    private settling = false;
    /** The highest cup weight seen while settling, so a drop reads as a lift. */
    private settlePeak = 0;
    /** The last cup reading that counted as a rise, and when it arrived. */
    private settleAnchorCup = 0;
    private settleAnchorAt = 0;
    /** The backstop timer, so a machine that never flattens still ends. */
    private settleCap: ReturnType<typeof setTimeout> | null = null;

    constructor(options: RecorderOptions) {
        this.options = options;
    }

    get samples(): readonly BrewSample[] {
        return this.collected;
    }

    start(): void {
        // An instance started twice must not end up wired twice. Re-arming is
        // cheaper to make safe than to forbid, so tear down first.
        this.stop();
        const {machine} = this.options;
        this.startedAt = this.clock();
        this.unsubscribers = [
            machine.onNotification((parsed) => this.receive(parsed)),
            machine.onPhase((phase) => this.observe(phase))
        ];
    }

    /** Unsubscribe without emitting. For a screen going away, not a brew ending. */
    stop(): void {
        this.unsubscribers.forEach((off) => off());
        this.unsubscribers = [];
        this.clearSettleCap();
    }

    private clearSettleCap(): void {
        if (this.settleCap !== null) {
            clearTimeout(this.settleCap);
            this.settleCap = null;
        }
    }

    private clock(): number {
        return (this.options.now ?? Date.now)();
    }

    private receive(parsed: Notification): void {
        if (this.emitted) return;
        if (parsed.kind === "cupWeight") {
            this.cup = parsed.grams;
            if (this.settling) this.watchSettle(parsed.grams);
            return;
        }
        // Sampled on water alone. Both channels arrive at about 10 Hz, so
        // sampling on each would double the stream to hold a second copy of
        // the same instant, and the cup's value is carried through anyway.
        if (parsed.kind !== "waterWeight") return;
        // Before the first drop the machine is grinding and the plan has not
        // started. Nothing it says then belongs on the plan's axis.
        if (this.pouringAt === 0) return;
        this.collected.push({
            at: this.clock() - this.pouringAt,
            water: parsed.grams,
            cup: this.cup,
            pour: this.pour
        });
    }

    private observe(phase: BrewPhase): void {
        if (phase.name === "pouring") {
            if (this.pouringAt === 0) this.pouringAt = this.clock();
            this.pour = phase.pour;
            this.pours = phase.pours;
            return;
        }
        // Non-terminal: water is done but coffee is still draining onto the
        // scale. Keep sampling and wait for the cup line to settle rather than
        // ending the record on the earliest of the machine's three end events.
        if (phase.name === "settling") {
            this.beginSettle();
            return;
        }
        if (!TERMINAL.has(phase.name)) return;
        // A refusal before anything was sent is not a brew. No frame went out
        // and no dose was spent, so there is nothing to keep.
        if (phase.name === "failed" && phase.reason === "blocked") {
            this.stop();
            return;
        }
        this.emit(phase);
    }

    private beginSettle(): void {
        // BREWER_STOP can only arrive once, but a missed one lets ENJOY fall
        // through to settling too, so guard against arming twice.
        if (this.settling || this.emitted) return;
        this.settling = true;
        this.settlePeak = this.cup;
        this.settleAnchorCup = this.cup;
        this.settleAnchorAt = this.clock();
        // Without this, a machine whose cup never quite stops weeping — or
        // whose weight stream simply stops after the pour — would leave a run
        // that never ends and a record that is never written.
        this.settleCap = setTimeout(() => this.emit({name: "done"}), SETTLE_CAP_MS);
    }

    /**
     * Decide, on each cup reading during settling, whether the brew has ended.
     *
     * Flatness is frame-driven, not a wall-clock timer: a plateau is only real
     * if we saw readings hold still across it. If the stream falls silent
     * instead, there is nothing to call flat and the cap is what ends the run.
     */
    private watchSettle(grams: number): void {
        if (grams > this.settlePeak) this.settlePeak = grams;
        // The cup being lifted off the scale: a real, physical end signal.
        if (this.settlePeak - grams > NOISE_FLOOR_ML) {
            this.emit({name: "done"});
            return;
        }
        // Still rising: coffee is still dripping. Reset the flat window.
        if (grams - this.settleAnchorCup > NOISE_FLOOR_ML) {
            this.settleAnchorCup = grams;
            this.settleAnchorAt = this.clock();
            return;
        }
        // Flat for long enough: the drawdown has stopped, so the brew has.
        if (this.clock() - this.settleAnchorAt >= SETTLE_FLAT_MS) this.emit({name: "done"});
    }

    private emit(phase: BrewPhase): void {
        // `cancelled` is routinely followed by another phase, and a machine
        // that drops mid-cancel produces two terminals for one brew.
        if (this.emitted) return;
        this.emitted = true;
        this.stop();

        const {recipe} = this.options;
        const failure: BrewFailure | null =
            phase.name === "failed" ? phase.reason : null;
        const record: BrewRecord = {
            id: (this.options.newId ?? defaultId)(),
            recipeUuid: recipe.uuid,
            recipeName: recipe.displayName(),
            accent: resolveAccent(recipe),
            startedAt: this.startedAt,
            pouringAt: this.pouringAt,
            endedAt: this.clock(),
            outcome: phase.name as BrewOutcome,
            failure,
            pours: this.pours > 0 ? this.pours : recipe.pours.length,
            stalls: stallsFromSamples(
                this.collected,
                recipe.pours.map((pour) => Math.max(pour.volume, 0))
            ),
            // Snapshotted here for the same reason `stalls` is computed here:
            // a record is a thing that happened, and it must go on saying what
            // it said even after the recipe is edited or deleted.
            plan: planFromPours(recipe.pours),
            stageWater: stageWaterFromSamples(this.collected, recipe.pours.length),
            ...summarise(this.collected, plannedSeconds(recipe.pours))
        };
        // The machine hands a phase to every listener in turn, and this is one
        // of them. If the write throws — a full disk is the realistic way —
        // the throw would walk back out through that loop and the listeners
        // behind us would never hear that the brew ended, which strands the
        // screen mid-pour with its sampling timer still running. Losing the
        // record is bad; losing the end of the brew is worse.
        try {
            this.options.onRecord(record, [...this.collected]);
        } catch (error) {
            console.warn("Could not keep this brew.", error);
        }
    }
}
