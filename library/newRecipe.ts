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
 * sets only the dose and the cup type: the editor hides grind size, grind
 * speed, cup type and the grinder toggle on tea, and `getData` writes the
 * default grind size for a tea card whatever the model holds, so setting them
 * would be theatre. Tea's ratio is not ours to choose either — `fixRatio`
 * derives it from the volumes, which is why it stays at its default until
 * `addOpeningPour` gives it a stage to derive from.
 *
 * `source` and `grinder` are set explicitly even though both already carry
 * these values by default. `"manual"` is also the legacy-migration fallback for
 * recipes whose stored JSON predates the field, so a factory that relied on the
 * default would be depending on a coincidence rather than stating its intent;
 * the same reasoning keeps `grinder` explicit.
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
