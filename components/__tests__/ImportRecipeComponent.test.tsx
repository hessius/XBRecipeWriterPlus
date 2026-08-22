import React, {useState} from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import {Button} from "tamagui";
import {renderWithProviders} from "@/test-utils/render";
import ImportRecipeComponent from "@/components/ImportRecipeComponent";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({useRouter: () => ({push: mockPush})}));

jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: class {
        fetchRecipeDetail() { return Promise.resolve(); }
        getName() { return "Test Recipe"; }
        getSubtitle() { return ""; }
        getImageURL() { return ""; }
        getRecipe() { return {title: "Test Recipe"}; }
    }
}));

jest.mock("@/library/RecipeDatabase", () => jest.fn().mockImplementation(() => ({
    retrieveAllRecipes: () => []
})));

beforeEach(() => mockPush.mockClear());

describe("ImportRecipeComponent", () => {
    it("shows the fetched recipe once it has loaded", async () => {
        await renderWithProviders(<ImportRecipeComponent recipeId="abc" onClose={jest.fn()}/>);

        await waitFor(() => expect(screen.getByText("Test Recipe")).toBeTruthy());
        expect(screen.getAllByText("Import Recipe")).toHaveLength(1);
    });

    it("navigates to the editor on import", async () => {
        await renderWithProviders(<ImportRecipeComponent recipeId="abc" onClose={jest.fn()}/>);
        await waitFor(() => expect(screen.getByText("Test Recipe")).toBeTruthy());

        await fireEvent.press(screen.getByLabelText("Import"));

        await waitFor(() => expect(mockPush).toHaveBeenCalled());
        expect(mockPush.mock.calls[0][0].pathname).toBe("/editRecipe");
    });

    it("tells the parent to clear its state after importing", async () => {
        // Otherwise the parent keeps showImportRecipeDialog true with a stale id, and
        // the next thing that remounts this component re-opens the sheet unprompted.
        const onClose = jest.fn();
        await renderWithProviders(<ImportRecipeComponent recipeId="abc" onClose={onClose}/>);
        await waitFor(() => expect(screen.getByText("Test Recipe")).toBeTruthy());

        await fireEvent.press(screen.getByLabelText("Import"));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("tells the parent to clear its state on cancel", async () => {
        const onClose = jest.fn();
        await renderWithProviders(<ImportRecipeComponent recipeId="abc" onClose={onClose}/>);
        await waitFor(() => expect(screen.getByText("Test Recipe")).toBeTruthy());

        await fireEvent.press(screen.getByLabelText("Close"));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("does not re-open when an unrelated parent re-render changes its key", async () => {
        // The recipe list bumps a `key` counter to force re-renders. It used to be
        // part of this component's key, so any refresh remounted it, re-fetched and
        // popped a second identical sheet on top of the first.
        function Parent() {
            const [refreshKey, setRefreshKey] = useState(0);
            return (
                <>
                    <Button aria-label="refresh" onPress={() => setRefreshKey((n) => n + 1)}>refresh</Button>
                    <ImportRecipeComponent key={`import-${refreshKey}`} recipeId="abc" onClose={jest.fn()}/>
                </>
            );
        }

        await renderWithProviders(<Parent/>);
        await waitFor(() => expect(screen.getByText("Test Recipe")).toBeTruthy());

        await fireEvent.press(screen.getByLabelText("refresh"));

        await waitFor(() => expect(screen.getAllByText("Import Recipe")).toHaveLength(1));
    });
});
