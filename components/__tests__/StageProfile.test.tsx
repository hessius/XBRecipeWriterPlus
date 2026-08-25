import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import StageProfile, {bandFor, curveHeight, profileScale, targetY} from "@/components/StageProfile";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pours(...volumes: number[]): Pour[] {
    return volumes.map((volume, index) => new Pour(index, volume));
}

describe("profileScale", () => {
    it("is whichever of the two totals is larger", () => {
        expect(profileScale(288, 288)).toBe(288);
        expect(profileScale(288, 324)).toBe(324);
        expect(profileScale(300, 288)).toBe(300);
    });

    it("never divides by zero", () => {
        expect(profileScale(0, 0)).toBe(1);
    });
});

describe("curveHeight", () => {
    it("fills the box when the stages reach the target", () => {
        expect(curveHeight(288, 288, 100)).toBe(100);
    });

    it("falls short in proportion when they do not", () => {
        expect(curveHeight(162, 324, 100)).toBe(50);
    });

    it("fills the box when the stages overshoot", () => {
        expect(curveHeight(324, 288, 100)).toBe(100);
    });
});

describe("targetY", () => {
    it("sits on the plateau when the stages balance", () => {
        expect(targetY(288, 288, 100)).toBe(0);
    });

    it("sits above the plateau when the stages fall short", () => {
        expect(targetY(162, 324, 100)).toBe(0);
        expect(curveHeight(162, 324, 100)).toBe(50);
    });

    it("sits below the top when the stages overshoot", () => {
        expect(targetY(324, 288, 100)).toBeCloseTo(11.11, 1);
    });
});

describe("bandFor", () => {
    it("splits the width evenly", () => {
        expect(bandFor(0, 4, 400)).toEqual({x: 0, width: 100});
        expect(bandFor(3, 4, 400)).toEqual({x: 300, width: 100});
    });
});

describe("StageProfile", () => {
    it("draws a target line", async () => {
        await renderWithProviders(
            <StageProfile pours={pours(96, 96, 96)} target={288} accent="#F0B98E"
                          width={300} height={90}/>
        );

        expect(screen.getByTestId("stage-profile-target")).toBeTruthy();
    });

    it("hatches the gap only when the stages fall short", async () => {
        const {rerender} = await renderWithProviders(
            <StageProfile pours={pours(96, 96, 96)} target={288} accent="#F0B98E"
                          width={300} height={90}/>
        );

        expect(screen.queryByTestId("stage-profile-shortfall")).toBeNull();

        await rerender(
            <StageProfile pours={pours(96, 96, 96)} target={324} accent="#F0B98E"
                          width={300} height={90}/>
        );

        expect(screen.getByTestId("stage-profile-shortfall")).toBeTruthy();
    });

    it("marks the selected stage's band", async () => {
        await renderWithProviders(
            <StageProfile pours={pours(96, 96, 96)} target={288} accent="#F0B98E"
                          width={300} height={90} selected={1}/>
        );

        const band = screen.getByTestId("stage-profile-band");
        expect(band.props.x).toBe(100);
        expect(band.props.width).toBe(100);
    });

    it("draws no band when nothing is selected", async () => {
        await renderWithProviders(
            <StageProfile pours={pours(96, 96, 96)} target={288} accent="#F0B98E"
                          width={300} height={90}/>
        );

        expect(screen.queryByTestId("stage-profile-band")).toBeNull();
    });

    it("offers a way into each stage when it is given one", async () => {
        // The curve is the thing being read, so it is the thing reached for.
        // It was inert for a round of device testing and that was the note.
        const onSelect = jest.fn();
        await renderWithProviders(
            <StageProfile pours={pours(96, 96, 96)} target={288} accent="#F0B98E"
                          width={300} height={90} onSelect={onSelect}/>
        );

        await fireEvent.press(screen.getByLabelText("Show stage 2 of 3"));

        expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("stays a readout when it is not given one", async () => {
        // Every other screen that draws a profile has no stage list to move.
        await renderWithProviders(
            <StageProfile pours={pours(96, 96, 96)} target={288} accent="#F0B98E"
                          width={300} height={90}/>
        );

        expect(screen.queryByLabelText("Show stage 2 of 3")).toBeNull();
    });
});
