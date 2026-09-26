// app/__tests__/brewRecord.test.tsx
import React from "react";
import {Linking, StyleSheet, type StyleProp, type ViewStyle} from "react-native";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import {File as FSFile} from "expo-file-system";

import BrewRecord from "@/app/brewRecord";
import type {RecipeLookup} from "@/app/brewRecord";
import {sharedSettings} from "@/hooks/useSetting";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";
import {
    brewRecordFixture as record,
    type BrewRecordOpenResult
} from "@/test-utils/brewRecordMocks";
import type {StoredBrew} from "@/library/BrewDatabase";
import type Recipe from "@/library/Recipe";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {planFromPours} from "@/library/brew/BrewRecord";
import {HANDOFF_TARGETS} from "@/library/brew/handoff/targets";

const mockPush = jest.fn();
const mockSetOptions = jest.fn();

// This file switches the handoff gate on so the hidden UI can be exercised.
// The pre-existing layout assertions in this file therefore describe the
// screen as a Labs tester sees it, not the one a default install draws.
// brewRecordHandoffGate.test.tsx covers the shipped default.
beforeEach(() => {
    sharedSettings().set("beanconquerorHandoff", true);
});

/**
 * `frames` is optional here only: the real `open()` always returns one, but a
 * test that is not about the frame log should not have to say so.
 */
let mockOpened: BrewRecordOpenResult = null;

// Settable per test — defaults to the `id` case; set to `{latest: "1"}` for
// the latest-branch tests.
let mockParams: {id?: string; latest?: string} = {id: "brew-1"};

// Settable per test — defaults to empty so that `brews[0]` is undefined.
let mockBrews: StoredBrew[] = [];

// The judgement writes the screen makes, recorded rather than performed.
const mockJudgementStore = {judge: jest.fn(), setPinned: jest.fn()};

jest.mock("expo-router", () => {
    const mocks = jest.requireActual<typeof import("@/test-utils/brewRecordMocks")>(
        "@/test-utils/brewRecordMocks"
    );
    return mocks.createExpoRouterMock({
        push: (...args: unknown[]) => mockPush(...args),
        back: jest.fn(),
        setOptions: (...args: unknown[]) => mockSetOptions(...args),
        params: () => mockParams
    });
});

// `useSetting` reaches for the shared SQLite-backed store, which cannot open
// under Jest. The frame-log button rides the machine-console gate, so the
// screen reads one setting and a test has to be able to set it.
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

jest.mock("@/library/RecipeDatabase", () => jest.fn(() => ({
    getRecipe: jest.fn(() => null)
})));

jest.mock("@/hooks/useBrewHistory", () => {
    const mocks = jest.requireActual<typeof import("@/test-utils/brewRecordMocks")>(
        "@/test-utils/brewRecordMocks"
    );
    return mocks.createBrewHistoryMock({
        brews: () => mockBrews,
        opened: () => mockOpened,
        judgementStore: () => mockJudgementStore
    });
});

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

