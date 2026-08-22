import Recipe, {CUP_TYPE} from '../Recipe';
import Pour from '../Pour';
import {buildCard, HASH_LENGTH, XPOD_CARD} from './cardFixtures';

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

describe("the new persistence fields", () => {
    function legacyJson(extra: Record<string, unknown> = {}): string {
        return JSON.stringify({
            uuid:     "legacy-uuid",
            title:    "Ethiopia Guji",
            xid:      "ABC123",
            ratio:    16,
            dosage:   18,
            cupType:  0x00,
            grindSize: 25,
            checksum: 0,
            pours:    [{pourNumber: 1, volume: 288, temperature: 92, flowRate: 3, agitation: 0, pourPattern: 0, pauseTime: 0}],
            ...extra
        });
    }

    it("takes a legacy title as the local name", () => {
        const recipe = new Recipe(undefined, legacyJson());
        expect(recipe.name).toBe("Ethiopia Guji");
    });

    it("prefers an explicit name over a legacy title", () => {
        const recipe = new Recipe(undefined, legacyJson({name: "My Blend"}));
        expect(recipe.name).toBe("My Blend");
    });

    it("defaults a recipe with neither to an empty name", () => {
        const recipe = new Recipe(undefined, legacyJson({title: undefined}));
        expect(recipe.name).toBe("");
    });

    it("leaves the xBloom name unknown on a legacy record", () => {
        // A legacy title may have come from a sync or from the user; there is no
        // way to tell, so it is treated as the user's and the cached xBloom name
        // starts empty rather than guessing.
        expect(new Recipe(undefined, legacyJson()).xbloomName).toBe("");
    });

    it("keeps a stored xBloom name", () => {
        expect(new Recipe(undefined, legacyJson({xbloomName: "Ethiopia Guji"})).xbloomName)
            .toBe("Ethiopia Guji");
    });

    it("marks a legacy record's creation time unknown rather than inventing one", () => {
        expect(new Recipe(undefined, legacyJson()).createdAt).toBe(0);
    });

    it("keeps a stored creation time", () => {
        expect(new Recipe(undefined, legacyJson({createdAt: 1700000000000})).createdAt)
            .toBe(1700000000000);
    });

    it("defaults a legacy record's provenance to manual", () => {
        expect(new Recipe(undefined, legacyJson()).source).toBe("manual");
    });

    it("keeps a stored provenance", () => {
        expect(new Recipe(undefined, legacyJson({source: "import"})).source).toBe("import");
    });

    it("leaves the accent index absent on a legacy record, for the hash fallback", () => {
        expect(new Recipe(undefined, legacyJson()).accentIndex).toBeUndefined();
    });

    it("keeps a stored accent index", () => {
        expect(new Recipe(undefined, legacyJson({accentIndex: 3})).accentIndex).toBe(3);
    });

    it("stamps a freshly built recipe with the current time", () => {
        const before = Date.now();
        expect(new Recipe().createdAt).toBeGreaterThanOrEqual(before);
    });

    it("survives a save and reload without losing the migrated name", () => {
        // The migration runs on read. If it did not also round-trip through
        // JSON.stringify, the first save after an upgrade would drop the name.
        const migrated = new Recipe(undefined, legacyJson());
        const reloaded = new Recipe(undefined, JSON.stringify(migrated));
        expect(reloaded.name).toBe("Ethiopia Guji");
        expect(reloaded.source).toBe("manual");
    });
});

