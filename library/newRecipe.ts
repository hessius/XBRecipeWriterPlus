import {type AccentGroup} from "@/constants/colors";
import Recipe, {CUP_TYPE} from "./Recipe";

/**
 * A blank recipe for the editor to open.
 *
 * The beverage is asked before the editor opens, not inside it, because
 * `editRecipe` deliberately hides the cup-type row on tea: `CUP_OPTIONS`
 * excludes `TEA`, so on a tea recipe the row showed nothing selected and
 * tapping any option silently turned the recipe into a coffee card. Tea is a
 * one-way door, and this is the only place in the app that can open it.
 *
 * Coffee's presets are a starting point a filter brewer would recognise. Tea
 * sets the dose and the cup type but leaves grind size and grind speed at their
 * class defaults: the editor hides grind size, grind speed, cup type and the
 * grinder toggle on tea, and `getData` writes the default grind size for a tea
 * card whatever the model holds, so setting them would be theatre. `grindSize`
 * in particular stays at its `-1` "not set" sentinel, which would be a defect
 * on coffee — the library row and the editor both render grind — but is
 * genuinely invisible on tea: every call site that draws grind size gates on
 * `!isTea`, so the sentinel is never shown and never reaches a card.
 *
 * Tea's ratio is still not ours to *choose* — `fixRatio` derives it from the
 * volumes, the opposite direction from coffee, and `addOpeningPour` runs that
 * derivation the moment the user adds a stage. But it must not be left at the
 * class default, because that default is `-1`, a sentinel meaning "not set",
 * and the editor has no way to recognise a sentinel: it would multiply dose by
 * `-1` and render a "-5 ML BREW" header with a red mismatch banner before the
 * user had done anything at all. So we seed it at 18, which is exactly what
 * `fixRatio` computes for the 90 ml / 5 g opening stage (`round(90 / 5)`).
 * Seeding the derivation's own answer means the figure does not jump when the
 * user taps ADD STAGE: it is derived, as tea's ratio always is, just derived
 * ahead of the stage that will confirm it.
 *
 * `source` is set explicitly even though it already carries this value by
 * default: `"manual"` is also the legacy-migration fallback for recipes whose
 * stored JSON predates the field, so a factory that relied on the default would
 * be depending on a coincidence rather than stating its intent. `grinder` is
 * set explicitly too, but for a plainer reason — symmetry. A factory that lists
 * every field it chooses is easier to read against than one that states some
 * choices and silently inherits others.
 *
 * No stages, deliberately. The recipe is not writable or brewable until the
 * user adds one, and every gate that enforces that already exists.
 */
export function blankRecipe(group: AccentGroup): Recipe {
    const recipe = new Recipe();
    recipe.source = "manual";

    if (group === "tea") {
        recipe.cupType = CUP_TYPE.TEA;
        recipe.dosage  = 5;
        recipe.ratio   = 18;
        return recipe;
    }

    recipe.cupType  = CUP_TYPE.OMNI;
    recipe.dosage   = 15;
    recipe.ratio    = 16;
    recipe.grindSize = 65;
    recipe.grindRPM = 120;
    recipe.grinder  = true;
    return recipe;
}
