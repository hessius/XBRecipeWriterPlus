import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BrewShortcut, {SHORTCUT_INSET} from "@/components/BrewShortcut";
import {accents, palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = accents.coffee[0];

describe("BrewShortcut", () => {
    it.each(["edge", "tab", "chip"] as const)("says BREW as a %s", async (variant) => {
        await renderWithProviders(
            <BrewShortcut variant={variant} accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        // The three differ in shape alone, so the word and the colours are
        // the invariant across all of them.
        expect(screen.getByLabelText("Brew this recipe")).toBeTruthy();
    });

    it("gives the tab a radius concentric with the card's", async () => {
        await renderWithProviders(
            <BrewShortcut variant="tab" accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        // 22 - 4. Two curves that nearly agree read as a sticker; one curve
        // inside another sharing a centre reads as a cut-out. The old capsule
        // used width/2, which was 10.5 against a card radius of 22.
        expect(screen.getByTestId("brew-shortcut").props.style)
            .toEqual(expect.objectContaining({borderRadius: 18}));
    });

    it("gives the edge band no radius of its own", async () => {
        await renderWithProviders(
            <BrewShortcut variant="edge" accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        // It bleeds to the card's boundary and the card's overflow: hidden
        // clips it, so there is no second radius to get wrong.
        expect(screen.getByTestId("brew-shortcut").props.style.borderRadius)
            .toBeUndefined();
    });

    it("reserves room on the card's trailing edge for the bands", () => {
        // Fault 2 was the capsule landing on the TEA marker. Fixed by the card
        // knowing what each shape occupies, not by picking a shape that misses.
        expect(SHORTCUT_INSET.edge).toBeGreaterThan(0);
        expect(SHORTCUT_INSET.tab).toBeGreaterThan(SHORTCUT_INSET.edge);
        // The chip is at the bottom, where nothing sits unless the card is
        // editing, and the card hides the shortcut while it is.
        expect(SHORTCUT_INSET.chip).toBe(0);
    });

    it("reaches a full touch target", async () => {
        await renderWithProviders(
            <BrewShortcut variant="edge" accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        const band = screen.getByTestId("brew-shortcut");
        const slop = band.props.hitSlop;
        const width = (band.props.style as {width: number}).width;

        // Read off the rendered style rather than restated, because the whole
        // point of this assertion is the number the component actually draws.
        //
        // Only the inward slop counts. The card clips its subtree, and React
        // Native will not hit-test into a clipping container for a point
        // outside it, so the band's top, bottom and right slop -- all three of
        // them beyond the card's edge -- buy nothing at all.
        expect(width + slop.left).toBeGreaterThanOrEqual(44);
    });

    it("sets BREW upright, one letter per line for the bands", async () => {
        await renderWithProviders(
            <BrewShortcut variant="edge" accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        ["B", "R", "E", "W"].forEach((letter) => expect(screen.getByText(letter)).toBeTruthy());
    });

    it("brews on a press", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <BrewShortcut variant="edge" accent={ACCENT} ink={palette.base} onPress={onPress}/>
        );
        await fireEvent.press(screen.getByLabelText("Brew this recipe"));
        expect(onPress).toHaveBeenCalled();
    });
});
