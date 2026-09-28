/**
 * The catalogue's data is dirty and this is the only place that knows it.
 *
 * Every input below was observed in the live catalogue on 2026-09-28. A test
 * here that stops holding is a row rendering as punctuation soup on the browse
 * screen, so treat a changed expectation as a regression until proven
 * otherwise.
 */
import type {HubListRow} from "@/library/hub/hubApi";
import {normaliseHubRow, splitFacet} from "@/library/hub/hubRow";

function row(over: Partial<HubListRow> = {}): HubListRow {
    return {
        communityRecipeId: 164, recipeId: 576, recipeName: "Brian's Recipe",
        imageUrl: "https://example.com/a.png", userName: "xBloom Official",
        userAvatar: null, official: 1, model: "Studio", cupType: "xPod",
        cupTypeInt: 1, type: "Single Origin", origin: ["Colombia"],
        varietal: ["Mix"], process: ["Washed"], flavor: [], roast: 1,
        dose: 15, grinderSize: 52, rpm: 120, pourCount: 5, grandWater: 16,
        volume: "240", likesCount: 910,
        shareRecipeLink: "https://share-h5.xbloom.com/?id=abc",
        ...over
    };
}

describe("splitting a facet the server pre-joined", () => {
    it("splits on all three separators the catalogue uses", () => {
        // Official rows pack a whole list into element zero, and three
        // different separators are in use across the catalogue. Picking one
        // would leave two thirds of the rows showing a single run-on value.
        expect(splitFacet(["Washed \u00b7 Anaerobic"])).toEqual(["Washed", "Anaerobic"]);
        expect(splitFacet(["Washed \u2022 Anaerobic"])).toEqual(["Washed", "Anaerobic"]);
        // The third separator is a plain space, and it is only safe with the
        // vocabulary in hand. See the next test for why.
        expect(splitFacet(["Colombia Brazil"], ["Colombia", "Brazil"]))
            .toEqual(["Colombia", "Brazil"]);
    });

    it("keeps a multi-word value that was never joined", () => {
        // The plain-space separator cannot be applied blindly: "Washed Thermal
        // Shock" is one process and "Costa Rica" is one country. Only split on
        // a space when neither of the two real separators is present AND every
        // piece is a word the vocabulary knows.
        expect(splitFacet(["Washed Thermal Shock"], ["Washed", "Natural"]))
            .toEqual(["Washed Thermal Shock"]);
        expect(splitFacet(["Washed Natural"], ["Washed", "Natural"]))
            .toEqual(["Washed", "Natural"]);
    });

    it("throws away JSON that leaked through as a string", () => {
        // Literally what the server sends for some rows.
        expect(splitFacet(['["Washed"]'])).toEqual(["Washed"]);
        expect(splitFacet(['["Washed","Natural"]'])).toEqual(["Washed", "Natural"]);
    });

    it("drops blanks, trims, and de-duplicates", () => {
        expect(splitFacet(["  Washed  ", "", "Washed", null as unknown as string]))
            .toEqual(["Washed"]);
    });

    it("survives a missing facet entirely", () => {
        expect(splitFacet(null)).toEqual([]);
        expect(splitFacet(undefined)).toEqual([]);
    });
});

