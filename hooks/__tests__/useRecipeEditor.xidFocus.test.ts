import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useRecipeEditor} from "@/hooks/useRecipeEditor";
import Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

jest.mock("@/library/RecipeDatabase");
jest.mock("@/library/XBloomRecipe");

/**
 * The XID lookup fires on mount and resolves later, often while the user is
 * still editing the Recipe ID. Applying its outcome then re-renders the screen
 * mid-typing, which on an uncontrolled `TextInput` resets the native text and
 * silently undoes keystrokes. So the outcome is deferred while the ID field
 * holds focus and flushed on blur. These tests pin that deferral down at the
 * one place it is plain JS state — RNTL cannot model native TextInput text, so
 * the byte-for-byte keystroke case stays device-only.
 *
 * The lookup is driven through `handleReloadTitlePress` rather than the mount
 * effect: it is fully awaitable, so the deferral is observed without racing the
 * effect. Seeding `xbloomName` keeps the mount effect from firing its own fetch.
 */
async function editorFor(xid: string, xbloomName: string) {
    const recipe = new Recipe();
    recipe.xid = xid;
    recipe.xbloomName = xbloomName;
    const view = await renderHook(() => useRecipeEditor({
        recipeJSON: JSON.stringify(recipe), temperatureUnit: "C", onSaved: () => {}
    }));
    await act(async () => {});
    return view;
}

describe("deferring the XID lookup while the ID field is focused", () => {
    it("holds a failed lookup until the field blurs", async () => {
        (XBloomRecipe as jest.Mock).mockImplementation(() => ({
            fetchRecipeDetail: () => Promise.reject(new Error("offline")),
            getRecipeTitle:    () => "",
            getRecipe:         () => null
        }));

        const {result} = await editorFor("XB0001", "Seeded name");

        // The field holds focus when the lookup comes back. Focus is a ref
        // mutation, so it needs no `act`.
        result.current.setXidFocused(true);
        await act(async () => { await result.current.handleReloadTitlePress(); });

        // The failure is stashed, not shown: the field is still being edited.
        expect(result.current.xidLookupFailed).toBe(false);

        // Blur flushes it.
        await act(async () => { result.current.setXidFocused(false); });
        await waitFor(() => expect(result.current.xidLookupFailed).toBe(true));
    });

    it("holds a successful lookup's name until the field blurs", async () => {
        (XBloomRecipe as jest.Mock).mockImplementation(() => ({
            fetchRecipeDetail: () => Promise.resolve(),
            getRecipeTitle:    () => "Ethiopia Guji",
            getRecipe:         () => null
        }));

        const {result} = await editorFor("XB0001", "Seeded name");

        result.current.setXidFocused(true);
        await act(async () => { await result.current.handleReloadTitlePress(); });

        // The fetched name is not published onto the recipe yet.
        expect(result.current.recipe?.xbloomName).toBe("Seeded name");

        await act(async () => { result.current.setXidFocused(false); });
        await waitFor(() =>
            expect(result.current.recipe?.xbloomName).toBe("Ethiopia Guji"));
    });

    it("applies the lookup at once when the field is not focused", async () => {
        (XBloomRecipe as jest.Mock).mockImplementation(() => ({
            fetchRecipeDetail: () => Promise.resolve(),
            getRecipeTitle:    () => "Ethiopia Guji",
            getRecipe:         () => null
        }));

        // No seeded name, so the mount effect fetches; no focus was reported, so
        // nothing is deferred.
        const {result} = await editorFor("XB0001", "");

        await waitFor(() =>
            expect(result.current.recipe?.xbloomName).toBe("Ethiopia Guji"));
        expect(result.current.xidLookupFailed).toBe(false);
    });
});
