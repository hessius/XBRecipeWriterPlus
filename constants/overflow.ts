/**
 * Overflow-protection software safety policy.
 *
 * These are unmeasured policy choices, not hardware latencies and not
 * animation durations. They bound how much stale or inconsistent evidence the
 * overflow controller may act on, and have not been derived from measurement.
 */

/** Oldest a scale reading may be, inclusive, before it is no evidence at all. */
export const OVERFLOW_READING_MAX_AGE_MS = 1000;

/** Largest gap, inclusive, between the water and cup readings of one pair. */
export const OVERFLOW_PAIR_MAX_SKEW_MS = 250;

/** How long a pair must stay across the limit before the crossing is sustained. */
export const OVERFLOW_CROSSING_MS = 500;

/** How often the controller publishes its verdict. */
export const OVERFLOW_PUBLISH_MS = 250;
