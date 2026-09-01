import {
    FRAME_GAP_MS, HANDSHAKE_WINDOW_MS, INFO_ATTEMPTS, INFO_WAIT_MS, RECIPE_ACK_MS
} from "@/constants/machine";
import {cardWriteProblems} from "@/library/cardLimits";
import type Recipe from "@/library/Recipe";

import {
    ascii,
    buildType1,
    buildType1Bytes,
    buildType2,
    encodeCoffeeBlob,
    encodeTeaBlob,
    EVENT,
    MACHINE_STATE,
    parseNotification,
    splitFrames,
    type MachineInfo,
    type Notification,
    type TeaSteepEncoding
} from "./protocol";
import type {FoundMachine, MachineTransport} from "./Transport";

/**
 * A subscriber to every frame in either direction, decoded. The console uses it.
 *
 * The direction is part of the event because the console's log is evidence —
 * it is what users are asked to attach to a protocol report — and a log that
 * cannot tell what the app said from what the machine answered is worse than
 * no log at all.
 */
export type FrameDirection = "sent" | "received";
export type FrameListener = (
    direction: FrameDirection, frame: Uint8Array, parsed: Notification
) => void;

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
    /** Uploaded and waiting for the user to press START in the app. */
    | {name: "readyToStart"}
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
 * One thing that happened to the link.
 *
 * `at` is a wall clock, not a monotonic count, because the only consumer is a
 * human reading a log next to a machine that beeped at a particular moment.
 */
export type LinkEvent = {at: number; text: string};

