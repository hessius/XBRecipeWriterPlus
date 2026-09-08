import {renderHook, waitFor} from "@testing-library/react-native";

import {useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

jest.mock("@/library/RecipeDatabase");
jest.mock("@/library/XBloomRecipe");

describe("XID lookup failure", () => {
    it("reports a lookup that failed", async () => {
        (XBloomRecipe as jest.Mock).mockImplementation(() => ({
            fetchRecipeDetail: () => Promise.reject(new Error("offline")),
            getRecipeTitle:    () => "",
            getRecipe:         () => null
        }));

        const recipe = new Recipe();
        recipe.xid = "XB0001";
        const {result} = await renderHook(() => useRecipeEditor({
            recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}
        }));

        await waitFor(() => expect(result.current.xidLookupFailed).toBe(true));
    });

    it("reports nothing when the lookup succeeds", async () => {
        (XBloomRecipe as jest.Mock).mockImplementation(() => ({
            fetchRecipeDetail: () => Promise.resolve(),
            getRecipeTitle:    () => "Ethiopia Guji",
            getRecipe:         () => null
        }));

        const recipe = new Recipe();
        recipe.xid = "XB0001";
        const {result} = await renderHook(() => useRecipeEditor({
            recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}
        }));

        await waitFor(() =>
            expect(result.current.recipe?.xbloomName).toBe("Ethiopia Guji"));
        expect(result.current.xidLookupFailed).toBe(false);
    });
});
