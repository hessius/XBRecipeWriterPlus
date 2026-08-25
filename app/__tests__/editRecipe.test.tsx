import React from "react";
import {StyleSheet} from "react-native";
import {act, fireEvent, screen} from "@testing-library/react-native";

import EditRecipe, {PROFILE_HEIGHT, stageScrollTarget} from "@/app/editRecipe";
import {renderWithProviders} from "@/test-utils/render";

import Recipe, {CUP_TYPE} from "@/library/Recipe";

// The mocks mirror app/__tests__/index.test.tsx — read that file and reuse its
// shapes rather than inventing new ones. Note the comment there about reading a
// `let` from inside a hoisted `jest.mock` factory: Babel rejects any name that
// does not start with `mock`.
jest.mock("expo-router", () => ({
    useLocalSearchParams: () =>
        mockParams ?? {recipeJSON: mockRecipeJSON, saveEnabled: "false"},
    useNavigation:        () => ({setOptions: mockSetOptions, goBack: mockGoBack})
}));

jest.mock("@/library/RecipeDatabase");

// `useSetting` reaches for the shared SQLite-backed settings store, which
// cannot open under jest. Held in a `mock`-prefixed `let` — Babel rejects any
// other name read inside a hoisted factory — so a test can pick a setting the
// way `mockRecipeJSON` picks the recipe. (Not in the plan's sketch — added here
// because the real hook opens a database.)
jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => {
        // A real store, not a constant: the caret's hints switch writes through
        // this hook and the deck reads back through it, so a setter that threw
        // the value away would leave that wiring untested.
        const [, bump] = mockReact.useState(0);
        return [
            mockSettings[key],
            (value: unknown) => {
                mockSettings = {...mockSettings, [key]: value};
                bump((n: number) => n + 1);
            }
        ];
    }
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

/** Route params, when a test needs more than the recipe. */
let mockParams: Record<string, string> | null = null;

/** Whatever the editor reads out of the settings store. */
let mockSettings: Record<string, unknown> = {};

/**
 * `mock`-prefixed so the hoisted `useSetting` factory is allowed to read it.
 *
 * Only read when a component renders, which is long after this has been
 * assigned -- the factory itself runs at import time and touches nothing.
 */
const mockReact = React;

const mockSetOptions = jest.fn();
const mockGoBack = jest.fn();

/** 18 g at 1:16 over three pours of 96: 288 ml, in balance. */
function fixture(): Recipe {
    const r = new Recipe();
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 60;
    r.grindRPM = 90;
    r.addPour(0, false);
    r.addPour(0);
    r.addPour(0);
    r.autoFixPourVolumes();
    r.pours.forEach(p => { p.flowRate = 30; });
    return r;
}

let mockRecipeJSON = JSON.stringify(fixture());

