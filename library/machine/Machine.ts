import {HANDSHAKE_WINDOW_MS} from "@/constants/machine";
import {cardWriteProblems} from "@/library/cardLimits";
import type Recipe from "@/library/Recipe";

import {
    buildType1,
    buildType1Bytes,
    encodeCoffeeBlob,
    encodeTeaBlob,
    EVENT,
    MACHINE_STATE,
    parseNotification,
    type MachineInfo,
    type Notification,
    type TeaSteepEncoding
} from "./protocol";
import type {FoundMachine, MachineTransport} from "./Transport";

/** A subscriber to everything the machine says, decoded. The console uses it. */
export type FrameListener = (frame: Uint8Array, parsed: Notification) => void;

/** Why a brew ended badly. Each has its own copy on the brew route. */
export type BrewFailure =
    | "noWater" | "noBeans" | "gearPosition" | "doseMismatch" | "idling" | "rejected";

/**
 * Where a brew has got to.
 *
 * Lifecycle only. The weight streams arrive ten times a second and are fully
 * available, but rendering them is M4 — this milestone reports stages.
 */
export type BrewPhase =
    | {name: "idle"}
    | {name: "sending"}
    | {name: "armed"}
    /** Parked in `awaiting_confirm`. The user presses the button, not the app. */
    | {name: "pressPlay"}
    | {name: "grinding"}
    | {name: "pouring"; pour: number; pours: number}
    | {name: "done"}
    | {name: "cancelled"}
    /** The link dropped mid-brew. The machine is assumed to still be brewing. */
    | {name: "lostContact"}
    | {name: "failed"; reason: BrewFailure; detail?: string};

const FAILURE_EVENTS: Record<number, BrewFailure> = {
    40522: "noWater",
    8203:  "gearPosition",
    8204:  "doseMismatch",
    40517: "idling"
};

/** States from which a brew may be started at all. */
const STARTABLE = new Set<number>([
    MACHINE_STATE.IDLE, MACHINE_STATE.COMPLETE, MACHINE_STATE.READY
]);

/**
 * One machine, one session.
 *
 * Takes a transport by constructor injection so the whole of this file can be
 * driven by a scripted fake — which matters, because the layer underneath it
 * cannot be tested at all.
 */
export default class Machine {
    public info: MachineInfo | null = null;
    public state: number | null = null;

    private transport: MachineTransport;
    private frameListeners = new Set<FrameListener>();
    private notificationListeners = new Set<(parsed: Notification) => void>();
    private unsubscribe: (() => void)[] = [];

    public phase: BrewPhase = {name: "idle"};
    /**
     * Which reading of the tea steep encoding to send.
     *
     * A property rather than a settings lookup, so this file keeps its one-way
     * dependency: `library/` does not reach up into `hooks/`. `useBrew` sets it
     * from the console's switch.
     */
    public teaSteepEncoding: TeaSteepEncoding = "homoland";
    private phaseListeners = new Set<(phase: BrewPhase) => void>();
    private pourCount = 0;
    private brewing = false;

    constructor(transport: MachineTransport) {
        this.transport = transport;
    }

    scan(): Promise<FoundMachine[]> {
        return this.transport.scan();
    }

    async connect(id: string): Promise<void> {
        try {
            await this.transport.connect(id);
        } catch {
            // The machine permits one link at a time and does not reject a
            // second one so much as ignore it, so a failure here is almost
            // always the official app holding the slot. Say that, rather than
            // implying the hardware is at fault.
            throw new Error("The machine is already in use by another app.");
        }

        this.unsubscribe.push(
            this.transport.onFrame((frame) => this.receive(frame)),
            this.transport.onDisconnect(() => this.forget())
        );

        // First write, before anything else is queued: the machine ignores
        // every command that follows if the handshake misses its window.
        await this.transport.write(buildType1(8100, [185, 1]));
        await this.requestInfo();
    }

    /**
     * Ask the machine to describe itself. The reply arrives as a frame.
     *
     * 40521 is documented as a *notification*, and no source records a command
     * that requests it — the machine may well send it unprompted after the
     * handshake. Sending it costs nothing if it is ignored, and step 2 of the
     * hardware checklist is what settles whether it was ever needed.
     */
    async requestInfo(): Promise<void> {
        await this.transport.write(buildType1(EVENT.MACHINE_INFO));
    }

    async disconnect(): Promise<void> {
        await this.transport.disconnect();
        this.forget();
    }

    isConnected(): boolean {
        return this.transport.isConnected();
    }

    /** Send an already-built frame. The brew path and the console both use it. */
    send(frame: Uint8Array): Promise<void> {
        this.frameListeners.forEach((listener) =>
            listener(frame, {kind: "unknown", raw: frame}));
        return this.transport.write(frame);
    }

    /** Every frame in either direction, for the console's log. */
    onFrame(listener: FrameListener): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    /** Decoded notifications only. The brew state machine uses this. */
    onNotification(listener: (parsed: Notification) => void): () => void {
        this.notificationListeners.add(listener);
        return () => this.notificationListeners.delete(listener);
    }