describe("normalising a row", () => {
    it("repairs a name that was decoded with the wrong codepage", () => {
        // "\u00ac\u2211" is the UTF-8 bytes of "\u00b7" read as Mac Roman. It is in real
        // recipe names, and it renders as visible rubbish.
        expect(normaliseHubRow(row({
            recipeName: "Colombia Washed \u00ac\u2211 Double Anaerobic"
        })).name).toBe("Colombia Washed \u00b7 Double Anaerobic");
    });

    it("reads an unset roast as unset rather than as the lightest", () => {
        // 479 of 3,020 rows are 0 or null. Showing those as "Light Roast"
        // would be inventing a fact about somebody's coffee.
        expect(normaliseHubRow(row({roast: 0})).roast).toBeNull();
        expect(normaliseHubRow(row({roast: null})).roast).toBeNull();
        expect(normaliseHubRow(row({roast: 3})).roast).toBe(3);
    });

    it("keeps the share link verbatim, because the importer parses it", () => {
        const link = "https://share-h5.xbloom.com/?id=MiGJDhQMUdG%2BttuEO8p8aQ%3D%3D";
        expect(normaliseHubRow(row({shareRecipeLink: link})).shareLink).toBe(link);
    });

    it("reads the volume, which arrives as a string on every row", () => {
        expect(normaliseHubRow(row({volume: "240"})).volume).toBe(240);
    });

    it("survives a volume the wire type says cannot happen", () => {
        // Checked across all 2,966 coffee rows: `volume` is always a non-empty
        // string, which is why `HubListRow` types it that way. This file is
        // the quarantine, though, so the defence stays and the cast is the
        // honest way to say these were never seen rather than pretending the
        // wire is looser than it is.
        const off = (volume: unknown) => row({volume} as Partial<HubListRow>);
        expect(normaliseHubRow(off(240)).volume).toBe(240);
        expect(normaliseHubRow(off(null)).volume).toBeNull();
        expect(normaliseHubRow(off("")).volume).toBeNull();
        expect(normaliseHubRow(off("not a number")).volume).toBeNull();
    });

    it("says whether a row is xBloom's own", () => {
        expect(normaliseHubRow(row({official: 1})).official).toBe(true);
        expect(normaliseHubRow(row({official: 2})).official).toBe(false);
    });

    it("gives a row with no author an empty author rather than the word null", () => {
        expect(normaliseHubRow(row({userName: null})).author).toBe("");
    });

    it("turns an empty image URL into no image", () => {
        // Empty strings sort like data downstream. This guard keeps the absence
        // of artwork as null, the same shape as an actually missing image.
        expect(normaliseHubRow(row({imageUrl: ""})).imageURL).toBeNull();
    });

    it("keeps missing display strings empty", () => {
        // These fields are typed from what the live wire currently sends, but
        // the normaliser is the quarantine. If one goes missing, render blank
        // copy instead of throwing or leaking a JS null into UI text.
        const broken = row(({
            recipeName: null,
            model: null,
            cupType: null,
            type: null
        } as unknown) as Partial<HubListRow>);
        expect(normaliseHubRow(broken)).toMatchObject({
            name: "",
            machine: "",
            cupType: "",
            coffeeType: ""
        });
    });

    it("does not carry the likes count forward at all", () => {
        // Every figure in the catalogue sits in the same narrow band, so it is
        // not a popularity signal. Not displayed, and therefore not modelled:
        // a field on the type is an invitation to show it.
        expect("likes" in normaliseHubRow(row())).toBe(false);
    });
});

