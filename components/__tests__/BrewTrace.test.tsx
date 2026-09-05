import React from "react";
import {processColor} from "react-native";

import BrewTrace from "@/components/BrewTrace";
import type {BrewSample} from "@/library/brew/BrewRecord";
import Pour from "@/library/Pour";
import {accents, cupLineFor, palette} from "@/constants/colors";

import {renderWithProviders} from "@/test-utils/render";

const TEST_ACCENT = accents.coffee[1];

const pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];
const fourPours = [
    new Pour(1, 40, 93, 40, 0, 0, 20),
    new Pour(2, 60, 92, 40, 0, 0, 0),
    new Pour(3, 50, 92, 40, 0, 0, 0),
    new Pour(4, 50, 92, 40, 0, 0, 0),
];

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
            samples: samples([0, 0, 0], [84_000, 200, 190]),
            plannedSeconds: 70,
        });
        // The overrun label must not appear in compact mode.
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
        // Non-compact: SVG height = height - 30 (legend plus overrun rows).
        const {getByLabelText: getLabelA} = await draw({height: knownHeight, compact: false});
        const {getByLabelText: getLabelB} = await draw({height: knownHeight, compact: true});

        expect(getLabelA("Brew trace").props.height).toBe(knownHeight - 30);
        expect(getLabelB("Brew trace").props.height).toBe(knownHeight);
    });

    it("fuses the dashes when told to", async () => {
        const {getByTestId} = await draw({planDashed: false});
        expect(getByTestId("trace-plan").props.strokeDasharray).toBeUndefined();
    });

    it("draws a travelling head part-way through, and none at the end", async () => {
        const travelling = await draw({planHeadAt: 0.4});
        expect(travelling.getByTestId("trace-head")).toBeTruthy();
        const arrived = await draw({planHeadAt: 1});
        expect(arrived.queryByTestId("trace-head")).toBeNull();
    });

    it("draws the cup line in the accent's derived colour, not in muted", async () => {
        const {getByTestId} = await draw({
            samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
        });

        const cup = getByTestId("trace-cup");
        // react-native-svg processes hex strings through processColor; compare via payload.
        expect(cup.props.stroke).toEqual(
            expect.objectContaining({payload: processColor(cupLineFor(TEST_ACCENT))})
        );
        expect(cup.props.stroke).not.toEqual(
            expect.objectContaining({payload: processColor(palette.muted)})
        );
    });

    it("moves the cup line with the accent", async () => {
        // Sky is the one accent whose complement the amber guard pushes.
        const {getByTestId} = await draw({
            accent: "#9FC3F0",
            samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
        });

        expect(getByTestId("trace-cup").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(cupLineFor("#9FC3F0"))})
        );
    });

    it("draws the cup line in that colour in compact mode too", async () => {
        const {getByTestId} = await draw({
            compact: true,
            height: 80,
            samples: samples([0, 0, 0], [30, 60, 20], [70, 160, 120])
        });

        expect(getByTestId("trace-cup").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(cupLineFor(TEST_ACCENT))})
        );
    });
});

describe("the trace as it was drawn", () => {
    it("fills beneath the water line", async () => {
        const {getByTestId} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 320,
            height: 180,
            plannedSeconds: 80,
        });

        expect(getByTestId("trace-water-fill")).toBeTruthy();
    });

    it("marks where each stage ends", async () => {
        const {getAllByTestId} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 320,
            height: 180,
            plannedSeconds: 80,
        });

        // Three internal boundaries on four stages; the last one is the edge.
        expect(getAllByTestId(/^trace-gridline-/)).toHaveLength(3);
    });

    it("names its three lines in a row beneath the graph", async () => {
        const {getByText} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 320,
            height: 180,
            plannedSeconds: 80,
        });

        expect(getByText("WATER")).toBeTruthy();
        expect(getByText("CUP")).toBeTruthy();
        expect(getByText("PLAN")).toBeTruthy();
    });

    it("draws neither fill nor legend in the bar", async () => {
        const {queryByTestId, queryByText} = await draw({
            pours: fourPours,
            samples: samples([0, 0, 0], [5000, 20, 12]),
            accent: palette.brand,
            width: 86,
            height: 34,
            plannedSeconds: 80,
            compact: true,
        });

        expect(queryByTestId("trace-water-fill")).toBeNull();
        expect(queryByText("WATER")).toBeNull();
    });

    it("does not name a plan line that is not drawn", async () => {
        const {queryByText, getByText} = await draw({
            pours: [],
            samples: [],
            accent: palette.brand,
            width: 300,
            height: 160,
            plannedSeconds: 60,
            planOpacity: 0,
        });

        expect(queryByText("PLAN")).toBeNull();
        expect(getByText("WATER")).toBeTruthy();
    });
});

describe("the travelling head", () => {
    it("sizes its dash along the line, not across the box", async () => {
        // A plan is a staircase, so its length is the width plus its whole
        // rise. The pattern used to be sized in `width`, which is shorter than
        // the line it runs along: it repeated, so a second lit head appeared,
        // and the real one reset before reaching the end.
        const {getByTestId} = await draw({planHeadAt: 0.5, width: 300});
        const dash = getByTestId("trace-head").props.strokeDasharray as string;
        const period = Number(String(dash).trim().split(/[\s,]+/)[1]);

        expect(period).toBeGreaterThan(300);
    });
});
