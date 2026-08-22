import React from "react";
import {AccessibilityInfo} from "react-native";
import {act, screen} from "@testing-library/react-native";

import DotBloom, {clampProgress, litCount} from "@/components/DotBloom";
import {DURATION} from "@/constants/motion";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

jest.useFakeTimers();

/** The static (non-animated) half of a dot's style: colour and position. */
function boxOf(index: number): {left: number; top: number; width: number; backgroundColor: string} {
    const style = screen.getAllByTestId("dot-bloom-dot")[index].props.style as never as
        {left: number; top: number; width: number; backgroundColor: string}[];
    return style[0];
}

/**
 * The dot's *live* opacity. `props.style` holds only the value from the last
 * React render, so it cannot see the pulse or a lit/unlit flip; the animated
 * style is the only thing that distinguishes a breathing ring from a still one.
 */
function opacityOf(index: number): number {
    const dot = screen.getAllByTestId("dot-bloom-dot")[index] as never as
        {props: {jestAnimatedStyle: {value: {opacity: number}}}};
    return dot.props.jestAnimatedStyle.value.opacity;
}

function colours(): string[] {
    return screen.getAllByTestId("dot-bloom-dot")
        .map((_, index) => boxOf(index).backgroundColor);
}

async function advance(ms: number) {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
}

describe("clampProgress", () => {
    it.each([
        [0, 0], [1, 1], [0.5, 0.5], [4, 1], [-1, 0],
        [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0], [Number.NEGATIVE_INFINITY, 0]
    ])("clamps %p to %p", (input, expected) => {
        expect(clampProgress(input)).toBe(expected);
    });
});

describe("litCount", () => {
    it("lights nothing at zero", () => {
        expect(litCount(0, 24)).toBe(0);
    });

    it("lights everything at one", () => {
        expect(litCount(1, 24)).toBe(24);
    });

    it("lights half at one half", () => {
        expect(litCount(0.5, 24)).toBe(12);
    });

    it("clamps progress above one", () => {
        expect(litCount(4, 24)).toBe(24);
    });

    it("clamps progress below zero", () => {
        expect(litCount(-1, 24)).toBe(0);
    });

    it("treats a non-finite progress as zero", () => {
        expect(litCount(Number.NaN, 24)).toBe(0);
    });

    it("rounds down, so a dot lights only once its share has been read", () => {
        // Rounding to nearest lights a dot at its halfway point, which at 24
        // dots means 23.5/24 of a read shows a full ring — and `scanning` goes
        // false — while the last block is still in flight. The spec's
        // non-negotiable is that progress is always driven by real state, and a
        // ring that completes early is the one lie this animation can tell.
        expect(litCount(23.5 / 24, 24)).toBe(23);
        expect(litCount(23.9 / 24, 24)).toBe(23);
    });

    it("leaves a single dot unlit until the read is complete", () => {
        expect(litCount(0.99, 1)).toBe(0);
        expect(litCount(1, 1)).toBe(1);
    });
});

