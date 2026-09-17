import React from "react";
import {StyleSheet, type StyleProp, type TextStyle} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import {RailSearchChip, RailSearchField} from "@/components/RailSearch";
import {CHIP_HEIGHT} from "@/components/RailChip";
import {DOTO_FAMILIES} from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

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

async function press(element: Parameters<typeof fireEvent>[0]) {
    await fireEvent(element, "responderGrant", TOUCH);
    await fireEvent(element, "responderRelease", TOUCH);
}

function field(props: Partial<React.ComponentProps<typeof RailSearchField>> = {}) {
    return (
        <RailSearchField state="no search term" text="" active={false}
                         onChangeText={jest.fn()} onBlur={jest.fn()}
                         onClear={jest.fn()} {...props}/>
    );
}

describe("RailSearchChip", () => {
    it("announces the search behind it", async () => {
        await renderWithProviders(
            <RailSearchChip state="term ETH active" onPress={jest.fn()}/>
        );

        expect(screen.getByRole("button", {
            name: "Search recipes, collapsed, term ETH active"
        })).toBeTruthy();
    });

    it("is a square, so opening search cannot take width from the rail", async () => {
        // The whole point of the phase 4b change. A flexed idle control shared a
        // 320 pt rail with the view toggle by taking width from it, and the
        // field that opened was too cramped to type in.
        await renderWithProviders(<RailSearchChip state="x" onPress={jest.fn()}/>);

        expect(screen.getByTestId("rail-search")).toHaveStyle({
            width: CHIP_HEIGHT, height: CHIP_HEIGHT
        });
    });

    it("wears the unfilled chip shape the other idle chips wear", async () => {
        await renderWithProviders(<RailSearchChip state="x" onPress={jest.fn()}/>);

        expect(screen.getByTestId("rail-search")).toHaveStyle({
            backgroundColor: palette.none, borderTopColor: palette.line
        });
    });

    it("reports a tap", async () => {
        const onPress = jest.fn();
        await renderWithProviders(<RailSearchChip state="x" onPress={onPress}/>);

        await press(screen.getByTestId("rail-search"));

        expect(onPress).toHaveBeenCalled();
    });
});

describe("RailSearchField", () => {
    it("announces the search it holds", async () => {
        await renderWithProviders(field({state: "term ETH active"}));

        expect(screen.getByLabelText("Search recipes, expanded, term ETH active"))
            .toBeTruthy();
    });

    it("types in the same dot matrix face the header is set in", async () => {
        await renderWithProviders(field());

        const style = StyleSheet.flatten(
            screen.getByTestId("rail-search-input").props.style as StyleProp<TextStyle>
        );
        expect(style.fontFamily).toBe(DOTO_FAMILIES.bold);
    });

    it("shift-locks the keyboard so a typed letter is never drawn lower case", async () => {
        // The hook upper-cases the term, but that correction lands a frame after
        // the native field has drawn the key, which flickered on device.
        await renderWithProviders(field());

        expect(screen.getByTestId("rail-search-input").props.autoCapitalize)
            .toBe("characters");
    });

    it("accents itself while a term is held and not while it is empty", async () => {
        await renderWithProviders(field({active: true, text: "ETH"}));
        expect(screen.getByTestId("rail-search-field"))
            .toHaveStyle({borderTopColor: palette.text});

        await renderWithProviders(field());
        expect(screen.getByTestId("rail-search-field"))
            .toHaveStyle({borderTopColor: palette.line});
    });

    it("hands typing and clearing to its owner", async () => {
        const onChangeText = jest.fn();
        const onClear = jest.fn();
        await renderWithProviders(field({onChangeText, onClear}));

        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");
        await fireEvent.press(screen.getByTestId("rail-search-clear"));

        expect(onChangeText).toHaveBeenCalledWith("eth");
        expect(onClear).toHaveBeenCalled();
    });

    it("tells its owner when the keyboard is dismissed", async () => {
        const onBlur = jest.fn();
        await renderWithProviders(field({onBlur}));

        await fireEvent(screen.getByTestId("rail-search-input"), "blur");

        expect(onBlur).toHaveBeenCalled();
    });
});
