import {
    COLLAPSE_AT, COLLAPSE_SHRINK, EXPAND_AT, nextCollapsed
} from "@/hooks/useCollapsibleHeader";

/**
 * A whole screen, run until its header stops changing its mind.
 *
 * The bug this models: collapsing the header shortens the page, so a list
 * resting at its bottom is dragged upwards by the collapse itself. If that
 * lands it under the expand threshold the header expands, the page grows back,
 * the list falls to the bottom again, and it strobes. `extent` is the furthest
 * the list can scroll, which is exactly the quantity the collapse changes.
 */
function settle(expandedExtent: number): boolean {
    let collapsed = false;

    for (let step = 0; step < 20; step++) {
        const extent = Math.max(collapsed ? expandedExtent - COLLAPSE_SHRINK : expandedExtent, 0);
        // A finger holding the list against the end of the page. It asks for the
        // bottom of the *expanded* page every frame, and gets whatever the page
        // is long enough to give -- so a collapse that shortens the page pulls
        // the offset up, and the expansion that would follow hands it straight
        // back. Modelling the offset as only ever falling misses the bug
        // entirely, because it is the handing back that closes the loop.
        const offset = Math.min(expandedExtent, extent);

        const next = nextCollapsed(offset, collapsed, extent);
        if (next === collapsed) {
            return collapsed;
        }
        collapsed = next;
    }

    throw new Error(`the header never settled on a page of ${expandedExtent}`);
}

describe("nextCollapsed", () => {
    it("stays expanded at rest", () => {
        expect(nextCollapsed(0, false)).toBe(false);
    });

    it("collapses once the list is scrolled past the threshold", () => {
        expect(nextCollapsed(COLLAPSE_AT + 1, false)).toBe(true);
    });

    it("does not collapse inside the dead band", () => {
        expect(nextCollapsed(EXPAND_AT + 1, false)).toBe(false);
    });

    it("stays collapsed inside the dead band", () => {
        expect(nextCollapsed(EXPAND_AT + 1, true)).toBe(true);
    });

    it("expands again only when the list returns near the top", () => {
        expect(nextCollapsed(EXPAND_AT - 1, true)).toBe(false);
    });

    it("cannot flap: no single offset produces a different state each call", () => {
        // The bug the dead band exists to prevent. With one threshold, an offset
        // sitting exactly on it alternates on every scroll event and the header
        // strobes. Applying the function to its own output must reach a fixed
        // point immediately, at every offset.
        for (let offset = 0; offset <= COLLAPSE_AT + 20; offset++) {
            for (const state of [true, false]) {
                const once = nextCollapsed(offset, state);
                expect(nextCollapsed(offset, once)).toBe(once);
            }
        }
    });

    it("treats rubber-band overscroll as the top of the list", () => {
        // iOS reports negative offsets when the list is pulled past its top.
        expect(nextCollapsed(-80, true)).toBe(false);
    });

    it("has a dead band at all", () => {
        expect(EXPAND_AT).toBeLessThan(COLLAPSE_AT);
    });

    it("settles on every page height, however little there is to scroll", () => {
        // The reported bug, as a range rather than an anecdote: a recipe whose
        // content was a few points taller than the screen caught the header
        // between its two states and it jumped back and forth.
        for (let extent = 0; extent <= COLLAPSE_SHRINK + COLLAPSE_AT + 200; extent += 4) {
            expect(() => settle(extent)).not.toThrow();
        }
    });

    it("does not collapse a page too short to stay collapsed", () => {
        // One point short of the room the collapse itself takes back.
        const extent = COLLAPSE_SHRINK + EXPAND_AT;
        expect(nextCollapsed(extent, false, extent)).toBe(false);
    });

    it("still collapses once there is room to spare", () => {
        const extent = COLLAPSE_SHRINK + EXPAND_AT + 1;
        expect(nextCollapsed(extent, false, extent)).toBe(true);
    });

    it("assumes there is room when nobody measured", () => {
        // The two-argument form is the pure decision, used where the extent is
        // not to hand. It must not become the conservative one by default.
        expect(nextCollapsed(COLLAPSE_AT + 1, false)).toBe(true);
    });
});
