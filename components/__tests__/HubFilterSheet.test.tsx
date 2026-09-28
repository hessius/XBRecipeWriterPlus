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

/**
 * The scale the catalogue actually has.
 *
 * Origins and processes run to a few hundred distinct values per partition,
 * and flavours to over a thousand, because the catalogue's metadata is free
 * text and more than half of every facet's values appear on exactly one
 * recipe. A sheet that drew all of them would be slow to render and worse to
 * read, so the commonest are drawn and the field reaches the rest.
 */
describe("a facet with more values than anybody can scroll", () => {
    const MANY = Array.from({length: 200}, (_, index) => ({
        value: `Flavour ${String(index).padStart(3, "0")}`,
        count: 200 - index
    }));

    function manySheet(onChange = jest.fn()) {
        return (
            <HubFilterSheet
                open
                title="FLAVOUR"
                options={MANY}
                selected={[]}
                onChange={onChange}
                onOpenChange={() => {}}
            />
        );
    }

    it("draws the commonest and says how many are waiting", async () => {
        await renderWithProviders(manySheet());

        expect(screen.getAllByTestId("hub-filter-row")).toHaveLength(60);
        expect(screen.getByText("Flavour 000")).toBeTruthy();
        expect(screen.queryByText("Flavour 199")).toBeNull();
        expect(screen.getByText("140 more. Search to reach them.")).toBeTruthy();
    });

    it("reaches a value the list did not draw", async () => {
        await renderWithProviders(manySheet());

        await fireEvent.changeText(
            screen.getByLabelText("Search flavour"), "flavour 199"
        );

        expect(screen.getByText("Flavour 199")).toBeTruthy();
        expect(screen.getAllByTestId("hub-filter-row")).toHaveLength(1);
        expect(screen.queryByText(/more\. Search to reach them\./)).toBeNull();
    });

    it("still reports the whole new selection when the list is filtered", async () => {
        const onChange = jest.fn();
        await renderWithProviders(manySheet(onChange));

        await fireEvent.changeText(
            screen.getByLabelText("Search flavour"), "flavour 199"
        );
        await pressOnSheet("Flavour 199, 1 recipe");

        expect(onChange).toHaveBeenCalledWith(["Flavour 199"]);
    });

    it("says so rather than showing an empty list when nothing matches", async () => {
        await renderWithProviders(manySheet());

        await fireEvent.changeText(
            screen.getByLabelText("Search flavour"), "bergamot"
        );

        expect(screen.queryAllByTestId("hub-filter-row")).toHaveLength(0);
        expect(screen.getByText("Nothing here matches that.")).toBeTruthy();
    });

    it("offers no field at all when the whole list fits", async () => {
        // Three origins do not need searching, and a field over three rows is
        // clutter. The library's own filter rows do not have one either.
        await renderWithProviders(sheet());

        expect(screen.queryByLabelText("Search origin")).toBeNull();
    });
});

