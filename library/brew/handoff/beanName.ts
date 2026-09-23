/**
 * A bean name guessed from a recipe name.
 *
 * A brew from an xPod carries its coffee, so it never comes here. Everything
 * else arrives at Beanconqueror with no bean at all, and BC then falls back to
 * whatever is first in the user's list. A wrong bean is worse than an unnamed
 * one, so we would rather hand over something with a chance of matching.
 *
 * People name recipes after the coffee more often than not. The guess is
 * deliberately short, because Beanconqueror matches on a whole leading word in
 * either direction: a two-word hint reaches a longer stored name, while the
 * whole recipe name -- "Ethiopia Guji Natural v3 hotter" -- reaches nothing.
 *
 * The guess is never final. It is a hint the user can overwrite before sending,
 * and if it matches nothing BC says so in the brew note and carries on.
 */

/**
 * A dash used as a separator, not as part of a word.
 *
 * "Ethiopia Guji - Drop Coffee" names a coffee and then its roaster, so the
 * coffee is what comes before. "Long-Berry" is one word and must survive, so a
 * hyphen only separates when it is spaced. En and em dashes are separators
 * wherever they appear; nobody spells a coffee with one inside a word.
 */
const SEPARATOR = /\s+[-]\s*|[-]\s+|\s*[\u2013\u2014]\s*/;

/** How many words to keep when there is no dash to cut at. */
const WORDS_KEPT = 2;

/** Whether a guess says anything. Punctuation alone is not a coffee. */
function hasSubstance(guess: string): boolean {
    return /[\p{L}\p{N}]/u.test(guess);
}

export function beanNameFromRecipe(recipeName: string): string | undefined {
    const trimmed = typeof recipeName === "string" ? recipeName.trim() : "";
    if (trimmed === "") return undefined;

    const dash = SEPARATOR.exec(trimmed);
    if (dash !== null) {
        // A dash is a deliberate division, so everything in front of it is
        // taken whole rather than cut to two words as well. "Ethiopia Guji
        // Natural" names one bean uniquely where "Ethiopia Guji" might name
        // two. A name that opens with a dash has nothing in front of it and
        // yields nothing, rather than the dash itself.
        const head = trimmed.slice(0, dash.index).trim();
        return hasSubstance(head) ? head : undefined;
    }

    // No dash to cut at, so the guess is the first two words. Longer than that
    // and a recipe name starts describing the brew rather than the coffee.
    const guess = trimmed.split(/\s+/).slice(0, WORDS_KEPT).join(" ");
    return hasSubstance(guess) ? guess : undefined;
}

export default beanNameFromRecipe;
