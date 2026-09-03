// components/__tests__/BrewStageLadder.test.tsx
import React from "react";

import BrewStageLadder from "@/components/BrewStageLadder";
import BrewStageRung from "@/components/BrewStageRung";
import {accents} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

/**
 * Walk the fiber tree from a TestInstance's unstable_fiber to collect memoizedProps
 * for every instance of a given component type. This reads the real component props
 * without any test-only backdoor.
 */
function findRungProps(root: {unstable_fiber?: unknown} | null | undefined, type: unknown): any[] {
    function walk(fiber: any): any[] {
        if (!fiber) return [];
        const mine: any[] = fiber.type === type ? [fiber.memoizedProps] : [];
        return [...mine, ...walk(fiber.child), ...walk(fiber.sibling)];
    }
    return walk((root as any)?.unstable_fiber);
}

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
        const {root} = await draw({pours: wide, activeIndex: null});
        // Stage 2 is 10 s of pour plus 60 s of pause, and fills the lane.
        const rungs = findRungProps(root, BrewStageRung);
        expect(rungs.every(r => r.laneSeconds === rungs[0].laneSeconds)).toBe(true);
        expect(rungs[0].laneSeconds).toBeCloseTo(70, 1);
    });

    it("re-scales when the live stage outruns its plan", async () => {
        // Overflow protection: the stage is still running well past its span,
        // so the lane grows rather than pinning at full and saying nothing.
        const {root} = await draw({activeIndex: 0, stageElapsed: 90});
        const rungs = findRungProps(root, BrewStageRung);
        expect(rungs[0].laneSeconds).toBeCloseTo(90, 1);
    });

    it("marks stages before the live one as done and after it as pending", async () => {
        const {root} = await draw({activeIndex: 2});
        const rungs = findRungProps(root, BrewStageRung);
        expect(rungs[0].state).toBe("done");
        expect(rungs[4].state).toBe("pending");
    });

    it("survives a recipe with no pours", async () => {
        const {queryAllByTestId} = await draw({pours: [], activeIndex: null});
        expect(queryAllByTestId(/^rung-\d+$/)).toHaveLength(0);
    });
});
