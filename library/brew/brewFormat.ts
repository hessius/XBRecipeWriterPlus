/**
 * How a brew's date and duration are written.
 *
 * Extracted from `BrewHistoryRow` when the record screen needed the same date:
 * a row and the screen it opens disagreeing about when a brew happened is the
 * kind of drift a second copy guarantees eventually.
 */

/** `2026-09-03`. Uses local time so a brew made at 11 pm shows that night's date. */
export function formatBrewDate(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** `14:07`, local time, so a brew is placed within its day as well as on it. */
export function formatBrewTime(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** `4:23`. */
export function formatBrewDuration(startMs: number, endMs: number): string {
    const totalSeconds = Math.round((endMs - startMs) / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
}
