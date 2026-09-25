import {tagKey} from "../tagKey";

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

export const ROASTS = ["Light", "Medium", "Dark"] as const;
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
    // Exact match only. A near miss is refused rather than repaired: repairing
    // one would mean deciding that "washed" is Washed, and then deciding what
    // "wet process" is, and the vocabulary stops being a fixed list.
    return (value: unknown): value is T =>
        typeof value === "string" && set.has(value);
}

export const isRoast = member(ROASTS);
export const isProcess = member(PROCESSES);
export const isFermentation = member(FERMENTATIONS);

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
