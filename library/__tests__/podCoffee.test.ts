import {isoDate, podCoffeeFromPodsVo, podCoffeeFromStored, podImageUrl} from "@/library/podCoffee";

describe("podImageUrl", () => {
    it("accepts only an https URL carried by pod artwork", () => {
        expect(podImageUrl("https://example.com/pod.png")).toBe("https://example.com/pod.png");
        expect(podImageUrl("http://example.com/pod.png")).toBeUndefined();
        expect(podImageUrl("javascript:alert(1)")).toBeUndefined();
        expect(podImageUrl("  ")).toBeUndefined();
        expect(podImageUrl(42)).toBeUndefined();
    });
});

describe("podCoffeeFromPodsVo", () => {
    it("reads the fields a real pod carries", () => {
        expect(podCoffeeFromPodsVo({
            theName: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            varietal: "Batian",
            flavor: "Cherry・strawberry・blueberry",
            introduce: "A producer narrative.",
            type: "Single Origin",
            imagePath: "https://example.com/pod.png",
            roast: 1
        })).toEqual({
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            processing: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            note: "A producer narrative.",
            beanMix: "Single Origin",
            imageUrl: "https://example.com/pod.png"
        });
    });

    it("does not map roast, whose meaning is unverified", () => {
        // The pod endpoint sends a field called `roast`, and `roast` is now a
        // field on this type too, filled by a BrewMind link. They must not be
        // wired together: the pod's value was 1 on every pod probed, so
        // mapping it would state a roast level nobody stated.
        const coffee = podCoffeeFromPodsVo({theName: "X", roast: 3});
        expect(coffee).not.toBeNull();
        expect(coffee!.roast).toBeUndefined();
    });

    it("drops empty strings rather than carrying them", () => {
        // subtitle is empty on real pods; so is origin on some.
        expect(podCoffeeFromPodsVo({theName: "X", origin: "", process: "  "}))
            .toEqual({name: "X"});
    });

    it("is null without a name, which is the only field worth matching on", () => {
        expect(podCoffeeFromPodsVo({origin: "Kenya"})).toBeNull();
        // Parsed endpoint JSON can carry an invalid typed value where the pod name should be.
        expect(podCoffeeFromPodsVo({theName: 42})).toBeNull();
        // The trust boundary should reject a non-object payload before looking for fields.
        expect(podCoffeeFromPodsVo("nonsense")).toBeNull();
        expect(podCoffeeFromPodsVo(null)).toBeNull();
        expect(podCoffeeFromPodsVo(undefined)).toBeNull();
    });

    it("refuses an image that is not https", () => {
        expect(podCoffeeFromPodsVo({theName: "X", imagePath: "javascript:alert(1)"}))
            .toEqual({name: "X"});
        // A plain-HTTP downgrade is the realistic bad image URL from the undocumented endpoint.
        expect(podCoffeeFromPodsVo({theName: "X", imagePath: "http://example.com/p.png"}))
            .toEqual({name: "X"});
    });
});

describe("podCoffeeFromStored", () => {
    it("reads the fields stored on our recipe JSON", () => {
        expect(podCoffeeFromStored({
            name: " Kenya Sakami Gloria Natural Batian ",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            note: "A producer narrative.",
            beanMix: "Single Origin",
            imageUrl: "https://example.com/pod.png",
            roast: 1
        })).toEqual({
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            processing: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            note: "A producer narrative.",
            beanMix: "Single Origin",
            imageUrl: "https://example.com/pod.png"
        });
    });

    it("drops empty, non-string, unknown, and non-https values", () => {
        expect(podCoffeeFromStored({
            name: "X",
            origin: "",
            process: 42,
            variety: "  ",
            aromatics: ["berry"],
            imageUrl: "http://example.com/pod.png",
            roast: 1
        })).toEqual({name: "X"});
    });

    it("is null without a stored name", () => {
        expect(podCoffeeFromStored({origin: "Kenya"})).toBeNull();
        expect(podCoffeeFromStored({name: ""})).toBeNull();
        expect(podCoffeeFromStored("nonsense")).toBeNull();
        expect(podCoffeeFromStored(null)).toBeNull();
        expect(podCoffeeFromStored(undefined)).toBeNull();
    });
});

