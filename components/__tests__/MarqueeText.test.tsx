import React from "react";
import {Text} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import {withRepeat as reanimatedWithRepeat} from "react-native-reanimated";

import MarqueeText from "@/components/MarqueeText";
import {renderWithProviders} from "@/test-utils/render";

// Spread the real module: mocking it wholesale would take `useSharedValue` and
// `useAnimatedStyle` with it and the component would not render at all.
jest.mock("react-native-reanimated", () => {
    const actual = jest.requireActual("react-native-reanimated");
    // `__esModule` and `default` restated explicitly: spreading the namespace
    // alone loses the default export, and `Animated.View` then renders as
    // undefined.
    // `withRepeat` records rather than runs: an endless repeat driven by the
    // real implementation keeps reanimated's frame loop alive and jest never
    // exits. It returns 0, which is the resting offset the animation starts
    // from, so the component is left in a coherent state.
    return {__esModule: true, ...actual, default: actual.default,
            withRepeat: jest.fn(() => 0)};
});
// A plain import resolves to the mock above, `withRepeat` being a real export
// of the module.
const withRepeat = reanimatedWithRepeat as unknown as jest.Mock;

let mockReduced = false;
jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: () => mockReduced
}));

/**
 * Measure the frame and the line, since RNTL runs no layout of its own.
 *
 * Both events are awaited: `fireEvent` is asynchronous as of RNTL 14, and
 * leaving one in flight produced overlapping `act()` calls that broke every
 * render after this one — with a "cannot find the element" failure several
 * tests away from the cause.
 */
async function measure(frame: number, text: number) {
    await fireEvent(screen.getByTestId("marquee"), "layout",
                    {nativeEvent: {layout: {width: frame, height: 20}}});
    await fireEvent(screen.getByTestId("marquee-track"), "layout",
                    {nativeEvent: {layout: {width: text, height: 20}}});
}

async function draw(paused = false) {
    return renderWithProviders(
        <MarqueeText testID="marquee" paused={paused}>
            <Text>Yirgacheffe Konga Natural</Text>
        </MarqueeText>
    );
}

describe("MarqueeText", () => {
    beforeEach(() => {
        withRepeat.mockClear();
        mockReduced = false;
    });

    it("shows the whole line rather than an ellipsis", async () => {
        // The travelling is what reveals the end, so there has to be an end
        // left to reveal.
        await draw();
        expect(screen.getByText("Yirgacheffe Konga Natural")).toBeTruthy();
        expect(screen.getByText("Yirgacheffe Konga Natural").props.numberOfLines)
            .toBeUndefined();
    });

    it("stays still for a line that fits", async () => {
        await draw();
        await measure(300, 200);
        expect(withRepeat).not.toHaveBeenCalled();
    });

    it("stays still before anything has been measured", async () => {
        // Both widths start at zero, and zero minus zero must not read as an
        // overflow — otherwise every marquee twitches once on mount.
        await draw();
        expect(withRepeat).not.toHaveBeenCalled();
    });

    it("travels for a line that does not fit", async () => {
        await draw();
        await measure(200, 320);
        expect(withRepeat).toHaveBeenCalled();
    });

    it("stays still while the screen is being photographed", async () => {
        // A capture taken mid-travel freezes the name half-scrolled in a PNG
        // that can never scroll back.
        await draw(true);
        await measure(200, 320);
        expect(withRepeat).not.toHaveBeenCalled();
    });

    it("stays still when the system asks for reduced motion", async () => {
        mockReduced = true;
        await draw();
        await measure(200, 320);
        expect(withRepeat).not.toHaveBeenCalled();
    });

    it("loops forever rather than travelling once", async () => {
        await draw();
        await measure(200, 320);
        // -1 is reanimated's "repeat without end". A finite count would show
        // the end of the name once and then truncate it for good.
        expect(withRepeat.mock.calls[0][1]).toBe(-1);
        // Not reversed: the sequence already walks out and back, and letting
        // reanimated reverse it as well would skip the rest at the far end.
        expect(withRepeat.mock.calls[0][2]).toBe(false);
    });

    it("clips what has not arrived yet", async () => {
        await draw();
        expect(screen.getByTestId("marquee").props.style.overflow).toBe("hidden");
    });
});
