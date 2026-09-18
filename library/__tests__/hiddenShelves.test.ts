import {
    isHidden, parseHidden, serialiseHidden, toggleHidden
} from "@/library/hiddenShelves";

describe("parseHidden", () => {
    it("reads nothing out of an empty setting", () => {
        // The default. A library that has never hidden anything must not get a
        // list containing one empty id, which would hide the shelf whose id is
        // the empty string -- there is none, but a filter is not the place to
        // rely on that.
        expect(parseHidden("")).toEqual([]);
    });

    it("reads a single id", () => {
        expect(parseHidden("tea")).toEqual(["tea"]);
    });

    it("keeps the order it was written in", () => {
        expect(parseHidden("tea,singlePour,mine"))
            .toEqual(["tea", "singlePour", "mine"]);
    });

    it("tolerates the whitespace a hand-edited backup might carry", () => {
        expect(parseHidden(" tea , mine ")).toEqual(["tea", "mine"]);
    });

    it("drops the empty fields a trailing comma leaves", () => {
        expect(parseHidden("tea,,mine,")).toEqual(["tea", "mine"]);
    });

    it("reads an author shelf's id whole", () => {
        // `sharedBy:Anna` carries a colon, not a comma, so it survives the one
        // separator this format has.
        expect(parseHidden("sharedBy:Anna,tea"))
            .toEqual(["sharedBy:Anna", "tea"]);
    });
});

describe("serialiseHidden", () => {
    it("writes nothing for an empty list", () => {
        expect(serialiseHidden([])).toBe("");
    });

    it("writes one id without a separator", () => {
        expect(serialiseHidden(["tea"])).toBe("tea");
    });

    it("says each id once", () => {
        expect(serialiseHidden(["tea", "tea", "mine"])).toBe("tea,mine");
    });

    it("drops a blank rather than writing an empty field", () => {
        expect(serialiseHidden(["tea", "", "  "])).toBe("tea");
    });

    it("round-trips what parse read", () => {
        expect(parseHidden(serialiseHidden(["tea", "mine"])))
            .toEqual(["tea", "mine"]);
    });
});

describe("isHidden", () => {
    it("finds a hidden shelf", () => {
        expect(isHidden("tea,mine", "mine")).toBe(true);
    });

    it("does not find one that is not there", () => {
        expect(isHidden("tea,mine", "singlePour")).toBe(false);
    });

    it("matches whole ids rather than substrings", () => {
        // `singlePour` contains no other id, but `mine` is a substring of
        // nothing here by luck rather than design: a prefix match would make
        // hiding one shelf hide another that merely starts the same way.
        expect(isHidden("singlePour", "single")).toBe(false);
    });

    it("hides nothing when nothing is stored", () => {
        expect(isHidden("", "tea")).toBe(false);
    });
});

describe("toggleHidden", () => {
    it("puts a shelf away", () => {
        expect(toggleHidden("", "tea")).toBe("tea");
    });

    it("brings one back", () => {
        expect(toggleHidden("tea,mine", "tea")).toBe("mine");
    });

    it("leaves the others where they were", () => {
        expect(toggleHidden("tea,mine,singlePour", "mine"))
            .toBe("tea,singlePour");
    });

    it("is its own inverse", () => {
        // The grid's footer and the tile's long press are the same act in two
        // directions, so this is the property that makes them one function.
        expect(toggleHidden(toggleHidden("tea", "mine"), "mine")).toBe("tea");
    });
});
