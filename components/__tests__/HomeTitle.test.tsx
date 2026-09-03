import React from "react";
import {act, screen} from "@testing-library/react-native";

import HomeTitle, {SESSION_START, WORDMARK_FADE_DELAY} from "@/components/HomeTitle";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

/** Long enough for the fade itself to have finished, not merely started. */
const DURATION_SLACK = 2000;

/** The `++` half of every copy of the lockup on screen, in draw order. */
function plusColours(includeHidden = false): string[] {
    return screen.getAllByText("++", {includeHiddenElements: includeHidden}).map((node) => {
        const style = Array.isArray(node.props.style)
            ? Object.assign({}, ...node.props.style.filter(Boolean))
            : node.props.style;
        return style?.color as string;
    });
}

function tintOpacity(): number {
    return screen.getByTestId("home-title-tint", {includeHiddenElements: true})
        .props.jestAnimatedStyle.value.opacity;
}

/**
 * Fake timers, with the clock wound back to the moment the module loaded.
 *
 * The countdown is measured against real time from `SESSION_START`, so without
 * this the test inherits however long the suite took to reach it — on a loaded
 * machine that is seconds, and the tint has already begun to go.
 */
function startTheSessionNow(): void {
    jest.useFakeTimers();
    jest.setSystemTime(SESSION_START);
}

describe("HomeTitle", () => {
    it("shows the mark and the library's count", async () => {
        await renderWithProviders(<HomeTitle count={7} fontSize={28}/>);

        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
        expect(screen.getByText("7")).toBeTruthy();
    });

    it("keeps the count off the screen when the library is empty", async () => {
        // A superscript zero beside the mark is not a fact worth stating.
        await renderWithProviders(<HomeTitle count={0} fontSize={28}/>);

        expect(screen.queryByTestId("home-title-count")).toBeNull();
    });

    it("stacks a tinted copy of the mark over a settled one", async () => {
        await renderWithProviders(<HomeTitle count={7} fontSize={28}/>);

        expect(plusColours(true)).toEqual([palette.muted, palette.brand]);
    });

    it("announces the mark once, not once per copy", async () => {
        // The tinted copy exists so the `++` can be cross-faded. A screen
        // reader hearing "XBRW++" twice in the same corner would be having an
        // implementation detail read aloud.
        await renderWithProviders(<HomeTitle count={7} fontSize={28}/>);

        expect(screen.getAllByLabelText("XBRW++")).toHaveLength(1);
        expect(plusColours()).toEqual([palette.muted]);
    });

    it("takes the tint away ten seconds in", async () => {
        startTheSessionNow();
        try {
            await renderWithProviders(<HomeTitle count={7} fontSize={28}/>);
            expect(tintOpacity()).toBe(1);

            await act(async () => {
                jest.advanceTimersByTime(WORDMARK_FADE_DELAY + DURATION_SLACK);
            });

            expect(tintOpacity()).toBe(0);
            // Faded to nothing rather than unmounted, so what is left on screen
            // is the settled copy underneath.
            expect(plusColours(true)).toEqual([palette.muted, palette.brand]);
        } finally {
            jest.useRealTimers();
        }
    });

    it("keeps the tint on until the delay is up", async () => {
        startTheSessionNow();
        try {
            await renderWithProviders(<HomeTitle count={7} fontSize={28}/>);

            await act(async () => {
                jest.advanceTimersByTime(WORDMARK_FADE_DELAY - 1000);
            });

            expect(tintOpacity()).toBe(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it("shrinks the mark when given a smaller size", async () => {
        const big = await renderWithProviders(<HomeTitle count={7} fontSize={28}/>);
        const large = big.getByText("XBRW").props.jestAnimatedStyle.value.fontSize;

        const small = await renderWithProviders(<HomeTitle count={7} fontSize={18}/>);
        const compact = small.getByText("XBRW").props.jestAnimatedStyle.value.fontSize;

        expect(compact).toBeLessThan(large);
    });

    it("does not shrink the count with it", async () => {
        // Doto stops reading as characters below 11 px, and the count is
        // already there.
        const small = await renderWithProviders(<HomeTitle count={7} fontSize={18}/>);

        expect(small.getByTestId("home-title-count").props.style)
            .toEqual(expect.arrayContaining([expect.objectContaining({fontSize: 11})]));
    });
});
