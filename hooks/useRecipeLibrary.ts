import {useState} from "react";

import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

/**
 * The part of `RecipeDatabase` this hook uses.
 *
 * Narrow on purpose: it is the whole contract, so a test can supply three
 * functions instead of a database, and a reader can see at a glance that the
 * home screen neither writes recipes nor reads settings.
 */
export type RecipeStore = {
    retrieveAllRecipes: () => Recipe[] | null;
    deleteRecipe: (uuid: string) => void;
    cloneRecipe: (uuid: string) => void;
};

export type RecipeLibrary = {
    recipes: Recipe[];
    refresh: () => void;
    deleteRecipe: (recipe: Recipe) => void;
    duplicateRecipe: (recipe: Recipe) => void;
};

/**
 * The saved recipes, and the two things the list can do to one.
 *
 * Lifted out of `app/index.tsx`, which was loading, sorting, deleting and
 * duplicating as well as laying the screen out. A route file should stay close
 * to layout — the same reasoning that produced `useRecipeEditor`.
 *
 * @param db Injected by tests. Production call sites omit it.
 */
export function useRecipeLibrary(db: RecipeStore = new RecipeDatabase()): RecipeLibrary {
    const [recipes, setRecipes] = useState<Recipe[]>(() => read(db));

    function reload() {
        setRecipes(read(db));
    }

    function deleteRecipe(recipe: Recipe) {
        db.deleteRecipe(recipe.uuid);
        reload();
    }

    function duplicateRecipe(recipe: Recipe) {
        db.cloneRecipe(recipe.uuid);
        reload();
    }

    return {recipes, refresh: reload, deleteRecipe, duplicateRecipe};
}

/**
 * `retrieveAllRecipes` answers `null` for an empty table. Absorbed here rather
 * than leaked to callers: the old screen checked for it at every use, and one
 * of those checks conflated "no recipes" with "not loaded yet".
 */
function read(db: RecipeStore): Recipe[] {
    const stored = db.retrieveAllRecipes() ?? [];
    return [...stored].sort((a, b) => a.displayName().localeCompare(b.displayName()));
}

export default useRecipeLibrary;
