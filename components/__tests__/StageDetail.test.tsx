import {fireEvent} from "@testing-library/react-native";
import React from "react";
import {StyleSheet} from "react-native";

import StageDetail from "@/components/StageDetail";
import {
    AGITATION_SENTENCE,
    STAGE_NO_HOLD,
    STAGE_POURED_IN_FULL,
    STAGE_SHORT_CANCELLED,
    STAGE_SHORT_UNDERDELIVERED,
    STAGE_TIMING_UNAVAILABLE
} from "@/constants/brewCopy";
import {accents, palette} from "@/constants/colors";
import type {BrewOutcome, BrewSample} from "@/library/brew/BrewRecord";
import type {Stall} from "@/library/brew/stalls";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = accents.coffee[1];

function stage(
    volume: number,
    {temperature = 92, pattern = POUR_PATTERN.CENTERED, agitation = AGITATION.ALL_OFF} = {}
): Pour {
    return new Pour(1, volume, temperature, 32, agitation, pattern, 0);
}

function sample(seconds: number, water: number, pour: number): BrewSample {
    return {at: seconds * 1000, water, cup: water * 0.9, pour};
}

type Overrides = {
    index?: number;
    stage?: Pour;
    deliveredMl?: number;
    stalls?: Stall[];
    samples?: BrewSample[];
    hasStream?: boolean;
    outcome?: BrewOutcome;
    onClose?: () => void;
};

function renderPanel(over: Overrides = {}) {
    return renderWithProviders(
        <StageDetail
            index={over.index ?? 0}
            stage={over.stage ?? stage(45)}
            deliveredMl={over.deliveredMl ?? 45}
            stalls={over.stalls ?? []}
            samples={over.samples ?? []}
            hasStream={over.hasStream ?? false}
            outcome={over.outcome ?? "done"}
            accent={ACCENT}
            onClose={over.onClose ?? (() => {})}
        />
    );
}

describe("StageDetail", () => {
    it("renders under the contract testID", async () => {
        const {getByTestId} = await renderPanel();
        expect(getByTestId("stage-detail")).toBeTruthy();
    });

    it("heads with the one-based stage number", async () => {
        const {getByText} = await renderPanel({index: 2});
        expect(getByText("STAGE 3")).toBeTruthy();
    });

    describe("asked for", () => {
        it("shows the planned volume and temperature", async () => {
            const {getByText} = await renderPanel({
                stage: stage(48, {temperature: 94})
            });
            expect(getByText("48 ML · 94°")).toBeTruthy();
        });

        it("describes the pour pattern in prose", async () => {
            const {getByText} = await renderPanel({
                stage: stage(45, {pattern: POUR_PATTERN.SPIRAL})
            });
            expect(getByText("Spiral pour.")).toBeTruthy();
        });

        it("appends the stirring only when the stage stirs", async () => {
            const {getByText, queryByText} = await renderPanel({
                stage: stage(45, {
                    pattern: POUR_PATTERN.CENTERED,
                    agitation: AGITATION.BEFORE_ON_AFTER_OFF
                })
            });
            expect(getByText(
                `Centre pour. ${AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_OFF]}`
            )).toBeTruthy();
            expect(queryByText("Centre pour.")).toBeNull();
        });

        it("says nothing about stirring for a stage that does not stir", async () => {
            const {getByText} = await renderPanel({
                stage: stage(45, {agitation: AGITATION.ALL_OFF})
            });
            expect(getByText("Centre pour.")).toBeTruthy();
        });
    });

    describe("delivered", () => {
        it("shows delivered against planned", async () => {
            const {getByText} = await renderPanel({
                stage: stage(45), deliveredMl: 45
            });
            expect(getByText("45 ML OF 45")).toBeTruthy();
            expect(getByText(STAGE_POURED_IN_FULL)).toBeTruthy();
        });

        it("rounds a scale-precise delivered volume", async () => {
            const {getByText} = await renderPanel({
                stage: stage(45), deliveredMl: 44.6
            });
            expect(getByText("45 ML OF 45")).toBeTruthy();
        });

        it("names the shortfall when a stage stops short", async () => {
            const {getByText, getByTestId} = await renderPanel({
                stage: stage(45), deliveredMl: 30, outcome: "endedOnMachine"
            });
            expect(getByText("STOPPED 15 ML SHORT")).toBeTruthy();
            expect(getByText(STAGE_SHORT_UNDERDELIVERED)).toBeTruthy();
            const style = StyleSheet.flatten(getByTestId("stage-detail-short").props.style);
            expect(style.color).toBe(palette.warn);
        });

        it("blames a cancel when the whole brew was stopped", async () => {
            const {getByText, queryByText} = await renderPanel({
                stage: stage(45), deliveredMl: 30, outcome: "cancelled"
            });
            expect(getByText(STAGE_SHORT_CANCELLED)).toBeTruthy();
            expect(queryByText(STAGE_SHORT_UNDERDELIVERED)).toBeNull();
        });
    });

    describe("holds", () => {
        it("lists each hold and totals them", async () => {
            const {getByText} = await renderPanel({
                stalls: [{atMl: 12, seconds: 4}, {atMl: 30, seconds: 2.5}]
            });
            expect(getByText("4 S AT 12 ML")).toBeTruthy();
            expect(getByText("2.5 S AT 30 ML")).toBeTruthy();
            expect(getByText("6.5 S HELD IN TOTAL")).toBeTruthy();
        });

        it("says the water never stopped when there were no holds", async () => {
            const {getByText, queryByTestId} = await renderPanel({stalls: []});
            expect(getByText(STAGE_NO_HOLD)).toBeTruthy();
            expect(queryByTestId("stage-detail-held-total")).toBeNull();
        });
    });

    describe("when", () => {
        it("shows the stage's own start and end in seconds", async () => {
            const samples = [
                sample(0, 0, 1), sample(10, 40, 1),
                sample(15, 55, 2), sample(28, 90, 2)
            ];
            const {getByText} = await renderPanel({
                index: 1, stage: stage(50), deliveredMl: 50,
                samples, hasStream: true
            });
            expect(getByText("15 S – 28 S")).toBeTruthy();
        });

        it("says timing is unavailable when the stream was swept", async () => {
            const {getByText, queryByTestId} = await renderPanel({hasStream: false});
            expect(getByText(STAGE_TIMING_UNAVAILABLE)).toBeTruthy();
            expect(queryByTestId("stage-detail-when")).toBeNull();
        });
    });

    it("dismisses when close is pressed", async () => {
        const onClose = jest.fn();
        const {getByTestId} = await renderPanel({onClose});
        await fireEvent.press(getByTestId("stage-detail-close"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
