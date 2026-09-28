import React from "react";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";

import HubFilterSheet from "@/components/HubFilterSheet";
import {renderWithProviders} from "@/test-utils/render";

const OPTIONS = [
    {value: "Colombia", count: 12},
    {value: "Ethiopia", count: 7},
    {value: "Kenya", count: 1}
] as const;

function sheet(onChange = jest.fn(), selected: readonly string[] = []) {
    return (
        <HubFilterSheet
            open
            title="ORIGIN"
            options={OPTIONS}
            selected={selected}
            onChange={onChange}
            onOpenChange={() => {}}
        />
    );
}

async function pressOnSheet(label: string) {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
    });
}

describe("HubFilterSheet", () => {
    beforeEach(() => jest.clearAllMocks());

    it("lists every option in the order it is given", async () => {
        await renderWithProviders(sheet());

        const rows = screen.getAllByTestId("hub-filter-row");
        expect(rows).toHaveLength(3);
        expect(within(rows[0]).getByText("Colombia")).toBeTruthy();
        expect(within(rows[1]).getByText("Ethiopia")).toBeTruthy();
        expect(within(rows[2]).getByText("Kenya")).toBeTruthy();
    });

    it("shows each option count", async () => {
        await renderWithProviders(sheet());

        expect(screen.getByText("12 recipes")).toBeTruthy();
        expect(screen.getByText("7 recipes")).toBeTruthy();
        expect(screen.getByText("1 recipe")).toBeTruthy();
    });

    it("adds an unchosen option and reports the whole selection", async () => {
        const onChange = jest.fn();
        await renderWithProviders(sheet(onChange, ["Ethiopia"]));

        await pressOnSheet("Colombia, 12 recipes");

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(["Ethiopia", "Colombia"]);
    });

    it("removes a chosen option and reports the whole selection", async () => {
        const onChange = jest.fn();
        await renderWithProviders(sheet(onChange, ["Colombia", "Ethiopia"]));

        await pressOnSheet("Colombia, 12 recipes");

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(["Ethiopia"]);
    });

    it("clears the whole selection in one call", async () => {
        const onChange = jest.fn();
        await renderWithProviders(sheet(onChange, ["Colombia", "Kenya"]));

        await pressOnSheet("Clear ORIGIN filters");

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("explains an empty option list", async () => {
        await renderWithProviders(
            <HubFilterSheet
                open
                title="FLAVOUR"
                options={[]}
                selected={[]}
                onChange={() => {}}
                onOpenChange={() => {}}
            />
        );

        expect(screen.getByText("No flavours found yet. Keep loading the catalogue."))
            .toBeTruthy();
    });

    it("names an empty process list naturally", async () => {
        await renderWithProviders(
            <HubFilterSheet
                open
                title="PROCESS"
                options={[]}
                selected={[]}
                onChange={() => {}}
                onOpenChange={() => {}}
            />
        );

        expect(screen.getByText("No processes found yet. Keep loading the catalogue."))
            .toBeTruthy();
    });

    it("marks selected options accessibly", async () => {
        await renderWithProviders(sheet(jest.fn(), ["Ethiopia"]));

        expect(screen.getByLabelText("Ethiopia, 7 recipes").props.accessibilityState)
            .toEqual(expect.objectContaining({selected: true}));
        expect(screen.getByLabelText("Colombia, 12 recipes").props.accessibilityState)
            .toEqual(expect.objectContaining({selected: false}));
    });
});