/** How many link events to keep. The machine lives as long as the app does. */
const LINK_HISTORY_LIMIT = 200;

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

    /**
     * What the link has been doing, oldest first.
     *
     * The console's frame log is component state filled from `onFrame`, so it
     * holds nothing about the case hardest to diagnose: a connection that never
     * came up. There is no screen open to log it and no frame to log. This
     * lives on the machine instead, so the console can be opened afterwards and
     * still say what happened.
     */
    public readonly linkHistory: LinkEvent[] = [];

    private transport: MachineTransport;
    private frameListeners = new Set<FrameListener>();
    private notificationListeners = new Set<(parsed: Notification) => void>();
    private linkListeners = new Set<() => void>();
    private unsubscribe: (() => void)[] = [];

    public phase: BrewPhase = {name: "idle"};
    /**
     * Which reading of the tea steep encoding to send.
     *
     * A property rather than a settings lookup, so this file keeps its one-way
     * dependency: `library/` does not reach up into `hooks/`. `useBrew` sets it
     * from the console's switch.
     */
    private steepEncoding: TeaSteepEncoding = "homoland";

    get teaSteepEncoding(): TeaSteepEncoding {
        return this.steepEncoding;
    }

    /**
     * A method rather than a settable field so that callers in `hooks/` are
     * telling the machine something rather than mutating a value the React
     * Compiler believes it owns.
     */
    setTeaSteepEncoding(encoding: TeaSteepEncoding): void {
        this.steepEncoding = encoding;
    }

    /**
     * Whether a brew commits itself, or waits to be started.
     *
     * `true` here is the protocol's own shape — upload and commit in one
     * sequence — and is what every test that is not about this feature wants.
     * The app's preference defaults the other way: the machine starts grinding
     * the instant it is committed to, and a user who tapped BREW to see what
     * would happen deserves one more press before that. `useBrew` pushes the
     * setting down, exactly as it does the steep encoding.
     */
    private autoStart = true;

    setAutoStart(autoStart: boolean): void {
        this.autoStart = autoStart;
    }

    private phaseListeners = new Set<(phase: BrewPhase) => void>();
    private pourCount = 0;
    private brewing = false;
    private ackTimer: ReturnType<typeof setTimeout> | null = null;
    private retriedInPro = false;
    /**
     * The commit frame of an uploaded recipe that has not been started yet.
     *
     * Held rather than rebuilt so that START commits the recipe that is
     * actually on the machine, and cleared everywhere a brew ends so it can
     * never commit one the user has already walked away from.
     */
    private pendingCommit: Uint8Array | null = null;

    private frameGapMs: number;
    private infoWaitMs: number;

    /**
     * @param options.frameGapMs How long to leave between the frames of a brew.
     * @param options.infoWaitMs How long to wait for an answer to the info request.
     *     Tests pass 0; nothing else should.
     */
    constructor(transport: MachineTransport, options: {frameGapMs?: number; infoWaitMs?: number} = {}) {
        this.transport = transport;
        this.frameGapMs = options.frameGapMs ?? FRAME_GAP_MS;
        this.infoWaitMs = options.infoWaitMs ?? INFO_WAIT_MS;
    }

    /** The pause between frames of a sequence. See `FRAME_GAP_MS`. */
    private gap(): Promise<void> {
        if (this.frameGapMs === 0) return Promise.resolve();
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, this.frameGapMs);
            timer.unref?.();
        });
    }

    /**
     * Send frames in order, leaving a gap between them.
     *
     * The gap is the point. A burst of Write Without Response frames is not
     * flow-controlled in any way, and the machine simply loses most of it.
     */
    private async sendPaced(frames: Uint8Array[]): Promise<void> {
        for (let index = 0; index < frames.length; index++) {
            if (index > 0) await this.gap();
            await this.send(frames[index]);
        }
    }

    scan(): Promise<FoundMachine[]> {
        return this.transport.scan();
    }

    async connect(id: string): Promise<void> {
        this.note(`connecting to ${id}`);
        try {
            await this.transport.connect(id);
        } catch (e) {
            this.note(`refused — ${(e as Error).message}`);
            // The machine permits one link at a time and does not reject a
            // second one so much as ignore it, so a failure here is almost
            // always the official app holding the slot. Say that, rather than
            // implying the hardware is at fault.
            throw new Error("The machine is already in use by another app.");
        }
        this.note("connected");
        this.unsubscribe.push(
            this.transport.onFrame((frame) => this.receive(frame)),
            this.transport.onDisconnect(() => {
                this.note("link dropped by the radio");
                this.forget();
            })
        );

        // First write, before anything else is queued: the machine ignores
        // every command that follows if the handshake misses its window.
        await this.transport.write(buildType1(8100, [185, 1]));
        this.announceLink();
        // The gap matters as much here as anywhere. Writing the info request
        // straight after the handshake is a two-frame burst on a channel with
        // no flow control, and on hardware the question was simply lost: the
        // link came up, the machine beeped, and no vitals ever arrived.
        await this.gap();
        // Connecting is not finished until the machine has said who it is and
        // how much water it has. Waiting here rather than at the brew means a
        // recipe is never sent into the gap, and the settings screen shows
        // vitals rather than blanks the moment it says "connected".
        await this.ensureInfo();
    }

    /**
     * Ask the machine to describe itself until it does, or give up.
     *
     * Does not throw: a machine that never introduces itself is still worth
     * being connected to from the console, and `brewBlockReason` is where the
     * consequence belongs.
     *
     * @returns whether the vitals are now known.
     */
    async ensureInfo(): Promise<boolean> {
        if (this.info !== null) return true;
        await this.askHowItIsDoing();
        if (this.info === null) this.note("machine did not say how it is doing");
        return this.info !== null;
    }

    /**
     * Wait for the next info frame.
     *
     * The *next* one, not "one at some point": a caller asking how the machine
     * is doing now must not be handed the answer to a question asked when the
     * link came up. Does not reject — a machine that stays quiet is still worth
     * being connected to, and `brewBlockReason` is where the consequence
     * belongs.
     *
     * @returns whether the machine answered before the window closed.
     */
    private waitForInfo(): Promise<boolean> {
        return new Promise((resolve) => {
            const finish = (answered: boolean): void => {
                clearTimeout(timer);
                off();
                resolve(answered);
            };
            const off = this.onNotification((parsed) => {
                if (parsed.kind === "info") finish(true);
            });
            const timer = setTimeout(() => finish(false), this.infoWaitMs);
            timer.unref?.();
        });
    }

    /**
     * Ask the machine how it is doing, and wait for the answer.
     *
     * Asked again before every decision that depends on it, rather than once at
     * connect. The water level is the reason: somebody who connects, sees the
     * tank is low, fills it and comes back was told the tank was still low,
     * because the app was answering from a reading taken minutes earlier while
     * the machine had long since stopped complaining.
     *
     * @returns whether the machine answered.
     */
    async askHowItIsDoing(): Promise<boolean> {
        for (let attempt = 0; attempt < INFO_ATTEMPTS; attempt++) {
            if (attempt > 0) await this.gap();
            // Listening before asking, not after. The answer can arrive inside
            // the write — the radio delivers on its own thread — and a listener
            // attached afterwards would miss it and wait out the whole window
            // for a reply that had already come.
            const answered = this.waitForInfo();
            try {
                await this.requestInfo();
            } catch {
                // A question the radio would not carry is not a reason to
                // abandon what the caller was actually doing. The brew decides
                // on the last thing it heard, and fails on its own first frame
                // if the radio is really gone — with a phase, which this has no
                // business setting.
                return false;
            }
            if (await answered) return true;
        }
        return false;
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
        this.note("disconnected by the app");
        await this.transport.disconnect();
        this.forget();
    }

    /**
     * Add a line to the link history.
     *
     * Public because the interesting events happen outside this class: the app
     * going to the back, coming to the front, and each attempt at taking the
     * link again.
     */
    note(text: string): void {
        this.linkHistory.push({at: Date.now(), text});
        if (this.linkHistory.length > LINK_HISTORY_LIMIT) this.linkHistory.shift();
        this.announceLink();
    }

    isConnected(): boolean {
        return this.transport.isConnected();
    }

    /** Send an already-built frame. The brew path and the console both use it. */
    send(frame: Uint8Array): Promise<void> {
        this.frameListeners.forEach((listener) =>
            listener("sent", frame, {kind: "unknown", raw: frame}));
        return this.transport.write(frame);
    }

    /** Every frame in either direction, for the console's log. */
    onFrame(listener: FrameListener): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    /**
     * The link came up or went down, or the machine told us something new
     * about itself.
     *
     * Views cannot learn this from `onFrame`, because the interesting case —
     * the link dropping — produces no frame at all.
     */
    onLink(listener: () => void): () => void {
        this.linkListeners.add(listener);
        return () => this.linkListeners.delete(listener);
    }

    private announceLink(): void {
        this.linkListeners.forEach((listener) => listener());
    }

    /** Decoded notifications only. The brew state machine uses this. */
    onNotification(listener: (parsed: Notification) => void): () => void {
        this.notificationListeners.add(listener);
        return () => this.notificationListeners.delete(listener);
    }

    private receive(packet: Uint8Array): void {
        // A packet may carry more than one frame: the machine packs an event
        // and a weight reading together under load, and reading only the first
        // silently dropped the rest. See `splitFrames`.
        for (const frame of splitFrames(packet)) this.receiveFrame(frame);
    }

    private receiveFrame(frame: Uint8Array): void {
        const parsed = parseNotification(frame);
        if (parsed.kind === "status") {
            this.state = parsed.state;
            this.onState(parsed.state);
        }
        if (parsed.kind === "info") {
            this.info = parsed;
            this.announceLink();
        }
        if (parsed.kind === "event") this.onEvent(parsed.code, parsed.value);
        this.frameListeners.forEach((listener) => listener("received", frame, parsed));
        this.notificationListeners.forEach((listener) => listener(parsed));
    }

    onPhase(listener: (phase: BrewPhase) => void): () => void {
        this.phaseListeners.add(listener);
        return () => this.phaseListeners.delete(listener);
    }

    private setPhase(phase: BrewPhase): void {
        // The acknowledgement timer only asks one question — did the recipe
        // reach the machine? — and any phase other than `sending` has already
        // answered it. A stale timer left running would fire a "rejected"
        // failure into the middle of a working pour.
        if (phase.name !== "sending") this.clearAckTimer();
        this.phase = phase;
        this.brewing = !["idle", "done", "cancelled", "failed", "lostContact"]
            .includes(phase.name);
        // A brew that has ended takes its uncommitted recipe with it. Left
        // behind, START on a later screen would commit a recipe the user has
        // already cancelled or watched fail.
        if (!this.brewing) this.pendingCommit = null;
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
        if (this.info === null) {
            // Not a pedantic check. The water level is reported nowhere else,
            // and "we never heard" is not the same as "the tank is fine" —
            // treating it as such is how a recipe gets committed to a machine
            // with an empty tank.
            return "The machine has not said how it is doing yet. Reconnect and try again.";
        }
        if (!this.info.waterEnough) return "The machine's water tank is low.";
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
        // A fresh attempt: the PRO-mode offer is per-brew, and this was not
        // reached through `switchToProAndRetry`, so the machine may be asked
        // about its mode again if this send also goes nowhere.
        this.retriedInPro = false;
        // Ask how it is doing *now*, every time. Not only when the vitals are
        // missing: they go stale, and the tank is the whole point of asking.
        // Telling the user to reconnect is also asking them to do something the
        // app can do for itself — and on hardware reconnecting did not help,
        // because the question was being lost rather than refused.
        if (this.isConnected()) await this.askHowItIsDoing();
        await this.brewOnce(recipe);
    }

    private async brewOnce(recipe: Recipe): Promise<void> {
        const blocked = this.brewBlockReason(recipe);
        if (blocked !== null) throw new Error(blocked);

        this.pourCount = recipe.pours.length;
        this.setPhase({name: "sending"});

        const tea = recipe.isTea();
        const commit = tea ? buildType1(4512) : buildType1(8002);
        this.pendingCommit = null;

        try {
            // This whole sequence, gaps and all, mirrors `run_brew` in the
            // reference implementation, which is the only brew sequence we have
            // that is known to work on real hardware.
            await this.sendPaced([
                // The handshake again, immediately before the recipe. The one
                // sent at connect may be many minutes old by now, and the
                // reference re-sends it at the start of every brew.
                buildType1(8100, [185, 1]),
                // Bypass off, but the dose still has to travel: the machine
                // needs it to grind correctly, and skipping it makes the grind
                // drift. The two bypass arguments are float bits, which for
                // zero are the same four zero bytes an integer would give.
                buildType1(8102, [0, 0, Math.round(recipe.dosage)]),
                ...(tea ? [
                    buildType1Bytes(4513, encodeTeaBlob(recipe, this.teaSteepEncoding))
                ] : [
                    setCupFrame(),
                    buildType1Bytes(
                        recipe.grinder ? 8001 : 8004, encodeCoffeeBlob(recipe)
                    )
                ]),
                // The commit is the frame that sets a burr spinning, so it is
                // the one the user may want to keep for themselves.
                ...(this.autoStart ? [commit] : [])
            ]);
        } catch (error) {
            // Without this the brew is left in `sending` with no timer armed —
            // the phase is only ever left by an acknowledgement that can no
            // longer come, so the brew screen would spin for good.
            this.setPhase({
                name: "failed", reason: "rejected",
                detail: error instanceof Error ? error.message : undefined
            });
            throw error;
        }

        if (!this.autoStart) {
            // Uploaded, not committed. Nothing is timed from here: the machine
            // is holding a recipe quite happily, and the only thing outstanding
            // is a person.
            this.pendingCommit = commit;
            this.setPhase({name: "readyToStart"});
            return;
        }

        // Not a grinding timeout — there is deliberately none of those, because
        // the machine goes silent for twenty seconds while it grinds. This is a
        // much earlier question: did the recipe reach the machine at all?
        this.armAckTimer();
    }

    /**
     * Commit a recipe that was uploaded but held back. See `setAutoStart`.
     *
     * From here on a started brew is indistinguishable from an auto-started
     * one: same phase, same acknowledgement question.
     */
    async startBrew(): Promise<void> {
        const commit = this.pendingCommit;
        if (commit === null) throw new Error("There is no recipe waiting to be started.");
        this.pendingCommit = null;
        this.setPhase({name: "sending"});
        try {
            await this.send(commit);
        } catch (error) {
            this.setPhase({
                name: "failed", reason: "rejected",
                detail: error instanceof Error ? error.message : undefined
            });
            throw error;
        }
        this.armAckTimer();
    }

    /**
     * Whether offering a mode switch would be a reasonable thing to do.
     *
     * Only after a send has gone nowhere, only on a machine that says it is in
     * EASY, and only once. The app never changes the mode of a machine across
     * the room without asking, and never asks twice about the same brew.
     */
    canOfferProMode(): boolean {
        return this.phase.name === "failed"
            && this.phase.reason === "rejected"
            && this.info?.mode === "EASY"
            && !this.retriedInPro;
    }

    /** Switch the machine to PRO, then send the recipe again. Once. */
    async switchToProAndRetry(recipe: Recipe): Promise<void> {
        this.retriedInPro = true;
        // Byte-exact, confirmed on hardware: "00000000" is PRO, "91327856" EASY.
        await this.send(buildType2(11511, ascii("00000000")));
        await this.brewOnce(recipe);
    }

    private armAckTimer(): void {
        this.clearAckTimer();
        this.ackTimer = setTimeout(() => {
            if (this.phase.name === "sending") {
                this.setPhase({name: "failed", reason: "rejected"});
            }
        }, RECIPE_ACK_MS);
        // This timer only waits to see whether the machine answers; it must not
        // by itself keep the process alive (and hold a test runner open) if
        // nothing else is pending.
        this.ackTimer.unref?.();
    }

    private clearAckTimer(): void {
        if (this.ackTimer !== null) clearTimeout(this.ackTimer);
        this.ackTimer = null;
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
                // Not while a recipe is waiting to be started: this is the
                // machine acknowledging the upload, and letting it replace the
                // phase would take away the only control that can commit it.
                if (this.pendingCommit !== null) break;
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
        // The acknowledgement timer must not outlive the link it was asking
        // about: a fired timer after a disconnect would report a phantom
        // failure about a machine we are no longer talking to.
        this.clearAckTimer();
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
        // Last, so a listener reading `isConnected()` or `info` sees the link
        // as gone rather than half torn down.
        this.announceLink();
    }
}

/**
 * Command 8104, the cup weight range, as two IEEE-754 floats.
 *
 * XBRW++ used to omit this on the grounds that three implementations send
 * three different value sets and nobody can name the field. That was a
 * misreading of the evidence: the sources disagree about the *values*, not
 * about whether the command is sent — all of them send it, and the reference
 * brew sequence that works on hardware sends it between the dose and the
 * recipe.
 *
 * (200.0, 80.0) is the reference's default and is HCI-confirmed for Free Solo.
 * It is also the widest range, which is the conservative choice for a field
 * that appears to govern overflow protection: too wide risks nothing that the
 * machine's own sensors do not already catch, while too narrow could refuse a
 * cup that is perfectly fine.
 */
function setCupFrame(): Uint8Array {
    const payload = new Uint8Array(8);
    const view = new DataView(payload.buffer);
    view.setFloat32(0, 200.0, true);
    view.setFloat32(4, 80.0, true);
    return buildType1Bytes(8104, payload);
}

/** Exported for the copy that explains the handshake budget. */
export {HANDSHAKE_WINDOW_MS};
