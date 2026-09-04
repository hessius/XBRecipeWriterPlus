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
