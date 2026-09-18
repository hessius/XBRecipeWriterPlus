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
        expect(parseHidden(serialiseHidden(["sharedBy:Anna", "tea"])))
            .toEqual(["sharedBy:anna", "tea"]);
    });
});

describe("serialiseHidden", () => {
    it("writes nothing for an empty list", () => {
        expect(parseHidden(serialiseHidden([]))).toEqual([]);
    });

    it("writes one id without a separator", () => {
        expect(parseHidden(serialiseHidden(["tea"]))).toEqual(["tea"]);
    });

    it("says each id once", () => {
        expect(parseHidden(serialiseHidden(["tea", "tea", "mine"])))
            .toEqual(["tea", "mine"]);
    });

    it("drops a blank rather than writing an empty field", () => {
        expect(parseHidden(serialiseHidden(["tea", "", "  "]))).toEqual(["tea"]);
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
        expect(parseHidden(toggleHidden("", "tea"))).toEqual(["tea"]);
    });

    it("brings one back", () => {
        expect(parseHidden(toggleHidden("tea,mine", "tea"))).toEqual(["mine"]);
    });

    it("leaves the others where they were", () => {
        expect(parseHidden(toggleHidden("tea,mine,singlePour", "mine")))
            .toEqual(["tea", "singlePour"]);
    });

    it("is its own inverse", () => {
        // The grid's footer and the tile's long press are the same act in two
        // directions, so this is the property that makes them one function.
        expect(parseHidden(toggleHidden(toggleHidden("tea", "mine"), "mine")))
            .toEqual(["tea"]);
    });
});

// An author shelf's id carries a display name somebody else typed into a share.
// "Smith, Anna" is an ordinary way to write a name, and under the old
// comma-separated format it was stored as two ids, neither of which was a shelf
// -- so the shelf the user put away came straight back.
describe("an author whose name has a comma in it", () => {
    const id = "sharedBy:Smith, Anna";

    it("stays one shelf through a round trip", () => {
        expect(parseHidden(serialiseHidden([id, "tea"]))).toHaveLength(2);
        expect(isHidden(serialiseHidden([id]), id)).toBe(true);
    });

    it("comes back out of hiding as one shelf", () => {
        const stored = toggleHidden("", id);
        expect(isHidden(stored, id)).toBe(true);
        expect(isHidden(toggleHidden(stored, id), id)).toBe(false);
    });
});

// The format changed after the setting shipped. A list written by the old build
// has to keep meaning what it meant, or everybody's put-away shelves return at
// once on upgrade.
describe("a list written in the old comma format", () => {
    it("still reads", () => {
        expect(parseHidden("tea,strong")).toEqual(["tea", "strong"]);
        expect(isHidden("tea,strong", "strong")).toBe(true);
    });

    it("is rewritten in the new format the first time it is touched", () => {
        expect(toggleHidden("tea,strong", "mine")).toContain("[");
    });

    it("survives a stored blank and a stored nonsense", () => {
        expect(parseHidden("")).toEqual([]);
        // A stored `[1]` reaching `trim` on a number is a crash on launch,
        // which is a worse outcome than a forgotten answer.
        expect(parseHidden("[1, null]")).toEqual([]);
        expect(parseHidden("not json [")).toEqual(["not json ["]);
    });
});

// Author shelves are grouped on the folded key, but the shelf id is built from
// whichever spelling the representative recipe happened to use. Storing the
// display spelling means a library whose representative changes from "café" to
// "CAFÉ" is a different id, and the shelf unhides itself.
describe("an author who is spelled two ways", () => {
    it("is one hidden shelf either way round", () => {
        const stored = toggleHidden("", "sharedBy:café");
        expect(isHidden(stored, "sharedBy:CAFÉ")).toBe(true);
    });

    it("leaves stock ids alone", () => {
        expect(parseHidden(serialiseHidden(["tea"]))).toEqual(["tea"]);
    });
});
