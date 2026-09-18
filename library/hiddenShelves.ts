import {AUTHOR_FILTER_PREFIX, authorFromFilterId} from "@/library/libraryFilters";
import {tagKey} from "@/library/tagKey";

/**
 * Which auto shelves the user has put away.
 *
 * Stored as a JSON array. The obvious cheaper format, one comma-separated
 * string, cannot hold what goes in it: an author shelf's id is `sharedBy:`
 * followed by a display name somebody else typed into a share, and "Smith,
 * Anna" is an ordinary way to write a name. Split on the comma it became two
 * ids, neither of which was a shelf, and the shelf the user put away came
 * straight back. A list written by the older build is still read, so nobody's
 * answer is lost on upgrade; it is rewritten in the new format the first time
 * the list is touched.
 *
 * Ids are stored canonically. Author shelves are grouped on `sharedByKey`, the
 * folded column, but the shelf id is built from whichever spelling the
 * representative recipe happened to use, so a library whose representative
 * changes from "café" to "CAFÉ" would otherwise present a different id and the
 * shelf would unhide itself. The fold here is `tagKey`, the same one the
 * grouping uses, so the two cannot disagree. The display label is never taken
 * from this list: it comes from the live shelf.
 *
 * Unknown ids are carried rather than dropped. A shelf id can disappear for a
 * while -- an author shelf exists only while a recipe from that author is in
 * the library -- and forgetting the user's answer because the shelf happened
 * not to be on screen would silently unhide it when they imported the recipe
 * again.
 */

/**
 * The form of a shelf id this list stores and compares.
 *
 * Stock ids are their own canonical form. An author id is folded, so the two
 * spellings of one person are one answer.
 */
export function canonicalShelfId(id: string): string {
    const author = authorFromFilterId(id.trim());
    return author === null
        ? id.trim()
        : `${AUTHOR_FILTER_PREFIX}${tagKey(author)}`;
}

function clean(ids: readonly unknown[]): string[] {
    const canonical = ids
        .filter((id): id is string => typeof id === "string")
        .map(canonicalShelfId)
        .filter((id) => id.length > 0);
    return [...new Set(canonical)];
}

/** The ids in a stored list, in the order they were written. */
export function parseHidden(stored: string): string[] {
    const text = stored.trim();
    if (text.length === 0) return [];
    if (text.startsWith("[")) {
        // Whatever a restore or an older build put there. A stored `[1]` would
        // otherwise reach `trim` on a number and take the library down on
        // launch, which is a worse outcome than a forgotten answer.
        try {
            const parsed: unknown = JSON.parse(text);
            return Array.isArray(parsed) ? clean(parsed) : [];
        } catch {
            return [];
        }
    }
    return clean(text.split(","));
}

/** The stored form of a list of ids, with duplicates and blanks removed. */
export function serialiseHidden(ids: readonly string[]): string {
    return JSON.stringify(clean(ids));
}

/** Whether a shelf is put away, given the parsed list. */
export function hides(ids: readonly string[], id: string): boolean {
    return ids.map(canonicalShelfId).includes(canonicalShelfId(id));
}

/** Whether a shelf is put away. */
export function isHidden(stored: string, id: string): boolean {
    return hides(parseHidden(stored), id);
}

/** The stored list with one shelf put away, or brought back if it was. */
export function toggleHidden(stored: string, id: string): string {
    const ids = parseHidden(stored);
    const wanted = canonicalShelfId(id);
    return serialiseHidden(hides(ids, id)
        ? ids.filter((existing) => canonicalShelfId(existing) !== wanted)
        : [...ids, wanted]);
}