describe("the separators the catalogue actually uses", () => {
    // Counted across all 2,966 live coffee rows rather than guessed: middle
    // dot 1,666, comma 456, bullet 119, katakana middle dot 76, semicolon 6.
    it.each([
        ["\u00b7", "Strawberry \u00b7 Floral Honey \u00b7 Stone Fruit"],
        [",", "Milk Chocolate, Orange Blossom, Vanilla"],
        ["\u2022", "Peach \u2022 Apple Cider \u2022 Butterscotch"],
        ["\u30fb", "Grapes\u30fbtamarind\u30fbcola"],
        [";", "Strawberry co-ferment; Dynamic Cherry"]
    ])("splits on %s", (_separator, joined) => {
        expect(splitFacet([joined])).toHaveLength(3 - Number(joined.includes(";")));
    });

    it("splits a row that mixes two separators", () => {
        // Four live rows do this, all of them flavour lists. Splitting on only
        // the first separator found would leave "cocoa, Tangerine zest" as one
        // flavour nobody has.
        expect(splitFacet(["Ginger flower \u00b7 Ripe plum \u00b7 Hints of cocoa, Tangerine zest"]))
            .toEqual(["Ginger flower", "Ripe plum", "Hints of cocoa", "Tangerine zest"]);
    });

    it("leaves an ampersand and a slash alone", () => {
        // "Herbs & Spices" is one flavour and "Geisha/Gesha" is one varietal.
        // Treating either as a separator invents values nobody wrote.
        expect(splitFacet(["Herbs & Spices"])).toEqual(["Herbs & Spices"]);
        expect(splitFacet(["Geisha/Gesha"])).toEqual(["Geisha/Gesha"]);
    });

    it("drops a value that is somebody declining to answer", () => {
        // 38 live rows between them. Kept, they become a filter chip offering
        // to find coffees whose flavour is "N/A".
        expect(splitFacet(["N/A"])).toEqual([]);
        expect(splitFacet(["NONE"])).toEqual([]);
        expect(splitFacet(["-"])).toEqual([]);
        // A rule, not a longer list: whatever the next person types instead of
        // answering will not be on any list we wrote.
        expect(splitFacet(["???"])).toEqual([]);
        expect(splitFacet(["\u2014"])).toEqual([]);
        expect(splitFacet(["Peach \u00b7 N/A \u00b7 Cocoa"])).toEqual(["Peach", "Cocoa"]);
    });
});

describe("the edges the first pass missed", () => {
    it("splits on the CJK list separator", () => {
        // 113 live occurrences, more than the semicolon. Found by censusing
        // every non-ASCII punctuation mark in every facet value rather than by
        // listing the separators we expected to find, which is how the first
        // pass missed it.
        expect(splitFacet(["\u6843\u5b50\u3001\u8309\u8389\u82b1\u3001\u9ed1\u7cd6"]))
            .toEqual(["\u6843\u5b50", "\u8309\u8389\u82b1", "\u9ed1\u7cd6"]);
    });

    it("leaves a dash alone, because it is a qualifier as often as a separator", () => {
        // `Rwanda \u2013 Gakenke District` is one origin. Flavour lists do use a
        // dash as a separator, but shredding an address is the worse mistake.
        expect(splitFacet(["Rwanda \u2013 Gakenke District"]))
            .toEqual(["Rwanda \u2013 Gakenke District"]);
    });

    it("cleans the coffee type the same way it cleans a facet", () => {
        // `type` is free text but the server's own vocabulary has three
        // members, so it carries the same junk: `N/A` on 11 rows, `???` on
        // two, a joiner on 25. It draws as one badge, so the first value wins.
        expect(normaliseHubRow(row({type: "N/A"})).coffeeType).toBe("");
        expect(normaliseHubRow(row({type: "SL28, SL34"})).coffeeType).toBe("SL28");
        expect(normaliseHubRow(row({type: "Single Origin"})).coffeeType).toBe("Single Origin");
    });

    it("refuses a roast the roast list has no word for", () => {
        // `roastList` has exactly five entries. A 7 passing through would
        // index off the end of it and draw nothing, or worse, draw the wrong
        // word, and the type alone does not stop it.
        expect(normaliseHubRow(row({roast: 7})).roast).toBeNull();
        expect(normaliseHubRow(row({roast: 5})).roast).toBe(5);
    });

    it("cleans a value that leaked through as unparsed JSON", () => {
        // Every live leak so far is a single plain word, but nothing promises
        // the string somebody stringified was clean to begin with.
        expect(splitFacet(['["Washed \u00b7 Natural"]'])).toEqual(["Washed", "Natural"]);
        expect(splitFacet(['["N/A"]'])).toEqual([]);
    });

    it("treats a whitespace-only image URL as no image", () => {
        expect(normaliseHubRow(row({imageUrl: "   "})).imageURL).toBeNull();
    });
});
