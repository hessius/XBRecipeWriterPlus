// components/__tests__/BrewStageRung.test.tsx
import React from "react";

import BrewStageRung from "@/components/BrewStageRung";
import {accents, palette} from "@/constants/colors";

import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const TEST_ACCENT = accents.coffee[1];

function pour(overrides: Partial<Pour> = {}): Pour {
    const p = new Pour(1, 45, 94, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 20);
    Object.assign(p, overrides);
    return p;
}

async function draw(props: Partial<React.ComponentProps<typeof BrewStageRung>> = {}) {
    return renderWithProviders(
        <BrewStageRung
            pour={pour()}
            index={5}
            state="pending"
            accent={TEST_ACCENT}
            laneSeconds={60}
            laneWidth={120}
            progress={0}
            {...props}
        />
    );
}

describe("BrewStageRung", () => {
    it("numbers the stage from one, padded", async () => {
        // Padded so a nine-stage recipe's numbers form a column rather than a
        // ragged edge.
        const {getByText} = await draw();
        expect(getByText("06")).toBeTruthy();
    });

    it("shows temperature and volume", async () => {
        const {getByText} = await draw();
        expect(getByText("94°")).toBeTruthy();
        expect(getByText("45 ml")).toBeTruthy();
    });

    it("shows the pattern glyph", async () => {
        const {getByLabelText} = await draw({pour: pour({pourPattern: POUR_PATTERN.SPIRAL})});
        expect(getByLabelText("Spiral pour")).toBeTruthy();
    });

    it("draws the pour and its pause to real seconds on a shared scale", async () => {
        // 45 ml at 4 ml/s is 11.25 s of pour, then a 20 s pause: 31.25 s of a
        // 60 s lane 120 px wide.
        const {getByTestId} = await draw();
        expect(getByTestId("rung-pour").props.style.width).toBeCloseTo(22.5, 1);
        expect(getByTestId("rung-pause").props.style.width).toBeCloseTo(40, 1);
    });

    it("draws no pause bar for a stage that has none", async () => {
        const {queryByTestId} = await draw({pour: pour({pauseTime: 0})});
        expect(queryByTestId("rung-pause")).toBeNull();
    });

    it("puts the agitation mark on the leading edge for agitation before", async () => {
        const {getByTestId, queryByTestId} = await draw({
            pour: pour({agitation: AGITATION.BEFORE_ON_AFTER_OFF})
        });
        expect(getByTestId("rung-agitation-before")).toBeTruthy();
        expect(queryByTestId("rung-agitation-after")).toBeNull();
    });

    it("puts it on the trailing edge for agitation after", async () => {
        const {getByTestId, queryByTestId} = await draw({
            pour: pour({agitation: AGITATION.BEFORE_OFF_AFTER_ON})
        });
        expect(getByTestId("rung-agitation-after")).toBeTruthy();
        expect(queryByTestId("rung-agitation-before")).toBeNull();
    });

    it("draws both marks when both are on", async () => {
        const {getByTestId} = await draw({
            pour: pour({agitation: AGITATION.BEFORE_ON_AFTER_ON})
        });
        expect(getByTestId("rung-agitation-before")).toBeTruthy();
        expect(getByTestId("rung-agitation-after")).toBeTruthy();
    });

    it("fills the lane in proportion to the live stage's progress", async () => {
        const {getByTestId} = await draw({state: "active", progress: 0.5});
        expect(getByTestId("rung-fill").props.style.width).toBeCloseTo(60, 1);
    });

    it("shows a full lane on a stage that is done", async () => {
        const {getByTestId} = await draw({state: "done", progress: 1});
        expect(getByTestId("rung-fill").props.style.width).toBeCloseTo(120, 1);
    });

    it("turns the fill amber while the machine is holding", async () => {
        const {getByTestId} = await draw({state: "active", progress: 0.5, holding: true});
        expect(getByTestId("rung-fill").props.style.backgroundColor).toBe(palette.warn);
    });

    it("fades a stage that has not run yet", async () => {
        const {getByTestId} = await draw({state: "pending", testID: "rung"});
        expect(getByTestId("rung").props.style.opacity).toBeLessThan(1);
    });

    it("the lane never draws wider than its scale", async () => {
        // 200 ml at 4 ml/s is 50 s pour, plus 120 s pause — far more than the
        // 60 s scale, so both bars must be clamped to the 120 px lane.
        const oversize = pour({volume: 200, pauseTime: 120});
        const {getByTestId} = await draw({pour: oversize});
        const pourW = getByTestId("rung-pour").props.style.width;
        const pauseW = getByTestId("rung-pause").props.style.width;
        expect(pourW).toBeLessThanOrEqual(120);
        expect(pourW + pauseW).toBeLessThanOrEqual(120);
    });

    it("a rung says what the pour does, in one sentence", async () => {
        const p = pour({pourPattern: POUR_PATTERN.SPIRAL, agitation: AGITATION.BEFORE_OFF_AFTER_ON});
        const {getByLabelText} = await draw({pour: p, index: 5});
        // Stage number, pattern, temperature, volume, agitation — in one label.
        const label = getByLabelText(/06/);
        expect(label).toBeTruthy();
        const text: string = label.props.accessibilityLabel;
        expect(text).toContain("spiral");
        expect(text).toContain("94");
        expect(text).toContain("45");
        expect(text).toContain("agitates");
    });

    it("a stage with no pause does not mention one", async () => {
        const {getByLabelText} = await draw({pour: pour({pauseTime: 0}), index: 5});
        const label = getByLabelText(/06/);
        const text: string = label.props.accessibilityLabel;
        expect(text).not.toContain("pause");
    });
});
