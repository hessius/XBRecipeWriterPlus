import React from "react";
import {StyleSheet} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import EditRecipe from "@/app/editRecipe";
import {renderWithProviders} from "@/test-utils/render";

import Recipe from "@/library/Recipe";

// The mocks mirror app/__tests__/index.test.tsx — read that file and reuse its
// shapes rather than inventing new ones. Note the comment there about reading a
// `const` from inside a hoisted `jest.mock` factory.
jest.mock("expo-router", () => ({
    useLocalSearchParams: () => ({recipeJSON: mockFixtureJSON, saveEnabled: "false"}),
    useNavigation:        () => ({setOptions: mockSetOptions, goBack: jest.fn()})
}));

jest.mock("@/library/RecipeDatabase");

// `useSetting` reaches for the shared SQLite-backed settings store, which
// cannot open under jest. The editor only reads `helpStyle`; pin it. (Not in
// the plan's sketch — added here because the real hook opens a database.)
jest.mock("@/hooks/useSetting", () => ({
    useSetting: () => ["explain", jest.fn()]
}));

jest.mock("@/library/NFC", () => ({
    __esModule:     true,
    default:        jest.fn().mockImplementation(() => ({
        getIsClosed: jest.fn(() => true),
        close:       jest.fn(),
        writeCard:   jest.fn()
    })),
    setNfcAlertIOS: jest.fn()
}));

const mockSetOptions = jest.fn();

/** 18 g at 1:16 over two pours of 144: 288 ml, in balance. */
function fixture(): Recipe {
    const r = new Recipe();
    r.dosage = 18;
    r.ratio = 16;
    r.addPour(0, false);
    r.addPour(0);
    r.autoFixPourVolumes();
    return r;
}

const mockFixtureJSON = JSON.stringify(fixture());

/**
 * The header's caret is set through `navigation.setOptions`, so it is not in
 * the tree — it has to be pulled back out of the mock and rendered.
 *
 * Both renders are wrapped in a fragment. The first render cannot be a bare
 * `<EditRecipe/>` while the second is a fragment: React would then see the
 * screen's element change from `EditRecipe` to `Fragment` and remount it,
 * disconnecting the caret's `onPress` closure from the live instance's state,
 * so pressing "More" would open nothing. Same shape both times keeps the
 * instance — and its overflow state — alive.
 */
async function renderEditor() {
    const view = await renderWithProviders(<><EditRecipe key="editor"/></>);
    const options = mockSetOptions.mock.calls.at(-1)?.[0];
    if (options?.headerRight) await view.rerender(
        <>
            <EditRecipe key="editor"/>
            {options.headerRight()}
        </>
    );
    return view;
}

describe("the editor", () => {
    it("opens on the recipe, not on a form", async () => {
        await renderEditor();

        expect(screen.getByTestId("recipe-hero")).toBeTruthy();
    });

    it("shows every brew field at once", async () => {
        await renderEditor();

        // The titles as `RECIPE_HELP` holds them. `FieldRow` uppercases with
        // `textTransform`, which is a style — the text content is unchanged,
        // so a query for "RATIO" would find nothing.
        for (const label of ["Dose", "Ratio", "Grind size", "Grind speed",
                             "Cup", "Grinder", "Recipe ID", "Name"]) {
            expect(screen.getByText(label)).toBeTruthy();
        }
    });

    it("steps the ratio by whole numbers, which is all the card holds", async () => {
        await renderEditor();

        await fireEvent.press(screen.getByLabelText("Increase Ratio"));

        expect(screen.getByLabelText("Ratio, 17")).toBeTruthy();
    });

    it("shows the target volume and follows the ratio", async () => {
        await renderEditor();

        expect(screen.getByTestId("brew-target")).toHaveTextContent("288");

        await fireEvent.press(screen.getByLabelText("Increase Ratio"));

        expect(screen.getByTestId("brew-target")).toHaveTextContent("306");
    });

    it("offers write and save, and nothing else, at the bottom", async () => {
        await renderEditor();

        expect(screen.getByLabelText("Write card")).toBeTruthy();
        expect(screen.getByLabelText("Save")).toBeTruthy();
        expect(screen.queryByLabelText("Restore")).toBeNull();
    });

    it("stops writing a recipe the machine would reject, but still saves it", async () => {
        await renderEditor();

        // Raising the ratio moves the target away from what the stages pour.
        await fireEvent.press(screen.getByLabelText("Increase Ratio"));

        expect(screen.getByLabelText("Write card").props.accessibilityState.disabled).toBe(true);
        expect(screen.getByLabelText("Save").props.accessibilityState.disabled).toBe(false);
    });

    it("dims the write action by its fill, never by the group's opacity", async () => {
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Increase Ratio"));

        // An opacity on the tile multiplies with what is beneath it and takes
        // the word WRITE down with it. The tile swaps its fill instead.
        const style = StyleSheet.flatten(screen.getByLabelText("Write card").props.style);

        expect(style?.opacity ?? 1).toBe(1);
    });

    it("puts the rest behind the caret", async () => {
        await renderEditor();

        await fireEvent.press(screen.getByLabelText("More"));

        expect(screen.getByLabelText("Duplicate")).toBeTruthy();
        expect(screen.getByLabelText("Revert")).toBeTruthy();
    });
});
