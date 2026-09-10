import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {processColor, StyleSheet} from "react-native";

import BrewTrace from "@/components/BrewTrace";
import {drawnFontSize} from "@/components/DotMatrixText";
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

    it("gives the overrun label a row tall enough to hold it", async () => {
        // A 16 pt row cropped the descenders off "+96 S" on a real brew. Doto's
        // line box is about 1.35em, so twelve-point text needs seventeen — and
        // more again for a user with text sizing turned up, which is why the
        // row measures the size the glyphs are *drawn* at rather than the size
        // it asked for.
        const {getByTestId} = await draw({samples: samples([0, 0, 0], [84_000, 200, 190])});
        const row = StyleSheet.flatten(getByTestId("trace-overrun-row").props.style);
        expect(row.height).toBeGreaterThanOrEqual(drawnFontSize(12) * 1.35);
    });

    it("gives the legend a row tall enough to hold it", async () => {
        // The legend asks for nine point, but DotMatrixText will not draw Doto
        // below eleven, so a row sized from the nine crops it.
        const {getByTestId} = await draw({});
        const row = StyleSheet.flatten(getByTestId("trace-legend-row").props.style);
        expect(row.height).toBeGreaterThanOrEqual(drawnFontSize(9) * 1.35);
    });

    it("the plot fits inside the height it was given", async () => {
        const knownHeight = 140;
        // Non-compact, the legend and overrun rows take their height first.
        // Not pinned to a literal: both rows scale with the OS text size, and
        // jest-expo does not run at the device default.
        const chrome = Math.ceil(drawnFontSize(12) * 1.35)
                     + Math.ceil(drawnFontSize(9) * 1.35);
        const {getByLabelText: getLabelA} = await draw({height: knownHeight, compact: false});
        const {getByLabelText: getLabelB} = await draw({height: knownHeight, compact: true});

        expect(getLabelA("Brew trace").props.height).toBe(knownHeight - chrome);
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

describe("BrewTrace's stage selection", () => {
    it("stays inert for a caller that passes no handler", async () => {
        // The live screen and the export both draw this component and neither
        // has a panel to answer a tap with, so neither may get a tap target.
        const {queryByTestId} = await draw({selectedIndex: null});
        expect(queryByTestId("trace-tap")).toBeNull();
        expect(queryByTestId("trace-band")).toBeNull();
    });

    it("shades the selected stage across its own share of the axis", async () => {
        // Stage one is 40 ml at 4 ml/s = 10 s, then a 20 s rest: 0-30 s of a
        // 70 s axis on a 300 pt chart. So x = 0 and width = 300 * 30/70.
        const {getByTestId} = await draw({selectedIndex: 0, onSelectStage: jest.fn()});
        const band = getByTestId("trace-band");
        expect(band.props.x).toBe(0);
        expect(band.props.width).toBeCloseTo(128.57, 1);
    });

    it("shades a later stage away from the left edge", async () => {
        // Stage two starts at 30 s: 300 * 30/70 across.
        const {getByTestId} = await draw({selectedIndex: 1, onSelectStage: jest.fn()});
        expect(getByTestId("trace-band").props.x).toBeCloseTo(128.57, 1);
    });

    it("names the stage under the finger, not the one under the plan", async () => {
        // The run overran: stage one really ended at 50 s, not the planned 30.
        // A tap at 40 s belongs to stage one, and resolving against the plan
        // would blame stage two — the overrun being the very thing a user taps
        // a late stage to ask about.
        const onSelectStage = jest.fn();
        const {getByTestId} = await draw({
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 50_000, water: 40, cup: 30, pour: 1},
                {at: 51_000, water: 41, cup: 31, pour: 2},
                {at: 90_000, water: 200, cup: 190, pour: 2}
            ],
            onSelectStage
        });
        // The axis now runs to 90 s, so 60 s is 300 * 60/90 = 200 pt across and
        // lands in stage two. Read against the 70 s plan the same 200 pt would
        // be 46.7 s, still inside stage one — so the two axes genuinely differ
        // here, which a tap earlier in the chart would not have shown.
        fireEvent.press(getByTestId("trace-tap"), {nativeEvent: {locationX: 200}});
        expect(onSelectStage).toHaveBeenCalledWith(1);
    });

    it("shades where the stage really ran, not where it was meant to", async () => {
        // Same overrun: stage one was planned to end at 30 s but ran to 50.
        // On the 90 s axis of a 300 pt chart that is 300 * 50/90 = 166.7 pt of
        // shading, against the 100 pt the plan alone would have given.
        const {getByTestId} = await draw({
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 50_000, water: 40, cup: 30, pour: 1},
                {at: 51_000, water: 41, cup: 31, pour: 2},
                {at: 90_000, water: 200, cup: 190, pour: 2}
            ],
            selectedIndex: 0,
            onSelectStage: jest.fn()
        });
        expect(getByTestId("trace-band").props.width).toBeCloseTo(166.67, 1);
    });

    it("names the last stage for a tap out in the overrun", async () => {
        const onSelectStage = jest.fn();
        const {getByTestId} = await draw({
            samples: [
                {at: 0, water: 0, cup: 0, pour: 1},
                {at: 20_000, water: 40, cup: 30, pour: 2}
            ],
            onSelectStage
        });
        fireEvent.press(getByTestId("trace-tap"), {nativeEvent: {locationX: 299}});
        expect(onSelectStage).toHaveBeenCalledWith(1);
    });
});

const traceProps = {
    pours,
    samples: [] as BrewSample[],
    accent: TEST_ACCENT,
    width: 300,
    height: 140,
    plannedSeconds: 70,
};

describe("the bypass box", () => {
    it("draws a dashed box above the target for a bypass", async () => {
        await renderWithProviders(
            <BrewTrace
                {...traceProps}
                bypass={{volume: 5, temperature: 85, delivered: 5,
                         startedAt: 120, state: "done"}}
            />
        );
        const box = screen.getByTestId("trace-bypass");
        expect(box.props.fill).toBeNull();  // react-native-svg processes "none" → null
        expect(box.props.strokeDasharray).toEqual(["4", "4"]);
    });

    it("draws no box when there is no bypass", async () => {
        await renderWithProviders(<BrewTrace {...traceProps} />);
        expect(screen.queryByTestId("trace-bypass")).toBeNull();
    });

    it("slides the box to now while the machine is still waiting", async () => {
        // startedAt null and the run already past its plan: the box has no real
        // time to sit at, so it tracks the right-hand edge rather than pinning
        // itself to a plan time that has already gone by.
        await renderWithProviders(
            <BrewTrace
                {...traceProps}
                plannedSeconds={100}
                samples={[{at: 160_000, water: 240, cup: 200, pour: 3}]}
                bypass={{volume: 5, temperature: 85, delivered: 0,
                         startedAt: null, state: "waiting"}}
            />
        );
        const box = screen.getByTestId("trace-bypass");
        const pinned = Number(box.props.x);
        expect(pinned).toBeGreaterThan(0);
    });
});