describe("displayName", () => {
    function named(fields: Partial<Recipe>): Recipe {
        const recipe = new Recipe();
        Object.assign(recipe, fields);
        return recipe;
    }

    it("prefers the local name", () => {
        expect(named({name: "My Blend", xbloomName: "Guji", xid: "ABC"}).displayName())
            .toBe("My Blend");
    });

    it("falls back to the xBloom name", () => {
        expect(named({xbloomName: "Guji", xid: "ABC"}).displayName()).toBe("Guji");
    });

    it("falls back to the XID", () => {
        expect(named({xid: "ABC123"}).displayName()).toBe("ABC123");
    });

    it("treats whitespace as absent, so a space does not become a name", () => {
        expect(named({name: "   ", xbloomName: "Guji"}).displayName()).toBe("Guji");
    });

    it("names a card read with no XID by how it arrived, and dates it", () => {
        // The date is asserted by shape, not by literal text: the formatter
        // follows the machine's locale and timezone, so "4 Mar" on a laptop can
        // be "Mar 4" on CI. Requiring a digit still catches the failures that
        // matter — "Read undefined", "Read NaN", "Read Invalid Date".
        const name = named({source: "read", createdAt: Date.UTC(2026, 2, 4)}).displayName();

        expect(name).toMatch(/^Read .*\d/);
        expect(name).not.toMatch(/undefined|NaN|Invalid/);
    });

    it("names an import by how it arrived, and dates it", () => {
        const name = named({source: "import", createdAt: Date.UTC(2026, 2, 4)}).displayName();

        expect(name).toMatch(/^Imported .*\d/);
        expect(name).not.toMatch(/undefined|NaN|Invalid/);
    });

    it("omits the date when the creation time is unknown", () => {
        expect(named({source: "read", createdAt: 0}).displayName()).toBe("Read");
    });

    it("falls back to Untitled for a recipe with no provenance at all", () => {
        expect(named({source: "manual", createdAt: 0}).displayName()).toBe("Untitled");
    });
});

describe("hasName", () => {
    it("is true when any real name is available", () => {
        const recipe = new Recipe();
        recipe.xid = "ABC";
        expect(recipe.hasName()).toBe(true);
    });

    it("is false when the placeholder is in use, so the UI can mute it", () => {
        const recipe = new Recipe();
        recipe.source = "read";
        expect(recipe.hasName()).toBe(false);
    });
});

describe("fingerprint", () => {
    function sample(): Recipe {
        const recipe = new Recipe();
        recipe.xid = "ABC123";
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.ratio = 16;
        recipe.dosage = 18;
        recipe.grindSize = 65;
        recipe.grindRPM = 120;
        recipe.pours = [new Pour(1, 240, 92, 3, 0, 0, 0)];
        return recipe;
    }

    it("is stable across two identical recipes", () => {
        expect(sample().fingerprint()).toBe(sample().fingerprint());
    });

    it("ignores the local name", () => {
        const a = sample();
        const b = sample();
        b.name = "Something Else";
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("ignores the uuid", () => {
        const a = sample();
        const b = sample();
        b.generateNewUUID();
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("ignores the accent index", () => {
        const a = sample();
        const b = sample();
        b.accentIndex = 5;
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("ignores the card signature, so a read and an import compare equal", () => {
        // This is the whole point of slicing 32 bytes off. A recipe read from a
        // card carries that card's signature in `backup`; the same recipe
        // imported from a share link carries none. Without the slice they would
        // never de-duplicate against each other.
        const a = sample();
        const b = sample();
        b.backup = new Array(32).fill(0xAB);
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("changes when the grind changes, because that is a different card", () => {
        const a = sample();
        const b = sample();
        b.grindSize = 66;
        expect(b.fingerprint()).not.toBe(a.fingerprint());
    });

    it("changes when a pour volume changes", () => {
        const a = sample();
        const b = sample();
        b.pours[0].volume = 250;
        expect(b.fingerprint()).not.toBe(a.fingerprint());
    });

    it("changes when the XID changes", () => {
        const a = sample();
        const b = sample();
        b.xid = "ZZZ999";
        expect(b.fingerprint()).not.toBe(a.fingerprint());
    });

    it("is exactly the payload bytes, per an independent implementation", () => {
        // Every test above is relational: they would all still pass if
        // `fingerprint` returned, say, the length of the payload. This one
        // pins the actual value, and takes the expectation from
        // `cardFixtures.buildCard` — a deliberately separate reimplementation
        // of the byte layout — rather than from `getData`, so it is not
        // checking the code against itself.
        // The checksum byte is computed over the hash-plus-payload, so it is
        // only independent of the recipe's identity when the hash is zero (the
        // same zero prefix `fingerprint` always uses, since it ignores
        // whatever signature the recipe itself carries).
        const bytes = buildCard({...XPOD_CARD, hash: new Array(HASH_LENGTH).fill(0)});
        const expected = bytes.slice(HASH_LENGTH)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        expect(new Recipe(bytes).fingerprint()).toBe(expected);
    });

    it("is lower-case hex with no separators, two characters per byte", () => {
        const printed = sample().fingerprint();
        expect(printed).toMatch(/^[0-9a-f]+$/);
        expect(printed.length % 2).toBe(0);
    });
});
