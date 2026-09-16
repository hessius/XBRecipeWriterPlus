/**
 * The form of a tag two spellings have in common.
 *
 * Tags are matched case-insensitively and displayed exactly as typed, so every
 * comparison needs a folded form and every display needs the original. This is
 * the one place that folding happens: `Recipe.normaliseTags` dedupes with it
 * and `recipe_tags.tagKey` stores it, so the model and the table cannot
 * disagree about whether two tags are the same tag.
 *
 * Deliberately not a SQLite collation. `COLLATE NOCASE` folds ASCII only, so it
 * reads CAFE and cafe as equal and CAFÉ and café as different, while
 * `toLowerCase()` folds both. Under NOCASE the two sides disagreed for exactly
 * the tags a non-English user would write: `setTags` would collapse two
 * spellings into one tag that no filter could then find.
 */
export function tagKey(tag: string): string {
    return tag.trim().toLowerCase();
}
