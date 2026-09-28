import React from "react";
import {processColor} from "react-native";

import CompareTrace from "@/components/CompareTrace";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {referenceCupColour} from "@/library/brew/traceStyle";
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
        const {getByTestId} = await draw();
        expect(getByTestId("trace-cup-reference").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(referenceCupColour)})
        );
        expect(getByTestId("trace-cup-subject").props.stroke).not.toEqual(
            expect.objectContaining({payload: processColor(referenceCupColour)})
        );
    });

    it("shades the gap between the two cups", async () => {
        const {getByTestId} = await draw();
        const band = getByTestId("trace-cup-gap").props.d as string;
        expect(band.startsWith("M")).toBe(true);
        expect(band.endsWith("Z")).toBe(true);
    });

    it("draws nothing where a brew has no stream", async () => {
        const {queryByTestId} = await draw({reference: []});
        expect(queryByTestId("trace-cup-reference")).toBeNull();
        expect(queryByTestId("trace-cup-gap")).toBeNull();
        expect(queryByTestId("trace-cup-subject")).toBeTruthy();
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

    it("keeps the amber of a held brew out of it", async () => {
        // `holding` is a live-brew idea. A finished record never holds, and a
        // comparison is always of finished records.
        const {getByTestId} = await draw({verdict: "differed"});
        expect(getByTestId("trace-water-subject").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(ACCENT)})
        );
        expect(getByTestId("trace-water-subject").props.stroke).not.toEqual(
            expect.objectContaining({payload: processColor(palette.warn)})
        );
    });
});
