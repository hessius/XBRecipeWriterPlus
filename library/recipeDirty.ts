/**
 * Which edits are still waiting on SAVE.
 *
 * The editor writes two different kinds of change. Name, note and tags go onto
 * the stored row the moment they are committed, because losing a note by
 * backing out of a screen is not a trade anyone would make. Everything the card
 * carries still travels with SAVE, because a half-typed dose written to the
 * library is worse than one lost.
 *
 * So the screen needs to know whether the second kind has changed, and it has
 * to know without asking each mutation to remember to say so. There are more
 * than a dozen ways to change a card field -- a stepper, a segmented row, a
 * stage added or deleted, the volume auto-fix, a revert, a card read -- and the
 * cost of forgetting one is a user's work disappearing with no prompt. So this
 * compares the recipe against a snapshot taken when the screen opened instead.
 *
 * The projection is a denylist. Everything counts as a card field unless it is
 * named here as one that writes itself. The denylist is conditional for
 * row-bound data: name, note, tags and favourite write themselves only when a
 * stored row exists. A card read or unfinished import has no row to write to,
 * so those fields must stay in the projection and make the leave guard ask.
 * That direction is deliberate: a field added later and not thought about
 * produces a prompt nobody needed, which is a nuisance. The other direction
 * loses work.
 */

import type Recipe from "@/library/Recipe";

/**
 * The fields that do not wait for SAVE and are never user work.
 *
 * `accentIndex` belongs to the library, not to the user: `updateRecipe`
 * reassigns it on write, so a draft and its row disagree about it routinely.
 */
const ALWAYS_IGNORED = ["accentIndex"];

/**
 * These only write themselves when there is already a row to receive them.
 * Otherwise they travel with SAVE and must count as pending work.
 *
 * This is why `metadataWritesItself` below has no default. Either answer is
 * wrong for half the callers, and the wrong one in the `true` direction loses
 * a user's name, note, tags or star with no prompt, so the caller has to say.
 */
const ROW_WRITES_ITSELF = ["favourite", "name", "description", "tags"];

/** A `JSON.stringify` whose object keys are always in the same order. */
function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, held]) => held !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, held]) => `${JSON.stringify(key)}:${stable(held)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

/**
 * What the recipe's SAVE-owned fields looked like at a moment in time.
 *
 * Text rather than a clone, so that holding one cannot accidentally hold a
 * reference into the live recipe -- which is mutated in place, and would
 * therefore compare equal to itself forever.
 */
export function snapshotForSave(recipe: Recipe, metadataWritesItself: boolean): string {
    const plain = JSON.parse(JSON.stringify(recipe)) as Record<string, unknown>;
    for (const field of ALWAYS_IGNORED) delete plain[field];
    if (metadataWritesItself) {
        for (const field of ROW_WRITES_ITSELF) delete plain[field];
    }
    return stable(plain);
}

/** Whether the recipe has changed since the snapshot, in a way SAVE owns. */
export function editsPendingSave(
    recipe: Recipe,
    opened: string,
    metadataWritesItself: boolean
): boolean {
    return snapshotForSave(recipe, metadataWritesItself) !== opened;
}
