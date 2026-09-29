import {tagKey} from "../tagKey";
import type {BrewRecord} from "./BrewRecord";

/**
 * What a brew's coffee was.
 *
 * One place, the way `constants/brewCopy.ts` owns copy, so the editor and the
 * filter cannot come to disagree about what a process is. A preset defined
 * anywhere else is a bug: #104 groups on these strings, and a second spelling
 * of one of them silently splits a group.
 */

/** The preset fields, in the order a surface should present them. */
export const BEAN_FIELDS = ["origin", "roast", "process", "fermentation"] as const;
export type BeanField = typeof BEAN_FIELDS[number];

/**
 * Roast level, in scale order rather than alphabetical.
 *
 * The two compound steps are here because roasters use them and BrewMind
 * sends them. Without them a coffee described as Light-Medium tagged as
 * nothing at all, so it sat outside #104's roast grouping entirely -- worse
 * than the coarseness of rounding it to Light, and invisible to the user.
 *
 * These are the spellings the app *stores*. What arrives is matched through
 * `roastFrom`, so "dark medium" and "MEDIUM–DARK" both land on `Medium-Dark`
 * and group with it.
 */
export const ROASTS = [
    "Light", "Light-Medium", "Medium", "Medium-Dark", "Dark"
] as const;
export type Roast = typeof ROASTS[number];

/**
 * How the fruit came off the seed.
 *
 * Deliberately separate from `FERMENTATIONS`. The two describe different
 * things and a bag routinely states both, so one field would force the user to
 * discard half of what they are holding.
 */
export const PROCESSES = ["Washed", "Natural", "Honey"] as const;
export type Process = typeof PROCESSES[number];

export const FERMENTATIONS = [
    "Anaerobic", "Carbonic maceration", "Lactic", "Co-ferment", "Experimental"
] as const;
export type Fermentation = typeof FERMENTATIONS[number];

/** Long enough for a washing station, short enough to not be a document. */
export const MAX_ORIGIN_LENGTH = 120;
/** The same ceilings recipe tags use, for the same reasons. */
export const MAX_BEAN_TAG_LENGTH = 32;
export const MAX_BEAN_TAGS = 20;

function member<T extends string>(values: readonly T[]) {
    const set = new Set<string>(values);
    // Exact match only, on purpose. These guard what is already *stored*: a
    // brew row, a restored backup, a filter id. Everything in those places has
    // been through `roastFrom` and friends already, so a value that is not
    // letter-for-letter a member is a value that came from somewhere it should
    // not have, and the right answer is to refuse it rather than to repair it
    // here, out of sight of the matching rules.
    return (value: unknown): value is T =>
        typeof value === "string" && set.has(value);
}

export const isRoast = member(ROASTS);
export const isProcess = member(PROCESSES);
export const isFermentation = member(FERMENTATIONS);

/**
 * Every character a writer might put between two words of one term.
 *
 * The dashes are the trap. A recipe page written in a word processor carries
 * an en dash, a copy-paste out of a PDF can carry a non-breaking hyphen or a
 * soft hyphen, and none of them are the ASCII hyphen anybody typed. They all
 * mean the same thing to a reader, so they have to mean the same thing here.
 *
 * `\s` covers the non-breaking space too, which is the other invisible one.
 */
const SEPARATORS = /[\s\u002d\u005f\u002f\u00ad\u2010-\u2015\u2212]+/u;

/**
 * The form of a vocabulary term that two spellings of it have in common.
 *
 * Case, separator and word order all folded away: "Dark-Medium", "medium
 * dark" and "MEDIUM–DARK" are one key. Sorting the words is what buys the
 * last of those, and it is safe only because these are closed lists of two
 * words at most -- a test asserts no two members of a vocabulary share a key,
 * so adding a term that collides with another fails CI rather than silently
 * making one of them unreachable.
 *
 * Separate from `tagKey`, which folds case alone. That one decides whether two
 * *user* tags are the same tag, and a user who typed both "Slow Brew" and
 * "brew slow" meant two things. This one reads somebody else's description of
 * a coffee against a list we control.
 */
