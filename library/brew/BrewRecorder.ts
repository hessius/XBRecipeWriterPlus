import {resolveAccent} from "@/library/accent";
import type {BrewFailure, BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import type Recipe from "@/library/Recipe";
import {LIFT_DROP_G, SETTLE_CAP_MS, SETTLE_CEILING_MS, SETTLE_FLAT_MS}
    from "@/constants/machine";
import {EVENT, MACHINE_STATE} from "@/library/machine/protocol";

import type {BrewRecord, BrewSample} from "./BrewRecord";
import {finalOutcome, planFromPours, stageWaterFromSamples, stallsFromSamples,
        summarise} from "./BrewRecord";
import {plannedSeconds} from "./brewShape";
import {NOISE_FLOOR_ML, stageWaterFrom} from "./stalls";

/** The part of `Machine` a recorder needs. Narrow, so a test can be a literal. */
export type RecorderMachine = {
    onNotification: (listener: (parsed: Notification) => void) => () => void;
    onPhase: (listener: (phase: BrewPhase) => void) => () => void;
    /**
     * The frames this machine has seen since a moment, as text.
     *
     * Optional so the narrow test literals above stay valid, and so a machine
     * that keeps no history is simply a brew with no log rather than a crash
     * at the one moment — the end of a brew — where a crash costs the record.
     */
    frameLogSince?: (from: number) => string;
};

export type RecorderOptions = {
    machine: RecorderMachine;
    recipe: Recipe;
    onRecord: (record: BrewRecord, samples: BrewSample[], frames: string) => void;
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
    /** Wall clock of the first water that moved, or 0 before it. The samples' zero. */
    private pouringAt = 0;
    /** True once the pour phase has opened, so the backstop knows a brew began. */
    private pourOpened = false;
    /** Wall clock when the pour phase opened — the fallback zero if water never moves. */
    private pourOpenedAt = 0;
    /** The water reading when the pour opened; the clock starts once it rises past it. */
    private pourBaselineWater = 0;
    private pour = 0;
    private pours = 0;
    /**
     * Milliseconds into the brew that the bypass began, or null.
     *
     * On the samples' clock, not the wall clock, so a record replays against
     * its own timeline the way every other figure on it does.
     */
    private bypassAt: number | null = null;
    private cup = 0;
    /** The most recent water reading, carried onto cup-driven settling samples. */
    private lastWater = 0;
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
    /** When settling opened, for the ceiling the backstop cannot be pushed past. */
    private settleOpenedAt = 0;
    /**
     * Whether the machine itself has said the coffee is ready.
     *
     * ENJOY (40512) and the READY state arrive a good twenty seconds before
     * ENJOY_2 stops the machine's timer, so they are not the end — but they are
     * the machine's own opinion that the drawdown is over, and that is exactly
     * the thing a flat cup line cannot tell on its own. Until one of them
     * arrives, a cup that has stopped rising is a bed that has dammed, not a
     * brew that has finished.
     */
    private machineReady = false;

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
        if (parsed.kind === "event" && parsed.code === EVENT.ENJOY) this.machineReady = true;
        if (parsed.kind === "status"
            && (parsed.state === MACHINE_STATE.READY
                || parsed.state === MACHINE_STATE.COMPLETE)) {
            this.machineReady = true;
        }
        // The machine is still talking, so the drawdown is still under way.
        // Push the backstop out; it is there for a link that has gone silent,
        // not for a brew that is taking its time.
        if (this.settling) this.armSettleCap();
        if (parsed.kind === "cupWeight") {
            this.cup = parsed.grams;
            // During settling the water stream may have stopped at BREWER_STOP
            // — that is the very hardware unknown this phase is contingent on.
            // If it has, the drawdown reaches the record only through the cup
            // channel, so sample on it here (the water value is static by now).
            // A silent gap in the trace would look exactly like success. Record
            // before deciding, so the frame that ends the settle is itself kept.
            if (this.settling) {
                if (this.pouringAt !== 0) this.push(this.lastWater);
                this.watchSettle(parsed.grams);
            }
            return;
        }
        // Outside settling, sampled on water alone. Both channels arrive at
        // about 10 Hz, so sampling on each would double the stream to hold a
        // second copy of the same instant, and the cup's value is carried
        // through anyway.
        if (parsed.kind !== "waterWeight") return;
        this.lastWater = parsed.grams;
        if (this.pouringAt === 0) {
            // Before the pour opens the machine is grinding; nothing it says
            // then belongs on the plan's axis.
            if (!this.pourOpened) return;
            // The pour phase opens on GRINDER_STOP, seconds before water moves
            // while the machine heats. Start the clock — and the trace — on the
            // first reading that has risen past the noise floor above where the
            // phase opened, so `at = 0` means "water started", not "grinder
            // stopped", and the trace does not open with a flat run of dead
            // time. NOISE_FLOOR_ML is the right scale for "a real change or just
            // the scale"; unlike the lift test, where a ratcheting peak made it
            // three orders of magnitude too small.
            if (parsed.grams - this.pourBaselineWater <= NOISE_FLOOR_ML) return;
            this.pouringAt = this.clock();
        }
        this.push(parsed.grams);
    }

    /** Append one sample at the current instant, cup and pour carried through. */
    private push(water: number): void {
        this.collected.push({
            at: this.clock() - this.pouringAt,
            water,
            cup: this.cup,
            pour: this.pour
        });
    }

    /**
     * Anchor the samples' zero when water never started the clock itself.
     *
     * The clock is meant to start on the first water that moves. If that never
     * happens — a silent channel, or a reading that never rises past the noise
     * floor — a genuine brew would otherwise keep `pouringAt` at 0 and discard
     * every frame. Fall back to where the pour opened, which is where the clock
     * used to start: a degraded zero, but a real record beats an empty one.
     */
    private ensurePouringAt(): void {
        if (this.pouringAt === 0 && this.pourOpened) this.pouringAt = this.pourOpenedAt;
    }

    private observe(phase: BrewPhase): void {
        if (phase.name === "pouring") {
            this.pour = phase.pour;
            this.pours = phase.pours;
            if (!this.pourOpened) {
                // The phase opens on GRINDER_STOP, not on water arriving. Note
                // where and when it opened, but leave the clock unstarted: it
                // begins on the first water that actually moves (see `receive`).
                this.pourOpened = true;
                this.pourOpenedAt = this.clock();
                this.pourBaselineWater = this.lastWater;
            }
            return;
        }
        // The bypass is stage n + 1, and this line is the whole fix.
        //
        // Every sample carries whichever pour index was last announced, and the
        // machine announces no pour for the bypass — so its water was stamped
        // with the last stage and counted as that stage's. Worse, its arrival
        // was a *rise*, which closed the flat drawdown plateau before it and
        // had it recorded as a 61-second stall: the target guard in
        // `stallsInStage` only covers a plateau still open at the end of the
        // stage. Moving the index moves both.
        if (phase.name === "bypass") {
            this.pour = (this.pours > 0 ? this.pours : this.options.recipe.pours.length) + 1;
            // `pouringAt` is 0 if water never moved; `ensurePouringAt` is what
            // the terminal path uses, and the same fallback applies here.
            this.ensurePouringAt();
            this.bypassAt = this.clock() - this.pouringAt;
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
        // Water may never have crossed the threshold — a silent or barely
        // moving channel — so the clock never started. Anchor it now, before
        // the drawdown arrives on the cup channel, or those frames would be
        // gated out at a zero of 0 and the settle would record nothing.
        this.ensurePouringAt();
        this.settling = true;
        this.settlePeak = this.cup;
        this.settleAnchorCup = this.cup;
        this.settleAnchorAt = this.clock();
        this.settleOpenedAt = this.clock();
        // Without this, a machine whose cup never quite stops weeping — or
        // whose weight stream simply stops after the pour — would leave a run
        // that never ends and a record that is never written.
        this.armSettleCap();
    }

    /**
     * (Re)start the backstop that ends a record the machine never ends itself.
     *
     * Restarted by every frame, so it counts silence rather than elapsed time:
     * a two-minute drawdown that the machine narrates the whole way through is
     * a slow brew, not a lost one. The ceiling is what keeps a machine that
     * chatters without ever finishing from leaving a record unwritten.
     */
    private armSettleCap(): void {
        this.clearSettleCap();
        const since = this.clock() - this.settleOpenedAt;
        const wait = Math.max(0, Math.min(SETTLE_CAP_MS, SETTLE_CEILING_MS - since));
        this.settleCap = setTimeout(() => this.emit({name: "done"}), wait);
        this.settleCap.unref?.();
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
        // The cup being lifted off the scale: a real, physical end signal. Held
        // to LIFT_DROP_G, not the noise floor — `settlePeak` ratchets, so a
        // peak-to-trough test against half a gram would fire on ordinary
        // scale jitter and truncate the drawdown non-deterministically.
        if (this.settlePeak - grams > LIFT_DROP_G) {
            this.emit({name: "done"});
            return;
        }
        // Still rising: coffee is still dripping. Reset the flat window.
        if (grams - this.settleAnchorCup > NOISE_FLOOR_ML) {
            this.settleAnchorCup = grams;
            this.settleAnchorAt = this.clock();
            return;
        }
        // A flat cup only means the end once the machine agrees the coffee is
        // ready. Before that it means the water is sitting on the bed, which is
        // an ordinary slow drawdown — and ending there truncated a real brew's
        // record with eighty-five of its two hundred and forty millilitres
        // still above the grounds.
        if (!this.machineReady) return;
        // Flat for long enough: the drawdown has stopped, so the brew has.
        if (this.clock() - this.settleAnchorAt >= SETTLE_FLAT_MS) this.emit({name: "done"});
    }

    private emit(phase: BrewPhase): void {
        // `cancelled` is routinely followed by another phase, and a machine
        // that drops mid-cancel produces two terminals for one brew.
        if (this.emitted) return;
        this.emitted = true;
        // If a brew opened but water never moved the clock, fall back to where
        // the pour opened so the record has a coherent, non-zero zero rather
        // than being silently discarded — the defect-5 failure shape again.
        this.ensurePouringAt();
        this.stop();

        const {recipe} = this.options;
        const plannedWater = recipe.pours.reduce(
            (sum, pour) => sum + Math.max(pour.volume, 0), 0
        );
        const figures = summarise(this.collected, plannedSeconds(recipe.pours));
        const failure: BrewFailure | null =
            phase.name === "failed" ? phase.reason : null;
        const stages = this.pours > 0 ? this.pours : recipe.pours.length;
        // Copied from the recipe, like `plan`: what was asked for is part of
        // what happened, and it must not change when the recipe does.
        const bypass = recipe.bypassEnabled && !recipe.isTea()
                       && recipe.bypassVolume > 0
            ? {
                volume: Math.max(recipe.bypassVolume, 0),
                temperature: recipe.bypassTemp,
                delivered: this.bypassAt === null
                    ? 0
                    : stageWaterFrom(this.collected, stages + 1),
                startedAt: this.bypassAt
              }
            : undefined;
        const record: BrewRecord = {
            id: (this.options.newId ?? defaultId)(),
            recipeUuid: recipe.uuid,
            recipeName: recipe.displayName(),
            accent: resolveAccent(recipe),
            startedAt: this.startedAt,
            pouringAt: this.pouringAt,
            endedAt: this.clock(),
            outcome: finalOutcome(phase.name, figures.waterTotal - (bypass?.delivered ?? 0), plannedWater),
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
            // Spread rather than assigned, so a recipe with no bypass leaves
            // the key off the row entirely and reads back as an old record.
            ...(bypass === undefined ? {} : {bypass}),
            ...figures
        };
        // The machine hands a phase to every listener in turn, and this is one
        // of them. If the write throws — a full disk is the realistic way —
        // the throw would walk back out through that loop and the listeners
        // behind us would never hear that the brew ended, which strands the
        // screen mid-pour with its sampling timer still running. Losing the
        // record is bad; losing the end of the brew is worse.
        try {
            this.options.onRecord(
                record, [...this.collected],
                this.options.machine.frameLogSince?.(record.startedAt) ?? ""
            );
        } catch (error) {
            console.warn("Could not keep this brew.", error);
        }
    }
}
