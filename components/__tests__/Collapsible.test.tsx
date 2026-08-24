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

    it("takes its natural height until it has been measured", async () => {
        // Before the first layout pass the content's height is unknown. Guessing
        // at zero would collapse the row on the first frame and then have it
        // spring open, which is worse than the jump being fixed here.
        await renderWithProviders(<Collapsible open>{body()}</Collapsible>);
        const node = screen.getByTestId("collapsible", includeHidden);

        expect(node.props.jestAnimatedStyle?.value?.height).toBeUndefined();
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
        expect(rowStyle(1, 80, true)).toEqual({height: 80, opacity: 1});
        expect(rowStyle(0, 80, false)).toEqual({height: 0, opacity: 0});
    });

    it("passes through the midpoint of the travel, rather than switching", () => {
        // The row has to give its height up gradually. Snapping from 80 to 0 at
        // some threshold is the jump this component exists to remove.
        expect(rowStyle(0.5, 80, true)).toEqual({height: 40, opacity: 0.5});
    });

    it("leaves an open row's height alone until the content has been measured", () => {
        expect(rowStyle(1, null, true)).toEqual({opacity: 1});
    });

    it("gives an unmeasured closed row no height at all", () => {
        // Returning only an opacity left the row holding its full natural
        // height while invisible, so a list of closed rows opened as a run of
        // tile-tall gaps and each row only found its real size after being
        // opened and closed once.
        expect(rowStyle(0, null, false)).toEqual({height: 0, opacity: 0});
    });
});

describe("nextHeight", () => {
    it("takes the measurement when the row is open", () => {
        expect(nextHeight(null, 80, true)).toBe(80);
        expect(nextHeight(80, 96, true)).toBe(96);
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
