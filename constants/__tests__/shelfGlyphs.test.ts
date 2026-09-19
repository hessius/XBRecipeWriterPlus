import {DOT_ICONS, DOT_ICON_GRID} from "@/constants/dotIcons";
import {AUTHOR_SHELF_GLYPH, SHELF_GLYPHS, shelfGlyph} from "@/constants/shelfGlyphs";
import {STOCK_FILTER_ORDER} from "@/library/libraryFilters";

describe("the auto shelves' glyphs", () => {
    // A stock filter with no glyph draws a blank square in a grid of drawings,
    // which reads as a bug rather than as a shelf. The Record type requires one
    // at compile time; this says the same thing at run time, for the filter that
    // gets added to the union without anybody rebuilding.
    it.each(STOCK_FILTER_ORDER)("gives %s a glyph", (id) => {
        expect(SHELF_GLYPHS[id]).toBeDefined();
        expect(DOT_ICONS[SHELF_GLYPHS[id]]).toBeDefined();
    });

    it("gives each shelf its own glyph", () => {
        const drawn = Object.values(SHELF_GLYPHS);
        expect(new Set(drawn).size).toBe(drawn.length);
    });

    it("keeps the author glyph out of the stock ones", () => {
        // Every author shelf shares it, so a stock shelf borrowing it would
        // make two different kinds of shelf look like the same one.
        expect(Object.values(SHELF_GLYPHS)).not.toContain(AUTHOR_SHELF_GLYPH);
        expect(DOT_ICONS[AUTHOR_SHELF_GLYPH]).toBeDefined();
    });

    it("draws every one of them on the 9 by 9 grid", () => {
        for (const name of Object.values(SHELF_GLYPHS)) {
            const rows = DOT_ICONS[name];
            expect(rows).toHaveLength(DOT_ICON_GRID);
            for (const row of rows) expect(row).toHaveLength(DOT_ICON_GRID);
        }
    });

    it("lights at least one dot in every one of them", () => {
        // A glyph of all dots off is a blank square that typechecks.
        for (const name of Object.values(SHELF_GLYPHS)) {
            expect(DOT_ICONS[name].join("")).toContain("#");
        }
    });

    describe("shelfGlyph", () => {
        it("answers for an auto shelf", () => {
            expect(shelfGlyph("tea")).toBe("shelfTea");
        });

        it("answers for an author shelf, whose name nobody could draw for", () => {
            // Auto is the kind of shelf that carries a glyph, and an author
            // shelf is auto. Without this it fell through to the manual mark
            // and read as a shelf somebody had built by hand.
            expect(shelfGlyph("sharedBy:Nils")).toBe(AUTHOR_SHELF_GLYPH);
        });

        it("gives every author the same glyph, since none of them is drawn", () => {
            expect(shelfGlyph("sharedBy:Nils")).toBe(shelfGlyph("sharedBy:Ada"));
        });

        it("answers nothing for a prefix with no author after it", () => {
            expect(shelfGlyph("sharedBy:")).toBeNull();
        });

        it("answers nothing for a tag, which has no drawing", () => {
            expect(shelfGlyph("tag:morning")).toBeNull();
        });

        it("answers nothing for an id it does not know", () => {
            expect(shelfGlyph("nonsense")).toBeNull();
        });
    });
});
