import {podCoffeeFrom, podCoffeeFromStored} from "@/library/podCoffee";

describe("podCoffeeFrom", () => {
    it("reads the fields a real pod carries", () => {
        expect(podCoffeeFrom({
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
        const coffee = podCoffeeFrom({theName: "X", roast: 3});
        expect(coffee).not.toBeNull();
        expect(Object.keys(coffee!)).not.toContain("degreeOfRoast");
    });

    it("drops empty strings rather than carrying them", () => {
        // subtitle is empty on real pods; so is origin on some.
        expect(podCoffeeFrom({theName: "X", origin: "", process: "  "}))
            .toEqual({name: "X"});
    });

    it("is null without a name, which is the only field worth matching on", () => {
        expect(podCoffeeFrom({origin: "Kenya"})).toBeNull();
        // Parsed endpoint JSON can carry an invalid typed value where the pod name should be.
        expect(podCoffeeFrom({theName: 42})).toBeNull();
        // The trust boundary should reject a non-object payload before looking for fields.
        expect(podCoffeeFrom("nonsense")).toBeNull();
        expect(podCoffeeFrom(null)).toBeNull();
        expect(podCoffeeFrom(undefined)).toBeNull();
    });

    it("refuses an image that is not https", () => {
        expect(podCoffeeFrom({theName: "X", imagePath: "javascript:alert(1)"}))
            .toEqual({name: "X"});
        // A plain-HTTP downgrade is the realistic bad image URL from the undocumented endpoint.
        expect(podCoffeeFrom({theName: "X", imagePath: "http://example.com/p.png"}))
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
