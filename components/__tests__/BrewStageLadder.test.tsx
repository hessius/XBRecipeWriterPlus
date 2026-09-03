// components/__tests__/BrewStageLadder.test.tsx
import React from "react";

import BrewStageLadder from "@/components/BrewStageLadder";
import {accents} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const TEST_ACCENT = accents.coffee[1];

function pours(count: number): Pour[] {
    return Array.from({length: count}, (_, i) =>
        new Pour(i + 1, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10));
}

async function draw(props: Partial<React.ComponentProps<typeof BrewStageLadder>> = {}) {
    return renderWithProviders(
        <BrewStageLadder
            pours={pours(5)}
            accent={TEST_ACCENT}
            activeIndex={1}
            stageElapsed={0}
            {...props}
        />
    );
}

describe("BrewStageLadder", () => {
    it("draws one rung per pour", async () => {
        const {getAllByTestId} = await draw({pours: pours(9)});
        expect(getAllByTestId(/^rung-\d+$/)).toHaveLength(9);
    });

    it("opens the card beneath its own rung, not at the end of the list", async () => {
        // The nine-stage mock put it at the bottom and it read as a footer.
        const {getByTestId} = await draw({activeIndex: 1});
        const ladder = getByTestId("ladder");
        const order = ladder.props.children.flat().map(
            (child: {props: {testID?: string}}) => child?.props?.testID
        );
        expect(order.indexOf("stage-card")).toBe(order.indexOf("row-1") + 1);
    });

    it("shows the glyph legend in the open card", async () => {
        const {getByText} = await draw();
        expect(getByText("AGITATION")).toBeTruthy();
    });

    it("says agitation, never shake", async () => {
        // The word is agitation everywhere: the editor, the help text and the
        // card format all use it, and two words for one thing is one too many.
        const {queryByText} = await draw();
        expect(queryByText(/shake/i)).toBeNull();
    });

    it("explains a hold in the open card", async () => {
        const {getByText} = await draw({holding: true});
        expect(getByText("HOLDING — THE CUP IS BEHIND")).toBeTruthy();
    });

    it("opens no card when no stage is live", async () => {
        const {queryByTestId} = await draw({activeIndex: null});
        expect(queryByTestId("stage-card")).toBeNull();
    });

    it("scales every lane to the widest stage the recipe plans", async () => {
        const wide = pours(2);
        wide[1].pauseTime = 60;
        const {getByTestId} = await draw({pours: wide, activeIndex: null});
        // Stage 2 is 10 s of pour plus 60 s of pause, and fills the lane.
        expect(parseFloat(getByTestId("ladder").props.accessibilityValue.text)).toBeCloseTo(70, 1);
    });

    it("re-scales when the live stage outruns its plan", async () => {
        // Overflow protection: the stage is still running well past its span,
        // so the lane grows rather than pinning at full and saying nothing.
        const {getByTestId} = await draw({activeIndex: 0, stageElapsed: 90});
        expect(parseFloat(getByTestId("ladder").props.accessibilityValue.text)).toBeCloseTo(90, 1);
    });

    it("marks stages before the live one as done and after it as pending", async () => {
        const {getByTestId} = await draw({activeIndex: 2});
        expect(getByTestId("row-0").props.accessibilityValue.text).toBe("done");
        expect(getByTestId("row-4").props.accessibilityValue.text).toBe("pending");
    });

    it("survives a recipe with no pours", async () => {
        const {queryAllByTestId} = await draw({pours: [], activeIndex: null});
        expect(queryAllByTestId(/^rung-\d+$/)).toHaveLength(0);
    });
});
