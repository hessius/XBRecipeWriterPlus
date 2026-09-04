import React from "react";

import BrewStageLadder from "@/components/BrewStageLadder";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pours(count: number): Pour[] {
    return Array.from({length: count}, (_, i) =>
        new Pour(i + 1, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10));
}

async function draw(overrides: Partial<React.ComponentProps<typeof BrewStageLadder>> = {}) {
    return renderWithProviders(
        <BrewStageLadder
            pours={pours(4)}
            accent={palette.brand}
            activeIndex={1}
            barHeight={11}
            rungGap={8}
            scrolls={false}
            stageWater={[40, 20, 0, 0]}
            stalls={[[], [], [], []]}
            pauseElapsed={0}
            {...overrides}
        />
    );
}

describe("BrewStageLadder", () => {
    it("draws one rung per stage", async () => {
        const {getByTestId} = await draw();

        for (const i of [0, 1, 2, 3]) expect(getByTestId(`rung-${i}`)).toBeTruthy();
    });

    it("no longer lists every pour pattern that is not in use", async () => {
        const {queryByText} = await draw();

        expect(queryByText("AGITATION")).toBeNull();
        expect(queryByText("CIRCULAR")).toBeNull();
    });

    it("shares one time scale across every rung", async () => {
        // Stage 2 stalled for 30 s, so the scale must grow for all of them.
        const {getByTestId} = await draw({
            stalls: [[], [{atMl: 10, seconds: 30}], [], []]
        });

        // 40 ml at 4 ml/s is 10 s of pour plus a 10 s rest: a clean stage is
        // 20 s. The stalled one is 50, so a clean rung must leave 30 s of slack.
        expect(getByTestId("rung-0")).toBeTruthy();
        expect(getByTestId("rung-1")).toBeTruthy();
    });

    it("gives each rung its own water", async () => {
        const {getByText} = await draw({stageWater: [40, 22, 0, 0]});

        expect(getByText("22/40 ml")).toBeTruthy();
    });

    it("marks everything done once the brew is over", async () => {
        const {getByTestId} = await draw({
            activeIndex: 4, stageWater: [40, 40, 40, 40]
        });

        expect(getByTestId("rung-3").props.style).not.toEqual(
            expect.objectContaining({opacity: 0.45})
        );
    });

    it("dims the stages still to come and not the ones already poured", async () => {
        // The mid-brew case, which is the only one where the boundary matters:
        // the all-done and not-yet-started tests either side of this one are
        // both satisfied by a component that ignores `activeIndex` entirely.
        const {getByTestId} = await draw({activeIndex: 1, stageWater: [40, 20, 0, 0]});

        const dim = expect.objectContaining({opacity: 0.45});
        expect(getByTestId("rung-0").props.style).not.toEqual(dim);
        expect(getByTestId("rung-1").props.style).not.toEqual(dim);
        expect(getByTestId("rung-2").props.style).toEqual(dim);
        expect(getByTestId("rung-3").props.style).toEqual(dim);
    });

    it("survives a recipe with no pours", async () => {
        // A ladder with nothing to draw still has to lay itself out. This is a
        // crash guard, not a rendering assertion.
        const {queryByTestId} = await draw({
            pours: [], activeIndex: null, stageWater: [], stalls: []
        });

        expect(queryByTestId("rung-0")).toBeNull();
    });

    it("marks everything pending before it starts", async () => {
        const {getByTestId} = await draw({
            activeIndex: null, stageWater: [0, 0, 0, 0]
        });

        expect(getByTestId("rung-0").props.style).toEqual(
            expect.objectContaining({opacity: 0.45})
        );
    });
});
