import React from "react";
import {AccessibilityInfo} from "react-native";
import {act, screen} from "@testing-library/react-native";

import WriteSweep, {blockState} from "@/components/WriteSweep";
import {DURATION} from "@/constants/motion";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

jest.useFakeTimers();

/**
 * The colour of every block, in strip order. `backgroundColor` is the only
 * thing that says "this block is on the card"; a block count cannot see it.
 */
function colours(): string[] {
    return screen.getAllByTestId("write-sweep-block")
        .map((node) => (node.props.style as never as {backgroundColor: string}[])[0].backgroundColor);
}

/** The gap either side of a block. */
function marginOf(index: number): number {
    const style = screen.getAllByTestId("write-sweep-block")[index].props.style as never as
        {marginHorizontal: number}[];
    return style[0].marginHorizontal;
}

/**
 * A block's *live* opacity. `props.style` is frozen at the last React render
 * and cannot see an animated value; only the animated style is live, and it
 * commits one frame after a rerender.
 */
function opacityOf(index: number): number {
    const block = screen.getAllByTestId("write-sweep-block")[index] as never as
        {props: {jestAnimatedStyle: {value: {opacity: number}}}};
    return block.props.jestAnimatedStyle.value.opacity;
}

async function advance(ms: number) {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
}

describe("blockState", () => {
    it("marks earlier blocks as written", () => {
        expect(blockState(0, 3)).toBe("written");
    });

    it("marks the current block as active", () => {
        expect(blockState(3, 3)).toBe("active");
    });

    it("marks later blocks as pending", () => {
        expect(blockState(4, 3)).toBe("pending");
    });

    it("marks everything written once the count passes the last block", () => {
        expect(blockState(9, 10)).toBe("written");
    });

    // The component passes a clamped count; the export is reachable with a raw
    // one. A block half-way through a write is not on the card.
    it("does not call a partially written block written", () => {
        expect(blockState(0, 0.5)).toBe("active");
        expect(blockState(0, 0.999)).toBe("active");
        expect(blockState(1, 1.5)).toBe("active");
    });

    it("treats a negative count as nothing written", () => {
        expect(blockState(0, -3)).toBe("active");
        expect(blockState(1, -3)).toBe("pending");
    });

    it("treats a non-finite count as nothing written", () => {
        expect(blockState(0, Number.NaN)).toBe("active");
        expect(blockState(1, Number.NaN)).toBe("pending");
        expect(blockState(0, Number.POSITIVE_INFINITY)).toBe("active");
        expect(blockState(5, Number.POSITIVE_INFINITY)).toBe("pending");
    });
});

