// app/__tests__/brewRecord.test.tsx
import React from "react";
import {StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import * as Sharing from "expo-sharing";
import {File as FSFile} from "expo-file-system";

import BrewRecord from "@/app/brewRecord";
import type {RecipeLookup} from "@/app/brewRecord";
import {palette} from "@/constants/colors";
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

    it("offers one way back, not two that go to the same place", async () => {
        // The history list is the only way in here, so an "All brews" button
        // sat beside a back chevron that already went to exactly that screen —
        // and it *pushed*, stacking a second copy of the list rather than
        // returning to the first.
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByTestId("screen-header-back")).toBeTruthy();
        expect(screen.queryByLabelText("All brews")).toBeNull();
        expect(mockSetOptions).not.toHaveBeenCalled();
    });

    it("titles itself Brew and dates it, rather than repeating the recipe name", async () => {
        // `BrewSummary` draws the name just below and has to, because the
        // export capture needs it. The date is what the name cannot say: which
        // brew of that recipe this one is.
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByText("Brew")).toBeTruthy();
        expect(screen.getByTestId("screen-header-meta")).toBeTruthy();
    });

    it("dates the brew on the title's own row, not on a band beneath it", async () => {
        // A second line cost a strip of screen as tall as the title itself for
        // one short string, and pushed the recipe name down with it.
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.queryByTestId("record-header-when")).toBeNull();
        // The record's `startedAt` is 0, so the date is the epoch in whatever
        // zone the test machine sits in — hence a shape, not a fixed day.
        expect(screen.getByText(/^\d{4}-\d{2}-\d{2} · \d{2}:\d{2}$/)).toBeTruthy();
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
        // Screen padding (18) plus the export margin (12); pinned as a literal
        // so shrinking the margin to 0 cannot pass this test unnoticed.
        expect(style?.padding).toBe(30);
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
        // Release the first press and let it finish. Awaited, because the
        // export now clears the stage highlight and waits a paint before it
        // reaches `isAvailableAsync` — so the resolver does not exist yet at
        // the moment the presses return.
        await waitFor(() => expect(releaseFirst).toBeDefined());
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
        // Release the first press and let it finish. Awaited, because the
        // export now clears the stage highlight and waits a paint before it
        // reaches `isAvailableAsync` — so the resolver does not exist yet at
        // the moment the presses return.
        await waitFor(() => expect(releaseFirst).toBeDefined());
        releaseFirst(true);
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
        expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });
});

describe("brew record's stage detail", () => {
    // A lookup with real pours, so the ladder has rungs to press.
    const lookup: RecipeLookup = {getRecipe: jest.fn(() => twoPours)};

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

    it("puts the detail inside the screen's scroller so its end can be read", async () => {
        // An open stage detail is taller than what is left below the figures.
        // Outside the scroller the end of the breakdown was simply unreachable.
        await renderWithProviders(<BrewRecord recipeLookup={lookup} />);
        await fireEvent.press(screen.getByTestId("rung-1"));
        expect(within(screen.getByTestId("record-scroll"))
            .getByTestId("stage-detail")).toBeTruthy();
    });

    it("shows nothing until a stage is asked about", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={lookup} />);
        expect(screen.queryByTestId("stage-detail")).toBeNull();
    });

    it("opens the detail for the rung that was pressed", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={lookup} />);
        await fireEvent.press(screen.getByTestId("rung-1"));
        expect(screen.getByTestId("stage-detail")).toBeTruthy();
        // Named from one, as every rung is.
        expect(screen.getByText("STAGE 2")).toBeTruthy();
    });

    it("closes the detail when the same rung is pressed again", async () => {
        // The rung is the only affordance that opened it, so it has to be able
        // to shut it too; otherwise the only way out is the CLOSE button and a
        // second press on an open stage does nothing visible at all.
        await renderWithProviders(<BrewRecord recipeLookup={lookup} />);
        await fireEvent.press(screen.getByTestId("rung-1"));
        await fireEvent.press(screen.getByTestId("rung-1"));
        expect(screen.queryByTestId("stage-detail")).toBeNull();
    });

    it("switches to another stage rather than closing", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={lookup} />);
        await fireEvent.press(screen.getByTestId("rung-1"));
        await fireEvent.press(screen.getByTestId("rung-0"));
        expect(screen.getByText("STAGE 1")).toBeTruthy();
    });

    it("takes the highlight off the screen before it photographs it", async () => {
        // The band and the tint answer a tap, and a PNG cannot be tapped.
        await renderWithProviders(<BrewRecord recipeLookup={lookup} />);
        await fireEvent.press(screen.getByTestId("rung-1"));
        expect(screen.getByTestId("trace-band")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Save as image"));
        await waitFor(() => expect(screen.queryByTestId("trace-band")).toBeNull());
        await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    });
});
