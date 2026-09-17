import {
    isLibraryView, asLibraryView, LIBRARY_VIEWS
} from "@/library/libraryView";

describe("library view", () => {
    it("knows the two views and nothing else", () => {
        expect(LIBRARY_VIEWS).toEqual(["list", "shelves"]);
        expect(isLibraryView("list")).toBe(true);
        expect(isLibraryView("shelves")).toBe(true);
        expect(isLibraryView("grid")).toBe(false);
        expect(isLibraryView(1)).toBe(false);
        expect(isLibraryView(undefined)).toBe(false);
    });

    // A view is one of a pair, and both halves are drawn at once. An unknown
    // stored value must resolve to one of them rather than to neither, or the
    // segmented control lights no segment and reports a state the library is
    // not in.
    it("falls back to the list rather than to neither half", () => {
        expect(asLibraryView("shelves")).toBe("shelves");
        expect(asLibraryView("nonsense")).toBe("list");
        expect(asLibraryView(null)).toBe("list");
    });

    // The strings a hostile backup carries. `in` walks the prototype chain;
    // `Object.hasOwn` does not, and a plain array membership test does not
    // either -- this locks the choice in whichever way the guard is written.
    it("rejects inherited property names", () => {
        expect(isLibraryView("toString")).toBe(false);
        expect(isLibraryView("constructor")).toBe(false);
        expect(isLibraryView("__proto__")).toBe(false);
    });
});