describe("podCoffeeFromStored, the #159 fields", () => {
    // Every case below has a name, so the reader cannot return null. Asserting
    // that once here keeps the assertions about the field under test.
    const stored = (value: unknown) => {
        const coffee = podCoffeeFromStored(value);
        if (coffee === null) throw new Error("expected a coffee block");
        return coffee;
    };
    it("reads every field the BrewMind contract adds", () => {
        expect(podCoffeeFromStored({
            name: "Finca La Esperanza",
            roaster: "Some Roastery",
            roastingDate: "2026-09-01",
            roast: "Medium",
            country: "Colombia",
            region: "Huila",
            farm: "La Esperanza",
            farmer: "Ana Ruiz",
            fermentation: "Anaerobic",
            elevation: 1750,
            cupping_points: 86.5,
            decaffeinated: false,
            url: "https://example.com/coffee"
        })).toEqual({
            name: "Finca La Esperanza",
            roaster: "Some Roastery",
            roastingDate: "2026-09-01",
            roast: "Medium",
            country: "Colombia",
            region: "Huila",
            farm: "La Esperanza",
            farmer: "Ana Ruiz",
            fermentation: "Anaerobic",
            elevation: 1750,
            cupping_points: 86.5,
            decaffeinated: false,
            url: "https://example.com/coffee"
        });
    });

    it("keeps a false decaffeinated, which is a verdict and not an absence", () => {
        // `decaffeinated: false` is the roaster saying caffeinated. Dropping
        // it as falsy would turn a stated fact into an unknown.
        expect(stored({name: "X", decaffeinated: false}).decaffeinated).toBe(false);
        expect(stored({name: "X", decaffeinated: true}).decaffeinated).toBe(true);
        expect(stored({name: "X"}).decaffeinated).toBeUndefined();
    });

    it("refuses a number that cannot be a real measurement", () => {
        expect(stored({name: "X", elevation: 0}).elevation).toBeUndefined();
        expect(stored({name: "X", elevation: -100}).elevation).toBeUndefined();
        expect(stored({name: "X", elevation: 99_000}).elevation).toBeUndefined();
        expect(stored({name: "X", elevation: 1750.4}).elevation).toBeUndefined();
        expect(stored({name: "X", cupping_points: 101}).cupping_points).toBeUndefined();
        expect(stored({name: "X", cupping_points: NaN}).cupping_points).toBeUndefined();
        expect(stored({name: "X", url: "http://example.com"}).url).toBeUndefined();
    });

    it("reads a height however the bag wrote it", () => {
        const height = (elevation: unknown) => stored({name: "X", elevation}).elevation;

        expect(height(1750)).toBe(1750);
        expect(height("1750")).toBe(1750);
        expect(height("1,750")).toBe(1750);
        expect(height("1750m")).toBe(1750);
        expect(height("1750 MASL")).toBe(1750);
        expect(height("1,750 metres")).toBe(1750);
        expect(height("  1750 m. ")).toBe(1750);
    });

    it("converts a height stated in feet", () => {
        // Only the unit differs, and 0.3048 is exact by definition, so this
        // is a conversion rather than a guess.
        expect(stored({name: "X", elevation: "5900 ft"}).elevation).toBe(1798);
        expect(stored({name: "X", elevation: "5,900 feet"}).elevation).toBe(1798);
    });

    it("refuses a height that is not one height", () => {
        const height = (elevation: unknown) => stored({name: "X", elevation}).elevation;

        // A range states two, and picking an end would invent a fact.
        expect(height("1800-2000")).toBeUndefined();
        expect(height("1800 to 2000 masl")).toBeUndefined();
        // A unit this does not know could be anything.
        expect(height("1800 leagues")).toBeUndefined();
        // European thousands separators are ambiguous against a decimal
        // point, so 1.800 falls out as a non-integer and is dropped.
        expect(height("1.800")).toBeUndefined();
        expect(height("high")).toBeUndefined();
        expect(height("")).toBeUndefined();
    });

    it("gives a pod none of them, because a pod carries none of them", () => {        // The pod map names these keys so the exhaustiveness check passes, and
        // this is the proof that naming them cannot put anything in a pod's
        // block that xBloom did not send.
        expect(podCoffeeFromPodsVo({theName: "Pod", roastDate: "2026-09-01"}))
            .toEqual({name: "Pod", roastingDate: "2026-09-01"});
    });
});

describe("isoDate", () => {
    it("keeps a real date exactly as written", () => {
        expect(isoDate("2026-09-01")).toBe("2026-09-01");
        expect(isoDate("2024-02-29")).toBe("2024-02-29");
        // A timestamp is still an ISO 8601 date, and is not trimmed: deciding
        // it meant only the date would be this app editing the value.
        expect(isoDate("2026-09-01T07:41:03Z")).toBe("2026-09-01T07:41:03Z");
    });

    it("refuses anything that is not one", () => {
        expect(isoDate("not-a-date")).toBeUndefined();
        expect(isoDate("01/09/2026")).toBeUndefined();
        expect(isoDate("2026-9-1")).toBeUndefined();
        expect(isoDate("")).toBeUndefined();
        expect(isoDate(20260901)).toBeUndefined();
    });

    it("refuses a day the calendar does not have", () => {
        // `Date` rolls these into the next month rather than refusing them, so
        // a shape check alone would store a different day than was written.
        expect(isoDate("2026-02-31")).toBeUndefined();
        expect(isoDate("2026-13-01")).toBeUndefined();
        expect(isoDate("2025-02-29")).toBeUndefined();
    });
});
