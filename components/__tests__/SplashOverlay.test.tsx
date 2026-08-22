import React from "react";
import {act, screen} from "@testing-library/react-native";

import SplashOverlay, {MARK_SIZE} from "@/components/SplashOverlay";
import {DURATION} from "@/constants/motion";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

jest.useFakeTimers();

/**
 * The overlay is deliberately hidden from the accessibility tree, and RNTL's
 * default queries skip anything hidden from it — so every lookup here has to opt
 * back in. That the plain queries cannot see it is itself the proof that the
 * hiding works.
 */
const HIDDEN = {includeHiddenElements: true} as const;

function get(testID: string) {
    return screen.getByTestId(testID, HIDDEN);
}

async function advance(ms: number) {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
}

/**
 * A node's *live* opacity. `props.style` is frozen at the last React render and
 * cannot see an animated value; only `jestAnimatedStyle` is live, and it commits
 * one frame after a rerender.
 */
function opacityOf(testID: string): number {
    const node = get(testID) as never as {
        props: {jestAnimatedStyle: {value: {opacity: number}}};
    };
    return node.props.jestAnimatedStyle.value.opacity;
}

function flatStyle(testID: string): Record<string, unknown> {
    const style = get(testID).props.style as never as
        Record<string, unknown>[];
    return Object.assign({}, ...[style].flat(2)) as Record<string, unknown>;
}

describe("SplashOverlay", () => {
    it("renders nothing when not visible", async () => {
        await renderWithProviders(
            <SplashOverlay visible={false} onFinished={jest.fn()}/>
        );

        expect(screen.queryByTestId("splash-overlay", HIDDEN)).toBeNull();
    });

    it("covers the screen in the base colour", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        // A splash that is not opaque, or not full-bleed, shows the seam it
        // exists to hide.
        const style = flatStyle("splash-overlay");

        expect(style.backgroundColor).toBe(palette.base);
        expect(style.position).toBe("absolute");
        expect([style.top, style.left, style.right, style.bottom]).toEqual([0, 0, 0, 0]);
    });

    it("draws the same mark as the static splash, at the same size", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        // The whole premise of the component is that its first frame is a pixel
        // match for the launch image it takes over from. A different asset or a
        // different size makes the handoff jump.
        const mark = get("splash-mark");
        const style = flatStyle("splash-mark");

        expect(mark.props.source).toBe(require("../../assets/images/splash-icon.png"));
        expect(style.width).toBe(MARK_SIZE);
        expect(style.height).toBe(MARK_SIZE);
        expect(MARK_SIZE).toBe(
            require("../../app.json").expo.plugins
                .find((p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen")[1]
                .imageWidth
        );
    });

    it("keeps the mark centred by positioning the wordmark absolutely", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        // In a column the wordmark would push the mark off centre, and the mark
        // would no longer line up with the static splash behind it.
        const style = flatStyle("splash-wordmark");

        expect(style.position).toBe("absolute");
        expect(screen.getByLabelText("XBRW++", HIDDEN)).toBeTruthy();
    });

    it("hides itself from screen readers", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        // It duplicates the launch image and the real app is already mounted
        // behind it, so it is decorative. `pointerEvents` alone does not remove
        // a view from the accessibility tree.
        const overlay = get("splash-overlay");

        // The default queries cannot see it at all, which is the behaviour a
        // screen reader gets.
        expect(screen.queryByTestId("splash-overlay")).toBeNull();
        expect(overlay.props.pointerEvents).toBe("none");
        expect(overlay.props.accessibilityElementsHidden).toBe(true);
        expect(overlay.props.importantForAccessibility).toBe("no-hide-descendants");
    });

    it("fades the wordmark in from nothing", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        const start = opacityOf("splash-wordmark");
        await advance(DURATION.base / 2);
        const middle = opacityOf("splash-wordmark");
        await advance(DURATION.base);

        expect(start).toBe(0);
        expect(middle).toBeGreaterThan(0);
        expect(middle).toBeLessThan(1);
        expect(opacityOf("splash-wordmark")).toBe(1);
    });

    it("holds at full opacity before it begins to fade", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        await advance(DURATION.hold - 40);

        expect(opacityOf("splash-overlay")).toBe(1);
    });

    it("fades the whole overlay, not just its contents", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        // Fading only the lockup would leave the opaque black backdrop up until
        // the parent unmounts it, turning the reveal into a hard cut.
        await advance(DURATION.hold + DURATION.base / 2);
        const middle = opacityOf("splash-overlay");

        expect(middle).toBeGreaterThan(0);
        expect(middle).toBeLessThan(1);
    });

    it("uses the leaving curve to go, and the entering curve to arrive", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);

        // A quarter of the way in, the two curves are far apart: EASING.out has
        // already covered most of its distance, EASING.in has barely started.
        // Sampling there is what distinguishes them — endpoints never can.
        await advance(DURATION.base / 4);
        const arriving = opacityOf("splash-wordmark");

        await advance(DURATION.hold);
        await advance(DURATION.base / 4);
        const leaving = opacityOf("splash-overlay");

        expect(arriving).toBeGreaterThan(0.5);
        expect(leaving).toBeGreaterThan(0.7);
    });

    it("does not report finished while it is still on screen", async () => {
        const onFinished = jest.fn();
        await renderWithProviders(<SplashOverlay visible onFinished={onFinished}/>);

        await advance(DURATION.hold + DURATION.base - 40);

        expect(onFinished).not.toHaveBeenCalled();
    });

    it("reports finished once it has faded out", async () => {
        const onFinished = jest.fn();
        await renderWithProviders(<SplashOverlay visible onFinished={onFinished}/>);

        await advance(DURATION.hold + DURATION.base + 32);

        expect(onFinished).toHaveBeenCalledTimes(1);
        expect(opacityOf("splash-overlay")).toBe(0);
    });

    it("survives its callback changing identity every render", async () => {
        const onFinished = jest.fn();
        const {rerender} = await renderWithProviders(
            <SplashOverlay visible onFinished={() => onFinished()}/>
        );

        // A parent that passes an inline arrow re-renders with a new function
        // each time. These deliberately continue past the fade: if the effect
        // depended on that identity it would restart the delay on every render
        // and the splash would cover the app forever.
        const step = 60;
        const window = DURATION.hold + DURATION.base + 32;
        for (let elapsed = 0; elapsed < window * 2; elapsed += step) {
            await advance(step);
            await rerender(<SplashOverlay visible onFinished={() => onFinished()}/>);
        }

        expect(onFinished).toHaveBeenCalledTimes(1);
    });
});
