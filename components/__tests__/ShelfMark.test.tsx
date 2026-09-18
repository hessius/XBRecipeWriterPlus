import {screen} from "@testing-library/react-native";
import React from "react";

import ShelfMark, {markFor, MARK_MEMBERS, MARK_SIZE} from "@/components/ShelfMark";
import Pour from "@/library/Pour";
import type {ShelfMarkVariant} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

function pours(count: number): Pour[] {
    return Array.from({length: count}, (_, index) => new Pour(index + 1, 50));
}

const THREE = ["#A", "#B", "#C"];

describe("ShelfMark", () => {
    // The size is the whole contract. Every art candidate the design is testing
    // draws inside this square, so a variant that changed it would reflow the
    // grid the moment a tester switched to it.
    it.each([
        ["auto", "hybrid"], ["manual", "hybrid"],
        ["auto", "mosaic"], ["manual", "profiles"], ["auto", "glyph"]
    ] as [("auto" | "manual"), ShelfMarkVariant][])(
        "draws a 44 point square for a %s shelf under %s",
        async (kind, variant) => {
            await renderWithProviders(
                <ShelfMark kind={kind} variant={variant} glyph="shelfTea"
                           accents={THREE} profiles={[pours(2)]}/>
            );

            expect(screen.getByTestId("shelf-mark")).toHaveStyle({
                width: MARK_SIZE, height: MARK_SIZE
            });
        });

    it("fixes the square at the size the design commits to", () => {
        expect(MARK_SIZE).toBe(44);
    });

    describe("which art a shelf takes", () => {
        // The hybrid's whole claim: a glyph means the app found this shelf,
        // stacked profiles mean you built it.
        it("gives an auto shelf a glyph and a manual one its members", () => {
            expect(markFor("hybrid", "auto")).toBe("glyph");
            expect(markFor("hybrid", "manual")).toBe("profiles");
        });

        it.each(["mosaic", "profiles", "glyph"] as const)(
            "draws %s for both kinds when a tester picks it", (variant) => {
                expect(markFor(variant, "auto")).toBe(variant);
                expect(markFor(variant, "manual")).toBe(variant);
            });
    });

    describe("what each variant draws", () => {
        it("draws an auto shelf's glyph under the hybrid", async () => {
            await renderWithProviders(
                <ShelfMark kind="auto" glyph="shelfTea" accents={THREE}/>
            );
            expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
        });

        it("draws a manual shelf's profiles under the hybrid", async () => {
            await renderWithProviders(
                <ShelfMark kind="manual" accents={THREE} profiles={[pours(3)]}/>
            );
            expect(screen.getByTestId("shelf-mark-profiles")).toBeTruthy();
        });

        // A recipe with no pours has nothing to draw, so it is left out of the
        // stack. Its accent must leave with it: the colour is what says which
        // recipe a staircase belongs to, and a shape wearing the colour of a
        // recipe that is not on the square is worse than no colour at all.
        it("keeps each profile in the colour of the recipe it came from", async () => {
            await renderWithProviders(
                <ShelfMark kind="manual" accents={["#AAAAAA", "#BBBBBB"]}
                           profiles={[[], pours(2)]}/>
            );

            // react-native-svg has already resolved the colour to an ARGB int
            // by the time it reaches the host element, so the assertion has to
            // meet it there rather than on the string that was written.
            expect(screen.getByTestId("shelf-mark-profile-0").props.stroke)
                .toEqual({type: 0, payload: 0xFFBBBBBB});
        });

        // The glyphs are a closed set drawn at design time, and an author
        // shelf is named by a stranger, so there is no glyph for it and none
        // can be invented. It is open ended in exactly the way a tag is, so it
        // takes the same derived mark a tag does rather than an empty square.
        it("falls back to the members when an auto shelf has no glyph", async () => {
            await renderWithProviders(
                <ShelfMark kind="auto" glyph={null} accents={THREE}
                           profiles={[pours(2)]}/>
            );

            expect(screen.getByTestId("shelf-mark-profiles")).toBeTruthy();
            expect(screen.queryByTestId("shelf-mark-field")).toBeNull();
        });

        it("draws the mosaic when a tester picks it", async () => {
            await renderWithProviders(
                <ShelfMark kind="auto" variant="mosaic" glyph="shelfTea"
                           accents={THREE}/>
            );
            expect(screen.getByTestId("shelf-mark-mosaic")).toBeTruthy();
            expect(screen.queryByTestId("shelf-mark-glyph")).toBeNull();
        });
    });

    describe("what it does with nothing to draw", () => {
        // A tile that changed art when its last member left would read as two
        // shelves, so the fallback is the plain field rather than a variant.
        it("falls back to the field when a manual shelf has no members", async () => {
            await renderWithProviders(<ShelfMark kind="manual"/>);
            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });

        it("falls back to the field when the mosaic has no accents", async () => {
            await renderWithProviders(<ShelfMark kind="auto" variant="mosaic"/>);
            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });

        it("falls back to the field for a glyph shelf with no glyph", async () => {
            // A manual shelf under the glyph variant: there is no drawing for a
            // tag somebody typed, and none is invented.
            await renderWithProviders(
                <ShelfMark kind="manual" variant="glyph" accents={THREE}/>
            );
            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });

        it("ignores members whose recipes have no pours", async () => {
            await renderWithProviders(
                <ShelfMark kind="manual" accents={THREE} profiles={[[], []]}/>
            );
            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });
    });

    describe("the member cap", () => {
        it("is the three the design fixes", () => {
            expect(MARK_MEMBERS).toBe(3);
        });

        it("draws no more staircases than that, whatever it is handed", async () => {
            await renderWithProviders(
                <ShelfMark kind="manual" accents={THREE}
                           profiles={[pours(1), pours(2), pours(3), pours(4), pours(5)]}/>
            );

            // Asserting on the rendered output rather than the component tree:
            // a fourth staircase would be a fourth path, and the JSON tree is
            // the only place a count of them is visible.
            const svg = JSON.stringify(screen.toJSON());
            expect(svg.split('"d":').length - 1).toBe(MARK_MEMBERS);
        });
    });
});
