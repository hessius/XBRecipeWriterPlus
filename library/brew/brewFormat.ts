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
 *
 * Counted in calendar days rather than in elapsed 24 hour periods, because the
 * word means what the user means by it: a brew at 23:50 read at 00:10 is twenty
 * minutes old and was still yesterday. Both instants are taken to local
 * midnight first, and the division is rounded rather than floored so that a
 * daylight saving day of 23 or 25 hours still counts as one day.
 */
/** The local midnight that starts the day an instant falls in. */
function midnight(ms: number): number {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

export function formatBrewAgo(ms: number, now = Date.now()): string {
    const {unit, count} = brewAgo(ms, now);
    if (unit === "today") return "TODAY";
    return `${count}${{day: "D", week: "W", month: "MO", year: "Y"}[unit]}`;
}

/**
 * The same answer in words: `today`, `3 days ago`, `2 weeks ago`.
 *
 * A screen reader gets the card's third fact from here. `3D` is four characters
 * a glance reads instantly and a voice cannot say at all, and without this the
 * recency would be conveyed by the drawn line alone -- which is the one place
 * the design says the evidence must not live.
 */
export function spokenBrewAgo(ms: number, now = Date.now()): string {
    const {unit, count} = brewAgo(ms, now);
    if (unit === "today") return "today";
    const word = count === 1 ? unit : `${unit}s`;
    return `${count} ${word} ago`;
}

type Ago = {unit: "today" | "day" | "week" | "month" | "year"; count: number};

/** How long ago, as a unit and a count, before either form words it. */
function brewAgo(ms: number, now: number): Ago {
    const days = Math.round((midnight(now) - midnight(ms)) / 86_400_000);
    if (days <= 0) return {unit: "today", count: 0};
    if (days < 7) return {unit: "day", count: days};
    if (days < 56) return {unit: "week", count: Math.floor(days / 7)};
    if (days < 365) return {unit: "month", count: Math.floor(days / 30)};
    return {unit: "year", count: Math.floor(days / 365)};
}
