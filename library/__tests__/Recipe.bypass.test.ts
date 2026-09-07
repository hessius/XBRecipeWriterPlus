import Recipe, {CUP_TYPE} from '../Recipe';
import {buildCard, XPOD_CARD} from './cardFixtures';

/**
 * Bypass water is a separate dilution volume dispensed alongside the brew.
 * It is NOT stored on the NFC card — so it must not affect the card byte format
 * or any volume invariant tied to the card (pour sum = dosage × ratio).
 *
 * These tests exist to guard against:
 *   - bypass being silently dropped on a save/load cycle
 *   - bypass fields creeping into card-write paths (getTotalVolume, isPourVolumeValid)
 *   - legacy records (saved before bypass existed) gaining unexpected defaults
 */

function legacyJson(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
        uuid:      'bypass-legacy-uuid',
        ratio:     16,
        dosage:    15,
        grindSize: 50,
        cupType:   CUP_TYPE.XPOD,
        grinder:   true,
        checksum:  0,
        pours: [{ pourNumber: 1, volume: 240, temperature: 93, flowRate: 3, agitation: 0, pourPattern: 0, pauseTime: 0 }],
        ...extra,
    });
}

describe('bypass water defaults', () => {
    it('is off on a freshly constructed recipe', () => {
        const recipe = new Recipe();
        expect(recipe.bypassEnabled).toBe(false);
        expect(recipe.bypassVolume).toBe(0);
        expect(recipe.bypassTemp).toBe(85);
    });

    it('loads as off/0/85 from a legacy JSON record that has no bypass keys', () => {
        // Records written before bypass was introduced must not produce undefined
        // fields; the share-link path reads these values to decide whether a link
        // is stale, and undefined !== false / 0 / 85 would re-mint every old link.
        const recipe = new Recipe(undefined, legacyJson());
        expect(recipe.bypassEnabled).toBe(false);
        expect(recipe.bypassVolume).toBe(0);
        expect(recipe.bypassTemp).toBe(85);
    });
});

describe('bypass water persistence', () => {
    it('survives a JSON round-trip with bypass enabled', () => {
        const original = new Recipe(undefined, legacyJson({
            bypassEnabled: true,
            bypassVolume:  50,
            bypassTemp:    90,
        }));

        const restored = new Recipe(undefined, JSON.stringify(original));
        expect(restored.bypassEnabled).toBe(true);
        expect(restored.bypassVolume).toBe(50);
        expect(restored.bypassTemp).toBe(90);
    });

    it('keeps bypass off after a round-trip when it was off', () => {
        const original = new Recipe(undefined, legacyJson());
        const restored = new Recipe(undefined, JSON.stringify(original));
        expect(restored.bypassEnabled).toBe(false);
        expect(restored.bypassVolume).toBe(0);
        expect(restored.bypassTemp).toBe(85);
    });

    it('preserves bypass through the duplicate stringify/reparse path', () => {
        // RecipeDatabase.duplicate() stringifies a recipe and passes it back
        // through the Recipe(json) constructor — the same path as save/load.
        // If the json branch does not read bypassEnabled/Volume/Temp, the
        // duplicate silently loses bypass.
        const source = new Recipe(undefined, legacyJson({
            bypassEnabled: true,
            bypassVolume:  30,
            bypassTemp:    80,
        }));
        const duplicate = new Recipe(undefined, JSON.stringify(source));
        expect(duplicate.bypassEnabled).toBe(true);
        expect(duplicate.bypassVolume).toBe(30);
        expect(duplicate.bypassTemp).toBe(80);
    });
});

describe('bypass and card bytes', () => {
    it('is off on a recipe parsed from card bytes', () => {
        // Bypass is NOT stored on the card. parseData must never set these fields;
        // they must hold their field-initialiser defaults after a card read.
        const recipe = new Recipe(buildCard(XPOD_CARD));
        expect(recipe.bypassEnabled).toBe(false);
        expect(recipe.bypassVolume).toBe(0);
        expect(recipe.bypassTemp).toBe(85);
    });
});

describe('bypass does not affect brew volume invariants', () => {
    it('enabling bypass does not change getTotalVolume()', () => {
        // getTotalVolume() = dosage × ratio. Bypass is extra water, not brew
        // water; changing it must not shift the pour-sum target or the machine
        // will reject the recipe.
        const recipe = new Recipe(undefined, legacyJson());
        const before = recipe.getTotalVolume();
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 100;
        expect(recipe.getTotalVolume()).toBe(before);
    });

    it('enabling bypass does not affect pour-volume validity', () => {
        // isPourVolumeValid() checks that pours sum to dosage × ratio.
        // Bypass is independent of that invariant.
        const recipe = new Recipe(undefined, legacyJson());
        expect(recipe.isPourVolumeValid()).toBe(true);
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 100;
        expect(recipe.isPourVolumeValid()).toBe(true);
    });
});
