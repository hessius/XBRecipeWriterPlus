import Recipe, {type RecipeSource} from "@/library/Recipe";
import {fermentationFrom, processFrom, roastFrom} from "@/library/brew/beanTags";
import type {PodCoffee} from "@/library/podCoffee";

/**
 * What an import link adds to the recipe it points at (issue #159).
 *
 * Kept out of the import hook because none of it is about React: it is a
 * statement about a recipe, and a statement about a recipe belongs in
 * `library/` where it can be tested without a renderer.
 */
export type ImportDecoration = {
    coffee?: PodCoffee;
    source?: RecipeSource;
    /** `recipe.url`: the producer's own page for this recipe. */
    recipeUrl?: string;
};

/**
 * Tags worth deriving from a coffee.
 *
 * Only the three closed vocabularies, and the tag is always the app's own
 * spelling of the term rather than the sender's. Case, separators and the
 * order of a compound level are all folded away first, so a coffee sent as
 * "dark medium" groups with one sent as `Medium-Dark` instead of quietly
 * sitting in a shelf of one. What the tag cannot do is guess: a value naming
 * no member is left untagged, which is the rule `roastFrom` enforces.
 *
 * The bean record itself keeps the sender's wording. That copy is on its way
 * to Beanconqueror and is what the roaster wrote; only the tag, which exists
 * to group, is normalised.
 *
 * Roaster, origin, farm and the rest are deliberately not tagged, per #159. A
 * tag is for grouping recipes, and a tag list that mirrors the bean record is
 * a second copy of data that already has a home, with a per-recipe cap it
 * would spend on values no two recipes share.
 */
function tagsFrom(coffee: PodCoffee): string[] {
    const tags: string[] = [];
    const roast = roastFrom(coffee.roast);
    if (roast !== undefined) tags.push(roast);
    const process = processFrom(coffee.processing);
    if (process !== undefined) tags.push(process);
    const fermentation = fermentationFrom(coffee.fermentation);
    if (fermentation !== undefined) tags.push(fermentation);
    return tags;
}

/**
 * Apply an import link's decoration to the recipe it fetched.
 *
 * Mutates, in keeping with the way a `Recipe` is handled everywhere else in
 * this app, and returns the same object so a caller can read as an expression.
 *
 * The caller must apply this to the *candidate*, before de-duplication. When
 * the link points at a recipe already in the library, the stored recipe wins
 * and keeps its own coffee: a link should not quietly rewrite the coffee on a
 * recipe the user has already edited.
 */
export function decorateImport(recipe: Recipe, decoration: ImportDecoration): Recipe {
    const {coffee, source, recipeUrl} = decoration;
    if (source !== undefined) recipe.source = source;
    if (recipeUrl !== undefined) recipe.recipeUrl = recipeUrl;
    if (coffee === undefined) return recipe;

    recipe.coffee = coffee;

    // Through `setTags`, never by assignment, so the result is normalised and
    // capped. Existing tags are kept: the fetched recipe's own tags are not
    // this link's to discard.
    const derived = tagsFrom(coffee);
    if (derived.length > 0) recipe.setTags([...recipe.tags, ...derived]);
    return recipe;
}
