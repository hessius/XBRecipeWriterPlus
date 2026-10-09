import Recipe from "@/library/Recipe";
import Pour from "@/library/Pour";

export function coffee(name = "Morning", ratio = 15): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.dosage = 15;
    recipe.ratio = ratio;
    recipe.grindSize = 65;
    recipe.grindRPM = 90;
    recipe.grinder = true;
    const pour = new Pour(1);
    pour.volume = 15 * ratio;
    pour.temperature = 93;
    pour.pourPattern = 0;
    pour.agitation = 0;
    pour.pauseTime = 0;
    pour.flowRate = 30;
    recipe.pours = [pour];
    return recipe;
}
