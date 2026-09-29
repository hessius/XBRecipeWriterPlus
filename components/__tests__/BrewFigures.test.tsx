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

    it("gives the drawdown its own labelled line", async () => {
        // On its own line rather than as a fourth column, and carrying the
        // word: a second clock beside TIME with no label says nothing about
        // which of the two it is.
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8"
                         drawdown={22} />
        );
        expect(screen.getByText("DRAWDOWN 0:22")).toBeTruthy();
    });

    it("floors the drawdown rather than rounding it up", async () => {
        // A clock that shows 0:23 at 22.6 s is wrong for the same reason TIME
        // is floored. The figure arrives unrounded so that the floor here is
        // the only rounding it meets.
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8"
                         drawdown={22.6} />
        );
        expect(screen.getByText("DRAWDOWN 0:22")).toBeTruthy();
    });

    it("says nothing about a drawdown it has not been given", async () => {
        // A cancelled brew never drew down and an old record cannot say. 0:00
        // for either would invent a figure somebody might dial a grind by.
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8" />
        );
        expect(screen.queryByTestId("figures-drawdown")).toBeNull();
    });

    it("shows no badge without a bypass", async () => {
        await renderWithProviders(
            <BrewFigures water={240} cup={200} seconds={196} accent="#8ab4f8" />
        );
        expect(screen.queryByTestId("figures-bypass")).toBeNull();
    });

    it("shows the live rate with its sparkline", async () => {
        await renderWithProviders(
            <BrewFigures
                water={120} cup={90} seconds={60} accent={TEST_ACCENT}
                flow={2.4} flowTail={[1, 2, 2.4, 2.2]}
            />
        );
        expect(screen.getByTestId("figures-flow")).toBeTruthy();
        expect(screen.getByText("FLOW")).toBeTruthy();
        expect(screen.getByText(/2\.4/)).toBeTruthy();
        expect(screen.getByTestId("flow-sparkline-path", {includeHiddenElements: true}))
            .toBeTruthy();
    });

    it("draws no flow row at all when there is no rate to report", async () => {
        await renderWithProviders(
            <BrewFigures water={0} cup={0} seconds={0} accent={TEST_ACCENT} />
        );
        expect(screen.queryByTestId("figures-flow")).toBeNull();
        expect(screen.queryByTestId("figures-flow-slot")).toBeNull();
    });

    it("draws the row without a sparkline when the tail is too short", async () => {
        await renderWithProviders(
            <BrewFigures
                water={120} cup={90} seconds={60} accent={TEST_ACCENT}
                flow={2.4} flowTail={[]}
            />
        );
        expect(screen.getByTestId("figures-flow")).toBeTruthy();
        expect(screen.queryByTestId("flow-sparkline-path")).toBeNull();
    });

    it("shows the pour rate as the second flow figure", async () => {
        await renderWithProviders(
            <BrewFigures
                water={120} cup={90} seconds={60} accent={TEST_ACCENT}
                flow={2.4} pourRate={3.1}
            />
        );
        expect(screen.getByText("FLOW")).toBeTruthy();
        expect(screen.getByText("2.4 g/s")).toBeTruthy();
        expect(screen.getByText("POUR 3.1")).toBeTruthy();
    });

    it("leaves the pour rate out when only the cup rate is known", async () => {
        await renderWithProviders(
            <BrewFigures
                water={120} cup={90} seconds={60} accent={TEST_ACCENT}
                flow={2.4}
            />
        );
        expect(screen.getByText("FLOW")).toBeTruthy();
        expect(screen.getByText("2.4 g/s")).toBeTruthy();
        expect(screen.queryByText(/^POUR /)).toBeNull();
    });

    it("reserves the flow row height when asked", async () => {
        await renderWithProviders(
            <BrewFigures
                water={120} cup={90} seconds={60} accent={TEST_ACCENT}
                reserveFlow
            />
        );
        expect(screen.getByTestId("figures-flow-slot")).toHaveStyle({minHeight: 24});
        expect(screen.queryByTestId("figures-flow")).toBeNull();
    });

    it("does not reserve the flow row height by default", async () => {
        await renderWithProviders(
            <BrewFigures water={120} cup={90} seconds={60} accent={TEST_ACCENT} />
        );
        expect(screen.queryByTestId("figures-flow-slot")).toBeNull();
    });

    it("puts the average rate on the drawdown line", async () => {
        await renderWithProviders(
            <BrewFigures
                water={240} cup={200} seconds={140} accent={TEST_ACCENT}
                drawdown={40} drawdownRate={2}
            />
        );
        const line = screen.getByTestId("figures-drawdown");
        expect(line).toHaveTextContent("DRAWDOWN 0:40 · 2.0 g/s");
    });

    it("leaves the drawdown line as it was when there is no rate", async () => {
        await renderWithProviders(
            <BrewFigures
                water={240} cup={200} seconds={140} accent={TEST_ACCENT}
                drawdown={40}
            />
        );
        const line = screen.getByTestId("figures-drawdown");
        expect(line).not.toHaveTextContent("g/s");
    });
});

describe("the grind dial", () => {
    it("shows the line the record gave it", async () => {
        await renderWithProviders(
            <BrewFigures water={182} cup={174} seconds={126} accent={TEST_ACCENT}
                         dial="MACHINE DIAL 47" />
        );
        expect(screen.getByTestId("figures-dial")).toHaveTextContent("MACHINE DIAL 47");
    });

    it("draws no line at all for a brew that took no reading", async () => {
        // Absent, never zero. A dial of 0 is not a setting, and printing one
        // would be an invented fact next to three measured ones.
        await renderWithProviders(
            <BrewFigures water={182} cup={174} seconds={126} accent={TEST_ACCENT} />
        );
        expect(screen.queryByTestId("figures-dial")).toBeNull();
    });
});
