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

/**
 * How long ago, in the shortest form that is still true: `3d`, `2w`, `5mo`.
 *
 * The card's evidence has room for a few characters at the end of a row of
 * figures, so a date is out: `2026-03-12` is both longer and a worse answer to
 * the question a glance is asking, which is whether this recipe is one the user
 * has been brewing lately.
 *
 * Rounded down throughout, because a brew six days ago is not yet a week ago.
 * `TODAY` is its own word rather than `0d`, which reads as nothing at all.
 */
export function formatBrewAgo(ms: number, now = Date.now()): string {
    const days = Math.floor((now - ms) / 86_400_000);
    if (days <= 0) return "TODAY";
    if (days < 7) return `${days}D`;
    if (days < 56) return `${Math.floor(days / 7)}W`;
    if (days < 365) return `${Math.floor(days / 30)}MO`;
    return `${Math.floor(days / 365)}Y`;
}
