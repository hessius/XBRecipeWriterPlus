import type {OverflowProtection} from "./overflowConfig";
import type {BrewPhase} from "@/library/machine/Machine";
import type {Notification} from "@/library/machine/protocol";
import {PAUSE_ACK_MS} from "@/constants/machine";
import {OVERFLOW_PUBLISH_MS, OVERFLOW_READING_MAX_AGE_MS} from "@/constants/overflow";
import {crossingAt, pairedRetained, type Crossing, type Reading, type RetainedPair} from "./overflowPolicy";

export type OverflowMode = "armed" | "requesting" | "holding" | "resuming" | "disabled" | "error" | "ended";
export type OverflowDisabled = "background" | "manualOverride" | "lostContact";
export type OverflowSnapshot = {
    mode: OverflowMode;
    retainedGrams: number | null;
    nextCheckAt: number | null;
    telemetryAvailable: boolean;
    disabledReason?: OverflowDisabled;
    error?: string;
};
export type OverflowCommands = {pause: () => Promise<void>; resume: () => Promise<void>};
export type OverflowOptions = {
    config: OverflowProtection;
    commands: OverflowCommands;
    now: () => number;
    onChange: (snapshot: OverflowSnapshot) => void;
};

/**
 * One run's policy, driven by raw notifications, phases and host ticks.
 * Command completion means sent, not confirmed; only an overflow paused phase
 * grants automatic resume ownership. The caller selects Other-only config.
 */
export class OverflowController {
    private readonly config: OverflowProtection;
    private currentPhase: BrewPhase = {name: "idle"};
    private state: OverflowSnapshot = {
        mode: "armed", retainedGrams: null, nextCheckAt: null, telemetryAvailable: false
    };
    private water?: Reading;
    private cup?: Reading;
    private crossing: Crossing = {since: null, lastAt: null, sustained: false};
    private lastPairAt: number | null = null;
    private ackAt: number | null = null;
    private generation = 0;
    private disposed = false;
    private manualPaused = false;
    private manualAckAt: number | null = null;
    private published?: OverflowSnapshot;
    private publishedAt = -Infinity;

    constructor(private readonly options: OverflowOptions) {
        this.config = {...options.config};
    }

    get snapshot(): OverflowSnapshot {
        return {...this.state};
    }

    notification(parsed: Notification): void {
        if (this.stopped()) return;
        const now = this.options.now();
        this.expireManualAck(now);
        this.resetStale(now);
        if (parsed.kind === "waterWeight") this.water = {grams: parsed.grams, at: now};
        if (parsed.kind === "cupWeight") this.cup = {grams: parsed.grams, at: now};
        const pair = this.refresh(now);
        if (this.expireAck(now)) return;
        if (parsed.kind === "waterWeight" || parsed.kind === "cupWeight") {
            this.observe(pair);
            if (this.state.mode === "armed" && this.eligible() && pair
                && pair.grams >= this.config.retainedGrams && this.crossing.sustained) {
                this.resetCrossing();
                this.ackAt = now + PAUSE_ACK_MS;
                this.state.mode = "requesting";
                const generation = ++this.generation;
                this.publish();
                this.send("pause", generation);
                return;
            }
        }
        this.publish();
    }

