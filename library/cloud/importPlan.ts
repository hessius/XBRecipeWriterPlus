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
    /**
     * False when this row cannot be acted on at all.
     *
     * Only one case reaches it: two local recipes carry this cloud id, or this
     * share id, and nothing here can say which one the row means. Such a row
     * names no local to replace, so a tick would not replace either copy -- it
     * would insert a third recipe carrying the same id, making the ambiguity
     * worse and permanent. The one honest move is to decline the tick and let
     * the user resolve it in the library, where both copies are visible.
     *
     * Every other row stays selectable, including `edited`: declining to
     * pre-tick is the app's opinion, and spec 4.4 is explicit that the tick is
     * the user's to give.
     */
    selectable: boolean;
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
    // The second road into the library.
    //
    // A recipe can arrive here two ways: an account import, which stamps
    // `cloudId`, and a share link, which does not. Opening your own recipe's
    // link takes the second road, so the local copy carries no cloud id and
    // the first account import offers it back as `new` -- a tick then inserts
    // a second copy of a recipe already sitting in the library. The device
    // pass found exactly this.
    //
    // Matching on the share id is identity, not resemblance. The account row
    // carries `shareRecipeLink`, whose `?id=` token is the server's own name
    // for that row; `mapRow` decodes it into `shareId`, and `parseImportInput`
    // decodes a pasted link into the same string. Nothing is being guessed
    // from names or contents, which is what keeps this on the right side of
    // the rule below about never adopting a recipe we cannot identify.
    const byShareId = new Map<string, Recipe>();
    const ambiguousShare = new Set<string>();
    for (const recipe of local) {
        const id = recipe.cloudId;
        if (typeof id === "number" && id > 0) {
            if (byCloudId.has(id)) ambiguous.add(id);
            else byCloudId.set(id, recipe);
            // Indexed by cloud id *or* share id, never both. A local that has
            // been through an account import is identified by the stronger of
            // the two, and leaving a stale share id in the second index would
            // let some other row pull this same local onto itself.
            continue;
        }

        // The empty string is what every hand-made recipe carries, so matching
        // on it would adopt an arbitrary local into a stranger's recipe. Same
        // rule as `cloudId: 0` never matching, and the same reason.
        //
        // No test can currently kill this line, and that is deliberate rather
        // than an oversight: the lookup below refuses an empty share id too,
        // so the miss happens there first. It is kept as the second of two
        // independent locks on the rule this module must never break, exactly
        // as the `cloudId` guard above is.
        const share = typeof recipe.shareId === "string" ? recipe.shareId.trim() : "";
        if (share.length === 0) continue;
        if (byShareId.has(share)) ambiguousShare.add(share);
        else byShareId.set(share, recipe);
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

        // Cloud id first: a local that carries one has already been through an
        // account import, which is the stronger statement of the two.
        let existing = byCloudId.get(cloudId);
        let undecidable = ambiguous.has(cloudId);

        if (existing === undefined && !undecidable) {
            const share = recipe.shareId.trim();
            if (share.length > 0) {
                if (ambiguousShare.has(share)) {
                    undecidable = true;
                } else {
                    existing = byShareId.get(share);
                    // One local, one adopter. Two rows carrying the same link
                    // would otherwise both name this local, and the second
                    // write would silently undo the first.
                    if (existing !== undefined) byShareId.delete(share);
                }
            }
        }

        const status = undecidable ? "edited" : classify(existing, recipe);

        // A replacement keeps the local recipe's identity. `updateRecipe`
        // finds the row by the uuid it is passed but stores the recipe's own,
        // so handing it a freshly minted one leaves the row keyed on the old
        // uuid and the blob claiming the new one. The next lookup misses and
        // inserts a second copy -- the recipe silently forks in two.
        //
        // The test is not the status. It is whether this entry will name a
        // local recipe to replace, because that is what decides which write
        // path it takes. Keying the realignment off the status instead let the
        // two drift apart, and they did: `edited` named a local uuid while
        // carrying a fresh one, so the recipe forked the moment somebody
        // ticked the box. `unchanged` and `edited` are both reached only by a
        // deliberate tick, and neither may be the path that forks.
        //
        // So `existingUuid` below is not merely set on the same condition, it
        // is read off this same binding. There is no longer a second
        // expression for the two to disagree about.
        const replacing = undecidable ? undefined : existing;
        if (replacing !== undefined) {
            recipe.uuid = replacing.uuid;
            // `key` only matters in memory: the JSON constructor always sets
            // it from `uuid` and never reads a stored one, so this aligns the
            // object the caller is holding and nothing more. Not load-bearing.
            recipe.key = replacing.uuid;
            // Local-only fields are carried across too, and for a different
            // reason than the uuid. A replacement is a whole freshly mapped
            // Recipe, so anything the cloud does not know about starts empty on
            // it and would be written straight over the local copy. xBloom has
            // no notion of tags, so a refresh would silently serialise `[]`
            // over work the user did by hand, on a recipe that still looks
            // identical on screen.
            //
            // The fingerprint deliberately covers brew content only, so
            // carrying these cannot change what counts as an edit. Anything
            // added to Recipe that the user authors and the cloud cannot
            // supply belongs on this list.
            recipe.setTags(replacing.tags);
            recipe.favourite = replacing.favourite;
            recipe.description = replacing.description;
        }

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
            existingUuid: replacing?.uuid,
            selectable: !undecidable,
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
