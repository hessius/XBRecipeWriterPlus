/**
 * Where the bypass rung stands.
 *
 * `waiting` is the one that had to exist. The machine lets the dripper finish
 * before it dispenses, and that gap ran to 61 s in the capture this was
 * written from. With no state for it the wait had nowhere to sit, so it was
 * scored against the last stage as a stall and painted amber — a fault drawn
 * over a machine behaving exactly as designed.
 */
export type BypassRungState = "pending" | "waiting" | "filling" | "done";

export type BypassStateInput = {
    /** `BrewPhase["name"]`, widened: this module must not import the machine. */
    phaseName: string;
    /** The brew has ended — `OVER.has(phase.name)`. */
    over: boolean;
    settling: boolean;
    /** The live stage, zero-based; `null` before the brew, `stages` once past. */
    activeIndex: number | null;
    /** How many pours the recipe has. */
    stages: number;
    /** The last stage has reached its target and served its planned rest. */
    lastPauseDone: boolean;
    /** Millilitres the bypass has delivered. */
    delivered: number;
};

/**
 * The rung's state, from the run's state.
 *
 * A pure function in its own module so it can be tested without a machine, a
 * renderer or a brew, and so the live screen and the history screen cannot
 * answer the question two different ways.
 */
export function bypassRungState(input: BypassStateInput): BypassRungState {
    const {phaseName, over, settling, activeIndex, stages, lastPauseDone,
           delivered} = input;

    if (phaseName === "bypass") return "filling";
    // A finished brew that never dispensed is not "done": nothing was
    // delivered, and drawing an empty rung as complete would be a lie.
    if (over) return delivered > 0 ? "done" : "waiting";
    if (settling) return "waiting";
    if (activeIndex === null) return "pending";
    if (activeIndex >= stages) return "waiting";
    if (activeIndex === stages - 1 && lastPauseDone) return "waiting";
    return "pending";
}

/**
 * Everything the three views need to draw the bypass, in one object.
 *
 * One shape shared by the live screen, the summary and the history record, so
 * a brew looks the same after it is saved as it did while it ran.
 */
export type BypassView = {
    /** Millilitres asked for. */
    volume: number;
    /** Degrees Celsius asked for. */
    temperature: number;
    /** Millilitres delivered so far. */
    delivered: number;
    /**
     * Seconds into the brew that the bypass began, or `null` while it has not.
     *
     * `null` is what makes the box on the trace slide right while the machine
     * waits: with no real time to draw at, it is drawn at the later of the
     * plan and now.
     */
    startedAt: number | null;
    state: BypassRungState;
};
