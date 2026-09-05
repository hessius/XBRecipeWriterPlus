import React from "react";
import {StyleSheet} from "react-native";
import {fireEvent} from "@testing-library/react-native";

import MachinePanel from "@/components/MachinePanel";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const vitals = {waterEnough: true, mode: "PRO" as const, grindSize: 62, askedAt: 0};
const someVitals = {waterEnough: true, mode: "PRO" as const, grindSize: 62, askedAt: 1000};

async function draw(props: Partial<React.ComponentProps<typeof MachinePanel>> = {}) {
    return renderWithProviders(
        <MachinePanel
            open
            status="connected"
            accent="#C86A3B"
            vitals={vitals}
            now={4 * 60 * 1000}
            onRefreshWater={jest.fn()}
            onConnect={jest.fn()}
            onClose={jest.fn()}
            {...props}
        />
    );
}

describe("MachinePanel", () => {
    it("shows water, mode and grind size", async () => {
        const {getByText} = await draw();
        expect(getByText("WATER")).toBeTruthy();
        expect(getByText("PRO")).toBeTruthy();
        expect(getByText("62")).toBeTruthy();
    });

    it("draws EASY in warn, because it will refuse a brew", async () => {
        // DotMatrixText puts color in style[0], not as a direct prop.
        const {getByText} = await draw({vitals: {...vitals, mode: "EASY"}});
        const styleArr = getByText("EASY").props.style as {color?: string}[];
        expect(styleArr[0]?.color).toBe(palette.warn);
    });

    it("ages the water reading", async () => {
        const {getByText} = await draw();
        expect(getByText("4 MIN AGO")).toBeTruthy();
    });

    it("offers a refresh button with the readings label", async () => {
        const {getByTestId, getByLabelText} = await draw();
        expect(getByTestId("machine-refresh")).toBeTruthy();
        expect(getByLabelText("Refresh the machine readings")).toBeTruthy();
    });

    it("warns when the tank is low, and says what to do", async () => {
        const {getByText} = await draw({vitals: {...vitals, waterEnough: false}});
        expect(getByText("FILL THE TANK, THEN REFRESH")).toBeTruthy();
    });

    it("offers TRY NOW only when the machine is out of range", async () => {
        const connected = await draw();
        expect(connected.queryByLabelText("Try now")).toBeNull();
        const away = await draw({status: "disconnected", vitals: null});
        expect(away.getByLabelText("Try now")).toBeTruthy();
    });

    it("says it will reconnect by itself", async () => {
        const {getByText} = await draw({status: "disconnected", vitals: null});
        expect(getByText(/reconnect by itself/i)).toBeTruthy();
    });

    it("shows last-seen age when the machine has gone away but had answered (task 2)", async () => {
        // This branch was previously unreachable because the disconnect handler
        // cleared vitals to null — the same code path that made the "last seen"
        // copy unrenderable.  With vitals preserved on disconnect, the age can
        // now appear.
        const {getByText, queryByText} = await draw({
            status: "disconnected",
            vitals:  {...vitals, askedAt: 5 * 60 * 1000},
            now:     10 * 60 * 1000
        });
        expect(getByText(/last seen/i)).toBeTruthy();
        expect(getByText(/5 min ago/i)).toBeTruthy();
        // The full vitals panel must not appear — the machine is away.
        expect(queryByText("WATER")).toBeNull();
    });

    it("has no machine settings button", async () => {
        const {queryByLabelText} = await draw();
        expect(queryByLabelText(/machine settings/i)).toBeNull();
    });

    it("shows nothing when closed", async () => {
        const {queryByText} = await draw({open: false});
        expect(queryByText("WATER")).toBeNull();
        expect(queryByText("OK")).toBeNull();
    });

    it("shows content when open", async () => {
        const {getByText} = await draw({open: true});
        expect(getByText("WATER")).toBeTruthy();
    });

    it("shows nothing but the state while connecting", async () => {
        const {queryByText} = await draw({status: "connecting", vitals: null});
        expect(queryByText("WATER")).toBeNull();
    });

    it("offers a refresh button, not a twelve-point icon", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        const button = r.getByTestId("machine-refresh");
        expect(button.props.accessibilityRole).toBe("button");
        const style = StyleSheet.flatten(button.props.style) as {minHeight?: number};
        expect(style.minHeight).toBeGreaterThanOrEqual(44);
    });

    it("says REFRESH when it is not doing anything", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        expect(r.getByTestId("machine-refresh-label").props.children).toBe("REFRESH");
    });

    it("says so while it is asking", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        await fireEvent.press(r.getByTestId("machine-refresh"));

        expect(r.getByTestId("machine-refresh-label").props.children)
            .toBe("CHECKING…");
    });

    it("asks the machine when pressed", async () => {
        const onRefreshWater = jest.fn();
        const r = await draw({status: "connected", vitals: someVitals, onRefreshWater});

        await fireEvent.press(r.getByTestId("machine-refresh"));

        expect(onRefreshWater).toHaveBeenCalledTimes(1);
    });

    it("will not ask twice while it is already asking", async () => {
        const onRefreshWater = jest.fn();
        const r = await draw({status: "connected", vitals: someVitals, onRefreshWater});

        await fireEvent.press(r.getByTestId("machine-refresh"));
        await fireEvent.press(r.getByTestId("machine-refresh"));

        expect(onRefreshWater).toHaveBeenCalledTimes(1);
    });

    it("reads the water level large enough to glance at", async () => {
        const r = await draw({status: "connected", vitals: someVitals});

        // DotMatrixText delivers fontSize through style, not as a host prop
        // (it is the app-wide floor enforcement point), so read the rendered
        // size off the flattened style rather than props.fontSize.
        const style = StyleSheet.flatten(
            r.getByTestId("machine-water-value").props.style
        ) as {fontSize?: number};
        expect(style.fontSize).toBe(18);
    });
});
