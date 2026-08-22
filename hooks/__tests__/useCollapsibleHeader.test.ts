import {COLLAPSE_AT, EXPAND_AT, nextCollapsed} from "@/hooks/useCollapsibleHeader";

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
});
