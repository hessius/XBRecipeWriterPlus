import Recipe from "./Recipe";
import {accents, type AccentGroup} from "@/constants/colors";

/** Which half of the palette a recipe draws from. */
export function accentGroupFor(recipe: Recipe): AccentGroup {
    // Ask Recipe rather than comparing `cupType` here. The tea byte can carry
    // the default cup count in its high nibble, and legacy cards arrive as 0x13
    // or 0x23; every one of those normalisations lives behind `isTea()`. A
    // second copy of the predicate would silently miss the next such fix.
    return recipe.isTea() ? "tea" : "coffee";
}

/**
 * FNV-1a over the uuid. Any stable hash would do; the only requirement is that a
 * given recipe keeps its colour across launches, since the accent is not yet
 * persisted. Sub-project 2 adds the persisted field and this becomes the
 * fallback for recipes saved before it existed.
 */
function hashToIndex(key: string, modulo: number): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        // Math.imul returns a signed 32-bit result; >>> 0 makes it unsigned
        // before the modulo, so the index can never come out negative.
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % modulo;
}

/** The accent colour to paint a recipe's card with. */
export function resolveAccent(recipe: Recipe): string {
    const group = accentGroupFor(recipe);
    const groupAccents = accents[group];

    const persisted = recipe.accentIndex;
    if (
        typeof persisted === "number" &&
        Number.isInteger(persisted) &&
        persisted >= 0 &&
        persisted < groupAccents.length
    ) {
        return groupAccents[persisted];
    }

    return groupAccents[hashToIndex(recipe.uuid, groupAccents.length)];
}

/**
 * The index a newly saved recipe should take: the least-used accent in its half
 * of the palette, ties broken by lowest index. While the library is smaller than
 * the half-palette this is simply the first unused colour; past that, colours
 * repeat as evenly as possible rather than clustering.
 *
 * Returns the index; persisting it is the caller's job.
 *
 * @param group Which half to assign from.
 * @param inUse Accent indices already taken by recipes in the same half.
 *              Repeats are meaningful — they are what makes an index "more
 *              used". Entries outside the group are silently ignored, so a
 *              caller holding indices from the larger coffee half cannot skew
 *              the tea counts.
 */
export function nextAccentIndex(group: AccentGroup, inUse: number[]): number {
    const counts: number[] = new Array(accents[group].length).fill(0);
    for (const index of inUse) {
        if (Number.isInteger(index) && index >= 0 && index < counts.length) {
            counts[index]++;
        }
    }

    // Strict `<` is what breaks ties by lowest index; `<=` would return the
    // highest of the tied indices instead.
    let best = 0;
    for (let i = 1; i < counts.length; i++) {
        if (counts[i] < counts[best]) {
            best = i;
        }
    }
    return best;
}

/**
 * The accent index a recipe should hold, given the accents already in use in
 * its half of the palette.
 *
 * Returns the existing index unchanged when it is still valid. A recipe whose
 * cup type has crossed between coffee and tea gets a fresh one, because the two
 * halves are disjoint: a coffee index can point past the end of the shorter tea
 * half, and even when it does not it names a colour from the wrong group.
 *
 * @param inUse Accent indices held by other recipes in the same half.
 */
export function reassignIfCrossed(recipe: Recipe, inUse: number[]): number {
    const group = accentGroupFor(recipe);
    const size = accents[group].length;
    const current = recipe.accentIndex;

    if (typeof current === "number" && Number.isInteger(current) &&
        current >= 0 && current < size) {
        return current;
    }

    return nextAccentIndex(group, inUse);
}
