import {grindBand, CARD_GRIND_MIN} from "@/library/grindBands";
import {GRIND_SIZE_OFFSET, GRINDER_OFF} from "@/library/Recipe";

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
        expect(grindBand(GRIND_SIZE_OFFSET + GRINDER_OFF)).toBeUndefined();
    });

    it("GRINDER_OFF_VALUE falls outside the 1-80 band scale", () => {
        // grindBand guards the sentinel explicitly, but relies on the sentinel
        // being outside the scale so that the range check provides a fallback.
        // If GRIND_SIZE_OFFSET or GRINDER_OFF are ever changed so their sum
        // lands inside 1-80, the sentinel guard in grindBand becomes the *only*
        // thing stopping "grinder off" from being drawn as a coarseness band.
        // A failure here means the guard is no longer redundant — audit it.
        const sentinelValue = GRIND_SIZE_OFFSET + GRINDER_OFF;
        expect(sentinelValue < 1 || sentinelValue > 80).toBe(true);
    });

    it("has no band for values off either end of the grinder's own scale", () => {
        expect(grindBand(0)).toBeUndefined();
        expect(grindBand(82)).toBeUndefined();
        expect(grindBand(-1)).toBeUndefined();
    });

    it("exposes the card floor so the UI does not re-type it", () => {
        expect(CARD_GRIND_MIN).toBe(40);
    });

    it("every integer 1-80 maps to a band, and labels change only at the four expected boundaries", () => {
        // Verifies that BANDS is sorted ascending and has no gaps. An
        // out-of-order insertion or a missing segment would silently mis-label
        // an entire range without breaking any of the spot-check tests above.
        const labels = Array.from({length: 80}, (_, i) => {
            const band = grindBand(i + 1);
            expect(band).toBeDefined();
            return band!.label;
        });

        // Find the indices (1-based) where the label changes.
        const boundaries: number[] = [];
        for (let i = 1; i < labels.length; i++) {
            if (labels[i] !== labels[i - 1]) boundaries.push(i + 1); // i+1 = 1-based value
        }
        expect(boundaries).toEqual([16, 31, 56]);
    });
});
