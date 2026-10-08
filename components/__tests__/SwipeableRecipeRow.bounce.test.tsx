import React from "react";
import {act} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import Recipe from "@/library/Recipe";

/**
 * Which tray the mount hint peeks open.
 *
 * Lives in its own file because it needs a fake `Swipeable` to see the
 * imperative calls, and the sibling suite deliberately renders the real one to
 * check what the trays actually contain.
 *
 * The direction is the whole point of the hint: there are two trays now, and
 * the owner decides which row demonstrates which side.
 */
const mockOpenLeft = jest.fn();
const mockOpenRight = jest.fn();
const mockClose = jest.fn();

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
    const {forwardRef, useImperativeHandle} = jest.requireActual("react");
    const {Pressable: MockPressable, View: MockView} =
        jest.requireActual<typeof import("react-native")>("react-native");
    return {
        __esModule: true,
        default: forwardRef((props: {
            children?: React.ReactNode;
            onSwipeableOpenStartDrag?: (direction: "left" | "right") => void;
            onSwipeableClose?: (direction: "left" | "right") => void;
        }, ref: unknown) => {
            useImperativeHandle(ref, () => ({openLeft: mockOpenLeft, openRight: mockOpenRight, close: mockClose}));
            return (
                <MockView>
                    <MockPressable testID="simulate-drag"
                                   onPress={() => props.onSwipeableOpenStartDrag?.("left")}/>
                    {/* The real Swipeable reports a close when the animation
                        ends, which is a frame the renderer has no notion of.
                        The test drives that moment itself. */}
                    <MockPressable testID="simulate-close-end"
                                   onPress={() => props.onSwipeableClose?.("left")}/>
                    {props.children ?? null}
                </MockView>
            );
        })
    };
});

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    return r;
}

beforeEach(() => {
    jest.useFakeTimers();
    mockOpenLeft.mockClear();
    mockOpenRight.mockClear();
    mockClose.mockClear();
});

afterEach(() => {
    jest.useRealTimers();
});

describe("SwipeableRecipeRow's mount hint", () => {
    it("peeks the action tray, the direction a user has no convention for", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()} onBrew={jest.fn()}
                                hintTray="action"/>
        );
        await act(async () => { jest.advanceTimersByTime(2000); });

        expect(mockOpenLeft).toHaveBeenCalled();
        // Not merely "one of them opened": peeking the management tray would
        // teach swipe-to-delete, which iOS already taught.
        expect(mockOpenRight).not.toHaveBeenCalled();
    });

    it("closes again, so the hint is a peek and not a stuck-open row", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()} onBrew={jest.fn()}
                                hintTray="action"/>
        );
        await act(async () => { jest.advanceTimersByTime(2000); });

        expect(mockClose).toHaveBeenCalled();
    });

    it("reports the hint once it has been given, so the owner can retire it", async () => {
        // The owner turns the hint off on this callback. Without it, "the first
        // row" is whichever recipe the current query puts on top, so every sort,
        // filter and search hands the gate a fresh row and replays the lesson.
        const onBounced = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()} onBrew={jest.fn()}
                                hintTray="action"
                                onBounced={onBounced}/>
        );
        expect(onBounced).not.toHaveBeenCalled();

        await act(async () => { jest.advanceTimersByTime(2000); });

        expect(onBounced).toHaveBeenCalledTimes(1);
    });

    it("still closes when the owner retires the nudge on the report", async () => {
        // The shape the app actually uses, and the one the fixed-prop tests
        // above cannot see. Retiring the hint clears `hintTray`, which
        // re-runs the effect and runs its cleanup -- and the cleanup clears the
        // timers. Report from the opening timer and the cleanup cancels the
        // very timer that brings the card back, leaving the row stuck open on
        // every cold start. Report from the closing one and there is nothing
        // left to cancel.
        function Owner() {
            const [hintTray, setHintTray] = React.useState<"action" | null>("action");
            return (
                <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                    onDuplicate={jest.fn()} onBrew={jest.fn()}
                                    hintTray={hintTray}
                                    onBounced={() => setHintTray(null)}/>
            );
        }

        await renderWithProviders(<Owner/>);
        // Advanced in two steps, and that is the test. Jumping past both timers
        // in one go runs them back to back before React ever re-renders, which
        // is not how a real 700 ms gap behaves: the retire lands between them.
        await act(async () => { jest.advanceTimersByTime(400); });
        expect(mockOpenLeft).toHaveBeenCalled();

        await act(async () => { jest.advanceTimersByTime(1600); });

        expect(mockClose).toHaveBeenCalled();
    });

    it("stays still when the caller does not ask for a hint", async () => {
        const onBounced = jest.fn();
        await renderWithProviders(
            <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()} onBrew={jest.fn()}
                                onBounced={onBounced}/>
        );
        await act(async () => { jest.advanceTimersByTime(2000); });

        expect(mockOpenLeft).not.toHaveBeenCalled();
        expect(mockOpenRight).not.toHaveBeenCalled();
        expect(onBounced).not.toHaveBeenCalled();
    });
});
