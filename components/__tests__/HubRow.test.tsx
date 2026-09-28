/**
 * One row of the catalogue.
 *
 * RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`, so
 * these assert on what the renderer produced: text, test ids and accessible
 * state, rather than on a child's props.
 */
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import HubRow from "@/components/HubRow";
import {palette} from "@/constants/colors";
import type {HubRecipe} from "@/library/hub/hubRow";
import {__resetHubCriteria, loadHubCriteria} from "@/library/hub/hubCriteria";
import {renderWithProviders} from "@/test-utils/render";

/** Whatever the queries hand back; RNTL does not export the type by name. */
type Node = ReturnType<typeof screen.getByTestId>;

type Style = Record<string, unknown> | undefined;

function stylesOf(node: Node): Style[] {
    return Array.isArray(node.props.style)
        ? node.props.style as Style[]
        : [node.props.style as Style];
}

function styleValue(node: Node, key: string): unknown {
    return stylesOf(node).reduce<unknown>((found, s) => s?.[key] ?? found, node.props[key]);
}

const mockFetchCriteria = jest.fn();
jest.mock("@/library/hub/hubApi", () => ({
    ...jest.requireActual("@/library/hub/hubApi"),
    fetchHubCriteria: (...args: unknown[]) => mockFetchCriteria(...args)
}));

const CRITERIA = {
    originList:     [],
    varietalList:   [],
    roastList:      [{name: "Light Roast", value: "1"}],
    flavorList:     [],
    machineList:    [],
    cupTypeList:    [],
    processingList: [],
    coffeeTypeList: []
};

function recipe(over: Partial<HubRecipe> = {}): HubRecipe {
    return {
        id: 164, name: "Brian's Recipe", imageURL: "https://example.com/a.png",
        author: "xBloom Official", official: true, machine: "Studio",
        cupType: "xPod", coffeeType: "Single Origin", origin: ["Colombia"],
        varietal: ["Mix"], process: ["Washed"], flavour: [], roast: 1,
        dose: 15, grind: 52, rpm: 120, pourCount: 5, ratio: 16, volume: 240,
        shareLink: "https://share-h5.xbloom.com/?id=abc", ...over
    };
}

beforeEach(() => {
    __resetHubCriteria();
    mockFetchCriteria.mockReset();
    mockFetchCriteria.mockResolvedValue(CRITERIA);
});

describe("a catalogue row", () => {
    it("shows the name, the origin and the process", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.getByText("Brian's Recipe")).toBeTruthy();
        expect(screen.getByText(/COLOMBIA/)).toBeTruthy();
        expect(screen.getByText(/WASHED/)).toBeTruthy();
    });

    it("omits the origin and process line when both are missing", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe({origin: [], process: []})}
                    selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.queryByTestId("hub-row-origin-process")).toBeNull();
    });

    it("shows dose, ratio and grind", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.getByTestId("hub-row-dose")).toHaveTextContent("15 g");
        expect(screen.getByTestId("hub-row-ratio")).toHaveTextContent("1:16");
        expect(screen.getByTestId("hub-row-grind")).toHaveTextContent("52");
    });

    it("never shows a likes count", async () => {
        // Every figure in the catalogue sits in one narrow band, so showing it
        // would dress noise up as a popularity signal.
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.queryByTestId("hub-row-likes")).toBeNull();
    });

    it("names a roast once the catalogue vocabulary is loaded", async () => {
        await loadHubCriteria();
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.getByTestId("hub-row-roast")).toHaveTextContent("LIGHT ROAST");
    });

    it("says nothing about a roast the catalogue left unset", async () => {
        await loadHubCriteria();
        await renderWithProviders(
            <HubRow recipe={recipe({roast: null})} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.queryByTestId("hub-row-roast")).toBeNull();
    });

    it("is a button when browsing and a checkbox when choosing", async () => {
        // The same control means two things, so it has to say which.
        const {rerender} = await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );
        expect(screen.getByTestId("hub-row-164").props.accessibilityRole).toBe("button");
        expect(screen.queryByTestId("hub-row-tick")).toBeNull();

        await rerender(
            <HubRow recipe={recipe()} selecting selected
                    onPress={() => {}} onLongPress={() => {}}/>
        );
        const row = screen.getByTestId("hub-row-164");
        const tick = screen.getByTestId("hub-row-tick");
        expect(row.props.accessibilityRole).toBe("checkbox");
        expect(row.props.accessibilityState.checked).toBe(true);
        expect(styleValue(tick, "width")).toBe(26);
        expect(styleValue(tick, "height")).toBe(26);
        expect(tick).toHaveStyle({
            backgroundColor: palette.text
        });
        expect(screen.getByTestId("hub-row-tick-icon")).toBeTruthy();
    });

    it("draws an empty tick when choosing an unselected row", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        const row = screen.getByTestId("hub-row-164");
        const tick = screen.getByTestId("hub-row-tick");
        expect(row.props.accessibilityState.checked).toBe(false);
        expect(tick).toHaveStyle({
            backgroundColor: palette.none
        });
        expect(screen.queryByTestId("hub-row-tick-icon")).toBeNull();
    });

    it("opens on a press and starts choosing on a long press", async () => {
        const onPress = jest.fn();
        const onLongPress = jest.fn();
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={onPress} onLongPress={onLongPress}/>
        );

        await fireEvent.press(screen.getByTestId("hub-row-164"));
        expect(onPress).toHaveBeenCalled();

        await fireEvent(screen.getByTestId("hub-row-164"), "longPress");
        expect(onLongPress).toHaveBeenCalled();
    });

    it("draws without a photo rather than leaving a hole", async () => {
        // 3,020 rows and an S3 bucket in two regions: some will not load.
        await renderWithProviders(
            <HubRow recipe={recipe({imageURL: null})} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        expect(screen.queryByTestId("hub-row-photo")).toBeNull();
        expect(screen.getByTestId("hub-row-photo-blank")).toBeTruthy();
    });

    it("replaces a failed photo with the blank", async () => {
        await renderWithProviders(
            <HubRow recipe={recipe()} selecting={false} selected={false}
                    onPress={() => {}} onLongPress={() => {}}/>
        );

        await fireEvent(screen.getByTestId("hub-row-photo"), "error");

        expect(screen.queryByTestId("hub-row-photo")).toBeNull();
        expect(screen.getByTestId("hub-row-photo-blank")).toBeTruthy();
    });
});
