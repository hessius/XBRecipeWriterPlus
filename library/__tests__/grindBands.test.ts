import {grindBand, CARD_GRIND_MIN} from "@/library/grindBands";

describe("grindBand", () => {
    it("names the bands a card can reach", () => {
        expect(grindBand(40)).toMatchObject({label: "Pourover", onCard: true});
        expect(grindBand(55)).toMatchObject({label: "Pourover", onCard: true});
        expect(grindBand(56)).toMatchObject({label: "French press", onCard: true});
        expect(grindBand(80)).toMatchObject({label: "French press", onCard: true});
    });

    it("names the bands a card cannot reach, so an import can be explained", () => {
        expect(grindBand(1)).toMatchObject({label: "Espresso", onCard: false});
        expect(grindBand(15)).toMatchObject({label: "Espresso", onCard: false});
        expect(grindBand(16)).toMatchObject({label: "Aeropress", onCard: false});
        expect(grindBand(30)).toMatchObject({label: "Aeropress", onCard: false});
        expect(grindBand(31)).toMatchObject({label: "Pourover", onCard: false});
        expect(grindBand(39)).toMatchObject({label: "Pourover", onCard: false});
    });

    it("reports the grinder-off sentinel as off, not as a coarseness", () => {
        // 81 is GRIND_SIZE_OFFSET (40) + GRINDER_OFF (41). Rendering it as
        // "coarser than cold brew" is the specific bug this guards.
        expect(grindBand(81)).toBeUndefined();
    });

    it("has no band for values off either end of the grinder's own scale", () => {
        expect(grindBand(0)).toBeUndefined();
        expect(grindBand(82)).toBeUndefined();
        expect(grindBand(-1)).toBeUndefined();
    });

    it("exposes the card floor so the UI does not re-type it", () => {
        expect(CARD_GRIND_MIN).toBe(40);
    });
});
