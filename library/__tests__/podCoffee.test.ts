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
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            note: "A producer narrative.",
            beanMix: "Single Origin",
            imageUrl: "https://example.com/pod.png"
        });
    });

    it("does not map roast, whose meaning is unverified", () => {
        const coffee = podCoffeeFromPodsVo({theName: "X", roast: 3});
        expect(coffee).not.toBeNull();
        expect(Object.keys(coffee!)).not.toContain("degreeOfRoast");
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
            process: "Natural",
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
            roastDate: "2026-09-01",
            roastLevel: "Medium",
            country: "Colombia",
            region: "Huila",
            farm: "La Esperanza",
            farmer: "Ana Ruiz",
            fermentation: "Anaerobic",
            elevation: 1750,
            cuppingScore: 86.5,
            decaf: false,
            url: "https://example.com/coffee"
        })).toEqual({
            name: "Finca La Esperanza",
            roaster: "Some Roastery",
            roastDate: "2026-09-01",
            roastLevel: "Medium",
            country: "Colombia",
            region: "Huila",
            farm: "La Esperanza",
            farmer: "Ana Ruiz",
            fermentation: "Anaerobic",
            elevation: 1750,
            cuppingScore: 86.5,
            decaf: false,
            url: "https://example.com/coffee"
        });
    });

    it("keeps a false decaf, which is a verdict and not an absence", () => {
        // `decaf: false` is the roaster saying caffeinated. Dropping it as
        // falsy would turn a stated fact into an unknown.
        expect(stored({name: "X", decaf: false}).decaf).toBe(false);
        expect(stored({name: "X", decaf: true}).decaf).toBe(true);
        expect(stored({name: "X"}).decaf).toBeUndefined();
    });

    it("refuses a number that cannot be a real measurement", () => {
        expect(stored({name: "X", elevation: 0}).elevation).toBeUndefined();
        expect(stored({name: "X", elevation: -100}).elevation).toBeUndefined();
        expect(stored({name: "X", elevation: 99_000}).elevation).toBeUndefined();
        expect(stored({name: "X", elevation: 1750.4}).elevation).toBeUndefined();
        expect(stored({name: "X", cuppingScore: 101}).cuppingScore).toBeUndefined();
        expect(stored({name: "X", cuppingScore: NaN}).cuppingScore).toBeUndefined();
        expect(stored({name: "X", url: "http://example.com"}).url).toBeUndefined();
    });

    it("gives a pod none of them, because a pod carries none of them", () => {
        // The pod map names these keys so the exhaustiveness check passes, and
        // this is the proof that naming them cannot put anything in a pod's
        // block that xBloom did not send.
        expect(podCoffeeFromPodsVo({theName: "Pod", roastDate: "2026-09-01"}))
            .toEqual({name: "Pod", roastDate: "2026-09-01"});
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
