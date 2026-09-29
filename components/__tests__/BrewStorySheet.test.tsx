import React from "react";
import {Text} from "react-native";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import BrewStorySheet from "@/components/BrewStorySheet";
import {STORY_ASPECT} from "@/library/brew/storyCard";
import {renderWithProviders} from "@/test-utils/render";

const shotRef = {current: null};

function measure(width: number, height: number): void {
    fireEvent(screen.getByTestId("story-stage"), "layout", {
        nativeEvent: {layout: {width, height, x: 0, y: 0}}
    });
}

async function show(over: Partial<React.ComponentProps<typeof BrewStorySheet>> = {}) {
    const onShare = jest.fn();
    await renderWithProviders(
        <BrewStorySheet
            open
            onOpenChange={jest.fn()}
            shotRef={shotRef}
            busy={false}
            onShare={onShare}
            {...over}
        >
            {(width) => <Text testID="card-stub">{`card at ${width}`}</Text>}
        </BrewStorySheet>
    );
    return {onShare};
}

describe("the story sheet", () => {
    it("draws nothing until it knows how much room it has", async () => {
        await show();
        expect(screen.queryByTestId("card-stub")).toBeNull();
    });

    it("draws the card as wide as the room allows", async () => {
        await show();
        measure(360, 4000);
        await waitFor(() =>
            expect(screen.getByTestId("card-stub")).toHaveTextContent("card at 360"));
    });

    it("shrinks the card when the height, not the width, is the constraint", async () => {
        await show();
        measure(360, 500);
        const fits = Math.floor(500 / STORY_ASPECT);
        await waitFor(() =>
            expect(screen.getByTestId("card-stub"))
                .toHaveTextContent(`card at ${fits}`));
        expect(fits).toBeLessThan(360);
    });

    it("offers no share until there is a card to share", async () => {
        const {onShare} = await show();
        fireEvent.press(screen.getByLabelText("Share the card"));
        expect(onShare).not.toHaveBeenCalled();
    });

    it("shares the card once it is drawn", async () => {
        const {onShare} = await show();
        measure(360, 4000);
        await waitFor(() => expect(screen.getByTestId("card-stub")).toBeTruthy());
        await waitFor(() => {
            fireEvent.press(screen.getByLabelText("Share the card"));
            expect(onShare).toHaveBeenCalled();
        });
    });
});
