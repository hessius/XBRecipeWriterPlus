import {moveShelfIdToSlot, shelfSlotAt, shelfSlotOrigin}
    from "@/library/shelfDrag";
import type {ShelfDragGeometry} from "@/library/shelfDrag";

const geometry: ShelfDragGeometry = {
    columns:    2,
    tileWidth:  100,
    tileHeight: 120,
    gapX:       12,
    gapY:       12
};

describe("shelfSlotAt", () => {
    it("finds the tile slot under the pointer", () => {
        expect(shelfSlotAt({x: 50, y: 60}, geometry, 4)).toBe(0);
        expect(shelfSlotAt({x: 162, y: 60}, geometry, 4)).toBe(1);
        expect(shelfSlotAt({x: 50, y: 192}, geometry, 4)).toBe(2);
        expect(shelfSlotAt({x: 162, y: 192}, geometry, 4)).toBe(3);
    });

    it("splits the gap between two tiles at its middle", () => {
        expect(shelfSlotAt({x: 105, y: 60}, geometry, 4)).toBe(0);
        expect(shelfSlotAt({x: 106, y: 60}, geometry, 4)).toBe(1);
    });

    it("splits the gap between rows at its middle", () => {
        expect(shelfSlotAt({x: 50, y: 125}, geometry, 4)).toBe(0);
        expect(shelfSlotAt({x: 50, y: 126}, geometry, 4)).toBe(2);
    });

    it("clamps positions before the grid to the first slot", () => {
        expect(shelfSlotAt({x: -80, y: -30}, geometry, 4)).toBe(0);
    });

    it("clamps positions past the grid to the last slot", () => {
        expect(shelfSlotAt({x: 500, y: 500}, geometry, 4)).toBe(3);
    });

    it("treats the padding slot on an odd final row as the last shelf", () => {
        expect(shelfSlotAt({x: 162, y: 192}, geometry, 3)).toBe(2);
    });

    it("returns no slot for an empty order", () => {
        expect(shelfSlotAt({x: 50, y: 60}, geometry, 0)).toBe(-1);
    });
});

describe("moveShelfIdToSlot", () => {
    it("moves an id earlier", () => {
        expect(moveShelfIdToSlot(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    });

    it("moves an id later", () => {
        expect(moveShelfIdToSlot(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    });

    it("does not change the order when the id is released over itself", () => {
        expect(moveShelfIdToSlot(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    });

    it("does not change the order when the id is absent", () => {
        expect(moveShelfIdToSlot(["a", "b"], "ghost", 1)).toEqual(["a", "b"]);
    });

    it("does not change the order when the slot is outside the arrangement", () => {
        expect(moveShelfIdToSlot(["a", "b"], "a", -1)).toEqual(["a", "b"]);
        expect(moveShelfIdToSlot(["a", "b"], "a", 2)).toEqual(["a", "b"]);
    });
});

describe("shelfSlotOrigin", () => {
    it("returns the top left point for a slot", () => {
        expect(shelfSlotOrigin(3, geometry)).toEqual({x: 112, y: 132});
    });
});
