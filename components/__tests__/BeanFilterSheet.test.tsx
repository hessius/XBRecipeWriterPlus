import React from "react";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";

import BeanFilterSheet from "@/components/BeanFilterSheet";
import {beanFilterId} from "@/library/beanFilters";
import type {ProfileField} from "@/library/beanProfile";
import type {BeanVocabularyEntry} from "@/library/BrewDatabase";
import {renderWithProviders} from "@/test-utils/render";

function entry(field: ProfileField, value: string, recipes = 1): BeanVocabularyEntry {
    return {field, value, recipes};
}

async function settleSheetEntrance(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    });
}

function id(field: ProfileField, value: string, rated = false): string {
    return beanFilterId({field, value, rated});
}

describe("BeanFilterSheet", () => {
    it("groups values under field headings in bean field order with custom last", async () => {
        await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[
                    entry("custom", "mornings"),
                    entry("process", "Natural"),
                    entry("origin", "Guji"),
                    entry("roast", "Light")
                ]}
                selected={[]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={jest.fn()}
            />
        );
        await settleSheetEntrance();

        const headings = screen.getAllByTestId("bean-filter-heading")
            .map((heading) => heading.props.children);
        expect(headings).toEqual(["ORIGIN", "ROAST", "PROCESS", "TAG"]);
    });

    it("draws no heading for a field with no values", async () => {
        await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("process", "Natural")]}
                selected={[]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={jest.fn()}
            />
        );
        await settleSheetEntrance();

        expect(screen.getByText("PROCESS")).toBeTruthy();
        expect(screen.queryByText("FERMENT")).toBeNull();
    });

    it("shows only empty prose when the vocabulary is empty", async () => {
        await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[]}
                selected={[]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={jest.fn()}
            />
        );
        await settleSheetEntrance();

        expect(screen.getByText("No tagged brew history yet. Tag a brew to filter by beans."))
            .toBeTruthy();
        expect(screen.queryAllByTestId("bean-filter-heading")).toEqual([]);
        expect(screen.queryByTestId("bean-filter-row")).toBeNull();
    });

    it("marks a value selected for either plain or rated ids", async () => {
        const {rerender} = await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("process", "Natural")]}
                selected={[id("process", "Natural")]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={jest.fn()}
            />
        );
        await settleSheetEntrance();

        expect(screen.getByLabelText("Natural, 1 recipe").props.accessibilityState)
            .toEqual(expect.objectContaining({selected: true}));

        await rerender(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("process", "Natural")]}
                selected={[id("process", "Natural", true)]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={jest.fn()}
            />
        );

        expect(screen.getByLabelText("Natural, 1 recipe").props.accessibilityState)
            .toEqual(expect.objectContaining({selected: true}));
    });

    it("adds, removes and keeps multiple selected values", async () => {
        const onChange = jest.fn();
        const natural = id("process", "Natural");
        const light = id("roast", "Light");

        const {rerender} = await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("roast", "Light"), entry("process", "Natural")]}
                selected={[]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={onChange}
            />
        );
        await settleSheetEntrance();

        await pressOnSheet("Natural, 1 recipe", () => onChange.mock.calls.length === 1);
        expect(onChange).toHaveBeenLastCalledWith([natural]);

        await rerender(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("roast", "Light"), entry("process", "Natural")]}
                selected={[natural]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={onChange}
            />
        );
        await pressOnSheet("Light, 1 recipe", () => onChange.mock.calls.length === 2);
        expect(onChange).toHaveBeenLastCalledWith([natural, light]);

        await rerender(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("roast", "Light"), entry("process", "Natural")]}
                selected={[natural, light]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={onChange}
            />
        );
        await pressOnSheet("Natural, 1 recipe", () => onChange.mock.calls.length === 3);
        expect(onChange).toHaveBeenLastCalledWith([light]);
    });

    it("renders the rated switch caption without the floor", async () => {
        await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("process", "Natural")]}
                selected={[]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={jest.fn()}
            />
        );
        await settleSheetEntrance();

        expect(screen.getByLabelText("Highly rated only").props.accessibilityState)
            .toEqual(expect.objectContaining({checked: false}));
        expect(screen.getByText("Average 4★ or better.")).toBeTruthy();
        expect(screen.queryByText(/3/)).toBeNull();
    });

    it("rewrites every selected id when the rated switch flips", async () => {
        const onChange = jest.fn();
        const onRatedOnlyChange = jest.fn();
        const selected = [id("process", "Natural"), id("roast", "Light")];

        const {rerender} = await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("roast", "Light"), entry("process", "Natural")]}
                selected={selected}
                ratedOnly={false}
                onRatedOnlyChange={onRatedOnlyChange}
                onChange={onChange}
            />
        );
        await settleSheetEntrance();

        await fireEvent.press(screen.getByLabelText("Highly rated only"));

        expect(onRatedOnlyChange).toHaveBeenCalledWith(true);
        expect(onChange).toHaveBeenLastCalledWith([
            id("process", "Natural", true),
            id("roast", "Light", true)
        ]);

        await rerender(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("roast", "Light"), entry("process", "Natural")]}
                selected={[id("process", "Natural", true), id("roast", "Light", true)]}
                ratedOnly
                onRatedOnlyChange={onRatedOnlyChange}
                onChange={onChange}
            />
        );
        await fireEvent.press(screen.getByLabelText("Highly rated only"));

        expect(onRatedOnlyChange).toHaveBeenLastCalledWith(false);
        expect(onChange).toHaveBeenLastCalledWith(selected);
    });

    it("remembers rated-only with no selected values for the next selection", async () => {
        const onChange = jest.fn();
        const onRatedOnlyChange = jest.fn();

        const {rerender} = await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("process", "Natural")]}
                selected={[]}
                ratedOnly={false}
                onRatedOnlyChange={onRatedOnlyChange}
                onChange={onChange}
            />
        );
        await settleSheetEntrance();

        await fireEvent.press(screen.getByLabelText("Highly rated only"));

        expect(onRatedOnlyChange).toHaveBeenCalledWith(true);
        expect(onChange).toHaveBeenCalledWith([]);

        await rerender(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("process", "Natural")]}
                selected={[]}
                ratedOnly
                onRatedOnlyChange={onRatedOnlyChange}
                onChange={onChange}
            />
        );
        await pressOnSheet("Natural, 1 recipe", () => onChange.mock.calls.length === 2);

        expect(onChange).toHaveBeenLastCalledWith([id("process", "Natural", true)]);
    });

    it("shows each value's recipe count", async () => {
        await renderWithProviders(
            <BeanFilterSheet
                open
                onOpenChange={jest.fn()}
                vocabulary={[entry("process", "Natural", 7)]}
                selected={[]}
                ratedOnly={false}
                onRatedOnlyChange={jest.fn()}
                onChange={jest.fn()}
            />
        );
        await settleSheetEntrance();

        expect(screen.getByText("7 recipes")).toBeTruthy();
        expect(screen.getByLabelText("Natural, 7 recipes")).toBeTruthy();
    });
});
