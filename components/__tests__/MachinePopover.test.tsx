import React from "react";

import MachinePopover from "@/components/MachinePopover";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const vitals = {waterEnough: true, mode: "PRO" as const, grindSize: 62, askedAt: 0};

async function draw(props: Partial<React.ComponentProps<typeof MachinePopover>> = {}) {
    return renderWithProviders(
        <MachinePopover
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

describe("MachinePopover", () => {
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

    it("puts the refresh on the water row, not among the buttons", async () => {
        const {getByLabelText} = await draw();
        expect(getByLabelText("Refresh the water reading")).toBeTruthy();
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
});
