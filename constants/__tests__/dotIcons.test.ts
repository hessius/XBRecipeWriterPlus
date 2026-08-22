import {DOT_ICON_GRID, DOT_ICONS, litCells, type DotIconName} from "@/constants/dotIcons";

const names = Object.keys(DOT_ICONS) as DotIconName[];

describe("DOT_ICONS", () => {
    it("has every icon the app needs", () => {
        expect(names.sort()).toEqual(
            ["edit", "error", "import", "info", "scan", "settings", "success"]
        );
    });

    it.each(names)("%s is a square grid of the declared size", (name) => {
        const rows = DOT_ICONS[name];
        expect(rows).toHaveLength(DOT_ICON_GRID);
        for (const row of rows) {
            expect(row).toHaveLength(DOT_ICON_GRID);
        }
    });

    it.each(names)("%s contains only lit and unlit marks", (name) => {
        for (const row of DOT_ICONS[name]) {
            expect(row).toMatch(/^[#.]+$/);
        }
    });

    it.each(names)("%s lights at least one dot", (name) => {
        expect(litCells(DOT_ICONS[name]).length).toBeGreaterThan(0);
    });
});

describe("litCells", () => {
    it("returns the coordinates of the lit dots, and nothing else", () => {
        expect(litCells(["#.", ".#"])).toEqual([
            {x: 0, y: 0},
            {x: 1, y: 1}
        ]);
    });

    it("reads x as the column and y as the row", () => {
        // A single dot on the top row, last column. If x and y were swapped
        // every icon would render transposed, which is invisible on the
        // symmetric ones and wrong on the pencil.
        expect(litCells([".#", ".."])).toEqual([{x: 1, y: 0}]);
    });

    it("returns nothing for an entirely unlit grid", () => {
        expect(litCells(["..", ".."])).toEqual([]);
    });
});