describe("DotBloom", () => {
    it("renders the full ring of dots regardless of progress", async () => {
        await renderWithProviders(<DotBloom progress={0.25} dotCount={24}/>);
        expect(screen.getAllByTestId("dot-bloom-dot")).toHaveLength(24);
    });

    it("renders as many dots as asked for", async () => {
        await renderWithProviders(<DotBloom progress={0} dotCount={12}/>);
        expect(screen.getAllByTestId("dot-bloom-dot")).toHaveLength(12);
    });

    it("exposes progress as an accessibility value", async () => {
        await renderWithProviders(<DotBloom progress={0.5}/>);
        expect(screen.getByTestId("dot-bloom").props.accessibilityValue)
            .toEqual({min: 0, max: 100, now: 50});
    });

    it("announces nothing read for a non-finite progress", async () => {
        // `read / total` with a total of zero. The ring lights nothing, so the
        // announcement must not say otherwise.
        await renderWithProviders(<DotBloom progress={Number.NaN} dotCount={8}/>);
        expect(screen.getByTestId("dot-bloom").props.accessibilityValue)
            .toEqual({min: 0, max: 100, now: 0});
        expect(colours()).toEqual(new Array(8).fill(palette.dim));
    });

    it("does not announce a complete read for an infinite progress", async () => {
        await renderWithProviders(<DotBloom progress={Number.POSITIVE_INFINITY} dotCount={8}/>);
        expect(screen.getByTestId("dot-bloom").props.accessibilityValue.now).toBe(0);
        expect(colours()).toEqual(new Array(8).fill(palette.dim));
    });

    it("announces itself as a progress indicator", async () => {
        // Without the role the value above is announced as nothing at all.
        await renderWithProviders(<DotBloom progress={0.5}/>);
        expect(screen.getByTestId("dot-bloom").props.accessibilityRole).toBe("progressbar");
    });

    it("lays the dots out on a ring, clockwise from twelve o'clock", async () => {
        // A ring that fills from 3 o'clock, or anticlockwise, or collapses to a
        // point, is a different animation; none of that is visible in a dot count.
        await renderWithProviders(<DotBloom progress={0} dotCount={4} size={100} dotSize={10}/>);
        const centre = 100 / 2 - 10 / 2;
        const radius = (100 - 10) / 2;

        // The ring occupies the box it says it does, or the layout around it is
        // sized for something other than what is drawn.
        expect(screen.getByTestId("dot-bloom").props.style)
            .toMatchObject({width: 100, height: 100});

        expect(boxOf(0).left).toBeCloseTo(centre);          // 12 o'clock
        expect(boxOf(0).top).toBeCloseTo(centre - radius);
        expect(boxOf(1).left).toBeCloseTo(centre + radius); // 3 o'clock
        expect(boxOf(1).top).toBeCloseTo(centre);
        expect(boxOf(2).left).toBeCloseTo(centre);          // 6 o'clock
        expect(boxOf(2).top).toBeCloseTo(centre + radius);
        expect(boxOf(3).left).toBeCloseTo(centre - radius); // 9 o'clock
        expect(boxOf(3).top).toBeCloseTo(centre);
    });

    it("keeps the whole ring inside the box it declares", async () => {
        await renderWithProviders(<DotBloom progress={0} dotCount={8} size={200} dotSize={16}/>);
        for (let index = 0; index < 8; index++) {
            expect(boxOf(index).width).toBe(16);

            // Sized from the dot centres, the ring overhangs by half a dot and a
            // clipping ancestor flattens its outer edge all the way round.
            expect(boxOf(index).left).toBeGreaterThanOrEqual(0);
            expect(boxOf(index).top).toBeGreaterThanOrEqual(0);
            expect(boxOf(index).left + 16).toBeLessThanOrEqual(200);
            expect(boxOf(index).top + 16).toBeLessThanOrEqual(200);
        }

        // ...and it still fills the box rather than shrinking away from it.
        expect(Math.min(...Array.from({length: 8}, (_, i) => boxOf(i).top))).toBeCloseTo(0);
        expect(Math.max(...Array.from({length: 8}, (_, i) => boxOf(i).top + 16))).toBeCloseTo(200);
    });

    it("lights the first N dots and no others", async () => {
        // The whole contract of the component: N is real read progress.
        await renderWithProviders(<DotBloom progress={0.25} dotCount={8}/>);
        expect(colours()).toEqual([
            palette.success, palette.success,
            palette.dim, palette.dim, palette.dim, palette.dim, palette.dim, palette.dim
        ]);
        expect(opacityOf(0)).toBe(1);
        expect(opacityOf(2)).toBeLessThan(1);
    });

    it("lights nothing before the read starts", async () => {
        await renderWithProviders(<DotBloom progress={0} dotCount={8}/>);
        expect(colours()).toEqual(new Array(8).fill(palette.dim));
    });

    it("lights everything when the read completes", async () => {
        await renderWithProviders(<DotBloom progress={1} dotCount={8}/>);
        expect(colours()).toEqual(new Array(8).fill(palette.success));
        expect(opacityOf(7)).toBe(1);
    });

    it("lights dots as real progress arrives, and never runs ahead of it", async () => {
        const {rerender} = await renderWithProviders(<DotBloom progress={0} dotCount={8}/>);
        expect(colours().filter((c) => c === palette.success)).toHaveLength(0);

        // Time alone must move nothing: this is progress-driven, not a timer.
        await advance(DURATION.deliberate * 4);
        expect(colours().filter((c) => c === palette.success)).toHaveLength(0);

        await rerender(<DotBloom progress={0.5} dotCount={8}/>);
        expect(colours().filter((c) => c === palette.success)).toHaveLength(4);
    });

    it("breathes the leading dot instead of leaving the ring frozen", async () => {
        await renderWithProviders(<DotBloom progress={0} dotCount={8}/>);
        const start = opacityOf(0);

        await advance(DURATION.deliberate / 2);
        const mid = opacityOf(0);
        expect(mid).toBeLessThan(start);

        // Reverses rather than restarting: a repeat that snaps back to full
        // brightness every cycle strobes instead of breathing.
        await advance(DURATION.deliberate);
        expect(opacityOf(0)).toBeGreaterThan(mid);
    });

    it("breathes only the dot at the fill boundary", async () => {
        // Every unlit dot pulsing in unison is a global flicker — a warning,
        // not a machine waiting. The motion marks where the ring has got to.
        await renderWithProviders(<DotBloom progress={0.25} dotCount={8}/>);
        const still = opacityOf(4);

        await advance(DURATION.deliberate / 2);
        expect(opacityOf(2)).toBeLessThan(still);  // the next dot to light
        expect(opacityOf(4)).toBe(still);
        expect(opacityOf(7)).toBe(still);
    });

    it("stops breathing once the read is complete", async () => {
        await renderWithProviders(<DotBloom progress={1} dotCount={8}/>);
        await advance(DURATION.deliberate / 2);

        // There is no boundary left, so nothing should still be waiting.
        for (let index = 0; index < 8; index++) {
            expect(opacityOf(index)).toBe(1);
        }
    });

    it("stops breathing a dot once it is lit", async () => {
        const {rerender} = await renderWithProviders(<DotBloom progress={0} dotCount={8}/>);
        await advance(DURATION.deliberate / 2);
        expect(opacityOf(0)).toBeLessThan(1);

        await rerender(<DotBloom progress={0.2} dotCount={8}/>);
        await advance(16);
        expect(opacityOf(0)).toBe(1);

        // The pulse was cancelled, not merely overwritten for one frame.
        await advance(DURATION.deliberate * 2);
        expect(opacityOf(0)).toBe(1);
    });

    // Last in the file on purpose: `useReducedMotion` seeds from a module-level
    // cache, so flipping the setting on leaks into every later test in the file.
    it("holds the ring still under Reduce Motion, without hiding progress", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

        await renderWithProviders(<DotBloom progress={0.25} dotCount={8}/>);

        // Let the asynchronous Reduce Motion read land before sampling.
        await advance(DURATION.deliberate);
        const before = opacityOf(4);

        // Deliberately not a whole number of pulse cycles: a still ring and a
        // ring sampled one full breath later look identical.
        await advance(DURATION.deliberate * 0.75);
        expect(opacityOf(4)).toBe(before);
        await advance(DURATION.deliberate * 0.4);
        expect(opacityOf(4)).toBe(before);

        // Still legible as progress: two lit, six not.
        expect(colours().filter((c) => c === palette.success)).toHaveLength(2);
    });
});
