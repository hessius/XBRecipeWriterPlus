import {resolveAccent} from "@/library/accent";
import type {BrewFailure, BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import type Recipe from "@/library/Recipe";

import type {BrewOutcome, BrewRecord, BrewSample} from "./BrewRecord";
import {summarise} from "./BrewRecord";
import {plannedSeconds} from "./brewShape";

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
    }

    private clock(): number {
        return (this.options.now ?? Date.now)();
    }

    private receive(parsed: Notification): void {
        if (this.emitted) return;
        if (parsed.kind === "cupWeight") {
            this.cup = parsed.grams;
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
        if (!TERMINAL.has(phase.name)) return;
        // A refusal before anything was sent is not a brew. No frame went out
        // and no dose was spent, so there is nothing to keep.
        if (phase.name === "failed" && phase.reason === "blocked") {
            this.stop();
            return;
        }
        this.emit(phase);
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
