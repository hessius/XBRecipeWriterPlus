import appConfig from "@/app.json";
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

describe("readBrewMindNavigation and the scheme boundary", () => {
    /*
     * The regression this guards is the one the browser introduced.
     *
     * `parseBrewMindLink` accepts an https URL with `import` in the path, and
     * said so deliberately: under `openAuthSessionAsync` the session returned
     * only on `xbrw://import`, so the scheme was the boundary and the parser
     * did not need to be. Classifying every navigation in a WebView we own
     * removes that boundary, and without the scheme check any page could claim
     * a handoff and choose the bean metadata attached to it.
     */
    it("does not accept a BrewMind shaped link from an ordinary web page", () => {
        const hostile = "https://example.com/import?v=1&share="
            + encodeURIComponent(SHARE_URL)
            + "&bean.name=Whatever";
        expect(readBrewMindNavigation(hostile)).toEqual({kind: "allow"});
    });

    it("does not accept one from BrewMind's own page either", () => {
        // Not a special case. BrewMind hands over by redirecting to the app
        // scheme, so their page has no reason to use this shape, and trusting
        // a host here would be trusting anything able to reach it.
        const viaHost = "https://brewmind.coffee/import?v=1&share="
            + encodeURIComponent(SHARE_URL);
        expect(readBrewMindNavigation(viaHost)).toEqual({kind: "allow"});
    });

    it("accepts the xbrecipewriter alias, not only xbrw", () => {
        const alias = "xbrecipewriter://import?v=1&share=" + encodeURIComponent(SHARE_URL);
        expect(readBrewMindNavigation(alias)).toMatchObject({kind: "brewmind"});
    });

    it("trusts exactly the schemes the app is registered for", () => {
        // `app.json` is the registration. If a scheme is added there and not
        // here, a real handoff is refused; if one is added here and not there,
        // this trusts a scheme nothing can deliver.
        const registered: string[] = appConfig.expo.scheme;
        for (const scheme of registered) {
            const url = `${scheme}://import?v=1&share=` + encodeURIComponent(SHARE_URL);
            expect(readBrewMindNavigation(url)).toMatchObject({kind: "brewmind"});
        }
    });
});