// The real summary, wrapped so a test can see the height the screen measured
// and handed it — the leg no rendered pixel would reveal if it broke.
let summaryProps: Record<string, unknown> = {};
jest.mock("@/components/BrewSummary", () => {
    const actual = jest.requireActual("@/components/BrewSummary");
    return {
        __esModule: true,
        ...actual,
        default: (props: Record<string, unknown>) => {
            summaryProps = props;
            return actual.default(props);
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

    it("takes the planned length from the stored plan, not from the clock", async () => {
        // `heldSeconds` is the overrun and is clamped at zero, so run-minus-held
        // returns the plan's length only for a brew that overran; for one that
        // ended early or stalled it returns the *run's* length and the plan line
        // is drawn against stages that say otherwise. The snapshot knows.
        const stages = planFromPours(twoPours.pours);
        // Two 40 ml pours at 4 ml/s with 10 s pauses: 2 x (10 + 10) = 40 s.
        mockOpened = {
            record: {...record, plan: stages},
            samples: [{at: 0, water: 0, cup: 0, pour: 1},
                      {at: 228_000, water: 250, cup: 244, pour: 2}]
        };
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        // 228 s run against a 40 s plan, not the +14 S the clock arithmetic
        // would have produced from the same record.
        expect(screen.getByText(/\+188 S/)).toBeTruthy();
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
        expect(screen.queryByLabelText(/^Brew trace/)).toBeNull();
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

    describe("Beanconqueror handoff", () => {
        let openURL: jest.SpiedFunction<typeof Linking.openURL>;
        const [handoffTarget] = HANDOFF_TARGETS;

        beforeEach(() => {
            openURL = jest.spyOn(Linking, "openURL");
            openURL.mockReset();
            openURL.mockResolvedValue(undefined);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it("offers Beanconqueror handoff for a completed brew when the gate is on", async () => {
            await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

            expect(screen.getByLabelText(handoffTarget.buttonLabel)).toBeTruthy();
        });

        it("does not offer Beanconqueror handoff for a failed brew when the gate is on", async () => {
            mockOpened = {record: {...record, outcome: "failed"}, samples: []};

            await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

            expect(screen.getByLabelText("Save as image")).toBeTruthy();
            expect(screen.queryByLabelText(handoffTarget.buttonLabel)).toBeNull();
        });

        it("asks what the coffee was before handing over a brew from beans", async () => {
            const {getByLabelText} = await renderWithProviders(
                <BrewRecord recipeLookup={mockLookup} />
            );

            await fireEvent.press(getByLabelText(handoffTarget.buttonLabel));

            // The machine cannot know what was in the hopper, so the send waits
            // on the one person who does.
            expect(screen.getByTestId("bean-name-field")).toBeTruthy();
            expect(openURL).not.toHaveBeenCalled();
        });

        it("opens Beanconqueror once the coffee question is answered", async () => {
            const {getByLabelText, getByTestId} = await renderWithProviders(
                <BrewRecord recipeLookup={mockLookup} />
            );

            await fireEvent.press(getByLabelText(handoffTarget.buttonLabel));
            // The sheet animates in, and while it is animating its buttons are
            // in the tree and findable but their press is discarded. Retrying
            // the press is the only honest wait for it, since the thing being
            // waited on is the press landing. Same trap as brew history's
            // delete confirmation.
            await waitFor(async () => {
                await fireEvent.press(getByTestId("bean-name-send"));
                expect(openURL).toHaveBeenCalledTimes(1);
            });
        });

        it("opens Beanconqueror straight away for a pod brew, which knows its coffee", async () => {
            mockOpened = {
                record: {...record, coffee: {name: "Kenya Sakami"}},
                samples: []
            };

            const {getByLabelText} = await renderWithProviders(
                <BrewRecord recipeLookup={mockLookup} />
            );

            await fireEvent.press(getByLabelText(handoffTarget.buttonLabel));

            await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
            expect(screen.queryByTestId("bean-name-field")).toBeNull();
        });
        it("does not offer the handoff without the action", async () => {
            mockOpened = {record: {...record, outcome: "failed"}, samples: []};
            await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

            expect(screen.getByLabelText("Save as image")).toBeTruthy();
            expect(screen.queryByLabelText(handoffTarget.buttonLabel)).toBeNull();
        });
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

describe("a verdict on a record", () => {
    beforeEach(() => {
        mockParams = {id: "brew-1"};
        mockJudgementStore.judge.mockReset();
        mockJudgementStore.setPinned.mockReset();
        mockOpened = {record, samples: []};
    });

    it("shows the verdict the record already carries", async () => {
        mockOpened = {
            record: {...record, rating: 4, note: "Sweet, a little thin.", pinned: true},
            samples: []
        };
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.getByLabelText("Clear the rating, currently 4 stars")).toBeTruthy();
        expect(screen.getByDisplayValue("Sweet, a little thin.")).toBeTruthy();
    });

    it("writes a rating given here", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        await fireEvent.press(screen.getByTestId("judgement-stars-5"));
        expect(mockJudgementStore.judge).toHaveBeenCalledWith("brew-1", {rating: 5});
    });

    it("says nothing about the sweep until the brew is judged", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(screen.queryByTestId("record-pinned")).toBeNull();
    });

    it("reports the pin, and lets it go", async () => {
        // The pin is set by judging rather than asked for, so the screen's job
        // is to say what happened and offer the way out.
        mockOpened = {record: {...record, rating: 5, pinned: true}, samples: []};
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

        expect(screen.getByTestId("record-pinned")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("record-release"));

        expect(mockJudgementStore.setPinned).toHaveBeenCalledWith("brew-1", false);
        expect(screen.queryByTestId("record-pinned")).toBeNull();
        // Releasing is about the trace, not the verdict.
        expect(screen.getByLabelText("Clear the rating, currently 5 stars")).toBeTruthy();
    });

    it("keeps the control out of the captured picture", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
        expect(within(screen.getByTestId("viewshot")).queryByTestId("judgement-stars-1"))
            .toBeNull();
        expect(screen.queryByTestId("judgement-stars-1")).not.toBeNull();
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

    it("gives the summary the height its scroller measured", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewRecord recipeLookup={lookup} />
        );

        await act(async () => {
            fireEvent(getByTestId("record-scroll"), "layout", {
                nativeEvent: {layout: {height: 640, width: 390, x: 0, y: 0}}
            });
        });

        expect(summaryProps.availableHeight).toBe(640);
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

/**
 * The frame log is the only account of what the machine actually said, and it
 * is kept per brew because the machine's own is in memory and dies with a JS
 * reload. It is offered here rather than on the console because by the time
 * anyone knows a brew went wrong, the brew is over and this is the screen they
 * are looking at.
 */
describe("the frame log of a brew", () => {
    const log = "18:51:44.123  ←  58 02 07 4A 9E  event 40522 (1)";

    beforeEach(() => {
        mockParams = {id: "brew-1"};
        (Clipboard.setStringAsync as jest.Mock).mockClear();
        sharedSettings().set("machineConsoleAcknowledged", true);
    });

    afterEach(() => {
        sharedSettings().set("machineConsoleAcknowledged", false);
    });

    it("copies what the machine said, for a brew that kept a log", async () => {
        mockOpened = {record: {...record, outcome: "failed", failure: "noWater"},
                      samples: [], frames: log};
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

        await fireEvent.press(screen.getByLabelText("Copy the frame log"));

        expect(Clipboard.setStringAsync).toHaveBeenCalledWith(log);
    });

    /**
     * Offering a copy that yields an empty clipboard reads as the app having
     * lost the log rather than never having had one — a brew from before this
     * existed, or one whose log the retention sweep has taken.
     */
    it("offers nothing to copy for a brew with no log", async () => {
        mockOpened = {record, samples: [], frames: ""};
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

        expect(screen.queryByLabelText("Copy the frame log")).toBeNull();
    });

    /**
     * A wall of hex means nothing to someone who is not debugging the machine,
     * so it rides the same seven-tap gate as the console and the card
     * diagnostics rather than sitting in every owner's way.
     */
    it("stays hidden until the machine console has been found", async () => {
        sharedSettings().set("machineConsoleAcknowledged", false);
        mockOpened = {record, samples: [], frames: log};
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

        expect(screen.queryByLabelText("Copy the frame log")).toBeNull();
    });
});

describe("bypass on the record screen", () => {
    async function renderRecord(r: typeof record) {
        mockParams = {id: r.id};
        mockOpened = {
            record: r,
            samples: [{at: 0, water: 0, cup: 0, pour: 1},
                      {at: 228_000, water: r.waterTotal, cup: r.cupTotal, pour: 2}]
        };
        return renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);
    }

    it("draws the bypass a record kept", async () => {
        await renderRecord({
            ...record,
            waterTotal: 245,
            bypass: {volume: 5, temperature: 85, delivered: 5, startedAt: 183_000}
        });
        expect(screen.getByTestId("rung-bypass")).toBeTruthy();
        expect(screen.getByText("+5")).toBeTruthy();
    });

    it("draws an old record exactly as before", async () => {
        await renderRecord(record);
        expect(screen.queryByTestId("rung-bypass")).toBeNull();
        expect(screen.queryByTestId("figures-bypass")).toBeNull();
    });
});

// A brew somebody logged by hand. It has a rating, a note and a date, and
// the machine never saw it: no trace, no figures, no stages. Drawing the
// recipe's pours as though they had been poured would put a brew on the
// screen that never happened.
describe("a brew the app did not watch", () => {
    beforeEach(() => {
        mockParams = {id: "brew-1"};
        summaryProps = undefined as unknown as Record<string, unknown>;
        mockOpened = {
            record: {...record, watched: false, pours: 0, waterTotal: 0,
                     cupTotal: 0, heldSeconds: 0, endedAt: record.startedAt,
                     hasStream: false, rating: 4},
            samples: []
        };
    });

    it("says so rather than drawing noughts", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup}/>);

        expect(screen.getByText("NOT WATCHED")).toBeTruthy();
        expect(screen.queryByLabelText(/^Brew trace/)).toBeNull();
    });

    it("does not reconstruct stages from the recipe as it stands now", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup}/>);

        expect(summaryProps).toBeUndefined();
    });

    it("still names the recipe", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup}/>);

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("still offers the rating, which is the whole of the record", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup}/>);

        expect(screen.getByTestId("judgement-stars")).toBeTruthy();
        expect(screen.getByTestId("judgement-note")).toBeTruthy();
    });

    // There is no picture to save and no stream to export, so offering
    // either would hand back an empty file.
    it("offers neither export", async () => {
        await renderWithProviders(<BrewRecord recipeLookup={mockLookup}/>);

        expect(screen.queryByText("Save as image")).toBeNull();
        expect(screen.queryByText("Export the data")).toBeNull();
    });
});
