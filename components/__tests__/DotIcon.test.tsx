import React from "react";
import {screen} from "@testing-library/react-native";

import DotIcon from "@/components/DotIcon";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {renderWithProviders} from "@/test-utils/render";

// DotIcon is hidden from accessibility by default (that is exactly what the
// third test below verifies), and @testing-library/react-native's default
// queries exclude anything hidden from the accessibility tree -- including the
// element itself, not just its descendants. Opting in with
// `includeHiddenElements` is the supported way to still assert on it.
const includeHidden = {includeHiddenElements: true};

describe("DotIcon", () => {
    it("draws exactly the lit dots of its bitmap", async () => {
        await renderWithProviders(<DotIcon name="scan" size={44}/>);
        expect(screen.getAllByTestId("dot-icon-dot", includeHidden))
            .toHaveLength(litCells(DOT_ICONS.scan).length);
    });

    it("scales the whole drawing with size, so two sizes are the same icon", async () => {
        // Each render is queried through its own utilities rather than the
        // shared `screen` binding: `screen` tracks only the most recently
        // rendered tree, so a second render() call in the same test would
        // otherwise leave nothing to find the first icon by.
        const first = await renderWithProviders(<DotIcon name="settings" size={18}/>);
        const small = first.getByTestId("dot-icon", includeHidden);

        const second = await renderWithProviders(<DotIcon name="settings" size={36}/>);
        const large = second.getByTestId("dot-icon", includeHidden);

        expect(small.props.style.width).toBe(18);
        expect(large.props.style.width).toBe(36);
    });

    it("costs nothing to animate when it is not animating", async () => {
        // Every dot used to be an Animated.View with its own shared value,
        // effect and animated style, whether or not it ever moved. A card's two
        // action glyphs are some sixty dots, and turning edit mode on across a
        // list built sixty of those per row -- half a second before the mode
        // appeared. A static icon is a static icon.
        await renderWithProviders(<DotIcon name="delete" size={20}/>);
        const animated = screen.getAllByTestId("dot-icon-dot", includeHidden)
            .filter((dot) => dot.props.jestAnimatedStyle !== undefined);

        expect(animated).toHaveLength(0);
    });

    it("still animates each dot when asked to", async () => {
        await renderWithProviders(<DotIcon name="delete" size={20} animated/>);
        const animated = screen.getAllByTestId("dot-icon-dot", includeHidden)
            .filter((dot) => dot.props.jestAnimatedStyle !== undefined);

        expect(animated).toHaveLength(litCells(DOT_ICONS.delete).length);
    });

    it("is hidden from the accessibility tree by default", async () => {
        await renderWithProviders(<DotIcon name="error" size={20}/>);
        expect(screen.getByTestId("dot-icon", includeHidden).props.accessibilityElementsHidden)
            .toBe(true);
    });

    it("announces itself when given a label, for use as a bare control", async () => {
        await renderWithProviders(
            <DotIcon name="edit" size={20} accessibilityLabel="Edit recipes"/>
        );
        expect(screen.getByLabelText("Edit recipes")).toBeTruthy();
    });
});