beforeEach(() => {
    mockRecipeJSON = JSON.stringify(fixture());
    mockSettings = {};
    mockParams = null;
    mockGoBack.mockClear();
});

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
async function renderEditor(overrides: Partial<Recipe> = {}) {
    mockRecipeJSON = JSON.stringify(Object.assign(fixture(), overrides));
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

    it("shows the tea banner only for tea", async () => {
        await renderEditor();
        expect(screen.queryByTestId("tea-banner-body")).toBeNull();

        await renderEditor({cupType: CUP_TYPE.TEA});
        expect(screen.getByTestId("tea-banner-body")).toBeTruthy();
    });

    it("hides the cup and grinder rows on tea", async () => {
        await renderEditor({cupType: CUP_TYPE.TEA});

        // `TEA` is deliberately not one of the cup options, so the row could
        // only ever show nothing selected — and tapping an option would turn
        // the recipe into a coffee card. The grinder is inert on tea besides.
        expect(screen.queryByText("Cup")).toBeNull();
        expect(screen.queryByText("Grinder")).toBeNull();
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

    it("redraws a value only the deck can see change", async () => {
        await renderEditor();

        // Nothing else on the screen moves with grind size — no target, no
        // balance — so this is the value that would go stale if the deck ever
        // stopped being told the recipe had been edited.
        await fireEvent.press(screen.getByLabelText("Increase Grind size"));
        await fireEvent.press(screen.getByLabelText("Increase Grind size"));

        expect(screen.getByLabelText(/^Grind size, /).props.accessibilityLabel)
            .toBe("Grind size, 62");
    });

    it("puts the rest behind the caret", async () => {
        await renderEditor();

        await fireEvent.press(screen.getByLabelText("More"));

        expect(screen.getByLabelText("Duplicate")).toBeTruthy();
        expect(screen.getByLabelText("Revert")).toBeTruthy();
    });

    it("duplicates the recipe in hand, not its stored row", async () => {
        // A recipe read from a card or imported from a link has no row to
        // re-read, and an edited one has changes the row does not know about.
        // Cloning by uuid silently produced nothing in the first case and
        // dropped every unsaved edit in the second.
        const RecipeDatabase = jest.requireMock("@/library/RecipeDatabase").default;
        RecipeDatabase.mockClear();

        await renderEditor({xid: "CGL12"});
        await fireEvent.press(screen.getByLabelText("More"));
        await fireEvent.press(screen.getByLabelText("Duplicate"));

        const store = RecipeDatabase.mock.instances.at(-1)!;
        expect(store.cloneRecipe).not.toHaveBeenCalled();
        expect(store.duplicateRecipe).toHaveBeenCalledTimes(1);
        expect(store.duplicateRecipe.mock.calls[0][0].xid).toBe("CGL12");
    });

    it("keeps the long form off the deck entirely", async () => {
        // Two deliveries were built and both were withdrawn: a marker beside
        // every complicated label dotted the screen with unanswered questions,
        // and an EXPLAIN toggle that unfolded all of them at once doubled the
        // deck's height. Neither leaves a trace on the deck now.
        mockSettings = {showHints: true};
        await renderEditor();

        expect(screen.queryByLabelText("Explain")).toBeNull();
        expect(screen.queryByLabelText("What is Ratio?")).toBeNull();
        expect(screen.queryByText(/Half ratios cannot be stored/)).toBeNull();
        // The hint is what the deck does carry.
        expect(screen.getByText("Whole numbers only. Sets the target volume."))
            .toBeTruthy();
    });

    it("turns the deck's hints on from the caret, not only from settings", async () => {
        // The hints are a property of the screen being read, so the switch for
        // them belongs on that screen. Reaching settings meant leaving the
        // recipe, and the setting was invisible from where it applied.
        mockSettings = {showHints: false};
        await renderEditor();

        expect(screen.queryByText("Whole numbers only. Sets the target volume."))
            .toBeNull();

        await fireEvent.press(screen.getByLabelText("More"));
        await fireEvent.press(screen.getByLabelText("Show hints"));
        // Dismissed first, because the sheet is modal while it is up: the deck
        // behind it is deliberately out of a screen reader's reach until then.
        await fireEvent.press(screen.getByLabelText("Close"));

        expect(screen.getByText("Whole numbers only. Sets the target volume."))
            .toBeTruthy();
    });

    it("answers the long-form questions from the Help sheet in the header", async () => {
        await renderEditor();

        await fireEvent.press(screen.getByLabelText("Help"));

        expect(screen.getByText("What does the ratio set?")).toBeTruthy();
        expect(screen.getByText(/Half ratios cannot be stored/)).toBeTruthy();
        expect(screen.getByText("Can I turn the grinder off?")).toBeTruthy();
    });

    it("blocks write and save while the recipe ID is malformed, and says why", async () => {
        await renderEditor();

        // Validated live, on change — not on blur — so the gate closes before
        // the field commits. `!!bad` is neither empty nor the vendor-code shape.
        await fireEvent.changeText(screen.getByLabelText("Recipe ID"), "!!bad");

        expect(screen.getByLabelText("Write card").props.accessibilityState.disabled).toBe(true);
        expect(screen.getByLabelText("Save").props.accessibilityState.disabled).toBe(true);
        // A distinctive fragment: the `xid` help detail also names the digits,
        // so the reason is worded to not collide with it under `getByText`.
        expect(screen.getByText(/Not a valid ID/i)).toBeTruthy();
    });

    it("clears the block once the recipe ID is valid again", async () => {
        await renderEditor();
        await fireEvent.changeText(screen.getByLabelText("Recipe ID"), "!!bad");

        await fireEvent.changeText(screen.getByLabelText("Recipe ID"), "CGL12");

        expect(screen.getByLabelText("Write card").props.accessibilityState.disabled).toBe(false);
        expect(screen.getByLabelText("Save").props.accessibilityState.disabled).toBe(false);
        expect(screen.queryByText(/Not a valid ID/i)).toBeNull();
    });

    it("treats an empty recipe ID as valid", async () => {
        await renderEditor();
        await fireEvent.changeText(screen.getByLabelText("Recipe ID"), "!!bad");

        await fireEvent.changeText(screen.getByLabelText("Recipe ID"), "");

        expect(screen.getByLabelText("Save").props.accessibilityState.disabled).toBe(false);
        expect(screen.queryByText(/Not a valid ID/i)).toBeNull();
    });
});

describe("the stages deck", () => {
    it("switches decks without leaving the screen", async () => {
        await renderEditor();

        await fireEvent.press(screen.getByLabelText("Stages, 3"));

        expect(screen.getByTestId("stage-profile")).toBeTruthy();
        // `FieldRow` uppercases with `textTransform`, which is a style — the
        // text content stays as `RECIPE_HELP` holds it.
        expect(screen.queryByText("Grind size")).toBeNull();
    });

    it("pins the profile to the top, at the index the ScrollView sticks", async () => {
        // `stickyHeaderIndices` addresses a *slot*, not an element, so this is
        // the assertion that catches a child being added, removed or made
        // conditional above the profile — after which the number would pin the
        // wrong thing, silently and only on a real scroll.
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));

        const scroll = screen.getByTestId("editor-scroll");
        expect(scroll.props.stickyHeaderIndices).toEqual([2]);

        // A ScrollView wraps its children in a content container, so the slots
        // the index counts are one level in from the host node.
        const container = React.Children.toArray(scroll.props.children)[0];
        const slots = React.Children.toArray(
            (container as React.ReactElement<{children: React.ReactNode}>).props.children
        ) as React.ReactElement<{pours?: unknown[]}>[];

        // Slot 2 is the profile card and not the empty placeholder that stands
        // in for it on the brew deck: only the card is handed the pours.
        expect(slots).toHaveLength(4);
        expect(slots[2].props.pours).toHaveLength(3);
    });

    it("leaves room for exactly as much action bar as there is", async () => {
        // The bottom padding used to be a fixed 120, chosen by eye while the
        // whole app was being inset a second time. The bar's real height varies
        // with the OS text size and the home indicator, so it is measured.
        await renderEditor();

        await fireEvent(
            screen.getByTestId("editor-actions"),
            "layout",
            {nativeEvent: {layout: {height: 200, width: 390, x: 0, y: 0}}}
        );

        expect(
            screen.getByTestId("editor-scroll").props.contentContainerStyle.paddingBottom
        ).toBeGreaterThanOrEqual(200);
    });

    it("opens the stage whose part of the curve was tapped", async () => {
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));

        // Nothing is open to begin with, so the tile offers no controls.
        expect(screen.queryByLabelText("Temperature")).toBeNull();

        await fireEvent.press(screen.getByLabelText("Show stage 2 of 3"));

        expect(screen.getByLabelText("Stage 2 of 3").props.accessibilityState)
            .toMatchObject({expanded: true});
    });

    it("gives the curve's height back to the stages once the header collapses", async () => {
        // Hero, profile and action bar are all pinned, which left a phone
        // screen with very little of itself to edit in.
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));

        expect(screen.getByTestId("stage-profile").props.height)
            .toBeGreaterThan(PROFILE_HEIGHT.full);

        await fireEvent.scroll(screen.getByTestId("editor-scroll"), {
            nativeEvent: {
                contentOffset:     {y: 400, x: 0},
                contentSize:       {height: 2000, width: 390},
                layoutMeasurement: {height: 800, width: 390}
            }
        });

        expect(screen.getByTestId("stage-profile").props.height)
            .toBeLessThan(PROFILE_HEIGHT.full);
    });

    it("sticks nothing on the brew deck", async () => {
        await renderEditor();

        expect(screen.getByTestId("editor-scroll").props.stickyHeaderIndices)
            .toBeUndefined();
    });

    it("counts the stages on the switch", async () => {
        await renderEditor();

        // `DeckSwitch` draws the count into its chrome: `STAGES · ${stageCount}`.
        // `toHaveTextContent` defaults to an exact, whitespace-normalised match,
        // so the assertion is the full label rather than the bare digit.
        expect(screen.getByLabelText("Stages, 3")).toHaveTextContent("STAGES · 3");
    });

    it("opens one stage at a time", async () => {
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));

        await fireEvent.press(screen.getByLabelText("Stage 1 of 3"));
        expect(screen.getByLabelText("Stage 1 of 3").props.accessibilityState.expanded)
            .toBe(true);

        await fireEvent.press(screen.getByLabelText("Stage 2 of 3"));
        expect(screen.getByLabelText("Stage 1 of 3").props.accessibilityState.expanded)
            .toBe(false);
    });

    it("explains a mismatch and offers to fix it", async () => {
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));
        await fireEvent.press(screen.getByLabelText("Stage 1 of 3"));

        await fireEvent.press(screen.getByLabelText("Decrease Stage volume"));

        expect(screen.getByTestId("stage-mismatch")).toBeTruthy();
        expect(screen.getByLabelText("Auto fix")).toBeTruthy();
        expect(screen.getByLabelText("Write card").props.accessibilityState.disabled)
            .toBe(true);
        expect(screen.getByLabelText("Save").props.accessibilityState.disabled)
            .toBe(false);
    });

    it("clears the mismatch when auto fix is taken", async () => {
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));
        await fireEvent.press(screen.getByLabelText("Stage 1 of 3"));
        await fireEvent.press(screen.getByLabelText("Decrease Stage volume"));

        await fireEvent.press(screen.getByLabelText("Auto fix"));

        expect(screen.queryByTestId("stage-mismatch")).toBeNull();
        expect(screen.getByLabelText("Write card").props.accessibilityState.disabled)
            .toBe(false);
    });

    it("keeps stepping a stage volume while the button is held", async () => {
        // A remounted Stepper loses the chained timer behind hold-to-repeat, so
        // this fails the moment the deck is redrawn by remounting it rather
        // than re-rendering it — which is exactly what a React `key` on the
        // deck does. Stage volume runs to 240 ml; tapping there is not an
        // option.
        jest.useFakeTimers();
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));
        await fireEvent.press(screen.getByLabelText("Stage 1 of 3"));

        await fireEvent(screen.getByLabelText("Decrease Stage volume"), "longPress");
        await act(async () => {
            jest.advanceTimersByTime(200);
        });
        const afterFirstTick = screen.getByLabelText(/^Stage volume, /).props.accessibilityLabel;

        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        expect(screen.getByLabelText(/^Stage volume, /).props.accessibilityLabel)
            .not.toBe(afterFirstTick);
        jest.useRealTimers();
    });

    it("adds a stage", async () => {
        await renderEditor();
        await fireEvent.press(screen.getByLabelText("Stages, 3"));

        await fireEvent.press(screen.getByLabelText("Add stage"));

        expect(screen.getByLabelText("Stage 4 of 4")).toBeTruthy();
        expect(screen.getByLabelText("Stages, 4")).toBeTruthy();
    });
});

