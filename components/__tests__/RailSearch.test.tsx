import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RailSearch from "@/components/RailSearch";
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

async function expand() {
    await press(screen.getByTestId("rail-search"));
}

describe("RailSearch", () => {
    it("shows a bare glyph until it is tapped", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        expect(screen.getByTestId("rail-search")).toBeTruthy();
        expect(screen.queryByTestId("rail-search-field")).toBeNull();
    });

    it("expands into a field on tap", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await expand();
        expect(screen.getByTestId("rail-search-field")).toBeTruthy();
        expect(screen.queryByTestId("rail-search")).toBeNull();
    });

    it("collapses back to the glyph when cleared", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await expand();
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");
        await fireEvent.press(screen.getByTestId("rail-search-clear"));

        expect(screen.queryByTestId("rail-search-field")).toBeNull();
        expect(screen.getByTestId("rail-search")).toBeTruthy();
    });

    it("accents the field while a term is held and not while it is empty", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await expand();

        const empty = screen.getByTestId("rail-search-field").props.style as Record<string, unknown>;
        expect(empty.borderTopColor).toBe(palette.line);

        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");
        const held = screen.getByTestId("rail-search-field").props.style as Record<string, unknown>;
        expect(held.borderTopColor).toBe(palette.text);
    });

    it("keeps the field and its term when the keyboard is dismissed", async () => {
        // A blur is not a clear. A user who typed a term and then looked at the
        // results still has one, so dismissing the keyboard must not collapse the
        // field or drop what was typed.
        const onTermChange = jest.fn();
        await renderWithProviders(<RailSearch onTermChange={onTermChange}/>);
        await expand();
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");

        await fireEvent(screen.getByTestId("rail-search-input"), "blur");

        expect(screen.getByTestId("rail-search-field")).toBeTruthy();
        expect(screen.getByTestId("rail-search-input").props.value).toBe("eth");
        expect(onTermChange).not.toHaveBeenCalledWith("");
    });
});
