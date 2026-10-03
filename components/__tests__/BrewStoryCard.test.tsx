import React from "react";
import {PixelRatio, StyleSheet, Text, type StyleProp, type ViewStyle} from "react-native";
import {screen} from "@testing-library/react-native";

import BrewStoryCard from "@/components/BrewStoryCard";
import {storyFrame, storySummaryBudget, type StorySummaryBudget} from "@/library/brew/storyCard";
import {renderWithProviders} from "@/test-utils/render";

const summary = <Text testID="summary-stub">the brew</Text>;

type ShowOptions = Partial<React.ComponentProps<typeof BrewStoryCard>> & {
    stageCount?: number;
    hasRateChart?: boolean;
    hasBypass?: boolean;
    hasGrindRecipeBadge?: boolean;
    drawdownRate?: number | null;
    figureExtraRows?: number;
    hasSummaryNote?: boolean;
    stagesUnavailable?: boolean;
};

async function show(over: ShowOptions = {}) {
    const width = over.width ?? 360;
    const rating = over.rating ?? 0;
    const coffee = over.coffee ?? null;
    const tags = over.tags ?? [];
    const storySummary = over.summary ?? summary;
    const when = over.when ?? "3 Sep · 07:12";
    const {
        stageCount, hasRateChart, hasBypass, hasGrindRecipeBadge, drawdownRate,
        figureExtraRows, hasSummaryNote, stagesUnavailable, summary: _summary,
        when: _when, ...cardProps
    } = over;
    const budget = over.budget ?? storySummaryBudget({
        width,
        stages: stageCount ?? 2,
        hasRateChart: hasRateChart ?? true,
        hasCoffee: coffee !== null,
        hasRating: rating > 0,
        tags,
        fontScale: PixelRatio.getFontScale(),
        hasBypass,
        hasGrindRecipeBadge,
        drawdownRate,
        figureExtraRows,
        hasSummaryNote,
        stagesUnavailable
    });
    await renderWithProviders(
        <BrewStoryCard
            {...cardProps}
            width={width}
            budget={budget}
            summary={storySummary}
            when={when}
            accent="#FF007F"
            rating={rating}
            coffee={coffee}
            tags={tags}
        />
    );
}

describe("the story card", () => {
    it("draws the summary it was given rather than a brew of its own", async () => {
        await show();
        expect(screen.getByTestId("summary-stub")).toBeTruthy();
    });

    it("hands a story height budget to a summary render function", async () => {
        const renderSummary = jest.fn(() => summary);
        await show({
            summary: renderSummary,
            stageCount: 2,
            coffee: "Huila · Washed",
            rating: 4,
            tags: ["a", "b", "c", "d"]
        });

        expect(renderSummary).toHaveBeenCalledWith(expect.objectContaining({
            contentHeight: 589,
            showRateChart: true,
            showStages: true,
            traceHeight: expect.any(Number),
            rateHeight: expect.any(Number),
            rateTopGap: expect.any(Number),
            rateBottomGap: expect.any(Number)
        }));
        const calls = renderSummary.mock.calls as unknown as [[StorySummaryBudget]];
        const budget = calls[0][0];
        expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
    });

    it("renders the section gap the story budget allocated", async () => {
        const renderSummary = jest.fn(() => summary);
        await show({
            width: 600,
            summary: renderSummary,
            stageCount: 1,
            coffee: "Huila · Washed",
            rating: 4,
            tags: ["filter", "washed", "morning"]
        });

        const calls = renderSummary.mock.calls as unknown as [[StorySummaryBudget]];
        const budget = calls[0][0] as StorySummaryBudget & {sectionGap?: number};
        expect(budget.sectionGap).toBeGreaterThan(8);
        const style = StyleSheet.flatten(
            screen.getByTestId("story-content").props.style as StyleProp<ViewStyle>
        );
        expect(style?.gap).toBe(budget.sectionGap);
    });

    it("stands the frame up at nine by sixteen", async () => {
        await show({width: 360});
        const frame = storyFrame(360);
        expect(screen.getByTestId("brew-story-card").props.style)
            .toEqual(expect.arrayContaining([
                expect.objectContaining({width: frame.width, height: frame.height})
            ]));
    });

    it("keeps the platform's bands empty", async () => {
        await show({width: 360});
        const frame = storyFrame(360);
        expect(screen.getByTestId("story-safe-top").props.style)
            .toEqual(expect.objectContaining({height: frame.safeTop}));
        expect(screen.getByTestId("story-safe-bottom").props.style)
            .toEqual(expect.objectContaining({height: frame.safeBottom}));
    });

    it("brands the card and dates it", async () => {
        await show();
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
        expect(screen.getByTestId("story-when")).toHaveTextContent("3 Sep · 07:12");
    });

    it("shrinks the story date during layout rather than transforming it", async () => {
        const scaleSpy = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(1.4);

        await show({width: 185, when: "2026-09-30 · 06:55"});

        const date = screen.getByTestId("story-when");
        const style = StyleSheet.flatten(date.props.style as StyleProp<ViewStyle>);
        expect(style?.transform).toBeUndefined();
        expect(date.props.maxFontSizeMultiplier).toBeLessThan(1.4);

        scaleSpy.mockRestore();
    });

    it("prints the coffee when there is one", async () => {
        await show({coffee: "Huila · Washed", hasRateChart: false});
        expect(screen.getByTestId("story-coffee")).toHaveTextContent("Huila · Washed");
    });

    it("leaves the coffee row out when nobody named it", async () => {
        await show({coffee: null});
        expect(screen.queryByTestId("story-coffee")).toBeNull();
    });

    it("shows the rating that was given", async () => {
        await show({rating: 4});
        expect(screen.getByTestId("story-rating")).toBeTruthy();
    });

    it("leaves the rating out of an unrated brew", async () => {
        await show({rating: 0});
        expect(screen.queryByTestId("story-rating")).toBeNull();
        // The row too, not just the stars: a padded row with nothing in it is
        // a gap the card has no explanation for.
        expect(screen.queryByTestId("story-rating-row")).toBeNull();
    });

    it("prints the tags", async () => {
        await show({tags: ["Ethiopia", "filter"], hasRateChart: false});
        expect(screen.getByTestId("story-tags")).toHaveTextContent(/Ethiopia/);
        expect(screen.getByTestId("story-tags")).toHaveTextContent(/filter/);
    });

    it("leaves the tag row out of an untagged brew", async () => {
        await show({tags: []});
        expect(screen.queryByTestId("story-tags")).toBeNull();
    });

    it("counts the tags it has no room for rather than wrapping them", async () => {
        await show({tags: ["a", "b", "c", "d", "e", "f"], hasRateChart: false});
        expect(screen.getByTestId("story-tags-more")).toHaveTextContent("+2");
        expect(screen.getByTestId("story-tags")).not.toHaveTextContent(/e/);
    });

    it("says nothing extra when every tag fits", async () => {
        await show({tags: ["a", "b"]});
        expect(screen.queryByTestId("story-tags-more")).toBeNull();
    });
});