describe("WriteSweep", () => {
    it("renders one cell per block", async () => {
        // Deliberately not 12: a hard-coded strip length passes a 12-block test.
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={7}/>);
        expect(screen.getAllByTestId("write-sweep-block")).toHaveLength(7);
    });

    it("colours exactly the blocks that are on the card, and no others", async () => {
        // The whole contract. A strip that paints everything green claims a
        // written card; nothing in a block count or an accessibility value sees it.
        await renderWithProviders(<WriteSweep blocksWritten={3} totalBlocks={8}/>);
        expect(colours()).toEqual([
            palette.success, palette.success, palette.success,
            palette.text,
            palette.line, palette.line, palette.line, palette.line
        ]);
    });

    it("shows nothing as written before the write begins", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={6}/>);
        expect(colours().filter((c) => c === palette.success)).toHaveLength(0);
    });

    it("shows the whole strip written, with nothing still active, once done", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={6} totalBlocks={6}/>);
        expect(colours()).toEqual(new Array(6).fill(palette.success));
    });

    it("keeps the active block visually distinct from a written one", async () => {
        // Both animate to opacity 1, so colour is the only distinction there is.
        await renderWithProviders(<WriteSweep blocksWritten={2} totalBlocks={4}/>);
        expect(colours()[2]).not.toBe(colours()[1]);
        expect(colours()[2]).not.toBe(colours()[3]);
    });

    it("fills left to right", async () => {
        // Same children in the same order either way: only the container's
        // direction says which end the strip starts from.
        await renderWithProviders(<WriteSweep blocksWritten={1} totalBlocks={4}/>);
        expect(screen.getByTestId("write-sweep").props.style)
            .toMatchObject({flexDirection: "row"});
    });

    it("announces itself as a progress indicator", async () => {
        // Without the role the value below is announced as nothing at all.
        await renderWithProviders(<WriteSweep blocksWritten={1} totalBlocks={4}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityRole).toBe("progressbar");
    });

    it("never announces or paints more than was written, for any input", async () => {
        // `written / total` from a writer that lost its total yields NaN or
        // Infinity. Announcing a complete write of a card that was never touched
        // is the one lie this component must not tell.
        const {rerender} = await renderWithProviders(
            <WriteSweep blocksWritten={Number.POSITIVE_INFINITY} totalBlocks={4}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue)
            .toEqual({min: 0, max: 4, now: 0});
        expect(colours().filter((c) => c === palette.success)).toHaveLength(0);

        await rerender(<WriteSweep blocksWritten={Number.NaN} totalBlocks={4}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue)
            .toEqual({min: 0, max: 4, now: 0});
        expect(colours().filter((c) => c === palette.success)).toHaveLength(0);

        await rerender(<WriteSweep blocksWritten={-2} totalBlocks={4}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue.now).toBe(0);
        expect(colours().filter((c) => c === palette.success)).toHaveLength(0);

        await rerender(<WriteSweep blocksWritten={99} totalBlocks={4}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue.now).toBe(4);

        // A block part-way through a write is not on the card: round down.
        await rerender(<WriteSweep blocksWritten={2.9} totalBlocks={4}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue.now).toBe(2);
        expect(colours().filter((c) => c === palette.success)).toHaveLength(2);
    });

    it("holds a pending block back from a written one by opacity, not colour alone", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={2} totalBlocks={4}/>);
        expect(opacityOf(0)).toBe(1);
        expect(opacityOf(2)).toBe(1);
        expect(opacityOf(3)).toBeLessThan(1);
    });

    it("fades a block up only when the block is actually committed", async () => {
        const {rerender} = await renderWithProviders(<WriteSweep blocksWritten={1} totalBlocks={4}/>);
        expect(opacityOf(2)).toBeLessThan(1);

        // Time alone must move nothing: this is write-driven, not a timer.
        await advance(DURATION.fast * 8);
        expect(opacityOf(2)).toBeLessThan(1);
        expect(colours().filter((c) => c === palette.success)).toHaveLength(1);

        await rerender(<WriteSweep blocksWritten={3} totalBlocks={4}/>);
        await advance(16);
        expect(opacityOf(2)).toBeGreaterThan(0.4);   // mid-fade, not yet arrived
        expect(opacityOf(2)).toBeLessThan(1);
        await advance(DURATION.fast);
        expect(opacityOf(2)).toBe(1);
    });

    it("reports progress as blocks, not a percentage of time", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={6} totalBlocks={12}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue)
            .toEqual({min: 0, max: 12, now: 6});
    });

    it("renders nothing when there are no blocks to write", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={0}/>);
        expect(screen.queryByTestId("write-sweep")).toBeNull();
    });

    it("renders nothing when the total is lost rather than zero", async () => {
        // `NaN <= 0` is false, so a lost total slips past a bare guard and
        // announces `max: NaN` over an empty strip.
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={Number.NaN}/>);
        expect(screen.queryByTestId("write-sweep")).toBeNull();
    });

    it("spaces a short strip generously", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={8}/>);
        expect(marginOf(0)).toBe(1);
    });

    it("tightens the gaps as the strip gets denser", async () => {
        // The blocks share whatever width the gaps do not take, so a fixed
        // margin eats a quarter of the pitch on a 40-block write.
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={40}/>);
        expect(marginOf(0)).toBe(0.5);
    });

    // Last in the file on purpose: `useReducedMotion` seeds from a module-level
    // cache, so flipping the setting on leaks into every later test in the file.
    it("commits a block instantly under Reduce Motion, without hiding progress", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

        const {rerender} = await renderWithProviders(<WriteSweep blocksWritten={1} totalBlocks={4}/>);
        await advance(DURATION.fast * 2);

        await rerender(<WriteSweep blocksWritten={3} totalBlocks={4}/>);
        await advance(16);
        // A cross-fade, not an animation: arrived within a frame, not over 120ms.
        expect(opacityOf(2)).toBe(1);

        // Still legible as progress.
        expect(colours().filter((c) => c === palette.success)).toHaveLength(3);
    });
});
