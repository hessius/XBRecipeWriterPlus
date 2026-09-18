/**
 * Which auto shelves the user has put away.
 *
 * Stored as one comma-separated string, because the settings table stores
 * strings and a JSON array in a text column would be a second format to
 * validate on the way back in for no gain: a shelf id is a short identifier
 * with no comma in it, and both stock ids and the `sharedBy:` ids are written
 * by the app rather than typed by anyone.
 *
 * Unknown ids are carried rather than dropped. A shelf id can disappear for a
 * while -- an author shelf exists only while a recipe from that author is in
 * the library -- and forgetting the user's answer because the shelf happened
 * not to be on screen would silently unhide it when they imported the recipe
 * again.
 */

/** The ids in a stored list, in the order they were written. */
export function parseHidden(stored: string): string[] {
    return stored.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
}

/** The stored form of a list of ids, with duplicates and blanks removed. */
export function serialiseHidden(ids: readonly string[]): string {
    return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))]
        .join(",");
}

/** Whether a shelf is put away. */
export function isHidden(stored: string, id: string): boolean {
    return parseHidden(stored).includes(id);
}

/** The stored list with one shelf put away, or brought back if it was. */
export function toggleHidden(stored: string, id: string): string {
    const ids = parseHidden(stored);
    return serialiseHidden(ids.includes(id)
        ? ids.filter((existing) => existing !== id)
        : [...ids, id]);
}
