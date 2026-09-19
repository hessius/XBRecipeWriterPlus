import {screen} from "@testing-library/react-native";
import React from "react";

import ShelfMark, {markFor, MARK_MEMBERS, MARK_SIZE} from "@/components/ShelfMark";
import {renderWithProviders} from "@/test-utils/render";

const THREE = ["#AAAAAA", "#BBBBBB", "#CCCCCC"];

describe("ShelfMark", () => {
    // The size is the whole contract. Both marks draw inside this square, so
    // one of them changing it would reflow the grid around the other.
    it.each(["auto", "manual"] as const)(
        "draws a 44 point square for a %s shelf",
        async (kind) => {
            await renderWithProviders(
                <ShelfMark kind={kind} glyph="shelfTea" accents={THREE}/>
            );

            expect(screen.getByTestId("shelf-mark")).toHaveStyle({
                width: MARK_SIZE, height: MARK_SIZE
            });
        });

    it("fixes the square at the size the design commits to", () => {
        expect(MARK_SIZE).toBe(44);
    });

    describe("which art a shelf takes", () => {
        // The settled rule, and the whole claim the art makes: a glyph means
        // the app found this shelf, a mosaic means you built it.
        it("gives an auto shelf a glyph", () => {
            expect(markFor("auto")).toBe("glyph");
        });

        it("gives a manual shelf a mosaic of its members", () => {
            expect(markFor("manual")).toBe("mosaic");
        });
    });

    describe("what each kind draws", () => {
        it("draws an auto shelf's glyph", async () => {
            await renderWithProviders(
                <ShelfMark kind="auto" glyph="shelfTea" accents={THREE}/>
            );
            expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
            expect(screen.queryByTestId("shelf-mark-mosaic")).toBeNull();
        });

        it("draws a manual shelf's mosaic", async () => {
            await renderWithProviders(
                <ShelfMark kind="manual" accents={THREE}/>
            );
            expect(screen.getByTestId("shelf-mark-mosaic")).toBeTruthy();
            expect(screen.queryByTestId("shelf-mark-glyph")).toBeNull();
        });

        // Every auto shelf is supposed to have a glyph: the stock ones are a
        // closed set drawn at design time, and the per-author ones share a
        // single drawing. This is a floor under a bug, not a route anything is
        // expected to take, and the mosaic is a better floor than an empty
        // square.
        it("falls back to the mosaic when an auto shelf has no glyph", async () => {
            await renderWithProviders(
                <ShelfMark kind="auto" glyph={null} accents={THREE}/>
            );

            expect(screen.getByTestId("shelf-mark-mosaic")).toBeTruthy();
            expect(screen.queryByTestId("shelf-mark-field")).toBeNull();
        });
    });

    describe("what it does with nothing to draw", () => {
        // A tile that changed art when its last member left would read as two
        // shelves, so the fallback is the plain field rather than the other
        // mark.
        it("falls back to the field when a manual shelf has no members", async () => {
            await renderWithProviders(<ShelfMark kind="manual"/>);
            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });

        it("falls back to the field when an auto shelf has neither", async () => {
            await renderWithProviders(<ShelfMark kind="auto" glyph={null}/>);
            expect(screen.getByTestId("shelf-mark-field")).toBeTruthy();
        });

        it("still draws the glyph for an auto shelf with no members", async () => {
            // The glyph is drawn at design time and owes nothing to what is on
            // the shelf, so an empty one is still itself.
            await renderWithProviders(<ShelfMark kind="auto" glyph="shelfTea"/>);
            expect(screen.getByTestId("shelf-mark-glyph")).toBeTruthy();
        });
    });

    describe("the member cap", () => {
        it("is the three the design fixes", () => {
            expect(MARK_MEMBERS).toBe(3);
        });

        it("reads no more accents than that, whatever it is handed", async () => {
            // A fourth accent must not reach the square: the mosaic's fourth
            // tile is the dominant colour again, which is what keeps a shelf
            // of one from drawing a lone quarter.
            await renderWithProviders(
                <ShelfMark kind="manual"
                           accents={[...THREE, "#DDDDDD", "#EEEEEE"]}/>
            );

            expect(JSON.stringify(screen.toJSON())).not.toContain("#DDDDDD");
        });

        it("fills all four tiles from a shelf of one", async () => {
            await renderWithProviders(
                <ShelfMark kind="manual" accents={["#AAAAAA"]}/>
            );

            const drawn = JSON.stringify(screen.toJSON());
            expect(drawn.split("#AAAAAA").length - 1).toBe(4);
        });
    });
});
