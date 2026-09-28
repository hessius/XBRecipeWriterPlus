import {parseHidden} from "@/library/hiddenShelves";
import {moveShelf, orderShelves} from "@/library/shelfOrder";

const A = "tag:mornings";
const B = "tag:for guests";
const C = "tag:decaf";

function stored(...ids: string[]): string {
    return JSON.stringify(ids);
}

describe("orderShelves", () => {
    it("rearranges the named ids into the given order", () => {
        expect(parseHidden(orderShelves(stored(A, B, C), [C, A, B]))).toEqual([C, A, B]);
    });

    it("leaves an id the order does not name where it was", () => {
        // The middle shelf is not part of the rearrangement, so the two that
        // are swap around it rather than through it.
        expect(parseHidden(orderShelves(stored(A, B, C), [C, A]))).toEqual([C, B, A]);
    });

    it("ignores an id that is not stored", () => {
        // `order` describes an arrangement of the user's shelves. A shelf that
        // is not one of them has no slot, and giving it one would promote it.
        expect(parseHidden(orderShelves(stored(A, B), [A, B, "tag:ghost"])))
            .toEqual([A, B]);
    });

    it("folds the ids it is given", () => {
        expect(parseHidden(orderShelves(stored(A, B), ["tag:FOR GUESTS", "tag:Mornings"])))
            .toEqual([B, A]);
    });

    it("returns the list unchanged when there is nothing to rearrange", () => {
        expect(parseHidden(orderShelves(stored(A, B, C), [B]))).toEqual([A, B, C]);
    });
});

describe("moveShelf", () => {
    it("moves a shelf one place earlier", () => {
        expect(parseHidden(moveShelf(stored(A, B, C), [A, B, C], B, -1)))
            .toEqual([B, A, C]);
    });

    it("moves a shelf one place later", () => {
        expect(parseHidden(moveShelf(stored(A, B, C), [A, B, C], B, 1)))
            .toEqual([A, C, B]);
    });

    it("refuses to move the first shelf earlier", () => {
        // Not a rotation to the end: a control the user presses at the top of
        // the grid must do nothing rather than something surprising.
        expect(parseHidden(moveShelf(stored(A, B, C), [A, B, C], A, -1)))
            .toEqual([A, B, C]);
    });

    it("refuses to move the last shelf later", () => {
        expect(parseHidden(moveShelf(stored(A, B, C), [A, B, C], C, 1)))
            .toEqual([A, B, C]);
    });

    it("moves past the shelf on screen, not the id in storage", () => {
        // `C` is stored between the two but is not on the grid, so moving `B`
        // up puts it before `A` and leaves the absent shelf where it was.
        expect(parseHidden(moveShelf(stored(A, C, B), [A, B], B, -1)))
            .toEqual([B, C, A]);
    });

    it("leaves the list alone when the shelf is not in the arrangement", () => {
        expect(parseHidden(moveShelf(stored(A, B), [A, B], "tag:ghost", 1)))
            .toEqual([A, B]);
    });
});
