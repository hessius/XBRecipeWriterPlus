import React from "react";
import {processColor} from "react-native";

import BrewTrace from "@/components/BrewTrace";
import type {BrewSample} from "@/library/brew/BrewRecord";
import Pour from "@/library/Pour";
import {accents, palette} from "@/constants/colors";

import {renderWithProviders} from "@/test-utils/render";

const TEST_ACCENT = accents.coffee[1];

const pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];

function samples(...rows: [number, number, number][]): BrewSample[] {
    return rows.map(([at, water, cup]) => ({at, water, cup, pour: 1}));
}

async function draw(props: Partial<React.ComponentProps<typeof BrewTrace>> = {}) {
    return renderWithProviders(
        <BrewTrace
            pours={pours}
            samples={[]}
            accent={TEST_ACCENT}
            width={300}
            height={140}
            plannedSeconds={70}
            {...props}
        />
    );
}

describe("BrewTrace", () => {
    it("draws the plan dashed", async () => {
        const {getByTestId} = await draw();
        expect(getByTestId("trace-plan").props.strokeDasharray).toBeTruthy();
    });

    it("draws no live line before any water has moved", async () => {
        // An empty path attribute and a path of one point both render as
        // artefacts. Before the first sample there is simply no line.
        const {queryByTestId} = await draw();
        expect(queryByTestId("trace-water")).toBeNull();
        expect(queryByTestId("trace-cup")).toBeNull();
    });

    it("draws the water line in the accent", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [5000, 20, 12])});
        expect(getByTestId("trace-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(TEST_ACCENT)})
        );
    });

    it("draws the cup line dotted and beneath", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [5000, 20, 12])});
        const cup = getByTestId("trace-cup");
        expect(cup.props.strokeDasharray).toBeTruthy();
        // Same x, lower value, so a larger y. Screen coordinates run downward.
        const lastY = (path: string) => Number(path.split(" ").pop());
        expect(lastY(cup.props.d)).toBeGreaterThan(lastY(getByTestId("trace-water").props.d));
    });

    it("keeps the axis at the plan while the brew is on time", async () => {
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [70_000, 200, 190])});
        // The plan fills the full width: nothing overran it.
        expect(getByTestId("trace-plan").props.d).toContain("300");
    });

    it("stretches the axis when the brew overran, and labels the gap", async () => {
        const {getByText} = await draw({samples: samples([0, 0, 0], [84_000, 200, 190])});
        expect(getByText("+14 S")).toBeTruthy();
    });

    it("says nothing about a gap the user cannot see", async () => {
        // A second of overrun is a rounding artefact, not a hold.
        const {queryByText} = await draw({samples: samples([0, 0, 0], [71_000, 200, 190])});
        expect(queryByText("+1 S")).toBeNull();
    });

    it("shows the stage counter", async () => {
        const {getByText} = await draw({stage: 3, stages: 5});
        expect(getByText("3/5")).toBeTruthy();
    });

    it("turns the water line amber while the machine is holding", async () => {
        const {getByTestId} = await draw({
            samples: samples([0, 0, 0], [5000, 20, 12]),
            holding: true
        });
        expect(getByTestId("trace-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(palette.warn)})
        );
    });

    it("survives a recipe with no pours", async () => {
        const {queryByTestId} = await draw({pours: [], plannedSeconds: 0});
        expect(queryByTestId("trace-plan")).toBeNull();
    });

    it("compact draws the chart and nothing else", async () => {
        const {queryByText, getByTestId} = await draw({
            compact: true,
            stage: 2,
            stages: 4,
            samples: samples([0, 0, 0], [84_000, 200, 190]),
            plannedSeconds: 70,
        });
        // Stage counter and overrun label must not appear in compact mode.
        expect(queryByText("2/4")).toBeNull();
        expect(queryByText("+14 S")).toBeNull();
        // The chart itself must still render.
        expect(getByTestId("trace-water")).toBeTruthy();
    });

    it("a plan of no seconds cannot be overrun", async () => {
        const {queryByText} = await draw({
            pours: [],
            plannedSeconds: 0,
            samples: samples([0, 0, 0], [10_000, 50, 40]),
        });
        // Overrun label must not appear when there is no plan.
        expect(queryByText(/^\+/)).toBeNull();
    });

    it("the plot fits inside the height it was given", async () => {
        const knownHeight = 140;
        // Non-compact: SVG height = height - 32 (two 16-px chrome rows).
        const {getByLabelText: getLabelA} = await draw({height: knownHeight, compact: false});
        const {getByLabelText: getLabelB} = await draw({height: knownHeight, compact: true});

        expect(getLabelA("Brew trace").props.height).toBe(knownHeight - 32);
        expect(getLabelB("Brew trace").props.height).toBe(knownHeight);
    });
});
