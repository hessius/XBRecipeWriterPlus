import {parseBrewMindLink} from "@/library/brewmindLink";

const SHARE = "https://xbloom.com/share?id=abc123";

const link = (params: Record<string, string>) => {
    const url = new URL("xbrw://import");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
};

const valid = (extra: Record<string, string> = {}) =>
    link({v: "1", source: "brewmind", share: SHARE, ...extra});

describe("parseBrewMindLink", () => {
    it("reads a link carrying only a share", () => {
        expect(parseBrewMindLink(valid())).toEqual({share: SHARE, source: "brewmind"});
    });

    it("reads every bean field the contract defines", () => {
        const parsed = parseBrewMindLink(valid({
            "bean.name": "Finca La Esperanza",
            "bean.roaster": "Some Roastery",
            "bean.roastingDate": "2026-09-01",
            "bean.roast": "Medium",
            "bean.country": "Colombia",
            "bean.region": "Huila",
            "bean.farm": "La Esperanza",
            "bean.farmer": "Ana Ruiz",
            "bean.elevation": "1750",
            "bean.processing": "Washed",
            "bean.fermentation": "Anaerobic",
            "bean.variety": "Pink Bourbon",
            "bean.beanMix": "Single Origin",
            "bean.aromatics": "Peach, jasmine",
            "bean.note": "A narrative.",
            "bean.cupping_points": "86.5",
            "bean.decaffeinated": "0",
            "bean.url": "https://example.com/coffee",
            "bean.image": "https://example.com/bag.png"
        }));
        expect(parsed?.coffee).toEqual({
            name: "Finca La Esperanza",
            roaster: "Some Roastery",
            roastingDate: "2026-09-01",
            roast: "Medium",
            country: "Colombia",
            region: "Huila",
            farm: "La Esperanza",
            farmer: "Ana Ruiz",
            elevation: 1750,
            processing: "Washed",
            fermentation: "Anaerobic",
            variety: "Pink Bourbon",
            beanMix: "Single Origin",
            aromatics: "Peach, jasmine",
            note: "A narrative.",
            cupping_points: 86.5,
            decaffeinated: false,
            url: "https://example.com/coffee",
            imageUrl: "https://example.com/bag.png"
        });
    });

    it("still reads the field names #159 first published", () => {
        // #159's first table claimed Beanconqueror's names and diverged on
        // five of them. The table was corrected, but a link is minted by a
        // second codebase on a release schedule this one does not control, so
        // a link written against the old table must not lose those five
        // fields silently.
        const parsed = parseBrewMindLink(valid({
            "bean.name": "X",
            "bean.roastDate": "2026-09-01",
            "bean.roastLevel": "Medium",
            "bean.process": "Washed",
            "bean.cuppingScore": "86.5",
            "bean.decaf": "0"
        }));
        expect(parsed?.coffee).toEqual({
            name: "X",
            roastingDate: "2026-09-01",
            roast: "Medium",
            processing: "Washed",
            cupping_points: 86.5,
            decaffeinated: false
        });
    });

    it("lets the current spelling win when a link sends both", () => {
        const parsed = parseBrewMindLink(valid({
            "bean.name": "X",
            "bean.process": "Washed",
            "bean.processing": "Natural"
        }));
        expect(parsed?.coffee?.processing).toBe("Natural");
    });

    it("refuses a version it was not built to read", () => {
        // Half-reading a later grammar would import quietly wrong coffee,
        // which is worse than failing, and is why #159 has a version at all.
        expect(parseBrewMindLink(valid({v: "2"}))).toBeNull();
        expect(parseBrewMindLink(link({source: "brewmind", share: SHARE}))).toBeNull();
    });

    it("needs a share, because the recipe is the point", () => {
        expect(parseBrewMindLink(link({v: "1", "bean.name": "X"}))).toBeNull();
        expect(parseBrewMindLink(valid({share: "   "}))).toBeNull();
    });

    it("records an unknown source rather than refusing it", () => {
        expect(parseBrewMindLink(valid({source: "someoneelse"}))?.source).toBe("someoneelse");
        expect(parseBrewMindLink(link({v: "1", share: SHARE}))?.source).toBeUndefined();
    });

    it("ignores a link that is not an import link", () => {
        expect(parseBrewMindLink("xbrw://settings?v=1&share=" + SHARE)).toBeNull();
        expect(parseBrewMindLink("not a url")).toBeNull();
    });

    it("accepts the grammar by either door", () => {
        const https = "https://xbrw.app/import?v=1&share=" + encodeURIComponent(SHARE);
        expect(parseBrewMindLink(https)?.share).toBe(SHARE);
    });

    it("drops an over-long field and keeps the rest", () => {
        // Truncating would invent a different farm, so the field goes and the
        // block survives.
        const parsed = parseBrewMindLink(valid({
            "bean.name": "Kept",
            "bean.farm": "f".repeat(121),
            "bean.aromatics": "a".repeat(501),
            "bean.note": "n".repeat(2001)
        }));
        expect(parsed?.coffee).toEqual({name: "Kept"});
    });

    it("keeps a field sitting exactly on its cap", () => {
        const parsed = parseBrewMindLink(valid({
            "bean.name": "N".repeat(120),
            "bean.note": "n".repeat(2000)
        }));
        expect(parsed?.coffee?.name).toHaveLength(120);
        expect(parsed?.coffee?.note).toHaveLength(2000);
    });

    it("yields no bean at all when the name is unusable", () => {
        // Per #159: the name is the only field a bean can be matched on, so a
        // nameless block is weight without meaning.
        const parsed = parseBrewMindLink(valid({
            "bean.name": "N".repeat(121),
            "bean.roaster": "Some Roastery"
        }));
        expect(parsed).toEqual({share: SHARE, source: "brewmind"});
    });

    it("refuses a link that is not https where a URL is expected", () => {
        const parsed = parseBrewMindLink(valid({
            "bean.name": "Kept",
            "bean.url": "javascript:alert(1)",
            "bean.image": "http://example.com/bag.png"
        }));
        expect(parsed?.coffee).toEqual({name: "Kept"});
    });

    it("reads decaffeinated as a three-way answer", () => {
        const decaf = (value: string) =>
            parseBrewMindLink(valid({"bean.name": "X", "bean.decaffeinated": value}))
                ?.coffee?.decaffeinated;
        expect(decaf("1")).toBe(true);
        expect(decaf("0")).toBe(false);
        expect(decaf("maybe")).toBeUndefined();
        expect(parseBrewMindLink(valid({"bean.name": "X"}))
            ?.coffee?.decaffeinated).toBeUndefined();
    });

    it("refuses a roasting date that is not one", () => {
        // #159 states the type, so it is enforced at the door rather than
        // handed on for Beanconqueror to fail on.
        const roastingDate = (value: string) =>
            parseBrewMindLink(valid({"bean.name": "X", "bean.roastingDate": value}))
                ?.coffee?.roastingDate;
        expect(roastingDate("2026-09-01")).toBe("2026-09-01");
        expect(roastingDate("not-a-date")).toBeUndefined();
        expect(roastingDate("01/09/2026")).toBeUndefined();
        expect(roastingDate("2026-02-31")).toBeUndefined();
    });

    it("refuses a measurement that cannot be real", () => {
        const parsed = parseBrewMindLink(valid({
            "bean.name": "X",
            "bean.elevation": "0",
            "bean.cupping_points": "120"
        }));
        expect(parsed?.coffee).toEqual({name: "X"});
    });

    it("reads a height a user pasted off a bag", () => {
        // Beanconqueror holds elevation as a string and BrewMind's value
        // comes from whatever somebody copied, so a bare integer is the one
        // shape we cannot count on receiving.
        const parsed = parseBrewMindLink(valid({
            "bean.name": "X",
            "bean.elevation": "5,900 ft"
        }));
        expect(parsed?.coffee?.elevation).toBe(1798);
    });
});