function vocabularyKey(value: string): string {
    return value.trim().toLowerCase().split(SEPARATORS)
        .filter((word) => word !== "").sort().join(" ");
}

/** Exposed for the collision test, which is the reason sorting is allowed. */
export const vocabularyKeyFor = vocabularyKey;

/**
 * The member of a vocabulary a free-text value names, canonically spelled.
 *
 * Returns the app's spelling, never the caller's, so what gets tagged and
 * grouped is one string however it arrived. Still a match and never a guess:
 * a value naming no member returns undefined, and an unset field is better
 * than an invented one.
 */
function matcher<T extends string>(values: readonly T[]) {
    const byKey = new Map<string, T>(
        values.map((value) => [vocabularyKey(value), value])
    );
    return (value: unknown): T | undefined =>
        typeof value === "string" ? byKey.get(vocabularyKey(value)) : undefined;
}

export const roastFrom = matcher(ROASTS);
export const processFrom = matcher(PROCESSES);
export const fermentationFrom = matcher(FERMENTATIONS);

/**
 * The process a pod's free text describes, when it plainly describes one.
 *
 * xBloom sends an arbitrary string, so this is a match and never a guess. Two
 * rules follow from that, and both matter more than the convenience:
 *
 * - no match means unset, not a default. `PodCoffee` already has no `roast`
 *   field because the probed value was unreliable, and the comment there says
 *   an invented roast level is worse than none. Same rule.
 * - two matches means unset as well. "washed and natural blend" describes a
 *   blend, and picking whichever term came first would make up a fact about
 *   somebody's coffee that #104 would then group on.
 */
export function processFromPodText(text: string | undefined): Process | undefined {
    if (typeof text !== "string") return undefined;
    const folded = tagKey(text);
    if (folded === "") return undefined;
    const hits = PROCESSES.filter((process) =>
        new RegExp(`\\b${tagKey(process)}\\b`).test(folded));
    return hits.length === 1 ? hits[0] : undefined;
}

/**
 * A brew's custom tags, folded to the set that will be stored.
 *
 * Folds through `tagKey` so two spellings are one tag, exactly as
 * `Recipe.normaliseTags` does, and keeps the first spelling seen because that
 * is the one the user typed most recently in this list.
 *
 * Over-length tags are dropped rather than truncated, the opposite of the
 * backup note rule. A truncated tag is a different tag, and it would group
 * with nothing.
 */
export function normaliseBeanTags(tags: readonly unknown[]): string[] {
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const raw of tags) {
        if (typeof raw !== "string") continue;
        const tag = raw.trim();
        if (tag.length === 0 || tag.length > MAX_BEAN_TAG_LENGTH) continue;
        const key = tagKey(tag);
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(tag);
        if (kept.length === MAX_BEAN_TAGS) break;
    }
    return kept;
}

function trimmedNonEmpty(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

/**
 * What this brew's origin is, counting the pod.
 *
 * User value, else the pod's, else unset. Resolved here rather than written
 * into the row, so the database never holds a claim the user did not make:
 * clearing their value reveals the pod's again instead of leaving a blank, and
 * a pod brew joins #104's comparison without anyone having typed anything.
 */
export function resolvedOrigin(record: BrewRecord): string | undefined {
    const own = trimmedNonEmpty(record.origin);
    if (own !== undefined) return own;
    // This intentionally follows the stored pod blob. `podCoffeeFromStored`
    // requires a name, so `{coffee: {origin: "Huila"}}` can resolve before a
    // backup restore and resolve to nothing after it has been rebuilt.
    return trimmedNonEmpty(record.coffee?.origin);
}

/**
 * What this brew's process is, counting the pod.
 *
 * The pod's side goes through `processFromPodText`, so an unmatched or
 * ambiguous description resolves to unset rather than to a guess.
 */
export function resolvedProcess(record: BrewRecord): Process | undefined {
    if (isProcess(record.process)) return record.process;
    return processFromPodText(record.coffee?.processing);
}
