import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";

import RecipeCard from "@/components/RecipeCard";
import {SHORTCUT_INSET} from "@/components/BrewShortcut";
import {PROFILE_BLEED} from "@/components/PourProfile";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import {accents, onAccent, palette} from "@/constants/colors";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {AA_LARGE, contrast} from "@/test-utils/contrast";
import {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import {renderWithProviders} from "@/test-utils/render";

/** The colour a dot icon's dots are drawn in. */
function dotColourOf(testID: string): string {
    const dot = within(screen.getByTestId(testID, {includeHiddenElements: true}))
        .getAllByTestId("dot-icon-dot", {includeHiddenElements: true})[0];
    const list = (Array.isArray(dot.props.style) ? dot.props.style : [dot.props.style]) as
        {backgroundColor?: string}[];
    return String(list.reduce<string | undefined>(
        (found, entry) => entry?.backgroundColor ?? found, undefined
    ));
}

/** The face a node is set in. Tamagui flattens its style; RN keeps the array. */
function fontFamilyOf(text: string): string {
    const style = screen.getByText(text).props.style;
    const list = (Array.isArray(style) ? style : [style]) as
        {fontFamily?: string}[];
    return String(list.reduce<string | undefined>(
        (found, s) => s?.fontFamily ?? found, undefined
    ));
}

/** The last value set for a style property, which is the one that wins. */
function styleValueOf(node: ReturnType<typeof screen.getByText>, key: string): unknown {
    const style = node.props.style;
    const list = (Array.isArray(style) ? style : [style]) as
        Record<string, unknown>[];
    return list.reduce<unknown>((found, s) => s?.[key] ?? found, undefined);
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
    recipe.name = "Ethiopia Guji";
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grindSize = 25;
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.pours = [new Pour(0, 288)];

    return Object.assign(recipe, overrides);
}

/**
 * A recipe that passes every field check in cardWriteProblems.
 *
 * Used by tests that need a balanced AND writable recipe to verify the
 * absence of the "Will not write" marker.
 */
function makeWritableRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 15;
    recipe.ratio = 15;
    recipe.grindSize = 60;
    recipe.grindRPM = 90;
    recipe.pours = [new Pour(0, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return recipe;
}

describe("RecipeCard", () => {
    it("renders the recipe name", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    describe("the BREW shortcut", () => {
        it.each(["edge", "tab", "chip"] as const)("draws a %s", async (variant) => {
            await renderWithProviders(
                <RecipeCard recipe={makeRecipe()} onPress={() => undefined}
                            brewShortcut={variant} onBrew={() => undefined}/>
            );
            expect(screen.getByTestId("brew-shortcut")).toBeTruthy();
        });

        it("draws nothing for swipe, which is the tray's job", async () => {
            await renderWithProviders(
                <RecipeCard recipe={makeRecipe()} onPress={() => undefined}
                            brewShortcut="swipe" onBrew={() => undefined}/>
            );
            expect(screen.queryByTestId("brew-shortcut")).toBeNull();
        });

        it("draws nothing when there is no shortcut at all", async () => {
            await renderWithProviders(
                <RecipeCard recipe={makeRecipe()} onPress={() => undefined}/>
            );
            expect(screen.queryByTestId("brew-shortcut")).toBeNull();
        });

        it("stands aside while the card is editing", async () => {
            await renderWithProviders(
                <RecipeCard recipe={makeRecipe()} onPress={() => undefined} editing
                            brewShortcut="chip" onBrew={() => undefined}
                            onDuplicate={() => undefined} onDelete={() => undefined}/>
            );
            // Duplicate and delete sit in the card's bottom right, which is
            // exactly where the chip lands, and editing is the one mode where
            // brewing is plainly not what the user came to do.
            expect(screen.queryByTestId("brew-shortcut")).toBeNull();
            // The action's glyph is hidden from the accessibility tree on purpose,
            // so this needs includeHiddenElements the way the file's other
            // assertions on these two controls do.
            expect(screen.getByTestId("recipe-card-delete",
                                      {includeHiddenElements: true})).toBeTruthy();
        });

        it("keeps the marker clear of the band", async () => {
            await renderWithProviders(
                <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                            onPress={() => undefined}
                            brewShortcut="tab" onBrew={() => undefined}/>
            );
            // The shipped capsule sat on top of the TEA marker. The card reserves
            // the trailing edge rather than hoping the shape misses it.
            expect(screen.getByTestId("recipe-card-title-row").props.style)
                .toEqual(expect.objectContaining({paddingRight: SHORTCUT_INSET.tab}));
        });
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
        recipe.accentIndex = 5;
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

    it("fills the profile flat by default and with dots when asked", async () => {
        const flat = await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(flat.queryByTestId("profile-dot")).toBeNull();

        const dotted = await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()} dottedProfile/>
        );
        expect(dotted.getAllByTestId("profile-dot").length).toBeGreaterThan(0);
    });

    it("runs the profile out to the card's own edges", async () => {
        // The mark is a background, so a gap along the bottom and right reads as
        // misalignment. It is offset by the stroke's bleed and the card clips,
        // which puts the baseline and the closing plateau on the edges exactly.
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        const layer = screen.getByTestId("recipe-card-profile").parent!;
        // Past them, in fact: the stroke's own bleed plus a little overhang, so
        // the mark reads as something the card was cut from rather than as a
        // shape sitting on it. Both edges by the same amount -- the asymmetry
        // was the thing that showed.
        const style = layer.props.style as {right: number; bottom: number};
        expect(style.right).toBeLessThan(-PROFILE_BLEED);
        expect(style.right).toBe(style.bottom);
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

    it("carries no contactless mark", async () => {
        // It used to sit beside the beverage marker, unconditionally, on every
        // card. Every recipe in this app writes to a card, so a mark that says
        // so on all of them distinguishes nothing -- it is a decoration in the
        // one corner a real per-recipe indicator would want.
        //
        // Queried with hidden elements included: the mark was hidden from the
        // accessibility tree, so a default query would report it absent while
        // it was still on screen.
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.queryByTestId("recipe-card-contactless",
                                    {includeHiddenElements: true})).toBeNull();
    });

    it("keeps the profile a faint watermark without dimming it below AA", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        const layer = screen.getByTestId("recipe-card-profile").parent!;
        const style = layer.props.style as Record<string, number>;

        // The faintness belongs in the token, not in a group opacity here. A
        // wrapper opacity multiplies an already-composited stroke, so the ratio
        // the colour suite validates stops being the ratio that renders: at 0.5
        // the stroke measured 2.72:1 on Blossom against a 3:1 requirement.
        expect(style.opacity ?? 1).toBe(1);

        for (const accent of [...accents.coffee, ...accents.tea]) {
            expect(contrast(onAccent.profileStroke, accent))
                .toBeGreaterThanOrEqual(AA_LARGE);
        }

        const svg = screen.getByTestId("recipe-card-profile");
        expect(svg.props.width).toBeGreaterThan(100);
        expect(svg.props.height).toBeGreaterThan(24);
    });

    it("caps a long name at two lines instead of shoving the marker aside", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({name: "A ".repeat(40) + "Name"})}
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
        expect(screen.getAllByText("–")).toHaveLength(2);
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
            <RecipeCard recipe={makeRecipe({name: ""})} onPress={jest.fn()}/>
        );
        expect(screen.getByTestId("recipe-card").props.accessibilityLabel)
            .toContain("Untitled");
    });

    it("shows the placeholder for a recipe with no name from any source", async () => {
        const recipe = makeRecipe();
        recipe.name = "";
        recipe.xbloomName = "";
        recipe.xid = "";
        recipe.source = "read";
        await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()}/>);

        expect(screen.getByText(recipe.displayName())).toBeTruthy();
    });

    it("mutes a placeholder so it does not read as a chosen name", async () => {
        const recipe = makeRecipe();
        recipe.name = "";
        recipe.xbloomName = "";
        recipe.xid = "";
        recipe.source = "read";
        await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()}/>);

        const placeholder = screen.getByText(recipe.displayName());
        const named = onAccent.text;
        expect(styleValueOf(placeholder, "color")).not.toBe(named);
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

    it("draws the row actions as dot glyphs rather than vector icons", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={jest.fn()} onDelete={jest.fn()} editing/>
        );

        // A dot icon is exactly as many nodes as its bitmap has lit cells, so
        // this fails both if the glyph reverts to a vector icon and if the two
        // are wired to the wrong bitmaps.
        // The glyphs are hidden from the accessibility tree on purpose -- the
        // pressable around each one is the single element a screen reader sees.
        const dots = (testID: string) =>
            within(screen.getByTestId(testID, {includeHiddenElements: true}))
                .getAllByTestId("dot-icon-dot", {includeHiddenElements: true});

        expect(dots("recipe-card-duplicate"))
            .toHaveLength(litCells(DOT_ICONS.duplicate).length);
        expect(dots("recipe-card-delete"))
            .toHaveLength(litCells(DOT_ICONS.delete).length);
    });

    it("inks duplicate and delete in their own tones", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={jest.fn()} onDelete={jest.fn()} editing/>
        );

        expect(dotColourOf("recipe-card-duplicate")).toBe(palette.success);
        expect(dotColourOf("recipe-card-delete")).toBe(palette.danger);
    });

    it("sits each glyph in a key cut from the card", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={jest.fn()} onDelete={jest.fn()} editing/>
        );

        // Without the key the glyph is drawn straight onto the accent, which is
        // what left it short of contrast and reading as decoration rather than
        // as something pressable.
        const style = screen.getByRole("button", {name: "Delete recipe"})
            .props.style as {backgroundColor?: string};
        expect(style.backgroundColor).toBe(onAccent.key);
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

    it("leaves a balanced one unmarked", async () => {
        await renderWithProviders(<RecipeCard recipe={makeWritableRecipe()} onPress={jest.fn()}/>);

        expect(screen.queryByLabelText("Will not write")).toBeNull();
    });

    it("marks a recipe the machine would reject due to volume imbalance", async () => {
        // Build from the writable fixture: imbalance is the only difference
        // between this and the "leaves a balanced one unmarked" test above.
        // dosage=15, ratio=15 → target=225 ml; setting volume to 10 breaks the balance.
        const recipe = makeWritableRecipe();
        recipe.pours[0].volume = 10;

        await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()}/>);

        expect(screen.getByLabelText("Will not write")).toBeTruthy();
    });

    it("marks a balanced recipe whose fields are out of range as unwritable", async () => {
        // The card used to ask only whether the volumes summed, so this recipe --
        // balanced, and holding a stage volume no byte can carry -- was shown as
        // writable while writing it would emit nonsense.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.dosage = 31;
        recipe.ratio = 100;
        recipe.pours = [new Pour(1, 3100, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];

        await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()} showCoffeeMarker/>);

        expect(await screen.findByLabelText("Will not write")).toBeTruthy();
    });

    it("carries the BREW capsule when a machine is remembered", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        brewShortcut="edge" onBrew={jest.fn()} />
        );
        expect(screen.getByLabelText("Brew this recipe")).toBeTruthy();
    });

    it("carries none when there is no machine to brew on", async () => {
        // A dead button on every card is worse than no button.
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()} />
        );
        expect(screen.queryByLabelText("Brew this recipe")).toBeNull();
    });

    it("offers the brew action to a screen reader when the capsule is shown", async () => {
        // The card collapses its subtree into one accessibility element, so
        // the capsule's own button is unreachable. A `brew` accessibilityAction
        // mirrors the swipe path that the capsule provides visually.
        const onBrew = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        brewShortcut="edge" onBrew={onBrew}/>
        );
        const card = screen.getByTestId("recipe-card");
        expect(card.props.accessibilityActions).toEqual(
            expect.arrayContaining([{name: "brew", label: "Brew this recipe"}])
        );

        await fireEvent(card, "accessibilityAction",
                        {nativeEvent: {actionName: "brew"}});
        expect(onBrew).toHaveBeenCalledTimes(1);
    });

    it("still offers the brew action when the tray draws the shortcut", async () => {
        // `swipe` puts BREW in the tray, behind a pan gesture that VoiceOver
        // cannot perform -- the same reason duplicate and delete are mirrored
        // here. So this is the shape that needs the action most, and it was
        // the one shape that did not publish it.
        const onBrew = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        brewShortcut="swipe" onBrew={onBrew}/>
        );
        const card = screen.getByTestId("recipe-card");

        // The card draws nothing for `swipe`, so this is not the visual
        // shortcut coming back -- only the non-visual path to it.
        expect(screen.queryByTestId("brew-shortcut")).toBeNull();
        expect(card.props.accessibilityActions).toEqual(
            expect.arrayContaining([{name: "brew", label: "Brew this recipe"}])
        );

        await fireEvent(card, "accessibilityAction",
                        {nativeEvent: {actionName: "brew"}});
        expect(onBrew).toHaveBeenCalledTimes(1);
    });

    it("offers no brew action when there is nothing to brew on", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDelete={jest.fn()}/>
        );
        const card = screen.getByTestId("recipe-card");

        // The other actions are here, so this is not passing because the card
        // published no actions at all.
        expect(card.props.accessibilityActions).toEqual(
            expect.arrayContaining([{name: "delete", label: "Delete recipe"}])
        );
        expect(card.props.accessibilityActions).not.toEqual(
            expect.arrayContaining([{name: "brew", label: "Brew this recipe"}])
        );
    });
});
