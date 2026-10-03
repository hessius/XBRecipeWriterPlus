import {readBrewMindNavigation} from "@/library/brewmindNavigation";

const SHARE_URL = "https://share-h5.xbloom.com/r?id=abc123";
const BREWMIND_URL = "xbrw://import?v=1&source=brewmind&share="
    + encodeURIComponent(SHARE_URL)
    + "&bean.name=Finca";

describe("readBrewMindNavigation", () => {
    it("classifies BrewMind import links before share links", () => {
        expect(readBrewMindNavigation(BREWMIND_URL)).toEqual({
            kind: "brewmind",
            link: expect.objectContaining({
                share:  SHARE_URL,
                source: "brewmind",
                coffee: {name: "Finca"}
            })
        });
    });

    it("classifies xBloom share links", () => {
        expect(readBrewMindNavigation(SHARE_URL)).toEqual({
            kind: "share",
            url:  SHARE_URL
        });
    });

    it("allows BrewMind pages that carry ordinary ids", () => {
        expect(readBrewMindNavigation("https://brewmind.coffee/coffee?id=42")).toEqual({
            kind: "allow"
        });
    });

    it("does not accept hostnames that only end with xbloom.com text", () => {
        expect(readBrewMindNavigation("https://evilxbloom.com/r?id=abc123")).toEqual({
            kind: "allow"
        });
    });

    it("allows malformed and non-web URLs without throwing", () => {
        for (const url of ["not a url", "about:blank", "data:text/plain,id=abc123"]) {
            expect(() => readBrewMindNavigation(url)).not.toThrow();
            expect(readBrewMindNavigation(url)).toEqual({kind: "allow"});
        }
    });
});
