import React from "react";
import {Pressable, Text} from "react-native";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";

import BrewStorySheet from "@/components/BrewStorySheet";
import {STORY_ASPECT} from "@/library/brew/storyCard";
import {renderWithProviders} from "@/test-utils/render";

const shotRef = {current: null};

async function measure(width: number, height: number): Promise<void> {
    await fireEvent(screen.getByTestId("story-stage"), "layout", {
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

function ReopenHarness() {
    const [open, setOpen] = React.useState(true);
    const [active, setActive] = React.useState(true);

    return (
        <>
            <Pressable accessibilityRole="button" accessibilityLabel="Host open"
                       onPress={() => setOpen(true)}>
                <Text>open</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Host close"
                       onPress={() => setOpen(false)}>
                <Text>close</Text>
            </Pressable>
            <BrewStorySheet
                open={open}
                onOpenChange={setOpen}
                shotRef={shotRef}
                busy={false}
                onShare={jest.fn()}
                toggles={[
                    {
                        key: "note", label: "NOTE", active,
                        onPress: () => setActive((value) => !value)
                    }
                ]}
            >
                {(width) => <Text testID="card-stub">{`card at ${width}`}</Text>}
            </BrewStorySheet>
        </>
    );
}

describe("the story sheet", () => {
    it("draws nothing until it knows how much room it has", async () => {
        await show();
        expect(screen.queryByTestId("card-stub")).toBeNull();
    });

    it("draws the card as wide as the room allows", async () => {
        await show();
        await measure(360, 4000);
        await waitFor(() =>
            expect(screen.getByTestId("card-stub")).toHaveTextContent("card at 360"));
    });

    it("shrinks the card when the height, not the width, is the constraint", async () => {
        await show();
        await measure(360, 500);
        const fits = Math.floor(500 / STORY_ASPECT);
        await waitFor(() =>
            expect(screen.getByTestId("card-stub"))
                .toHaveTextContent(`card at ${fits}`));
        expect(fits).toBeLessThan(360);
    });

    it("offers no share until there is a card to share", async () => {
        const {onShare} = await show();
        await fireEvent.press(screen.getByLabelText("Share the card"));
        expect(onShare).not.toHaveBeenCalled();
    });

    it("shares the card once it is drawn", async () => {
        const {onShare} = await show();
        await measure(360, 4000);
        await waitFor(() => expect(screen.getByTestId("card-stub")).toBeTruthy());
        await waitFor(async () => {
            await fireEvent.press(screen.getByLabelText("Share the card"));
            expect(onShare).toHaveBeenCalled();
        });
    });

    it("draws story toggles outside the captured card", async () => {
        await show({
            toggles: [
                {key: "coffee", label: "COFFEE", active: true, onPress: jest.fn()}
            ]
        });
        await measure(360, 4000);
        await waitFor(() => expect(screen.getByTestId("story-toggle-coffee")).toBeTruthy());

        expect(screen.getByTestId("story-toggle-row").props.horizontal).toBe(true);
        expect(within(screen.getByTestId("viewshot")).queryByTestId("story-toggle-coffee"))
            .toBeNull();
    });

    it("keeps a story toggle choice when the sheet is closed and reopened", async () => {
        await renderWithProviders(<ReopenHarness />);
        await measure(360, 4000);
        await waitFor(() => expect(screen.getByTestId("story-toggle-note")).toBeTruthy());

        await waitFor(async () => {
            await fireEvent.press(screen.getByLabelText("NOTE"));
            expect(screen.getByLabelText("NOTE").props.accessibilityState)
                .toEqual(expect.objectContaining({selected: false}));
        });
        await fireEvent.press(screen.getByLabelText("Host close"));
        await fireEvent.press(screen.getByLabelText("Host open"));
        await measure(360, 4000);

        await waitFor(() =>
            expect(screen.getByLabelText("NOTE").props.accessibilityState)
                .toEqual(expect.objectContaining({selected: false})));
    });
});
