import React from "react";
import {Text} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import Collapsible, {nextHeight, rowStyle} from "@/components/Collapsible";
import {renderWithProviders} from "@/test-utils/render";

const includeHidden = {includeHiddenElements: true};

/** Report a natural height for the content, as a real layout pass would. */
async function measure(height: number) {
    await fireEvent(
        screen.getByTestId("collapsible-content", includeHidden),
        "layout",
        {nativeEvent: {layout: {height, width: 320, x: 0, y: 0}}}
    );
}

function body() {
    return <Text>TILES</Text>;
}

describe("Collapsible", () => {
    it("keeps its children mounted, so there is a height to animate", async () => {
        // Unmounting them is what made them vanish in a single frame: an exit
        // animation cannot run on a subtree that is already gone from layout,
        // and the content below snaps up to fill the space regardless.
        await renderWithProviders(<Collapsible open={false}>{body()}</Collapsible>);
        expect(screen.getByText("TILES", includeHidden)).toBeTruthy();
    });

    it("measures its content off to the side until it knows how tall it is", async () => {
        // The row itself is clipped, so the content cannot be measured inside
        // it. Taking it out of the row's flow for the one pass it takes to
        // learn the height is what lets a row that mounted closed still know
        // what to open to.
        await renderWithProviders(<Collapsible open={false}>{body()}</Collapsible>);
        const content = screen.getByTestId("collapsible-content", includeHidden);

        expect(content.props.style).toMatchObject({position: "absolute"});

        await measure(80);
        expect(
            screen.getByTestId("collapsible-content", includeHidden).props.style
        ).toBeUndefined();
    });

    it("measures its content", async () => {
        await renderWithProviders(<Collapsible open>{body()}</Collapsible>);
        // What the measurement is then used for is the subject of the rowStyle
        // tests below: an animated style is evaluated on the UI thread, and a
        // test can only read the value it was handed at mount.
        await measure(80);
        expect(screen.getByText("TILES", includeHidden)).toBeTruthy();
    });

    it("puts the hidden content out of reach", async () => {
        // Zero height is a visual fact. Without this the tiles would still be
        // focusable by a screen reader and would still take a tap at the seam.
        await renderWithProviders(<Collapsible open={false}>{body()}</Collapsible>);
        const node = screen.getByTestId("collapsible", includeHidden);

        expect(node.props.accessibilityElementsHidden).toBe(true);
        expect(node.props.pointerEvents).toBe("none");
    });

    it("leaves the open content reachable", async () => {
        await renderWithProviders(<Collapsible open>{body()}</Collapsible>);
        const node = screen.getByTestId("collapsible", includeHidden);

        expect(node.props.accessibilityElementsHidden).toBe(false);
        expect(node.props.pointerEvents).toBe("auto");
    });
});

describe("rowStyle", () => {
    it("gives the row its full height when open and none when closed", () => {
        expect(rowStyle(1, 80)).toEqual({height: 80, opacity: 1});
        expect(rowStyle(0, 80)).toEqual({height: 0, opacity: 0});
    });

    it("passes through the midpoint of the travel, rather than switching", () => {
        // The row has to give its height up gradually. Snapping from 80 to 0 at
        // some threshold is the jump this component exists to remove.
        expect(rowStyle(0.5, 80)).toEqual({height: 40, opacity: 0.5});
    });

    it("always names both properties, whatever it knows", () => {
        // The bug this replaces: an unmeasured row returned an opacity and no
        // height at all, and Reanimated does not restore a property that stops
        // being returned -- it keeps applying the last value it was given. A
        // row that mounted closed was handed height zero, and every later
        // style that omitted the height left that zero in place, so the row
        // could never open, never be laid out, and never be measured.
        for (const style of [rowStyle(1, null), rowStyle(0, null), rowStyle(1, 80)]) {
            expect(Object.keys(style).sort()).toEqual(["height", "opacity"]);
        }
    });

    it("gives an unmeasured row no height, open or not", () => {
        // Nothing is lost by it: until the height is known the content is
        // positioned outside the row anyway, so the row has nothing to show.
        expect(rowStyle(1, null)).toEqual({height: 0, opacity: 1});
    });
});

describe("nextHeight", () => {
    it("takes the measurement when the row is open", () => {
        expect(nextHeight(null, 80, true)).toBe(80);
        expect(nextHeight(80, 96, true)).toBe(96);
    });

    it("takes the first measurement even from a closed row", () => {
        // The first one is made with the content lifted out of the clipped row,
        // so a closed row's first report is as truthful as an open row's -- and
        // it is the only chance a row that mounted closed gets.
        expect(nextHeight(null, 80, false)).toBe(80);
    });

    it("ignores anything measured while the row is closed", () => {
        // This is what kept the tiles from ever coming back. Closed, the row is
        // clipped to nothing; a layout pass in that state reported a height of
        // zero, the row remembered it, and reopening then animated to zero --
        // the tiles were gone for good after the first scroll.
        expect(nextHeight(80, 0, false)).toBe(80);
        expect(nextHeight(80, 96, false)).toBe(80);
    });

    it("ignores a height of nothing even when open, having nothing to say", () => {
        expect(nextHeight(80, 0, true)).toBe(80);
    });

    it("returns the height it was given back unchanged, so nothing re-renders", () => {
        expect(nextHeight(80, 80, true)).toBe(80);
    });
});
