import React from "react";
import {processColor} from "react-native";

import CompareTrace from "@/components/CompareTrace";
import {cupLineFor} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
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
