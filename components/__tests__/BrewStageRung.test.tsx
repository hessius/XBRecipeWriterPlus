import React from "react";

import BrewStageRung from "@/components/BrewStageRung";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = palette.brand;

function stage(volume = 70, pause = 20): Pour {
    return new Pour(1, volume, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, pause);
}

async function draw(overrides: Partial<React.ComponentProps<typeof BrewStageRung>> = {}) {
    return renderWithProviders(
        <BrewStageRung
            pour={stage()}
            index={0}
            state="pending"
            accent={ACCENT}
            laneSeconds={40}
            barHeight={11}
            delivered={0}
            pauseElapsed={0}
            stalls={[]}
            {...overrides}
        />
    );
}

describe("BrewStageRung", () => {
    it("gives the lane the whole row rather than a fixed width", async () => {
        const {getByTestId} = await draw();

        expect(getByTestId("rung-lane").props.style).toEqual(
            expect.objectContaining({flex: 1})
        );
    });

    it("is dimmed before the stage happens", async () => {
        const {getByTestId} = await draw({testID: "rung"});

        expect(getByTestId("rung").props.style).toEqual(
            expect.objectContaining({opacity: 0.45})
        );
    });

    it("fills the water segment by millilitres, not by time", async () => {
        const {getByTestId} = await draw({state: "active", delivered: 35});

        // The lane is 40 s wide; a clean 70 ml stage pours for 17.5 s of it.
        // Half delivered is half of that segment lit.
        expect(getByTestId("segment-fill-0").props.style.flex).toBeCloseTo(0.5);
    });

    it("counts millilitres while pouring", async () => {
        const {getByText} = await draw({state: "active", delivered: 41});

        expect(getByText("41/70 ml")).toBeTruthy();
    });

    it("counts down seconds while resting, because millilitres have stopped moving", async () => {
        const {getByText} = await draw({
            state: "active", delivered: 70, pauseElapsed: 6
        });

        expect(getByText("14 s left")).toBeTruthy();
    });

    it("changes texture, not colour, for a planned rest", async () => {
        const {getByTestId} = await draw({
            state: "active", delivered: 70, pauseElapsed: 6
        });

        expect(getByTestId("segment-1").props.style.borderStyle).toBe("dashed");
        expect(getByTestId("segment-fill-1").props.style.backgroundColor).toBe(ACCENT);
    });

    it("changes colour, not texture, where it held", async () => {
        const {getByTestId} = await draw({
            state: "active", delivered: 40, stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByTestId("segment-1").props.style.backgroundColor).toBe(palette.warn);
    });

    it("keeps the stall bands after the stage is done", async () => {
        const {getByTestId} = await draw({
            state: "done", delivered: 70, pauseElapsed: 20,
            stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByTestId("segment-1").props.style.backgroundColor).toBe(palette.warn);
    });

    it("says the whole stage in one sentence for VoiceOver", async () => {
        const {getByLabelText} = await draw();

        expect(getByLabelText(/Stage 01, centred pour, 93 degrees, 70 millilitres/))
            .toBeTruthy();
    });

    it("says where it held, for VoiceOver", async () => {
        const {getByLabelText} = await draw({
            state: "active", delivered: 40, stalls: [{atMl: 20, seconds: 9}]
        });

        expect(getByLabelText(/held once, 9 seconds/)).toBeTruthy();
    });
});
