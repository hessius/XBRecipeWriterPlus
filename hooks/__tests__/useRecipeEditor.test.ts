import {act, renderHook} from "@testing-library/react-native";

import {useRecipeEditor, RECIPE_LABELS} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";

jest.mock("@/library/RecipeDatabase");

/**
 * A recipe whose pours do not add up to `dosage x ratio`.
 *
 * 18 g at 1:16 wants 288 ml; the single pour holds 200. The machine rejects
 * exactly this, which is what the message beside Save is about.
 */
function mismatchedJSON(): string {
    const r = new Recipe();
    r.dosage = 18;
    r.ratio = 16;
    r.addPour(0, false);
    r.pours[0].volume = 200;
    return JSON.stringify(r);
}

function editorFor(json: string) {
    return renderHook(() => useRecipeEditor({
        recipeJSON:           json,
        initiallySaveEnabled: true,
        onSaved:              jest.fn()
    }));
}

describe("useRecipeEditor volume error", () => {
    it("reports the mismatch when saving a recipe whose pours do not add up", async () => {
        const {result} = await editorFor(mismatchedJSON());

        await act(async () => result.current.saveRecipe());

        expect(result.current.volumeError).toBeTruthy();
    });

    // Regression test. The message used to be cleared only by AUTO or by a
    // successful save, so a user who corrected the pour volumes by hand was
    // left reading an error about a recipe that was already valid. As a modal
    // this could not happen -- it dismissed itself -- so making the message
    // persistent and inline is what created the need to clear it here.
    it("clears the mismatch as soon as an edit makes the pours add up", async () => {
        const {result} = await editorFor(mismatchedJSON());
        await act(async () => result.current.saveRecipe());
        expect(result.current.volumeError).toBeTruthy();

        // The user drags the one pour up to the target by hand, without
        // touching AUTO and without saving again.
        await act(async () => result.current.editInputComplete(
            RECIPE_LABELS.VOLUME, "288", 0
        ));

        expect(result.current.volumeError).toBeNull();
    });

    it("leaves the mismatch up while an edit still does not add up", async () => {
        const {result} = await editorFor(mismatchedJSON());
        await act(async () => result.current.saveRecipe());

        await act(async () => result.current.editInputComplete(
            RECIPE_LABELS.VOLUME, "250", 0
        ));

        expect(result.current.volumeError).toBeTruthy();
    });

    // Changing the ratio moves the target rather than the pours, so it can
    // invalidate a recipe that was valid a moment ago. The message must not
    // appear before the user has asked for anything to be checked, though:
    // it is raised by Save and by the write path, never by typing.
    it("does not raise the mismatch merely because an edit invalidated it", async () => {
        const valid = new Recipe();
        valid.dosage = 18;
        valid.ratio = 16;
        valid.addPour(0, false);
        valid.pours[0].volume = 288;

        const {result} = await editorFor(JSON.stringify(valid));

        await act(async () => result.current.editInputComplete(RECIPE_LABELS.RATIO, "17"));

        expect(result.current.volumeError).toBeNull();
    });
});
