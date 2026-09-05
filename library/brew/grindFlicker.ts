/**
 * The grinder's flicker, paced by the burr.
 *
 * It used to be a constant 420 ms, which on hardware read as a slow pulse
 * rather than as grinding -- a full on-off cycle took 840 ms. The recipe
 * already knows how fast the burr turns, so the flicker beats with it: the
 * animation says something true instead of being a number somebody picked.
 */

/** The grinder's range, as the editor's stepper offers it. */
const SLOWEST_RPM = 60;
const FASTEST_RPM = 120;

/**
 * Beats per turn of the burr.
 *
 * Three rather than one, because one beat per turn is 500 ms at the fastest
 * grind -- slower than the constant this replaces, which was the complaint.
 */
export const FLICKER_BEATS_PER_TURN = 3;

/**
 * Half a beat, in milliseconds: the square wave's on time, and its off time.
 *
 * Out of range falls back to the fastest burr rather than to the middle. An
 * unset speed is -1, a recipe read off a damaged card can carry anything, and
 * of the two ways to be wrong a flicker that is too quick is at least the one
 * that cannot divide by zero.
 */
export function flickerMsFor(rpm: number): number {
    const turns = Number.isFinite(rpm) && rpm >= SLOWEST_RPM && rpm <= FASTEST_RPM
        ? rpm : FASTEST_RPM;
    return 60_000 / turns / FLICKER_BEATS_PER_TURN / 2;
}

/**
 * A hair, in the units of an edge index.
 *
 * `flickerMsFor` returns an irrational-in-binary number for most burrs -- 83.33
 * ms and the like -- so `n * half` does not round-trip: `Math.floor(n * half /
 * half)` comes back as `n - 1` for about one edge in ten. That dropped a whole
 * toggle of the square wave at those edges, which read as the flicker stalling.
 * Nudging every `floor` of an elapsed-over-half by this lands the exact multiple
 * on the right side without moving any honest mid-interval reading.
 */
export const EDGE_EPSILON = 1e-9;

/**
 * How many half-beats have elapsed, snapped back to the multiple of `half` that
 * began the current one.
 *
 * The reading published for a grind. `traceAnimationFor` turns it back into a
 * lit-or-dark square wave, and holding it at the edge means that function
 * returns an equal object between edges, so React bails out of re-rendering the
 * brew screen to draw the same thing.
 */
export function grindEdgeElapsed(msSinceStart: number, half: number): number {
    return Math.floor(msSinceStart / half + EDGE_EPSILON) * half;
}

/**
 * Milliseconds from `msSinceStart` to the square wave's next edge.
 *
 * Aimed at the edge, not sampled short of it. A `setTimeout` re-armed for
 * exactly this on each fire, measured against the wall clock, toggles the
 * flicker at a constant rate however late any one timer runs: the lateness does
 * not accumulate, because the next aim is recomputed from the true elapsed each
 * time. This replaces a 16 ms sampler that only ever *noticed* an edge at the
 * next frame boundary, quantising each half of the wave to a multiple of 16 ms
 * -- 80 ms then 96 ms then 80 -- so the rate drifted on a slow beat. The irony
 * is that that sampler was itself put there to cure a coarser aliasing from a
 * 50 ms clock: a faster sampler is still a sampler, and the fault was
 * quantisation, not rate.
 *
 * Never returns zero: `half` is always positive (`flickerMsFor` falls back to
 * the fastest burr for an unset or damaged speed), and a reading sitting
 * exactly on an edge is one full half-beat from the next, not none -- a zero
 * would spin the timer.
 */
export function msToNextGrindEdge(msSinceStart: number, half: number): number {
    const into = msSinceStart - grindEdgeElapsed(msSinceStart, half);
    const remaining = half - into;
    return remaining > EDGE_EPSILON ? remaining : half;
}
