import React from "react";
import {fireEvent} from "@testing-library/react-native";
import {processColor} from "react-native";

import BrewMiniBar from "@/components/BrewMiniBar";
import {palette} from "@/constants/colors";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const pours = [new Pour(1, 40, 93, 40, 0, 0, 20), new Pour(2, 160, 92, 40, 0, 0, 0)];

async function draw(props: Partial<React.ComponentProps<typeof BrewMiniBar>> = {}) {
    return renderWithProviders(
        <BrewMiniBar
            recipeName="Ethiopia Guji"
            dose={18}
            pours={pours}
            samples={[]}
            accent="#C86A3B"
            phase={{name: "grinding"}}
            elapsed={0}
            holding={false}
            heldSeconds={0}
            onOpen={jest.fn()}
            onDismiss={jest.fn()}
            {...props}
        />
    );
}

describe("BrewMiniBar", () => {
    it("says what it is doing while grinding, with the dose", async () => {
        const {getByText} = await draw();
        expect(getByText("Grinding")).toBeTruthy();
        expect(getByText("ETHIOPIA GUJI · 18 G")).toBeTruthy();
    });

    it("names the recipe and the pour while pouring", async () => {
        const {getByText} = await draw({
            phase: {name: "pouring", pour: 3, pours: 5},
            elapsed: 102
        });
        expect(getByText("Ethiopia Guji")).toBeTruthy();
        expect(getByText("POUR 3 OF 5 · 1:42")).toBeTruthy();
    });

    it("explains a hold, and says it needs nothing from the user", async () => {
        const {getByText} = await draw({
            phase: {name: "pouring", pour: 3, pours: 5},
            holding: true,
            heldSeconds: 11
        });
        expect(getByText("Waiting for the cup")).toBeTruthy();
        expect(getByText("+11 S · CARRIES ON BY ITSELF")).toBeTruthy();
    });

    it("invites a tap when the brew is done", async () => {
        const {getByText} = await draw({
            phase: {name: "done"}, elapsed: 228,
            samples: [{at: 228_000, water: 254, cup: 254, pour: 2}]
        });
        expect(getByText("Ready")).toBeTruthy();
        expect(getByText("254 G · 3:48 · TAP TO SEE IT")).toBeTruthy();
    });

    it("says where a stopped brew went", async () => {
        const {getByText} = await draw({phase: {name: "failed", reason: "noWater"}});
        expect(getByText("Stopped: no water")).toBeTruthy();
        expect(getByText("KEPT IN YOUR BREW HISTORY")).toBeTruthy();
    });

    it("does not call a refusal a stopped brew, or claim it was kept", async () => {
        // A `blocked` phase is a refusal before anything was sent: no dose was
        // spent and the recorder deliberately writes no row, so the bar must
        // not promise a history entry that will not be there.
        const {getByText, queryByText} = await draw({
            phase: {name: "failed", reason: "blocked", block: "busy",
                    detail: "The machine is already brewing."}
        });
        expect(getByText("Did not start")).toBeTruthy();
        expect(queryByText("KEPT IN YOUR BREW HISTORY")).toBeNull();
    });

    it("names each mid-brew failure rather than calling them all lost contact", async () => {
        const beans = await draw({phase: {name: "failed", reason: "noBeans"}});
        expect(beans.getByText("Stopped: no beans")).toBeTruthy();
    });

    it("draws a stopped brew in danger", async () => {
        const {getByTestId} = await draw({
            phase: {name: "failed", reason: "noWater"},
            samples: [
                {at: 10_000, water: 40, cup: 35, pour: 1},
                {at: 40_000, water: 90, cup: 80, pour: 1}
            ]
        });
        expect(getByTestId("trace-water").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(palette.danger)})
        );
    });

    it("reopens the sheet on a press", async () => {
        const onOpen = jest.fn();
        const {getByLabelText} = await draw({onOpen});
        await fireEvent.press(getByLabelText("Open the brew"));
        expect(onOpen).toHaveBeenCalled();
    });

    it("can be dismissed once the brew is over, and not before", async () => {
        const running = await draw({phase: {name: "pouring", pour: 1, pours: 2}});
        expect(running.queryByLabelText("Dismiss")).toBeNull();
        const finished = await draw({phase: {name: "done"}});
        expect(finished.getByLabelText("Dismiss")).toBeTruthy();
    });

    describe("the bar's controls", () => {
        it("has no chevron, because the whole bar is the tap target", async () => {
            const {queryByTestId} = await draw({phase: {name: "pouring", pour: 1, pours: 4}});

            expect(queryByTestId("mini-chevron", {includeHiddenElements: true})).toBeNull();
        });

        it("gives the close button room to be pressed", async () => {
            const {getByLabelText} = await draw({phase: {name: "done"}});

            expect(getByLabelText("Dismiss").props.hitSlop).toEqual(
                {top: 12, bottom: 12, left: 12, right: 12}
            );
        });

        it("uses the recipe's accent while it is pouring", async () => {
            const {getByTestId} = await draw({
                phase: {name: "pouring", pour: 1, pours: 4},
                accent: "#123456",
                samples: [
                    {at: 10_000, water: 40, cup: 35, pour: 1},
                    {at: 20_000, water: 80, cup: 72, pour: 1}
                ]
            });

            expect(getByTestId("trace-water").props.stroke).toEqual(
                expect.objectContaining({payload: processColor("#123456")})
            );
        });
    });
});
