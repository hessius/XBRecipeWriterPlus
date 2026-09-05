// app/__tests__/brewRecord.test.tsx
import React from "react";
import {StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import {File as FSFile} from "expo-file-system";

import BrewRecord from "@/app/brewRecord";
import type {RecipeLookup} from "@/app/brewRecord";
import {palette} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import {renderWithProviders} from "@/test-utils/render";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type Recipe from "@/library/Recipe";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";

const mockPush = jest.fn();
const mockSetOptions = jest.fn();

type OpenResult = {record: StoredBrew; samples: BrewSample[]} | null;
let mockOpened: OpenResult = null;

// Settable per test — defaults to the `id` case; set to `{latest: "1"}` for
// the latest-branch tests.
let mockParams: {id?: string; latest?: string} = {id: "brew-1"};

// Settable per test — defaults to empty so that `brews[0]` is undefined.
let mockBrews: StoredBrew[] = [];

jest.mock("expo-router", () => ({
    router: {push: (...args: unknown[]) => mockPush(...args), back: jest.fn()},
    useLocalSearchParams: () => mockParams,
    useNavigation: () => ({setOptions: (...args: unknown[]) => mockSetOptions(...args)})
}));

jest.mock("@/hooks/useBrewHistory", () => ({
    useBrewHistory: () => ({
        brews: mockBrews,
        remove: jest.fn(),
        open: () => mockOpened
    }),
    sharedBrewDatabase: () => ({})
}));

// Provide a minimal pour-less recipe for the ladder, avoiding the need to
// construct a full Recipe object in tests.
const mockRecipe = {pours: []} as unknown as Recipe;
const mockLookup: RecipeLookup = {getRecipe: jest.fn(() => mockRecipe)};
const noRecipeLookup: RecipeLookup = {getRecipe: jest.fn(() => null)};

// The real ladder, wrapped so a test can see what the screen handed it. Stalls
// travel a long way — recorder, database, screen — and the last leg is the one
// no rendered pixel would reveal if it broke.
let ladderProps: {
    stalls?: unknown; stageWater?: unknown; activeIndex?: unknown; pours?: unknown;
} = {};
jest.mock("@/components/BrewStageLadder", () => {
    const actual = jest.requireActual("@/components/BrewStageLadder");
    const Ladder = actual.default;
    return {
        __esModule: true,
        ...actual,
        default: (props: Record<string, unknown>) => {
            ladderProps = props;
            return Ladder(props);
        }
    };
});

// A recipe with real pours, since the ladder draws each rung from the Pour.
const twoPours = {
    pours: [
        new Pour(1, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10),
        new Pour(2, 40, 93, 40, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 10)
    ]
} as unknown as Recipe;

const record: StoredBrew = {
    id: "brew-1", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
    accent: "#C86A3B", startedAt: 0, endedAt: 228_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 14,
    hasStream: true
};

describe("brew record", () => {
    beforeEach(() => {
        mockPush.mockReset();
        mockSetOptions.mockReset();
        mockParams = {id: "brew-1"};
        mockBrews  = [];
        mockOpened = {
            record,
            samples: [{at: 0, water: 0, cup: 0, pour: 1},
                      {at: 228_000, water: 250, cup: 244, pour: 2}]
        };
    });

    it("draws the trace and the figures", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByLabelText("Brew trace")).toBeTruthy();
        expect(screen.getByText("244")).toBeTruthy();
    });

    it("names the time it held", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByText(/\+14 S/)).toBeTruthy();
    });

    it("puts All brews in the header, not the body", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        // The button lives in navigation.setOptions, not in the scroll body.
        const call = mockSetOptions.mock.calls.find(
            (c) => c[0] && typeof c[0].headerRight === "function"
        );
        expect(call).toBeTruthy();
        // Render the header button and confirm its label.
        const HeaderRight = call![0].headerRight as React.ComponentType;
        const {getByLabelText} = await renderWithProviders(<HeaderRight />);
        expect(getByLabelText("All brews")).toBeTruthy();
    });

    it("renders the stage ladder with every stage done when the recipe exists", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        // BrewStageLadder's root view carries testID="ladder".
        expect(screen.getByTestId("ladder")).toBeTruthy();
    });

    it("hands the recorded stalls to the ladder", async () => {
        const stalls = [[{atMl: 20, seconds: 11}], []];
        mockOpened = {record: {...record, stalls}, samples: []};
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );
        expect(ladderProps.stalls).toEqual(stalls);
    });

    it("gives the ladder an empty list per stage for a brew recorded before stalls", async () => {
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );
        expect(ladderProps.stalls).toEqual([[], []]);
    });

    it("shows a note and no ladder when the recipe has been deleted", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={noRecipeLookup} />);
        expect(screen.queryByTestId("ladder")).toBeNull();
        expect(screen.getByText(/recipe deleted/i)).toBeTruthy();
    });

    it("still draws a ladder for a recipe that has been deleted", async () => {
        // #86: the ladder used to be built from the live recipe, so deleting
        // the recipe left the record with no stages at all.
        mockOpened = {
            record: {
                ...record,
                plan: [
                    {pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
                     agitation: 0, pourPattern: 0, pauseTime: 20},
                    {pourNumber: 2, volume: 160, temperature: 92, flowRate: 40,
                     agitation: 0, pourPattern: 0, pauseTime: 0}
                ],
                stageWater: [40, 160]
            },
            samples: []
        };
        await renderWithProviders(<BrewRecord recipeLookup={noRecipeLookup} />);

        expect(screen.getByTestId("ladder")).toBeTruthy();
        expect(screen.queryByText(/recipe deleted/i)).toBeNull();
        expect(ladderProps.stageWater).toEqual([40, 160]);
    });

    it("stops the ladder in the stage a failed brew stopped in", async () => {
        // #89: stage 2 poured nothing, and used to be drawn full to the brim.
        mockOpened = {
            record: {...record, outcome: "failed", stageWater: [40, 0]},
            samples: []
        };
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );

        expect(ladderProps.activeIndex).toBe(0);
        expect(ladderProps.stageWater).toEqual([40, 0]);
    });

    it("prefers what the brew poured over what the recipe now says", async () => {
        // The recipe may have been edited since. `twoPours` asks for 40 and 40;
        // the brew that was actually run delivered 40 and 70.
        mockOpened = {
            record: {...record, stageWater: [40, 70]},
            samples: []
        };
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );

        expect(ladderProps.stageWater).toEqual([40, 70]);
    });

    it("draws the stages the plan asked for, not what the recipe now says", async () => {
        // The recipe may have been edited since the brew. The plan is what was
        // actually brewed, and the ladder must draw that, not the recipe's
        // current numbers -- here the recipe asks for 40 and 40, but the
        // brew's own plan asked for 40 and 160.
        mockOpened = {
            record: {
                ...record,
                plan: [
                    {pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
                     agitation: 0, pourPattern: 0, pauseTime: 20},
                    {pourNumber: 2, volume: 160, temperature: 92, flowRate: 40,
                     agitation: 0, pourPattern: 0, pauseTime: 0}
                ],
                stageWater: [40, 160]
            },
            samples: []
        };
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );

        const pours = ladderProps.pours as Pour[];
        expect(pours.length).toBe(2);
        expect(pours[1].volume).toBe(160);
    });

    it("says the trace has expired rather than drawing an empty chart", async () => {
        mockOpened = {record: {...record, hasStream: false}, samples: []};
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByText(/no trace was kept/i)).toBeTruthy();
        expect(screen.queryByLabelText("Brew trace")).toBeNull();
    });

    it("says so when the record is gone", async () => {
        mockOpened = null;
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByText(/that brew is no longer here/i)).toBeTruthy();
    });

    it("offers both exports", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByLabelText("Save as image")).toBeTruthy();
        expect(screen.getByLabelText("Export the data")).toBeTruthy();
    });

    // ── Finding 1: ?latest=1 branch ─────────────────────────────────────────

    it("latest=1 resolves to the newest history record and shows the export buttons", async () => {
        mockParams = {latest: "1"};
        mockBrews  = [record];
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByLabelText("Save as image")).toBeTruthy();
        expect(screen.getByLabelText("Export the data")).toBeTruthy();
        // The record was found — no "not found" message.
        expect(screen.queryByText(/that brew is no longer here/i)).toBeNull();
    });

    it("latest=1 with an empty history shows the not-found state rather than crashing", async () => {
        mockParams = {latest: "1"};
        mockBrews  = [];           // no brews recorded yet
        mockOpened = null;
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByText(/that brew is no longer here/i)).toBeTruthy();
    });

    // ── Finding 2: pressing the export buttons triggers the share ────────────

    it("pressing Save as image calls capture and then shareAsync with the captured URI", async () => {
        (Sharing.shareAsync as jest.Mock).mockClear();
        const {getByLabelText} = await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        fireEvent.press(getByLabelText("Save as image"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///mock/brew.png",
                expect.objectContaining({mimeType: "image/png"})
            )
        );
    });

    // ── Finding: what the exported PNG actually contains ─────────────────────

    it("offers the image as a PNG the photo library will accept", async () => {
        (Sharing.shareAsync as jest.Mock).mockClear();
        const {getByLabelText} = await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        fireEvent.press(getByLabelText("Save as image"));
        // Without a UTI, iOS offers Files but not Save Image.
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///mock/brew.png",
                expect.objectContaining({UTI: "public.png"})
            )
        );
    });

    it("captures the stage ladder along with the trace and the figures", async () => {
        await renderWithProviders(
            <BrewRecord recipeLookup={{getRecipe: jest.fn(() => twoPours)}} />
        );
        // "viewshot" is the mock's own testID: the capture boundary itself.
        const capture = within(screen.getByTestId("viewshot"));
        expect(capture.getByTestId("ladder")).toBeTruthy();
    });

    it("paints the captured area so the PNG is not a white sheet with no margin", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        const style = StyleSheet.flatten(
            screen.getByTestId("brew-capture").props.style as StyleProp<ViewStyle>
        );
        expect(style?.backgroundColor).toBe(palette.base);
        expect(style?.padding).toBe(SCREEN_PADDING);
    });

    it("pressing Export the data writes the file and calls shareAsync with the file URI", async () => {
        (Sharing.shareAsync as jest.Mock).mockClear();
        (FSFile as unknown as jest.Mock).mockClear();
        const {getByLabelText} = await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        fireEvent.press(getByLabelText("Export the data"));
        await waitFor(() =>
            expect(Sharing.shareAsync).toHaveBeenCalledWith(
                "file:///mock-cache/ethiopia-guji-1970-01-01.json",
                expect.objectContaining({mimeType: "application/json"})
            )
        );
        const instance = (FSFile as unknown as jest.Mock).mock.instances[0] as {write: jest.Mock; uri: string};
        expect(instance.write).toHaveBeenCalled();
    });

    // ── Finding 3: double-press while in flight ──────────────────────────────

    it("a second press on Save as image while the first is in flight does nothing", async () => {
        (Sharing.shareAsync as jest.Mock).mockClear();
        // Block the first press inside isAvailableAsync so the guard stays set
        // when the second press fires.
        let releaseFirst!: (v: boolean) => void;
        (Sharing.isAvailableAsync as jest.Mock).mockImplementationOnce(
            () => new Promise<boolean>(r => { releaseFirst = r; })
        );
        const {getByLabelText} = await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        // First press — the guard is set synchronously; the share hangs inside
        // isAvailableAsync and cannot complete until we call releaseFirst.
        await fireEvent.press(getByLabelText("Save as image"));
        // Second press — isSharingImageRef is still true, so this returns early.
        await fireEvent.press(getByLabelText("Save as image"));
        // Release the first press and let it finish.
        releaseFirst(true);
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });

    it("a second press on Export the data while the first is in flight does nothing", async () => {
        (Sharing.shareAsync as jest.Mock).mockClear();
        (Sharing.isAvailableAsync as jest.Mock).mockClear();
        let releaseFirst!: (v: boolean) => void;
        (Sharing.isAvailableAsync as jest.Mock).mockImplementationOnce(
            () => new Promise<boolean>(r => { releaseFirst = r; })
        );
        const {getByLabelText} = await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        // First press — the guard is set synchronously; hangs at isAvailableAsync.
        await fireEvent.press(getByLabelText("Export the data"));
        // Second press — isSharingDataRef is still true, so this returns early.
        await fireEvent.press(getByLabelText("Export the data"));
        // Release the first press and let it finish.
        releaseFirst(true);
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });
});