describe("stageScrollTarget", () => {
    it("puts the stage just under the pinned profile", () => {
        // The profile is pinned over the top of the content, so a stage
        // scrolled to its own offset would arrive underneath it.
        expect(stageScrollTarget(200, 400, 120)).toBe(480);
    });

    it("refuses to scroll past the top", () => {
        // The first stage is already above the fold, and a negative offset
        // makes the list bounce rather than stay put.
        expect(stageScrollTarget(200, 0, 400)).toBe(0);
    });
});




describe("flushing an unblurred field before an action", () => {
    // A `Pressable` does not blur a focused `TextInput`, so `onEndEditing`
    // never fires -- and navigating away unmounts the field before it could.
    // Every action drains what a text row is still holding before it reads the
    // recipe.
    const RecipeDatabase = jest.requireMock("@/library/RecipeDatabase").default;

    it("saves the name being typed when SAVE is tapped without blurring first", async () => {
        RecipeDatabase.mockClear();
        await renderEditor();

        await fireEvent.changeText(screen.getByLabelText("Name"), "New name");
        await fireEvent.press(screen.getByLabelText("Save"));

        const store = RecipeDatabase.mock.instances.at(-1)!;
        expect(store.updateRecipe.mock.calls[0][1].name).toBe("New name");
    });

    it("keeps the name being typed when Back is tapped, which unmounts the field", async () => {
        // The most dangerous of the four: navigation tears the input down, so
        // `onEndEditing` can never rescue the value. `goBack` is mocked, so the
        // screen stays mounted and the flushed name surfaces on the hero.
        await renderEditor();

        await fireEvent.changeText(screen.getByLabelText("Name"), "New name");
        await fireEvent.press(screen.getByLabelText("Back"));

        expect(mockGoBack).toHaveBeenCalled();
        expect(screen.getByText("New name")).toBeTruthy();
    });

    it("drops a committed field's draft, so a later flush cannot re-apply it", async () => {
        // A normal commit clears that field's draft. It is the committed value
        // a later flush must honour, never an earlier keystroke's draft -- so
        // the two are made to differ to prove the draft was dropped.
        RecipeDatabase.mockClear();
        await renderEditor();

        const name = screen.getByLabelText("Name");
        await fireEvent.changeText(name, "Draft");
        await fireEvent(name, "endEditing", {nativeEvent: {text: "Committed"}});
        await fireEvent.press(screen.getByLabelText("Save"));

        const store = RecipeDatabase.mock.instances.at(-1)!;
        expect(store.updateRecipe.mock.calls[0][1].name).toBe("Committed");
    });

    it("drops an unblurred draft when a revert replaces the recipe", async () => {
        // The revert swaps the whole `Recipe` out from under the rows. A draft
        // typed against the old one used to evaporate when its row remounted;
        // held in a ref, it outlived the recipe and the next save wrote it back
        // over the restored values. The restore keeps the name, so the saved
        // name must be the original one, never the keystroke the revert answered.
        //
        // Fake timers because the sheet gates its open state on a
        // `requestAnimationFrame`, and this test opens two of them in turn: the
        // overflow menu, then the revert sheet reached through it.
        jest.useFakeTimers();
        RecipeDatabase.mockClear();
        const backing = fixture();
        backing.xid = "CGL12";
        await renderEditor({name: "Original", offline_backup: backing.getData()});

        await fireEvent.changeText(screen.getByLabelText("Name"), "Stale");
        await fireEvent.press(screen.getByLabelText("More"));
        await act(async () => { jest.advanceTimersByTime(500); });
        await fireEvent.press(screen.getByLabelText("Revert"));
        await act(async () => { jest.advanceTimersByTime(500); });
        await fireEvent.press(screen.getByLabelText("THE SAVED COPY"));
        await act(async () => { jest.advanceTimersByTime(500); });
        await fireEvent.press(screen.getByLabelText("Save"));
        await act(async () => { jest.advanceTimersByTime(500); });

        const store = RecipeDatabase.mock.instances.at(-1)!;
        expect(store.updateRecipe.mock.calls.at(-1)![1].name).toBe("Original");
        jest.useRealTimers();
    });
});
