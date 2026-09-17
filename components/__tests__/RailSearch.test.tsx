import React from "react";
import {StyleSheet, type StyleProp, type TextStyle} from "react-native";
import {act, fireEvent, screen} from "@testing-library/react-native";

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

async function layout(width: number) {
    await fireEvent(screen.getByTestId("rail-search"), "layout", {
        nativeEvent: {layout: {width, height: 44, x: 0, y: 0}}
    });
}

async function expand() {
    await press(screen.getByTestId("rail-search"));
}

describe("RailSearch", () => {
    it("announces that the collapsed chip has no active term", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);

        expect(screen.getByRole("button", {
            name: "Search recipes, collapsed, no search term"
        })).toBeTruthy();
    });

    it("announces that the expanded field has an active term", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await expand();
        await fireEvent.changeText(screen.getByTestId("rail-search-input"), "eth");

        expect(screen.getByLabelText("Search recipes, expanded, term ETH active")).toBeTruthy();
    });

    it("shows a bare glyph until it is tapped", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        expect(screen.getByTestId("rail-search")).toBeTruthy();
        expect(screen.queryByTestId("rail-search-field")).toBeNull();
    });

    it("takes the rail's width while idle, not only once tapped", async () => {
        // The idle control is flexed exactly as the live field is, so the two
        // occupy the same space and a tap moves nothing across the rail. A
        // square here would leave a dead gap beside the trailing buttons.
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        const idle = screen.getByTestId("rail-search").props.style as Record<string, unknown>;
        expect(idle.flex).toBe(1);

        await expand();

        const live = screen.getByTestId("rail-search-field").props.style as Record<string, unknown>;
        expect(live.flex).toBe(1);
    });

    it("wears the unfilled chip shape until there is a cursor in it", async () => {
        // Idle search is one more control in the row, so it carries the same
        // nothing-behind-it the sort and filter chips carry when they are off.
        // The fill arrives with the cursor and means the field is live.
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        const idle = screen.getByTestId("rail-search").props.style as Record<string, unknown>;
        expect(idle.backgroundColor).toBe("transparent");

        await expand();

        const live = screen.getByTestId("rail-search-field").props.style as Record<string, unknown>;
        expect(live.backgroundColor).toBe(palette.raised);
    });

    it("types in the same dot matrix face the header is set in", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await expand();

        const style = StyleSheet.flatten(
            screen.getByTestId("rail-search-input").props.style as StyleProp<TextStyle>
        );
        expect(style.fontFamily).toBe("Doto-Bold");
    });

    it("draws the term in caps, matching the words on the rail around it", async () => {
        // In the string rather than in a style: React Native implements
        // `textTransform` for Text and never plumbs it through to a TextInput on
        // either platform, so a style here would have been inert on device and
        // green in Jest, which is the worst of both.
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await expand();
        const field = screen.getByTestId("rail-search-input");

        await fireEvent.changeText(field, "\u00e9tna");

        expect(screen.getByTestId("rail-search-input").props.value).toBe("\u00c9TNA");
    });

    it("hands the query a lower-case term whatever the field is showing", async () => {
        // The field's casing is a display choice and the query must not inherit
        // it. LIKE folds ASCII case and nothing else, so the case that reaches
        // it decides which accented text still matches, and free text is written
        // lower case far more often than upper.
        jest.useFakeTimers();
        try {
            const onTermChange = jest.fn();
            await renderWithProviders(<RailSearch onTermChange={onTermChange}/>);
            await expand();

            // Pasted in caps, which is the case the field's own upper-casing
            // cannot stand in for: a typed term is already lower case.
            await fireEvent.changeText(screen.getByTestId("rail-search-input"), "\u00c9TNA");
            await act(async () => { jest.advanceTimersByTime(2000); });

            expect(onTermChange).toHaveBeenCalledWith("\u00e9tna");
        } finally {
            jest.useRealTimers();
        }
    });

    it("shift-locks the keyboard so a typed letter is never drawn lower case", async () => {
        // Belt as well as braces. The hook's upper-casing is the guarantee and
        // catches a pasted term, but it lands a frame after the native field has
        // drawn the key that was pressed, so typing flickered. This is what
        // stops the flicker; it is not what makes the invariant true.
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await expand();

        expect(screen.getByTestId("rail-search-input").props.autoCapitalize)
            .toBe("characters");
    });

    it("spells its name once it has been measured wide enough for the word", async () => {
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await layout(240);

        expect(screen.getByText("SEARCH")).toBeTruthy();
    });

    it("keeps the word off until it knows there is room for it", async () => {
        // Before the first measurement there is no width to judge, so the word
        // stays off: a clipped half-word reads as a broken control, while a bare
        // glyph reads as a search button.
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        expect(screen.queryByText("SEARCH")).toBeNull();
    });

    it("drops the word when a long sort axis leaves too little room", async () => {
        // The remainder depends on the sort chip's word, which changes as the
        // user sorts, so no breakpoint on device width could answer this.
        await renderWithProviders(<RailSearch onTermChange={jest.fn()}/>);
        await layout(240);
        expect(screen.getByText("SEARCH")).toBeTruthy();

        await layout(90);
        expect(screen.queryByText("SEARCH")).toBeNull();
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
        expect(screen.getByTestId("rail-search-input").props.value).toBe("ETH");
        expect(onTermChange).not.toHaveBeenCalledWith("");
    });
});