    private receive(frame: Uint8Array): void {
        const parsed = parseNotification(frame);
        if (parsed.kind === "status") {
            this.state = parsed.state;
            this.onState(parsed.state);
        }
        if (parsed.kind === "info") this.info = parsed;
        if (parsed.kind === "event") this.onEvent(parsed.code, parsed.value);
        this.frameListeners.forEach((listener) => listener(frame, parsed));
        this.notificationListeners.forEach((listener) => listener(parsed));
    }

    onPhase(listener: (phase: BrewPhase) => void): () => void {
        this.phaseListeners.add(listener);
        return () => this.phaseListeners.delete(listener);
    }

    private setPhase(phase: BrewPhase): void {
        this.phase = phase;
        this.brewing = !["idle", "done", "cancelled", "failed", "lostContact"]
            .includes(phase.name);
        this.phaseListeners.forEach((listener) => listener(phase));
    }

    /**
     * Why this recipe cannot be sent right now, or null.
     *
     * Strict, deliberately: a false refusal costs one more press, a false send
     * costs water on the counter or a brew interrupted halfway. What it cannot
     * check — whether a cup is under the spout, whether the pod is in, whether
     * the beans match the dose — is stated on the brew route instead.
     */
    brewBlockReason(recipe: Recipe): string | null {
        if (!this.isConnected()) return "The machine is not connected.";
        if (this.info !== null && !this.info.waterEnough) {
            return "The machine's water tank is low.";
        }
        if (this.state !== null && !STARTABLE.has(this.state)) {
            return "The machine is busy. Wait for it to finish.";
        }
        const problems = cardWriteProblems(recipe);
        if (problems.length > 0) return problems[0];
        return null;
    }

    /**
     * Send a recipe and commit it.
     *
     * Resolves once the machine has been committed to, not once the brew is
     * over — the brew's progress arrives as phases.
     */
    async brew(recipe: Recipe): Promise<void> {
        const blocked = this.brewBlockReason(recipe);
        if (blocked !== null) throw new Error(blocked);

        this.pourCount = recipe.pours.length;
        this.setPhase({name: "sending"});

        const tea = recipe.isTea();

        // Bypass off, but the dose still has to travel: the machine needs it to
        // grind correctly, and skipping this makes the grind drift.
        await this.send(buildType1(8102, [0, 0, Math.round(recipe.dosage)]));

        if (tea) {
            await this.send(buildType1Bytes(4513, encodeTeaBlob(recipe, this.teaSteepEncoding)));
            await this.send(buildType1(4512));
        } else {
            const opcode = recipe.grinder ? 8001 : 8004;
            await this.send(buildType1Bytes(opcode, encodeCoffeeBlob(recipe)));
            await this.send(buildType1(8002));
        }
    }

    /** Stop a brew and put the machine back on its home screen. */
    async cancelBrew(): Promise<void> {
        await this.send(buildType1(40519, [1]));
        await this.send(buildType1(8022));
        this.setPhase({name: "cancelled"});
    }

    private onState(state: number): void {
        if (!this.brewing) return;
        switch (state) {
            case MACHINE_STATE.ARMED:
            case MACHINE_STATE.LOADING:
                this.setPhase({name: "armed"});
                break;
            case MACHINE_STATE.AWAITING_CONFIRM:
                // The machine is waiting for a human. We do not send 40518:
                // one source watched it move the state backwards, another
                // verified it aborts a running brew, a third calls it PAUSE.
                this.setPhase({name: "pressPlay"});
                break;
            case MACHINE_STATE.STARTING:
                // Grinding begins here, and the machine now goes silent for
                // about twenty seconds. There is no timeout on this phase.
                this.setPhase({name: "grinding"});
                break;
            case MACHINE_STATE.NO_BEANS:
                this.setPhase({name: "failed", reason: "noBeans"});
                break;
            case MACHINE_STATE.NO_WATER:
                this.setPhase({name: "failed", reason: "noWater"});
                break;
            default:
                break;
        }
    }

    private onEvent(code: number, value?: number): void {
        if (!this.brewing) return;

        const failure = FAILURE_EVENTS[code];
        if (failure !== undefined) {
            this.setPhase({name: "failed", reason: failure});
            return;
        }

        switch (code) {
            case EVENT.GRINDER_STOP:
                this.setPhase({name: "pouring", pour: 1, pours: this.pourCount});
                break;
            case EVENT.POUR_START:
                this.setPhase({
                    name: "pouring",
                    // The machine's own index, when it sends one. Counting our
                    // own would drift the moment a pour is skipped or repeated.
                    pour: Math.min(Math.max(value ?? 1, 1), this.pourCount),
                    pours: this.pourCount
                });
                break;
            case EVENT.BREWER_STOP:
            case EVENT.ENJOY:
            case EVENT.ENJOY_2:
                this.setPhase({name: "done"});
                break;
            default:
                break;
        }
    }

    private forget(): void {
        this.unsubscribe.forEach((off) => off());
        this.unsubscribe = [];
        if (this.brewing) {
            // The machine executes a committed recipe itself, so a dropped
            // link is very probably not a failed brew. Saying "failed" would
            // send somebody to rescue a brew that is going fine.
            this.setPhase({name: "lostContact"});
        }
        // Not merely tidiness: a stale info blob would let the app claim the
        // tank is full and the mode is PRO about a machine it is no longer
        // talking to.
        this.info = null;
        this.state = null;
    }
}

/** Exported for the copy that explains the handshake budget. */
export {HANDSHAKE_WINDOW_MS};
