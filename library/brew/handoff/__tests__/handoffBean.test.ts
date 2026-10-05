import {handoffBean} from "@/library/brew/handoff/handoffBean";
import type {PodCoffee} from "@/library/podCoffee";

describe("handoffBean", () => {
    const full: PodCoffee = {
        name: "Kenya Sakami",
        roaster: "Drop Coffee",
        roastingDate: "2026-09-01",
        roast: "Medium",
        origin: "Kenya",
        country: "Kenya",
        region: "Nyeri",
        farm: "Sakami",
        farmer: "Gloria",
        elevation: 1950,
        processing: "Natural",
        fermentation: "Anaerobic",
        variety: "Batian",
        beanMix: "Single Origin",
        aromatics: "Cherry",
        note: "A producer narrative.",
        cupping_points: 87,
        decaffeinated: false,
        url: "https://example.com/coffee",
        imageUrl: "https://example.com/pod.png"
    };

    it("says a pod's process in the word the receiving app reads", () => {
        // The whole reason this module exists. `processing` went over the wire
        // for as long as the handoff has existed and was dropped on arrival.
        expect(handoffBean(full).process).toBe("Natural");
        expect(handoffBean(full)).not.toHaveProperty("processing");
    });

    it("carries the roaster, the roast date and where the coffee grew", () => {
        expect(handoffBean(full)).toEqual({
            name: "Kenya Sakami",
            roaster: "Drop Coffee",
            roastingDate: "2026-09-01",
            origin: "Kenya",
            region: "Nyeri",
            farm: "Sakami",
            farmer: "Gloria",
            elevation: "1950",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry",
            note: "A producer narrative.",
            beanMix: "Single Origin",
            decaffeinated: false,
            imageUrl: "https://example.com/pod.png"
        });
    });

    it("leaves out what the receiving app has nowhere to put", () => {
        const bean = handoffBean(full);

        // Each of these is deliberate and the module comment says why. A field
        // sent and ignored looks like a field that works.
        expect(bean).not.toHaveProperty("roast");
        expect(bean).not.toHaveProperty("fermentation");
        expect(bean).not.toHaveProperty("cupping_points");
        expect(bean).not.toHaveProperty("url");
        expect(bean).not.toHaveProperty("country");
    });

    it("falls back to country when a coffee names no origin", () => {
        expect(handoffBean({name: "A coffee", country: "Colombia"}).origin)
            .toBe("Colombia");
    });

    it("says nothing rather than something empty", () => {
        expect(handoffBean({name: "A coffee"})).toEqual({name: "A coffee"});
    });

    it("keeps a decaffeinated coffee's answer, including no", () => {
        // `false` is an answer and must survive a presence check that would
        // treat it as absence.
        expect(handoffBean({name: "A coffee", decaffeinated: false}))
            .toEqual({name: "A coffee", decaffeinated: false});
        expect(handoffBean({name: "A coffee", decaffeinated: true}))
            .toEqual({name: "A coffee", decaffeinated: true});
    });

    it("drops an elevation that is not a number", () => {
        expect(handoffBean({name: "A coffee", elevation: NaN}))
            .toEqual({name: "A coffee"});
        expect(handoffBean({name: "A coffee", elevation: 0}).elevation)
            .toBe("0");
    });
});
