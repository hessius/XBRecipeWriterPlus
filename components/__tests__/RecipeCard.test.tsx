import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";

import RecipeCard from "@/components/RecipeCard";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour from "@/library/Pour";
import {accents, onAccent} from "@/constants/colors";
import type {RecipeWithAccent} from "@/library/accent";
import {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import {renderWithProviders} from "@/test-utils/render";

/** The face a node is set in. Tamagui flattens its style; RN keeps the array. */
function fontFamilyOf(text: string): string {
    const style = screen.getByText(text).props.style;
    const list = (Array.isArray(style) ? style : [style]) as
        {fontFamily?: string}[];
    return String(list.reduce<string | undefined>(
        (found, s) => s?.fontFamily ?? found, undefined
    ));
}

/** The outline path of the pour profile, which react-native-svg renders deep. */
function profilePath(): string {
    const svg = screen.getByTestId("recipe-card-profile");
    const paths: string[] = [];
    const walk = (node: {type?: unknown; props?: {d?: string}; children?: unknown[]}) => {
        if (typeof node.props?.d === "string") {
            paths.push(node.props.d);
        }
        for (const child of node.children ?? []) {
            if (typeof child !== "string") {
                walk(child as Parameters<typeof walk>[0]);
            }
        }
    };
    walk(svg as unknown as Parameters<typeof walk>[0]);
    return paths.join("|");
}

const TOUCH = {
    nativeEvent: {
        touches:        [],
        changedTouches: [],
        locationX:      1,
        locationY:      1,
        pageX:          1,
        pageY:          1,
        timestamp:      0
    }
};

/**
 * A real touch.
 *
 * Deliberately not `fireEvent.press`: Tamagui drives presses through the
 * responder system rather than an `onPress` prop on the host view, so
 * `fireEvent.press` finds no handler there and walks up the React tree until it
 * reaches a component's own `onPress` prop — the mock the test just passed in.
 * That passes whether or not anything is wired up.
 */
async function press(element: Parameters<typeof fireEvent>[0]) {
    await fireEvent(element, "responderGrant", TOUCH);
    await fireEvent(element, "responderRelease", TOUCH);
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
    const recipe = new Recipe();
    recipe.title = "Ethiopia Guji";
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grindSize = 25;
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.pours = [new Pour(0, 288)];

    return Object.assign(recipe, overrides);
}

describe("RecipeCard", () => {
    it("renders the recipe name", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("shows the dose and ratio", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        // `DigitRoll` folds its suffix into the accessible label, so the dose
        // announces as "18g" rather than a bare number.
        expect(screen.getByLabelText("18g")).toBeTruthy();
        expect(screen.getByLabelText("16")).toBeTruthy();
    });

    it("marks a coffee recipe as COFFEE", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByText("COFFEE")).toBeTruthy();
    });

    it("marks a tea recipe as TEA", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()}/>
        );
        expect(screen.getByText("TEA")).toBeTruthy();
    });

    it("hides the coffee marker when asked", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()} showCoffeeMarker={false}/>
        );
        expect(screen.queryByText("COFFEE")).toBeNull();
    });

    it("still shows the tea marker when the coffee marker is hidden", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()} showCoffeeMarker={false}/>
        );
        expect(screen.getByText("TEA")).toBeTruthy();
    });

    it("draws a coffee recipe from the coffee half of the palette", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        const card = screen.getByTestId("recipe-card");
        expect(accents.coffee).toContain(card.props.style.backgroundColor);
    });

    it("honours a saved accent rather than picking its own", async () => {
        // The accent is assigned once, on save, and persisted. A card that
        // recomputed it would repaint the library whenever anything changed.
        const recipe = makeRecipe();
        (recipe as RecipeWithAccent).accentIndex = 5;
        await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()}/>);
        expect(screen.getByTestId("recipe-card").props.style.backgroundColor)
            .toBe(accents.coffee[5]);
    });

    it("draws a tea recipe from the tea half of the palette", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()}/>
        );
        const card = screen.getByTestId("recipe-card");
        expect(accents.tea).toContain(card.props.style.backgroundColor);
    });

    it("keeps its text dark enough to read on a pastel", async () => {
        // Every accent is a light pastel, so the one thing that must never
        // happen is white text.
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByText("Ethiopia Guji").props.style)
            .toEqual(expect.objectContaining({color: onAccent.text}));
        // The dose is a DigitRoll, so its colour lives on the digit glyphs —
        // which are hidden from accessibility, and so from the default queries.
        const digit = within(screen.getByLabelText("18g"))
            .getAllByText("8", {includeHiddenElements: true})[0];
        expect((digit.props.style as {color?: string}[])
            .some((s) => s?.color === onAccent.text)).toBe(true);
    });

    it("draws the pour profile from this recipe's pours", async () => {
        // The silhouette is how a recipe is recognised before it is read, so a
        // profile that ignores the pours is worse than none.
        const one = makeRecipe();
        const many = makeRecipe();
        many.pours = [new Pour(0, 60), new Pour(1, 120), new Pour(2, 108)];

        const {rerender} = await renderWithProviders(
            <RecipeCard recipe={one} onPress={jest.fn()}/>
        );
        const single = profilePath();
        expect(single).toBeTruthy();

        await rerender(<RecipeCard recipe={many} onPress={jest.fn()}/>);
        expect(profilePath()).not.toBe(single);
    });

    it("keeps the profile behind the content, out of the way of touches", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        // Absolutely positioned and transparent to touch, or it would swallow
        // presses meant for the card and the row actions.
        const layer = screen.getByTestId("recipe-card-profile").parent!;
        expect(layer.props.pointerEvents).toBe("none");
        expect(layer.props.style).toEqual(
            expect.objectContaining({position: "absolute"})
        );
    });

    it("shows the grind for coffee and hides it for tea", async () => {
        // A tea card always writes the default grind, so showing a grind number
        // beside it would be a number the machine ignores.
        const {rerender} = await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByText("GRIND")).toBeTruthy();
        expect(screen.getByLabelText("25")).toBeTruthy();

        await rerender(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()}/>
        );
        expect(screen.queryByText("GRIND")).toBeNull();
    });

    it("is a card of at least a card's height, clipped to its corners", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        const style = screen.getByTestId("recipe-card").props.style as
            Record<string, number | string>;
        // The profile is drawn oversized and flush to the corner; without the
        // clip it spills out of the card.
        expect(style.overflow).toBe("hidden");
        expect(style.borderTopLeftRadius).toBeGreaterThan(0);
        expect(style.paddingTop).toBeGreaterThan(0);
        expect(style.justifyContent).toBe("space-between");

        // A minimum, not a fixed height. Combined with the clip above, a fixed
        // height crops the stats away as soon as the OS text size grows.
        expect(style.minHeight).toBeGreaterThan(0);
        expect(style.height).toBeUndefined();
    });

    it("bounds the name's growth the way the dot matrix is bounded", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        // Unbounded, the prose outgrows the data it sits above.
        expect(screen.getByText("Ethiopia Guji").props.maxFontSizeMultiplier)
            .toBe(DOTO_MAX_FONT_SCALE);
    });

    it("labels each number with the stat it belongs to", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        // Swapping two labels leaves every value still present and correct, so
        // the pairing has to be asserted, not just the numbers.
        for (const [label, value] of [["DOSE", "18g"], ["RATIO", "16"],
                                      ["GRIND", "25"]] as const) {
            const stat = screen.getByText(label).parent!;
            expect(within(stat).getByLabelText(value)).toBeTruthy();
        }
    });

    it("sets the stat labels and the marker in dot matrix", async () => {
        // Prose is Inter, machine values are Doto. Labels on a machine's
        // readout are Doto too; the recipe name is the only prose here.
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        for (const text of ["DOSE", "RATIO", "GRIND", "COFFEE"]) {
            expect(fontFamilyOf(text)).toMatch(/^Doto-/);
        }
        expect(fontFamilyOf("Ethiopia Guji")).not.toMatch(/^Doto-/);
        // ...and set as a name, not as body copy: it is the first thing read.
        expect(screen.getByText("Ethiopia Guji").props.style)
            .toEqual(expect.objectContaining({fontSize: 17, fontWeight: "700"}));
    });

    it("keeps the profile a faint watermark, behind and out of the way", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        const layer = screen.getByTestId("recipe-card-profile").parent!;
        const style = layer.props.style as Record<string, number>;
        // Drawn at full strength, or over the title, it stops being a
        // background and starts competing with the text.
        expect(style.opacity).toBeLessThan(1);
        expect(style.right).toBe(0);
        expect(style.bottom).toBe(0);

        const svg = screen.getByTestId("recipe-card-profile");
        expect(svg.props.width).toBeGreaterThan(100);
        expect(svg.props.height).toBeGreaterThan(24);
    });

    it("caps a long name at two lines instead of shoving the marker aside", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({title: "A ".repeat(40) + "Name"})}
                        onPress={jest.fn()}/>
        );
        const title = screen.getByText(/Name$/);
        expect(title.props.numberOfLines).toBe(2);
        // Without flex the name takes its full measured width and pushes the
        // marker off the card.
        expect(title.props.style).toEqual(expect.objectContaining({flex: 1}));
        expect(screen.getByText("COFFEE")).toBeTruthy();
    });

    it("shows an unset ratio and grind as unset, not as zero", async () => {
        // Recipe seeds both to -1, and DigitRoll clamps at zero -- so passing a
        // sentinel through would claim a ratio of 1:0.
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({ratio: -1, grindSize: -1})}
                        onPress={jest.fn()}/>
        );
        expect(screen.queryByLabelText("0")).toBeNull();
        expect(screen.getAllByText("—")).toHaveLength(2);
    });

    it("announces everything the grouping hides", async () => {
        // `accessible` collapses the subtree into one element on iOS, so the
        // marker and the stats are only ever heard if they are in this label.
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        const label = screen.getByTestId("recipe-card").props
            .accessibilityLabel as string;
        expect(label).toContain("Ethiopia Guji");
        expect(label).toContain("coffee");
        expect(label).toContain("18");
        expect(label).toContain("16");
        expect(label).toContain("25");
    });

    it("says tea out loud rather than leaving it to the colour", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()}/>
        );
        expect(screen.getByTestId("recipe-card").props.accessibilityLabel)
            .toContain("tea");
    });

    it("gives an untitled recipe a name to be announced by", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({title: ""})} onPress={jest.fn()}/>
        );
        expect(screen.getByTestId("recipe-card").props.accessibilityLabel)
            .toContain("Untitled");
    });

    it("is a single accessibility element, and says what it is", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        const card = screen.getByTestId("recipe-card");
        expect(card.props.accessible).toBe(true);
        expect(card.props.accessibilityRole).toBe("button");
    });

    it("offers the row actions to a screen reader, which cannot swipe", async () => {
        // The buttons are nested inside the accessible group, so VoiceOver
        // cannot reach them; and the swipe gesture they mirror is not available
        // either. Without these, deleting is a sighted-only feature.
        const onDelete = jest.fn();
        const onDuplicate = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={onDuplicate} onDelete={onDelete}/>
        );
        const card = screen.getByTestId("recipe-card");
        expect(card.props.accessibilityActions).toEqual([
            {name: "duplicate", label: "Duplicate recipe"},
            {name: "delete", label: "Delete recipe"}
        ]);

        await fireEvent(card, "accessibilityAction",
                        {nativeEvent: {actionName: "delete"}});
        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(onDuplicate).not.toHaveBeenCalled();
    });

    it("offers no action it cannot perform", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByTestId("recipe-card").props.accessibilityActions)
            .toEqual([]);
    });

    it("calls onPress when tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={onPress}/>
        );

        await press(screen.getByTestId("recipe-card"));

        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("hides the row actions by default", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={jest.fn()} onDelete={jest.fn()}/>
        );
        expect(screen.queryByRole("button", {name: "Delete recipe"})).toBeNull();
    });

    it("reveals the row actions in edit mode", async () => {
        const onPress = jest.fn();
        const onDelete = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={onPress}
                        onDuplicate={jest.fn()} onDelete={onDelete} editing/>
        );

        await press(screen.getByRole("button", {name: "Delete recipe"}));

        expect(onDelete).toHaveBeenCalledTimes(1);
        // A delete that also opens the recipe it just deleted is a bug.
        expect(onPress).not.toHaveBeenCalled();
    });

    it("gives the row actions targets big enough to hit, and apart", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={jest.fn()} onDelete={jest.fn()} editing/>
        );
        const duplicate = screen.getByRole("button", {name: "Duplicate recipe"});
        const style = duplicate.props.style as Record<string, number>;
        // Padded rather than hit-slopped: slop on adjacent icons overlaps into
        // the gap, and the later sibling wins -- so a tap at the edge of
        // duplicate would delete the recipe.
        expect(duplicate.props.hitSlop).toBeUndefined();
        expect(style.paddingTop * 2 + 18).toBeGreaterThanOrEqual(44);
        expect(style.paddingLeft * 2 + 18).toBeGreaterThanOrEqual(44);
    });

    it("duplicates from the row actions too", async () => {
        const onDuplicate = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={onDuplicate} onDelete={jest.fn()} editing/>
        );

        await press(screen.getByRole("button", {name: "Duplicate recipe"}));

        expect(onDuplicate).toHaveBeenCalledTimes(1);
    });
});
