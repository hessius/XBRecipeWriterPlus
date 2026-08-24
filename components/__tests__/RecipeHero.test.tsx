import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipeHero from "@/components/RecipeHero";
import {onAccent} from "@/constants/colors";
import Pour from "@/library/Pour";
import {renderWithProviders, TEST_INSETS} from "@/test-utils/render";

function pours(...volumes: number[]): Pour[] {
    return volumes.map((volume, index) => new Pour(index + 1, volume));
}

const BASE = {
    name:     "Ethiopia Guji",
    named:    true,
    xid:      "AB12CD",
    accent:   "#F0B98E",
    beverage: "COFFEE" as const,
    pours:    pours(96, 96, 96),
    collapsed: false,
    onBack:    () => {},
    onMore:    () => {}
};

type Node = ReturnType<typeof screen.getByTestId>;

/** How many nodes at or under this one respond to a touch. */
function touchables(node: Node): number {
    const self = node.props?.onStartShouldSetResponder === undefined ? 0 : 1;
    return node.children.reduce<number>(
        (count, child) => count + (typeof child === "string" ? 0 : touchables(child)),
        self
    );
}

describe("RecipeHero", () => {
    it("shows the name, the beverage and the id", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
        expect(screen.getByText("COFFEE")).toBeTruthy();
        expect(screen.getByText("AB12CD")).toBeTruthy();
    });

    it("draws a name the user did not choose in a quieter colour", async () => {
        await renderWithProviders(<RecipeHero {...BASE} name="Read · 3 May" named={false}/>);

        expect(screen.getByText("Read · 3 May").props.style)
            .toEqual(expect.objectContaining({color: onAccent.label}));
    });

    it("draws a name the user did choose at full strength", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.getByText("Ethiopia Guji").props.style)
            .toEqual(expect.objectContaining({color: onAccent.text}));
    });

    it("leaves the id out when the recipe has none", async () => {
        await renderWithProviders(<RecipeHero {...BASE} xid=""/>);

        expect(screen.queryByTestId("hero-xid")).toBeNull();
    });

    it("is the screen's navigation, and nothing else is tappable", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        // Counted by the handler rather than by role. A bare Pressable declares
        // no accessibility role, so a query for buttons stays empty however
        // tappable the hero has quietly become; every touchable does set a
        // responder on its host view. Two: back and more. The slab itself is
        // still a picture — every value on it is edited in the deck below.
        expect(touchables(screen.getByTestId("recipe-hero"))).toBe(2);
        expect(screen.getByTestId("recipe-hero").props.accessibilityRole)
            .not.toBe("button");
    });

    it("goes back and opens the overflow", async () => {
        const onBack = jest.fn();
        const onMore = jest.fn();
        await renderWithProviders(<RecipeHero {...BASE} onBack={onBack} onMore={onMore}/>);

        await fireEvent.press(screen.getByLabelText("Back"));
        await fireEvent.press(screen.getByLabelText("More"));

        expect(onBack).toHaveBeenCalledTimes(1);
        expect(onMore).toHaveBeenCalledTimes(1);
    });

    it("carries the name in its chrome row once collapsed", async () => {
        await renderWithProviders(<RecipeHero {...BASE} collapsed/>);

        // The folded-away slab keeps its own copy mounted so it has something
        // to animate back to, but `Collapsible` hides it from the screen
        // reader while it is closed — so only the chrome row's copy is
        // reachable, and it is the small one.
        const found = screen.getAllByText("Ethiopia Guji");
        expect(found).toHaveLength(1);
        expect(found[0].props.style).toEqual(expect.objectContaining({fontSize: 15}));
    });

    it("keeps the chrome row empty of the name while the slab is open", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        // Only the slab's own headline, at its own size. A second copy of the
        // name in the chrome row while the slab is open would be the title bar
        // this header was built to get rid of.
        const found = screen.getAllByText("Ethiopia Guji");
        expect(found).toHaveLength(1);
        expect(found[0].props.style).toEqual(expect.objectContaining({fontSize: 26}));
    });

    it("offers no EXPLAIN toggle when there is nothing to fold", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.queryByLabelText("Explain")).toBeNull();
    });

    it("toggles EXPLAIN when the help style has notes", async () => {
        const onToggle = jest.fn();
        await renderWithProviders(
            <RecipeHero {...BASE} explain={{active: true, onToggle}}/>
        );

        const toggle = screen.getByLabelText("Explain");
        expect(toggle.props.accessibilityState).toEqual(
            expect.objectContaining({selected: true})
        );

        await fireEvent.press(toggle);
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("runs up behind the status bar", async () => {
        // The accent slab is the top of the screen, not a card below it. When
        // the app was inset as a whole this began under the notch and left a
        // black strip above it.
        await renderWithProviders(<RecipeHero {...BASE}/>);
        const style = screen.getByTestId("recipe-hero").props.style;

        expect(style.paddingTop).toBeGreaterThanOrEqual(TEST_INSETS.top);
    });
});
