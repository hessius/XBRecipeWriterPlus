import React from "react";
import {Text} from "react-native";
import {screen} from "@testing-library/react-native";

import BrewStoryCard from "@/components/BrewStoryCard";
import {storyFrame} from "@/library/brew/storyCard";
import {renderWithProviders} from "@/test-utils/render";

const summary = <Text testID="summary-stub">the brew</Text>;

async function show(over: Partial<React.ComponentProps<typeof BrewStoryCard>> = {}) {
    await renderWithProviders(
        <BrewStoryCard
            width={360}
            summary={summary}
            when="3 Sep · 07:12"
            accent="#FF007F"
            rating={0}
            coffee={null}
            tags={[]}
            {...over}
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
            contentHeight: 461,
            summaryAvailableHeight: 328,
            requiredHeight: 444
        }));
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

    it("prints the coffee when there is one", async () => {
        await show({coffee: "Huila · Washed"});
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
        await show({tags: ["Ethiopia", "filter"]});
        expect(screen.getByTestId("story-tags")).toHaveTextContent(/Ethiopia/);
        expect(screen.getByTestId("story-tags")).toHaveTextContent(/filter/);
    });

    it("leaves the tag row out of an untagged brew", async () => {
        await show({tags: []});
        expect(screen.queryByTestId("story-tags")).toBeNull();
    });

    it("counts the tags it has no room for rather than wrapping them", async () => {
        await show({tags: ["a", "b", "c", "d", "e", "f"]});
        expect(screen.getByTestId("story-tags-more")).toHaveTextContent("+2");
        expect(screen.getByTestId("story-tags")).not.toHaveTextContent(/e/);
    });

    it("says nothing extra when every tag fits", async () => {
        await show({tags: ["a", "b"]});
        expect(screen.queryByTestId("story-tags-more")).toBeNull();
    });
});