    phase(phase: BrewPhase): void {
        if (this.disposed || this.state.mode === "ended") return;
        if (phase.name === "done" || phase.name === "cancelled" || phase.name === "failed") {
            this.cancel();
            return;
        }
        if (this.stopped()) return;
        if (phase.name === "lostContact") {
            this.disable("lostContact");
            return;
        }
        this.expireManualAck(this.options.now());
        if (this.expireAck(this.options.now())) return;
        const previous = this.currentPhase;
        this.currentPhase = phase;
        if (this.state.mode === "requesting" && phase.name === "paused" && phase.pauseKind === "overflow") {
            this.ackAt = null;
            this.state.mode = "holding";
            this.state.nextCheckAt = this.options.now() + this.config.checkSeconds * 1000;
            this.resetCrossing();
            this.publish();
            return;
        }
        if (phase.name === "paused" && (phase.pauseKind !== "overflow" || this.manualPaused)) {
            // A late overflow ACK may describe the pause the user just took over.
            this.manualPaused = true;
            this.manualAckAt = null;
            this.relinquish();
            this.publish();
            return;
        }
        if (this.state.mode === "holding" && phase.name !== "paused") {
            this.disable("manualOverride");
            return;
        }
        if (previous.name === "paused" && previous.pauseKind !== "overflow" && phase.name !== "paused") {
            this.releaseManualPause();
        }
        const samePour = previous.name === "pouring" && phase.name === "pouring"
            && previous.pour === phase.pour && previous.pours === phase.pours;
        if (previous.name !== phase.name || (phase.name === "pouring" && !samePour)) {
            this.resetCrossing();
            if (this.state.mode === "requesting" || (this.state.mode === "resuming" && !this.eligible())) {
                this.relinquish();
                this.publish();
            }
        }
    }

    tick(): void {
        if (this.stopped()) return;
        const now = this.options.now();
        this.expireManualAck(now);
        const pair = this.refresh(now);
        if (!pair) this.resetCrossing();
        if (this.expireAck(now)) return;
        if (this.state.mode === "holding" && this.state.nextCheckAt !== null && now >= this.state.nextCheckAt) {
            if (pair && pair.grams < this.config.retainedGrams && this.crossing.sustained) {
                this.state.mode = "resuming";
                this.state.nextCheckAt = null;
                const generation = ++this.generation;
                this.publish();
                this.send("resume", generation);
                return;
            }
            this.state.nextCheckAt = now + this.config.checkSeconds * 1000;
        }
        this.publish();
    }

    background(): void {
        if (!this.stopped()) this.disable("background");
    }

    /** Suppress before sending; only this request's native failure can roll it back. */
    manualPause(): (() => void) | undefined {
        if (this.stopped()) return;
        this.manualPaused = true;
        this.relinquish();
        // Taking over an actual pause must not expire back into automatic ownership.
        this.manualAckAt = this.currentPhase.name === "paused" ? null : this.options.now() + PAUSE_ACK_MS;
        const generation = this.generation;
        this.publish();
        return () => {
            if (this.stopped() || generation !== this.generation || this.manualAckAt === null) return;
            this.releaseManualPause();
        };
    }

    manualResume(): void {
        if (this.stopped()) return;
        if (this.ownsPause()) {
            this.disable("manualOverride");
        } else {
            this.releaseManualPause();
        }
    }

    cancel(): void {
        if (this.disposed || this.state.mode === "ended") return;
        this.clear();
        this.state = {mode: "ended", retainedGrams: null, nextCheckAt: null, telemetryAvailable: false};
        this.publish();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.state = {mode: "ended", retainedGrams: null, nextCheckAt: null, telemetryAvailable: false};
    }

    private stopped(): boolean {
        return this.disposed || this.state.mode === "ended"
            || this.state.mode === "disabled" || this.state.mode === "error";
    }

    private ownsPause(): boolean {
        return this.state.mode === "requesting" || this.state.mode === "holding" || this.state.mode === "resuming";
    }

    private relinquish(): void {
        this.generation++;
        this.ackAt = null;
        this.state.mode = "armed";
        this.state.nextCheckAt = null;
        this.resetCrossing();
    }

    private clear(): void {
        this.generation++;
        this.ackAt = null;
        this.manualAckAt = null;
        this.manualPaused = false;
        this.water = undefined;
        this.cup = undefined;
        this.resetCrossing();
    }

    private disable(reason: OverflowDisabled): void {
        this.clear();
        this.state = {
            mode: "disabled", disabledReason: reason,
            retainedGrams: null, nextCheckAt: null, telemetryAvailable: false
        };
        this.publish();
    }

    private send(operation: keyof OverflowCommands, generation: number): void {
        if (this.stopped() || generation !== this.generation) return;
        let sent: Promise<void>;
        try {
            sent = this.options.commands[operation]();
        } catch {
            this.commandFailed(operation, generation);
            return;
        }
        void sent.then(() => {
            if (this.stopped() || generation !== this.generation) return;
            if (operation === "resume" && this.state.mode === "resuming") {
                this.state.mode = "armed";
                this.resetCrossing();
                this.publish();
            }
        }, () => this.commandFailed(operation, generation));
    }

