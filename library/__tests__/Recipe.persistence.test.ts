import Recipe, {CUP_TYPE} from '../Recipe';
import Pour from '../Pour';
import {buildCard, XPOD_CARD} from './cardFixtures';

/**
 * Recipes are persisted to SQLite as whole JSON blobs, so every recipe ever saved by
 * an older build must still deserialise. The migrations in the Recipe(json) constructor
 * are the only thing standing between a user's saved library and silent data loss.
 */

function serialise(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        uuid:      'fixed-uuid-1234',
        title:     'Ethiopia Yirgacheffe',
        xid:       'ABC1234',
        ratio:     16,
        dosage:    15,
        grindSize: 50,
        grindRPM:  90,
        cupType:   CUP_TYPE.XPOD,
        grinder:   true,
        pours:     [new Pour(1, 30, 93, 32, 0, 1, 30), new Pour(2, 210, 92, 33, 0, 2, 0)],
        ...overrides
    });
}

describe('legacy cup type migrations', () => {
    it('rewrites the 0x23 tea encoding to cup type 3 with 3 steeps', () => {
        const recipe = new Recipe(undefined, serialise({cupType: 0x23}));

        expect(recipe.cupType).toBe(CUP_TYPE.TEA);
        expect(recipe.defaultCups).toBe(3);
    });

    it('rewrites the 0x13 tea encoding to cup type 3 with 2 steeps', () => {
        const recipe = new Recipe(undefined, serialise({cupType: 0x13}));

        expect(recipe.cupType).toBe(CUP_TYPE.TEA);
        expect(recipe.defaultCups).toBe(2);
    });

    it('rewrites the legacy 0x04 cup type to Other', () => {
        const recipe = new Recipe(undefined, serialise({cupType: 0x04}));

        expect(recipe.cupType).toBe(CUP_TYPE.OTHER);
    });

    it('zeroes defaultCups for every non-tea cup type', () => {
        for (const cupType of [CUP_TYPE.XPOD, CUP_TYPE.OMNI, CUP_TYPE.OTHER]) {
            const recipe = new Recipe(undefined, serialise({cupType, defaultCups: 3}));
            expect(recipe.defaultCups).toBe(0);
        }
    });

    it('leaves modern cup types untouched', () => {
        expect(new Recipe(undefined, serialise({cupType: CUP_TYPE.OMNI})).cupType).toBe(CUP_TYPE.OMNI);
        expect(new Recipe(undefined, serialise({cupType: CUP_TYPE.TEA})).cupType).toBe(CUP_TYPE.TEA);
    });
});

describe('defaults for fields absent from older saves', () => {
    it('defaults grindRPM to 120', () => {
        expect(new Recipe(undefined, serialise({grindRPM: undefined})).grindRPM).toBe(120);
    });

    it('defaults cupType to xPod', () => {
        expect(new Recipe(undefined, serialise({cupType: undefined})).cupType).toBe(CUP_TYPE.XPOD);
    });

    it('defaults grinder to enabled', () => {
        expect(new Recipe(undefined, serialise({grinder: undefined})).grinder).toBe(true);
    });

    it('defaults the byte backups and uid to empty arrays', () => {
        const recipe = new Recipe(undefined, serialise());

        expect(recipe.backup).toEqual([]);
        expect(recipe.offline_backup).toEqual([]);
        expect(recipe.uid).toEqual([]);
    });

    it('defaults shareId to an empty string', () => {
        expect(new Recipe(undefined, serialise()).shareId).toBe('');
    });

    it('keeps the default 15g dose when none was saved', () => {
        expect(new Recipe(undefined, serialise({dosage: undefined})).dosage).toBe(15);
    });
});

describe('identity', () => {
    it('preserves the stored uuid and mirrors it into key', () => {
        const recipe = new Recipe(undefined, serialise());

        expect(recipe.uuid).toBe('fixed-uuid-1234');
        expect(recipe.key).toBe('fixed-uuid-1234');
    });

    it('generates a uuid when the save predates the field', () => {
        const recipe = new Recipe(undefined, serialise({uuid: undefined}));

        expect(recipe.uuid).toHaveLength(36);
        expect(recipe.key).toBe(recipe.uuid);
    });

    it('issues a fresh uuid on demand, keeping key in sync', () => {
        const recipe = new Recipe(undefined, serialise());
        recipe.generateNewUUID();

        expect(recipe.uuid).not.toBe('fixed-uuid-1234');
        expect(recipe.key).toBe(recipe.uuid);
    });
});

describe('pour deserialisation', () => {
    it('accepts pours stored as nested JSON strings, which is what Pour.toJSON produces', () => {
        // Pour.toJSON() returns a string rather than an object, so a serialised Recipe
        // carries its pours as nested JSON strings. This is the shape on disk today.
        const raw = JSON.parse(serialise());
        expect(typeof raw.pours[0]).toBe('string');

        const recipe = new Recipe(undefined, serialise());

        expect(recipe.pours).toHaveLength(2);
        expect(recipe.pours[0]).toBeInstanceOf(Pour);
        expect(recipe.pours[0].volume).toBe(30);
        expect(recipe.pours[0].temperature).toBe(93);
        expect(recipe.pours[0].flowRate).toBe(32);
        expect(recipe.pours[1].pauseTime).toBe(0);
    });

    it('also accepts pours stored as plain objects', () => {
        const recipe = new Recipe(undefined, serialise({
            pours: [{
                pourNumber:  1,
                volume:      45,
                temperature: 91,
                flowRate:    31,
                agitation:   2,
                pourPattern: 0,
                pauseTime:   15
            }]
        }));

        expect(recipe.pours[0]).toBeInstanceOf(Pour);
        expect(recipe.pours[0].volume).toBe(45);
        expect(recipe.pours[0].temperature).toBe(91);
        expect(recipe.pours[0].flowRate).toBe(31);
        expect(recipe.pours[0].agitation).toBe(2);
        expect(recipe.pours[0].pauseTime).toBe(15);
    });
});

describe('JSON round-trip', () => {
    it('survives serialise -> deserialise unchanged', () => {
        const original = new Recipe(buildCard(XPOD_CARD));
        original.title = 'Round Trip';

        const restored = new Recipe(undefined, JSON.stringify(original));

        expect(restored.title).toBe(original.title);
        expect(restored.xid).toBe(original.xid);
        expect(restored.ratio).toBe(original.ratio);
        expect(restored.dosage).toBe(original.dosage);
        expect(restored.grindSize).toBe(original.grindSize);
        expect(restored.grindRPM).toBe(original.grindRPM);
        expect(restored.cupType).toBe(original.cupType);
        expect(restored.pours.map(p => p.volume)).toEqual(original.pours.map(p => p.volume));
    });

    it('still produces identical card bytes after a save/load cycle', () => {
        const card = buildCard(XPOD_CARD);
        const original = new Recipe(card);
        const restored = new Recipe(undefined, JSON.stringify(original));

        expect(restored.getData(card.slice(0, 32), true)).toEqual(original.getData(card.slice(0, 32), true));
    });
});
