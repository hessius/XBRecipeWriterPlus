import React from "react";
import {screen} from "@testing-library/react-native";

import OverflowStatus from "@/components/OverflowStatus";
import {
    OVERFLOW_ESTIMATE_NOTE, OVERFLOW_FOREGROUND_CAUTION, OVERFLOW_MANUAL_OVERRIDE
} from "@/constants/brewCopy";
import type {OverflowSnapshot} from "@/library/brew/OverflowController";
import {renderWithProviders} from "@/test-utils/render";

function snap(over: Partial<OverflowSnapshot> = {}): OverflowSnapshot {
    return {
        mode: "armed", retainedGrams: null, nextCheckAt: null, telemetryAvailable: false,
        ...over
    };
}

describe("OverflowStatus", () => {
    it("armed with a reading shows the estimate, the caution and the estimate note", async () => {
        await renderWithProviders(
            <OverflowStatus status={snap({retainedGrams: 41.6, telemetryAvailable: true})} now={0}/>
        );
        expect(screen.getByText("Estimated in the dripper: 42 g")).toBeOnTheScreen();
        expect(screen.getByText(OVERFLOW_FOREGROUND_CAUTION)).toBeOnTheScreen();
        expect(screen.getByText(OVERFLOW_ESTIMATE_NOTE)).toBeOnTheScreen();
    });

    it("armed with no reading says the estimate is unavailable and keeps the caution", async () => {
        await renderWithProviders(<OverflowStatus status={snap()} now={0}/>);
        expect(screen.getByText("Estimated in the dripper: unavailable")).toBeOnTheScreen();
        expect(screen.getByText(OVERFLOW_FOREGROUND_CAUTION)).toBeOnTheScreen();
    });

    it("requesting waits on the machine's confirmation", async () => {
        await renderWithProviders(<OverflowStatus status={snap({mode: "requesting"})} now={0}/>);
        expect(screen.getByText(/Waiting for the machine to confirm/)).toBeOnTheScreen();
    });

    it("holding counts down to the next check, rounded up, never below zero", async () => {
        const status = snap({mode: "holding", nextCheckAt: 10_001, retainedGrams: 60,
                             telemetryAvailable: true});
        const {rerender} = await renderWithProviders(<OverflowStatus status={status} now={0}/>);
        expect(screen.getByText("Paused for the dripper to drain.")).toBeOnTheScreen();
        expect(screen.getByText(/Next check in 11 s/)).toBeOnTheScreen();

        await rerender(<OverflowStatus status={status} now={10_001}/>);
        expect(screen.getByText(/Next check in 0 s/)).toBeOnTheScreen();
        await rerender(<OverflowStatus status={status} now={99_000}/>);
        expect(screen.getByText(/Next check in 0 s/)).toBeOnTheScreen();
    });

    it("holding without telemetry waits for fresh readings and never says the cup is full", async () => {
        await renderWithProviders(
            <OverflowStatus status={snap({mode: "holding", nextCheckAt: 5000})} now={0}/>
        );
        expect(screen.getByText(/Waiting for fresh scale readings/)).toBeOnTheScreen();
        expect(screen.queryByText(/cup is full|cup full/i)).toBeNull();
    });

    it("resuming says so", async () => {
        await renderWithProviders(<OverflowStatus status={snap({mode: "resuming"})} now={0}/>);
        expect(screen.getByText("Resuming the brew.")).toBeOnTheScreen();
    });

    it.each([
        ["background", /left the foreground/],
        ["lostContact", /contact with the machine was lost/],
        ["manualOverride", new RegExp(OVERFLOW_MANUAL_OVERRIDE)]
    ] as const)("disabled for %s names the reason", async (reason, pattern) => {
        await renderWithProviders(
            <OverflowStatus status={snap({mode: "disabled", disabledReason: reason})} now={0}/>
        );
        expect(screen.getByText(pattern)).toBeOnTheScreen();
        expect(screen.queryByText(OVERFLOW_FOREGROUND_CAUTION)).toBeNull();
    });

    it("error shows the controller's own operation error", async () => {
        await renderWithProviders(
            <OverflowStatus status={snap({mode: "error", error: "The machine did not confirm the protection pause."})}
                            now={0}/>
        );
        expect(screen.getByText("The machine did not confirm the protection pause.")).toBeOnTheScreen();
    });

    it("ended draws no active status", async () => {
        await renderWithProviders(<OverflowStatus status={snap({mode: "ended"})} now={0}/>);
        expect(screen.queryByTestId("overflow-status")).toBeNull();
    });

    it("keeps the spoken state in a polite live region apart from the changing figures", async () => {
        await renderWithProviders(
            <OverflowStatus status={snap({mode: "holding", nextCheckAt: 9000, retainedGrams: 50,
                                          telemetryAvailable: true})} now={0}/>
        );
        const live = screen.getByTestId("overflow-status-state");
        expect(live.props.accessibilityLiveRegion).toBe("polite");
        expect(live).toHaveTextContent("Paused for the dripper to drain.");
        expect(live).not.toHaveTextContent(/\d+ s|\d+ g/);

        const figures = screen.getByTestId("overflow-status-figures");
        expect(figures.props.accessibilityLiveRegion).toBeUndefined();
        expect(figures).toHaveTextContent(/Next check in 9 s/);
    });

    it("does not change the live-region text when only the countdown moves", async () => {
        const status = snap({mode: "holding", nextCheckAt: 9000});
        const {rerender} = await renderWithProviders(<OverflowStatus status={status} now={0}/>);
        const before = screen.getByTestId("overflow-status-state").props.children;
        await rerender(<OverflowStatus status={status} now={4000}/>);
        expect(screen.getByTestId("overflow-status-state").props.children).toEqual(before);
    });

    it("compact draws the state line alone", async () => {
        await renderWithProviders(
            <OverflowStatus status={snap({retainedGrams: 10, telemetryAvailable: true})} now={0} compact/>
        );
        expect(screen.getByTestId("overflow-status-state")).toBeOnTheScreen();
        expect(screen.queryByText(OVERFLOW_FOREGROUND_CAUTION)).toBeNull();
        expect(screen.queryByText(OVERFLOW_ESTIMATE_NOTE)).toBeNull();
    });
});
