import React from "react";
import {fireEvent} from "@testing-library/react-native";

import BrewCapsule from "@/components/BrewCapsule";
import {accents, palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = accents.coffee[0];
const INK = palette.surface;

describe("BrewCapsule", () => {
    it("sets BREW upright, one letter per line", async () => {
        // Rotated text was tried and is unreadable at this width; four stacked
        // letters are legible and say the same thing.
        const {getByText} = await renderWithProviders(
            <BrewCapsule accent={ACCENT} ink={INK} onPress={jest.fn()} />
        );
        ["B", "R", "E", "W"].forEach((letter) => expect(getByText(letter)).toBeTruthy());
    });

    it("reads as one control, not four letters", async () => {
        const {getByLabelText} = await renderWithProviders(
            <BrewCapsule accent={ACCENT} ink={INK} onPress={jest.fn()} />
        );
        expect(getByLabelText("Brew this recipe")).toBeTruthy();
    });

    it("has a full touch target without being wider", async () => {
        const {getByLabelText} = await renderWithProviders(
            <BrewCapsule accent={ACCENT} ink={INK} onPress={jest.fn()} />
        );
        const capsule = getByLabelText("Brew this recipe");
        const style = capsule.props.style as {width?: number};
        expect(style.width).toBeLessThanOrEqual(24);
        expect(capsule.props.hitSlop).toBeTruthy();
    });

    it("brews on a press", async () => {
        const onPress = jest.fn();
        const {getByLabelText} = await renderWithProviders(
            <BrewCapsule accent={ACCENT} ink={INK} onPress={onPress} />
        );
        await fireEvent.press(getByLabelText("Brew this recipe"));
        expect(onPress).toHaveBeenCalled();
    });
});
