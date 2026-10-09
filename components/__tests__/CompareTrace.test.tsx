import React from "react";
import {processColor} from "react-native";

import CompareTrace, {compareTracePlotHeight} from "@/components/CompareTrace";
import {LEGEND_SIZE, rowHeight} from "@/components/TraceLegendItem";
import {cupLineFor} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {toPath} from "@/library/brew/brewShape";
import type {PauseInterval} from "@/library/brew/pauseIntervals";
import {referenceCupColour, referenceWaterColour} from "@/library/brew/traceStyle";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = "#C86A3B";

function stream(...rows: [number, number, number][]): BrewSample[] {
    return rows.map(([at, water, cup]) => ({at: at * 1000, water, cup, pour: 1}));
}

const A = stream([0, 0, 0], [15, 120, 90], [30, 250, 235]);
const B = stream([0, 0, 0], [15, 120, 60], [30, 250, 228]);

async function draw(over: Partial<React.ComponentProps<typeof CompareTrace>> = {}) {
    return renderWithProviders(
        <CompareTrace
            subject={A} reference={B} accent={ACCENT}
            verdict="same" width={300} height={160} maxT={30} maxV={260}
            {...over}
        />
    );
}

describe("CompareTrace", () => {
    const pause: PauseInterval[] = [{from: 2000, to: 8000, pour: 1, reason: "overflow"}];
    const paused = stream([0, 0, 0], [2, 20, 20], [8, 80, 80], [10, 100, 100]);
    const continuous = stream([0, 0, 0], [10, 100, 50]);

    it.each(["subject", "reference"] as const)(
        "splits each %s channel and closes gap polygons only over observed overlap",
        async (lane) => {
            const box = {width: 300, height: compareTracePlotHeight(160), maxT: 10, maxV: 100};
            const extras = lane === "subject"
                ? {subjectPauses: pause} : {referencePauses: pause};
            const {getByTestId} = await draw({
                subject: lane === "subject" ? paused : continuous,
                reference: lane === "reference" ? paused : continuous,
                verdict: "differed", maxT: 10, maxV: 100, ...extras
            });
            const expected = [
                [{t: 0, v: 0}, {t: 2, v: 20}],
                [{t: 8, v: 80}, {t: 10, v: 100}]
            ].map((run) => toPath(run, box)).join(" ");
            expect(getByTestId(`trace-water-${lane}`).props.d).toBe(expected);
            expect(getByTestId(`trace-cup-${lane}`).props.d).toBe(expected);
            const polygons = [
                [{t: 0, v: 0}, {t: 2, v: 20}, {t: 2, v: 10}, {t: 0, v: 0}],
                [{t: 8, v: 80}, {t: 10, v: 100}, {t: 10, v: 50}, {t: 8, v: 40}]
            ];
            if (lane === "reference") polygons.forEach((polygon) => polygon.reverse());
            expect(getByTestId("trace-cup-gap").props.d)
                .toBe(polygons.map((polygon) => `${toPath(polygon, box)} Z`).join(" "));
        }
    );

    it("marks lane ownership and reasons inside the shared plot without adding a legend row",
        async () => {
            const extras: Partial<React.ComponentProps<typeof CompareTrace>> = {
                subjectPauses: pause,
                referencePauses: [{from: 4000, to: 9000, pour: 1, reason: "manual"}]
            };
            const {getByTestId, getByLabelText} = await draw({
                maxT: 10, ...extras
            });
            const subject = getByTestId("trace-pause-subject-overflow-0");
            const reference = getByTestId("trace-pause-reference-manual-0");
            expect(subject.props).toMatchObject({x: 60, width: 180, y: 0,
                height: compareTracePlotHeight(160)});
            expect(reference.props).toMatchObject({x: 120, width: 150});
            expect(subject.props.fill).toEqual(expect.objectContaining({payload: processColor(ACCENT)}));
            expect(reference.props.fill).toEqual(expect.objectContaining({
                payload: processColor(referenceWaterColour)
            }));
            expect(getByLabelText("This brew: paused for overflow 6 seconds")).toBeTruthy();
            expect(getByLabelText("That brew: paused by you 5 seconds")).toBeTruthy();
            expect(getByTestId("compare-trace-plot").props.accessibilityLabel)
                .toContain("This brew: paused for overflow 6 seconds");
            expect(getByTestId("compare-trace-plot").props.accessibilityLabel)
                .toContain("That brew: paused by you 5 seconds");
            expect(getByTestId("compare-trace-plot").props.height).toBe(compareTracePlotHeight(160));
        }
    );

    it("ignores pause marks on a missing lane", async () => {
        const extras = {referencePauses: pause};
        const {queryByTestId} = await draw({reference: [], ...extras});
        expect(queryByTestId("trace-pause-reference-overflow-0")).toBeNull();
    });

    it("does not call one continuous water line BOTH when the other brew has an observed gap",
        async () => {
            const extras = {referencePauses: pause};
            const {getByTestId, getByText} = await draw({
                subject: continuous, reference: paused, verdict: "same",
                maxT: 10, maxV: 100, ...extras
            });
            expect(getByTestId("trace-water-reference").props.d.split("M")).toHaveLength(3);
            expect(getByText("WATER, THIS")).toBeTruthy();
            expect(getByText("WATER, THAT")).toBeTruthy();
            expect(getByTestId("compare-trace-plot").props.accessibilityLabel)
                .toContain("Water matched, but observed gaps require separate water lines.");
        }
    );

    it("preserves manual lines and real cup and water samples inside an automatic pause",
        async () => {
            const subject = stream([0, 0, 0], [2, 20, 10], [5, 30, 40], [8, 80, 60], [10, 100, 90]);
            const box = {width: 300, height: compareTracePlotHeight(160), maxT: 10, maxV: 100};
            const extras = {
                subjectPauses: pause,
                referencePauses: [{...pause[0], reason: "manual" as const}]
            };
            const {getByTestId} = await draw({
                subject, reference: continuous, verdict: "differed", maxT: 10, maxV: 100, ...extras
            });
            expect(getByTestId("trace-water-subject").props.d).toBe(toPath(
                subject.map((sample) => ({t: sample.at / 1000, v: sample.water})), box
            ));
            expect(getByTestId("trace-cup-subject").props.d).toBe(toPath(
                subject.map((sample) => ({t: sample.at / 1000, v: sample.cup})), box
            ));
            expect(getByTestId("trace-water-reference").props.d)
                .toBe(toPath([{t: 0, v: 0}, {t: 10, v: 100}], box));
            expect(getByTestId("trace-cup-gap").props.d.match(/M/g)).toHaveLength(1);
        }
    );

    it("draws the water once when both brews poured the same", async () => {
        const {getByTestId, queryByTestId} = await draw({verdict: "same"});
        expect(getByTestId("trace-water-subject")).toBeTruthy();
        expect(queryByTestId("trace-water-reference")).toBeNull();
    });

    it("says BOTH of the one water line, so it is not read as one brew's", async () => {
        const {getByText} = await draw({verdict: "same"});
        expect(getByText("WATER, BOTH")).toBeTruthy();
    });

    it("draws both water lines once the pours differed", async () => {
        const {getByTestId} = await draw({verdict: "differed"});
        expect(getByTestId("trace-water-subject")).toBeTruthy();
        expect(getByTestId("trace-water-reference")).toBeTruthy();
    });

    it("always draws both cups, because the cup is the comparison", async () => {
        const {getByTestId} = await draw({verdict: "same"});
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(getByTestId("trace-cup-reference")).toBeTruthy();
    });

    it("greys the reference and colours the subject", async () => {
        const {getByTestId} = await draw({verdict: "differed"});
        expect(getByTestId("trace-water-reference").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(referenceWaterColour)})
        );
        expect(getByTestId("trace-cup-reference").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(referenceCupColour)})
        );
        expect(getByTestId("trace-cup-subject").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(cupLineFor(ACCENT))})
        );
    });

    it("shades the gap between the two cups", async () => {
        const {getByTestId} = await draw();
        const band = getByTestId("trace-cup-gap").props.d as string;
        expect(band.startsWith("M")).toBe(true);
        expect(band.endsWith("Z")).toBe(true);
        expect(band).not.toContain("NaN");
    });

    it("draws nothing where a brew has no stream", async () => {
        const {queryByTestId} = await draw({reference: []});
        expect(queryByTestId("trace-cup-reference")).toBeNull();
        expect(queryByTestId("trace-cup-gap")).toBeNull();
        expect(queryByTestId("trace-cup-subject")).toBeTruthy();
    });

    it("uses the surviving reference water as the shared water line", async () => {
        const {getByTestId, queryByTestId, getByText} =
            await draw({subject: [], reference: B, verdict: "same"});
        expect(queryByTestId("trace-water-subject")).toBeNull();
        expect(getByTestId("trace-water-reference")).toBeTruthy();
        expect(getByText("WATER, BOTH")).toBeTruthy();
    });

    it("says only the surviving water line was drawn when this trace expired", async () => {
        const {getByLabelText} = await draw({subject: [], reference: B, verdict: "differed"});
        expect(getByLabelText(
            "Brew comparison. This brew is coloured and that brew is grey. "
            + "Cup difference is not drawn because a trace is missing. "
            + "Only that brew's water could be drawn because this trace is missing."
        )).toBeTruthy();
    });

    // A fixed height and flexWrap together are a trap: the wrapped rows have
    // nowhere to go and spill over whatever follows. The legend is left unsized
    // so it may grow, and the plot spends only the one row it usually needs.
    it("lets a six item legend wrap rather than sizing it to one row", async () => {
        const height = 160;
        const {getByTestId} = await draw({
            verdict: "differed",
            height,
            subjectPlan: "M0 100 L300 0",
            referencePlan: "M0 100 L300 20"
        });

        expect(getByTestId("compare-legend-row").props.height).toBeUndefined();
        expect(compareTracePlotHeight(height)).toBe(height - rowHeight(LEGEND_SIZE));
        expect(getByTestId("compare-trace-plot").props.height)
            .toBe(compareTracePlotHeight(height));
    });

    it("draws one faint plan, or two when the plans differ in shape", async () => {
        const plan = "M0 100 L300 0";
        const one = await draw({subjectPlan: plan});
        expect(one.getByTestId("trace-plan-subject").props.strokeOpacity)
            .toBeLessThan(1);
        expect(one.queryByTestId("trace-plan-reference")).toBeNull();

        const two = await draw({subjectPlan: plan, referencePlan: "M0 100 L300 20"});
        expect(two.getByTestId("trace-plan-reference")).toBeTruthy();
    });

    it("does not claim a legend entry for a line it did not draw", async () => {
        const {queryByText} = await draw({subject: [], reference: [], verdict: "same"});
        expect(queryByText("WATER, BOTH")).toBeNull();
        expect(queryByText("CUP, THIS")).toBeNull();
        expect(queryByText("CUP, THAT")).toBeNull();
    });

    it("labels a reference-only plan", async () => {
        const {getByText, getByTestId} = await draw({referencePlan: "M0 100 L300 20"});
        expect(getByTestId("trace-plan-reference")).toBeTruthy();
        expect(getByText("PLAN")).toBeTruthy();
    });

    it("says which brew is coloured, which is grey, and how far the cups differed", async () => {
        const {getByLabelText} = await draw();
        expect(getByLabelText(
            "Brew comparison. This brew is coloured and that brew is grey. "
            + "Cups finished 7 g apart. Water matched, so one coloured water line "
            + "stands for both brews."
        )).toBeTruthy();
    });
});
