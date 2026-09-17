/**
 * Which front door the library opens on.
 *
 * Two views over one table, not two screens: the list is the library sorted and
 * narrowed, and the shelf grid is the same filter vocabulary drawn as tiles.
 * Kept in its own module rather than inside `libraryFilters.ts` because the
 * setting is read by the rail, the home screen and the settings backup, none of
 * which has any business importing the filter vocabulary to learn what a view
 * is.
 */
export const LIBRARY_VIEWS = ["list", "shelves"] as const;

export type LibraryView = (typeof LIBRARY_VIEWS)[number];

/**
 * Whether a value is one of the two views.
 *
 * An array membership test rather than a lookup in an object, so the strings a
 * hostile backup carries -- `"toString"`, `"constructor"`, `"__proto__"` --
 * cannot pass by walking a prototype chain. `isSortAxis` reaches the same place
 * through `Object.hasOwn` because its vocabulary is a record of fragments;
 * here there is nothing to look up, only two names.
 */
export function isLibraryView(value: unknown): value is LibraryView {
    return typeof value === "string"
        && (LIBRARY_VIEWS as readonly string[]).includes(value);
}

/**
 * Narrows an unchecked value to a `LibraryView`, falling back to the list.
 *
 * `Settings.get` widens the union back to `string`, so a stale row or a restored
 * backup can hand back a view this build has no half for. Every reader narrows
 * through here, because the segmented pair draws both halves and lights the
 * active one: an unrecognised value would light neither, and a control with no
 * active segment reports a state the library is not in. The list is the fallback
 * for the same reason it is the default, being the view that works at any
 * library size.
 */
export function asLibraryView(value: unknown): LibraryView {
    return isLibraryView(value) ? value : "list";
}
