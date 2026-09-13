import React from "react";
import {screen} from "@testing-library/react-native";

import BrewBypassRung from "@/components/BrewBypassRung";
import {renderWithProviders} from "@/test-utils/render";

const base = {
    volume: 5,
    temperature: 85,
    delivered: 0,
    state: "pending" as const,
    accent: "#8ab4f8",
    laneSeconds: 60,
    barHeight: 12
};

describe("BrewBypassRung", () => {
    it("says how much bypass is planned before it happens", async () => {
        await renderWithProviders(<BrewBypassRung {...base} />);
        expect(screen.getByText("5 ml")).toBeTruthy();
    });

    it("says it is waiting for the drawdown", async () => {
        await renderWithProviders(<BrewBypassRung {...base} state="waiting" />);
        expect(screen.getByText("WAITING")).toBeTruthy();
    });

    it("reads out what has landed once it is filling", async () => {
        await renderWithProviders(
            <BrewBypassRung {...base} state="filling" delivered={3} />
        );
        expect(screen.getByText("3/5 ml")).toBeTruthy();
    });

    it("draws a dashed lane, the way the editor does", async () => {
        await renderWithProviders(<BrewBypassRung {...base} state="done" delivered={5} />);
        const lane = screen.getByTestId("bypass-rung-lane");
        const style = Array.isArray(lane.props.style)
            ? Object.assign({}, ...lane.props.style)
            : lane.props.style;
        expect(style).toEqual(expect.objectContaining({borderStyle: "dashed"}));
    });

    it("names itself for a screen reader", async () => {
        await renderWithProviders(<BrewBypassRung {...base} state="done" delivered={5} />);
        expect(screen.getByLabelText("Bypass water, 85 degrees, 5 millilitres, delivered"))
            .toBeTruthy();
    });
});