    private commandFailed(operation: keyof OverflowCommands, generation: number): void {
        if (this.stopped() || generation !== this.generation) return;
        this.fail(operation === "pause"
            ? "Could not pause the brew for protection. Pause the machine manually."
            : "Could not resume the brew after protection. Resume the machine manually.");
    }

    private expireAck(now: number): boolean {
        if (this.state.mode !== "requesting" || this.ackAt === null || now < this.ackAt) return false;
        this.fail("The machine did not confirm the protection pause.");
        return true;
    }

    private expireManualAck(now: number): void {
        if (this.manualAckAt !== null && now >= this.manualAckAt) this.releaseManualPause();
    }

    private releaseManualPause(): void {
        this.generation++;
        this.manualAckAt = null;
        this.manualPaused = false;
        this.resetCrossing();
    }

    private fail(error: string): void {
        this.clear();
        this.state = {mode: "error", error, retainedGrams: null, nextCheckAt: null, telemetryAvailable: false};
        this.publish();
    }

    private eligible(): boolean {
        // BrewPhase has no delivery target: only a phase transition can end final-stage eligibility here.
        return !this.manualPaused && this.currentPhase.name === "pouring"
            && this.currentPhase.pour >= 1 && this.currentPhase.pour <= this.currentPhase.pours;
    }

    private resetCrossing(): void {
        this.crossing = {since: null, lastAt: null, sustained: false};
    }

    private resetStale(now: number): void {
        if ([this.water, this.cup].some(reading => reading
            && (now - reading.at > OVERFLOW_READING_MAX_AGE_MS || now < reading.at))) {
            this.resetCrossing();
        }
    }

    private refresh(now: number): RetainedPair | null {
        const pair = pairedRetained(this.water, this.cup, now);
        if ([this.water, this.cup].some(reading => reading
            && (!Number.isFinite(reading.grams) || reading.grams < 0))) this.resetCrossing();
        this.state.retainedGrams = pair?.grams ?? null;
        this.state.telemetryAvailable = pair !== null;
        return pair;
    }

    private observe(pair: RetainedPair | null): void {
        const newer = pair !== null && (this.lastPairAt === null || pair.at > this.lastPairAt);
        if (newer) this.lastPairAt = pair.at;
        const direction = this.state.mode === "holding" ? "below" : "above";
        if (this.state.mode !== "holding" && (this.state.mode !== "armed" || !this.eligible())) {
            this.resetCrossing();
            return;
        }
        // Channel updates may briefly exceed pair skew before their partner arrives.
        // No action uses that intermediate pair; freshness is checked before each update.
        if (!pair) return;
        if (this.crossing.lastAt !== null && pair.at - this.crossing.lastAt > OVERFLOW_READING_MAX_AGE_MS) {
            this.resetCrossing();
        }
        if (direction === "below" ? pair.grams >= this.config.retainedGrams : pair.grams < this.config.retainedGrams) {
            this.resetCrossing();
            return;
        }
        if (!newer) return;
        this.crossing = crossingAt(
            this.crossing.since, this.crossing.lastAt, pair, this.config.retainedGrams, direction
        );
    }

    private publish(): void {
        if (this.disposed) return;
        const now = this.options.now();
        const previous = this.published;
        const transition = !previous || previous.mode !== this.state.mode
            || previous.nextCheckAt !== this.state.nextCheckAt
            || previous.disabledReason !== this.state.disabledReason || previous.error !== this.state.error;
        const changed = transition || previous.retainedGrams !== this.state.retainedGrams
            || previous.telemetryAvailable !== this.state.telemetryAvailable;
        if (!changed || (!transition && now - this.publishedAt < OVERFLOW_PUBLISH_MS)) return;
        this.published = this.snapshot;
        this.publishedAt = now;
        this.options.onChange(this.snapshot);
    }
}
