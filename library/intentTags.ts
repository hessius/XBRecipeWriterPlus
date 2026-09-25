import type Recipe from "@/library/Recipe";
import {FERMENTATIONS, PROCESSES, ROASTS} from "@/library/brew/beanTags";
import {tagKey} from "@/library/tagKey";

/**
 * The words a recipe's tags share with the coffee vocabulary.
 *
 * Intent is not a separate field and never was. A recipe has one set of tags;
 * a tag that is also a word the brews are described in is additionally read as
 * intent, because that is the only property that lets #104 hold the two sides
 * against each other. Derived rather than stored, so removing the tag removes
 * the intent and nothing can drift out of agreement with the shelf.
 *
 * Three of #100's four bean fields take part. Origin is free text there, so
 * there is no closed list to match a tag against and no way to tell "Huila"
 * from "Morning" without the app guessing -- the same guess `podCoffee.ts`
 * refused when it left out a roast rather than invent one.
 *
 * Matched on `tagKey`, the JavaScript-folded form, so "washed" and "Washed"
 * are one intent. The tag is returned as the user spelled it: the chip shows
 * their spelling, and a reading that recased it would disagree with the
 * control that produced it.
 */
export default function intentTags(recipe: Recipe): string[] {
    return recipe.tags.filter((tag) => VOCABULARY.has(tagKey(tag)));
}

const VOCABULARY = new Set(
    [...ROASTS, ...PROCESSES, ...FERMENTATIONS].map(tagKey)
);
