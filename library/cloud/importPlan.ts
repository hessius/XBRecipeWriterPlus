import {accentGroupFor, assignAccent} from "@/library/accent";
import type Recipe from "@/library/Recipe";
import {matchAccent} from "./accentMatch";
import type {CloudRow} from "./cloudLibrary";
import {fingerprint} from "./fingerprint";
import {mapRow} from "./mapRow";

/**
 * What a second import would do, decided before anything is written.
 *
 * Pure: it takes the rows and the local recipes and returns a description. It
 * has no database, so there is no arrangement of it that can write anything,
 * and the rule the whole feature rests on -- that an edit made here is never
 * silently overwritten -- is a property of a function that can simply be
 * tested.
 *
 * `edited` is the interesting case. It is not an error and not a conflict to
 * be resolved: it is the app declining to make a decision that is the user's,
 * offering the row unselected and saying why.
 */

export type ImportStatus =
    /** No local recipe carries this cloud id. */
    | "new"
    /** The local copy is untouched and the cloud copy has moved on. */
    | "updated"
    /** The local copy is untouched and identical. Nothing to do. */
    | "unchanged"
    /** The local copy has been changed here since it arrived. Hands off. */
    | "edited";

export type ImportEntry = {
    /** The id of this recipe in the account library. */
    cloudId: number;
    name: string;
    status: ImportStatus;
    /** The recipe as it would be written, accent and fingerprint already set. */
    recipe: Recipe;
    /** The local recipe this would replace, when there is one. */
    existingUuid?: string;
    /** Pre-ticked for `new` and `updated`; never for `unchanged` or `edited`. */
    selected: boolean;
};

export type ImportPlan = {
    entries: ImportEntry[];
    /** Rows the mapper could not read. Surfaced, never silently dropped. */
    unreadable: number;
    /**
     * Rows repeating a cloud id already seen in this same response, and so
     * skipped. Counted rather than dropped in silence, for the same reason as
     * `unreadable`: the user can count their own recipes.
     */
    duplicated: number;
    counts: Record<ImportStatus, number>;
};

export function buildImportPlan(rows: CloudRow[], local: Recipe[]): ImportPlan {
    // Keyed only on real cloud ids. A local recipe that never came from an
    // account carries `undefined` or the design's `0` sentinel, and neither may
    // ever match: the spec singles this out as the one bug here that would
    // quietly destroy work, because a hand-made recipe colliding as "already
    // imported" gets silently replaced by a stranger's.
    //
    // Note this half of the guard cannot currently be reached, and no test
    // covers it: `mapRow` refuses a row whose `tableId` is zero or absent, so
    // nothing arriving here is keyed on either value and the lookup misses
    // anyway. It is kept as the second of two independent locks on the one
    // rule in this module that must not fail, not because it is dead -- a
    // future caller that builds entries some other way would need it.
    const byCloudId = new Map<number, Recipe>();
    // A cloud id appearing twice locally means we cannot say which copy a row
    // refers to. Rather than let insertion order pick -- which would make the
    // answer depend on the order the database happened to return rows, and
    // could auto-select an update while another copy holds the user's edits --
    // every copy is treated as edited and nothing is pre-selected.
    const ambiguous = new Set<number>();
    for (const recipe of local) {
        const id = recipe.cloudId;
        if (typeof id !== "number" || id <= 0) continue;
        if (byCloudId.has(id)) ambiguous.add(id);
        else byCloudId.set(id, recipe);
    }

    const entries: ImportEntry[] = [];
    let unreadable = 0;
    let duplicated = 0;
    const seen = new Set<number>();

    // Accents are chosen against the local library *and* against the recipes
    // earlier in this same import, so twenty recipes arriving together do not
    // all land on the same colour.
    const assignedSoFar: Recipe[] = [...local];

    for (const row of rows) {
        const mapped = mapRow(row);
        if (!mapped) {
            unreadable += 1;
            continue;
        }

        const {recipe, color} = mapped;
        const cloudId = recipe.cloudId!;

        // The same row twice would otherwise produce two selected entries
        // naming one local recipe, leaving whichever ran last to win. One row
        // is one decision.
        if (seen.has(cloudId)) {
            duplicated += 1;
            continue;
        }
        seen.add(cloudId);

        const existing = byCloudId.get(cloudId);
        const status = ambiguous.has(cloudId) ? "edited" : classify(existing, recipe);

        applyAccent(recipe, color, assignedSoFar);
        // The fingerprint excludes the accent, so the order of these two is
        // immaterial and no test pins it. Stamped here because this is the
        // value the *next* import compares against, and it should describe the
        // recipe in its final state.
        recipe.cloudFingerprint = fingerprint(recipe);
        assignedSoFar.push(recipe);

        entries.push({
            cloudId,
            name: recipe.name,
            status,
            recipe,
            // Not named when the local side is ambiguous: two copies carry
            // this cloud id and the one in the map is whichever the database
            // happened to return first. The entry is unselected, but a user
            // may still tick it by hand, and a write aimed at a coin-flip
            // winner is worse than one the caller has to resolve.
            existingUuid: ambiguous.has(cloudId) ? undefined : existing?.uuid,
            selected: status === "new" || status === "updated",
        });
    }

    const counts: Record<ImportStatus, number> = {
        new: 0,
        updated: 0,
        unchanged: 0,
        edited: 0,
    };
    for (const entry of entries) counts[entry.status] += 1;

    return {entries, unreadable, duplicated, counts};
}

function classify(existing: Recipe | undefined, incoming: Recipe): ImportStatus {
    if (!existing) return "new";

    // No stored fingerprint means the local copy predates this feature or came
    // from a backup. We cannot show it is untouched, so we must not touch it.
    if (!existing.cloudFingerprint) return "edited";

    const localNow = fingerprint(existing);
    if (localNow !== existing.cloudFingerprint) return "edited";

    return localNow === fingerprint(incoming) ? "unchanged" : "updated";
}

// The colour arrives beside the recipe, from `mapRow`'s `MappedRow`, and is
// consumed here. It is never set on the `Recipe`: that object is persisted by
// a blanket `JSON.stringify`, so a foreign hex parked on it would be written
// to the database and to backups, and stripping it again everywhere it is
// saved is a promise this codebase has already failed to keep once.
function applyAccent(recipe: Recipe, color: string | undefined, others: Recipe[]): void {
    const matched = color ? matchAccent(color, accentGroupFor(recipe)) : null;

    if (matched === null) {
        assignAccent(recipe, others);
    } else {
        recipe.accentIndex = matched;
    }
}
