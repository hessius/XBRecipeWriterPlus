import React from "react";
import {screen} from "@testing-library/react-native";

import BrewFigures from "@/components/BrewFigures";
import {accents} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const TEST_ACCENT = accents.coffee[1];

describe("BrewFigures", () => {
    it("shows water, cup and time", async () => {
        const {getByText} = await renderWithProviders(
            <BrewFigures water={182} cup={174} seconds={126} accent={TEST_ACCENT} />
        );
        expect(getByText("182")).toBeTruthy();
        expect(getByText("174")).toBeTruthy();
        expect(getByText("2:06")).toBeTruthy();
    });

    it("labels each figure", async () => {
        const {getByText} = await renderWithProviders(
            <BrewFigures water={0} cup={0} seconds={0} accent={TEST_ACCENT} />
        );
        ["WATER", "CUP", "TIME"].forEach((label) => expect(getByText(label)).toBeTruthy());
    });

    it("rounds to whole units", async () => {
        // The scale reports tenths and they flicker. A readout that changes
        // every 100 ms is unreadable at this size.
        const {getByText} = await renderWithProviders(
            <BrewFigures water={182.4} cup={173.6} seconds={5.9} accent={TEST_ACCENT} />
        );
        expect(getByText("182")).toBeTruthy();
        expect(getByText("174")).toBeTruthy();
        expect(getByText("0:05")).toBeTruthy();
    });

    it("pads the seconds", async () => {
        const {getByText} = await renderWithProviders(
            <BrewFigures water={0} cup={0} seconds={65} accent={TEST_ACCENT} />
        );
        expect(getByText("1:05")).toBeTruthy();
    });

    it("breaks the bypass out beside the water, rather than folding it in", async () => {
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8" bypass={5} />
        );
        expect(screen.getByText("240")).toBeTruthy();
        expect(screen.getByText("+5")).toBeTruthy();
    });

    it("shows no badge without a bypass", async () => {
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8" />
        );
        expect(screen.queryByTestId("figures-bypass")).toBeNull();
    });
});
