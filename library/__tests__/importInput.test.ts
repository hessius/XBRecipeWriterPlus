/**
 * The whole grammar of what this app will accept from a user.
 *
 * Exhaustive on purpose: everything downstream -- the state machine, the
 * endpoint choice, whether a lookup happens at all -- is decided here, and a
 * pure function with no mocks is the cheapest place in the sub-project to be
 * thorough.
 */
import {parseImportInput} from "@/library/importInput";

describe("share links", () => {
    it("takes the id out of an xBloom share URL", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/recipe?id=abc123"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("accepts http as well as https", () => {
        expect(parseImportInput("http://share-h5.xbloom.com/recipe?id=abc123"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("accepts any host, because the id is opaque to us and the server checks it", () => {
        expect(parseImportInput("https://example.com/whatever?id=abc123"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("finds the id wherever it sits in the query string", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/r?lang=en&id=abc123&ref=x"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("decodes a percent-encoded id", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/r?id=a%2Bb"))
            .toEqual({kind: "share", id: "a+b"});
    });

    it("rejects a URL with no id", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/recipe")).toBeNull();
    });

    it("rejects a URL whose id is empty", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/recipe?id=")).toBeNull();
    });

    it("rejects a URL whose id is only whitespace", () => {
        // A blank id costs a guaranteed-failing request and shows a "no recipe"
        // error instead of a clean parse rejection.
        expect(parseImportInput("https://share-h5.xbloom.com/r?id=%20")).toBeNull();
    });

    it("trims whitespace around the id", () => {
        expect(parseImportInput("https://share-h5.xbloom.com/r?id=%20abc123%20"))
            .toEqual({kind: "share", id: "abc123"});
    });

    it("accepts an id at the length cap", () => {
        const id = "a".repeat(256);
        expect(parseImportInput(`https://share-h5.xbloom.com/r?id=${id}`))
            .toEqual({kind: "share", id});
    });

    it("rejects an id beyond the length cap", () => {
        const id = "a".repeat(257);
        expect(parseImportInput(`https://share-h5.xbloom.com/r?id=${id}`)).toBeNull();
    });

    it("rejects a non-http scheme", () => {
        expect(parseImportInput("ftp://share-h5.xbloom.com/r?id=abc123")).toBeNull();
    });

    it("ignores surrounding whitespace, which a paste often carries", () => {
        expect(parseImportInput("  https://share-h5.xbloom.com/r?id=abc123\n"))
            .toEqual({kind: "share", id: "abc123"});
    });
});

describe("pod codes", () => {
    it("takes a three-letter code with three digits", () => {
        expect(parseImportInput("ETH120")).toEqual({kind: "xid", xid: "ETH120"});
    });

    it("takes a three-letter code with two digits", () => {
        expect(parseImportInput("ETH12")).toEqual({kind: "xid", xid: "ETH12"});
    });

    it("takes a tea code", () => {
        expect(parseImportInput("SIGT58")).toEqual({kind: "xid", xid: "SIGT58"});
    });

    it("upper-cases a lower-case code, because the card holds it upper-case", () => {
        expect(parseImportInput("eth120")).toEqual({kind: "xid", xid: "ETH120"});
    });

    it("trims a code", () => {
        expect(parseImportInput("  ETH120  ")).toEqual({kind: "xid", xid: "ETH120"});
    });

    it("rejects two letters", () => {
        expect(parseImportInput("ET120")).toBeNull();
    });

    it("rejects one digit", () => {
        expect(parseImportInput("ETH1")).toBeNull();
    });

    it("rejects four digits", () => {
        expect(parseImportInput("ETH1234")).toBeNull();
    });
});

describe("everything else", () => {
    it("rejects an empty string", () => {
        // `isValidXID` says an empty XID is fine -- a recipe brews without one.
        // Nothing to look up is a different question, and the answer is no.
        expect(parseImportInput("")).toBeNull();
    });

    it("rejects whitespace alone", () => {
        expect(parseImportInput("   ")).toBeNull();
    });

    it("rejects prose", () => {
        expect(parseImportInput("meet me at six")).toBeNull();
    });

    it("rejects a bare word that is not a code", () => {
        expect(parseImportInput("coffee")).toBeNull();
    });
});
