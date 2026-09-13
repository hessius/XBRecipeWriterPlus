import React from "react";
import {act} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import Recipe from "@/library/Recipe";

/**
 * Which tray the mount nudge peeks open.
 *
 * Lives in its own file because it needs a fake `Swipeable` to see the
 * imperative calls, and the sibling suite deliberately renders the real one to
 * check what the trays actually contain.
 *
 * The direction is the whole point of the nudge: there are two trays now, and
 * the one worth teaching is the unconventional one. Swipe-left-to-manage is the
 * iOS convention every user already carries, so hinting it would spend the
 * app's one launch-time interruption saying something already known.
 */
const mockOpenLeft = jest.fn();
const mockOpenRight = jest.fn();
const mockClose = jest.fn();

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
    const {forwardRef, useImperativeHandle} = jest.requireActual("react");
    return {
        __esModule: true,
        default: forwardRef((props: {children?: React.ReactNode}, ref: unknown) => {
            useImperativeHandle(ref, () => ({openLeft: mockOpenLeft, openRight: mockOpenRight, close: mockClose}));
            return props.children ?? null;
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

describe("SwipeableRecipeRow's mount nudge", () => {
    it("peeks the action tray, the direction a user has no convention for", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()} onBrew={jest.fn()} bounceOnMount/>
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
                                onDuplicate={jest.fn()} onBrew={jest.fn()} bounceOnMount/>
        );
        await act(async () => { jest.advanceTimersByTime(2000); });

        expect(mockClose).toHaveBeenCalled();
    });

    it("stays still when the caller does not ask for a hint", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()} onDelete={jest.fn()}
                                onDuplicate={jest.fn()} onBrew={jest.fn()}/>
        );
        await act(async () => { jest.advanceTimersByTime(2000); });

        expect(mockOpenLeft).not.toHaveBeenCalled();
        expect(mockOpenRight).not.toHaveBeenCalled();
    });
});
