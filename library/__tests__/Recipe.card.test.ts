import Recipe, {CUP_TYPE, DEFAULT_GRIND_SIZE, GRIND_SIZE_OFFSET, GRINDER_OFF} from '../Recipe';
import {AGITATION, POUR_PATTERN} from '../Pour';
import {buildCard, crc8MaximDow, HASH_LENGTH, makeHash, TEA_CARD, XPOD_CARD} from './cardFixtures';

/**
 * Characterisation tests for the byte layout written to genuine xBloom cards.
 * A regression here means the app writes a card the machine will reject, so these
 * assertions pin the exact wire format rather than merely exercising the code.
 */

describe('CRC-8/MAXIM-DOW', () => {
    it('matches the published check value', () => {
        // Canonical CRC-8/MAXIM-DOW check: "123456789" -> 0xA1.
        const check = '123456789'.split('').map(c => c.charCodeAt(0));
        expect(crc8MaximDow(check)).toBe(0xa1);
    });

    it('agrees with Recipe\'s precomputed lookup table across varied payloads', () => {
        // Recipe uses a hardcoded POLY_TABLE rather than computing the CRC bitwise.
        // Driving the encoder over many shapes proves that table is not corrupted.
        for (let dosage = 1; dosage <= 31; dosage += 3) {
            for (const ratio of [10, 15, 16, 18]) {
                const card = buildCard({...XPOD_CARD, dosage, ratio});
                const encoded = new Recipe(card).getData(card.slice(0, HASH_LENGTH), true);

                expect(encoded[encoded.length - 1]).toBe(crc8MaximDow(encoded.slice(0, -1)));
            }
        }
    });

    it('is the checksum the encoder appends', () => {
        const card = buildCard(XPOD_CARD);
        const recipe = new Recipe(card);
        const encoded = recipe.getData(card.slice(0, HASH_LENGTH), true);

        const payload = encoded.slice(0, encoded.length - 1);
        expect(encoded[encoded.length - 1]).toBe(crc8MaximDow(payload));
    });
});

describe('Recipe.parseData', () => {
    it('decodes an xPod card into the expected recipe', () => {
        const recipe = new Recipe(buildCard(XPOD_CARD));

        expect(recipe.xid).toBe('ABC1234');
        expect(recipe.cupType).toBe(CUP_TYPE.XPOD);
        expect(recipe.dosage).toBe(15);
        expect(recipe.grindRPM).toBe(90);
        expect(recipe.grindSize).toBe(50);
        expect(recipe.ratio).toBe(16);
        expect(recipe.grinder).toBe(true);
        expect(recipe.pours).toHaveLength(3);
    });

    it('decodes every field of each pour', () => {
        const recipe = new Recipe(buildCard(XPOD_CARD));

        expect(recipe.pours.map(p => p.volume)).toEqual([30, 105, 105]);
        expect(recipe.pours.map(p => p.temperature)).toEqual([93, 92, 91]);
        expect(recipe.pours.map(p => p.pourPattern)).toEqual([
            POUR_PATTERN.CIRCULAR, POUR_PATTERN.SPIRAL, POUR_PATTERN.CENTERED
        ]);
        expect(recipe.pours.map(p => p.agitation)).toEqual([
            AGITATION.ALL_OFF, AGITATION.BEFORE_ON_AFTER_OFF, AGITATION.BEFORE_ON_AFTER_ON
        ]);
        expect(recipe.pours.map(p => p.flowRate)).toEqual([32, 33, 30]);
        expect(recipe.pours.map(p => p.pourNumber)).toEqual([1, 2, 3]);
    });

    it('numbers pours from 1', () => {
        const recipe = new Recipe(buildCard(XPOD_CARD));
        expect(recipe.pours[0].pourNumber).toBe(1);
    });

    it('accepts payloads without the 32-byte signature', () => {
        const card = buildCard(XPOD_CARD);
        const withSignature = new Recipe(card);
        const withoutSignature = new Recipe(card.slice(HASH_LENGTH), undefined, false);

        expect(withoutSignature.xid).toBe(withSignature.xid);
        expect(withoutSignature.ratio).toBe(withSignature.ratio);
        expect(withoutSignature.pours).toHaveLength(withSignature.pours.length);
    });
});

describe('pour byte 5 bit packing (dose and wait-minutes)', () => {
    it('reads the 5-bit dose from the first pour only', () => {
        const recipe = new Recipe(buildCard({...XPOD_CARD, dosage: 21}));
        expect(recipe.dosage).toBe(21);
    });

    it('falls back to 15g when the encoded dose is out of range', () => {
        const card = buildCard(XPOD_CARD);
        // Zero the dose bits (0-4) of the first pour's byte 5, keeping wait-minutes.
        const firstPourByte5 = 41 + 5;
        card[firstPourByte5] = card[firstPourByte5] & 0xe0;

        expect(new Recipe(card).dosage).toBe(15);
    });

    it('reconstructs pauses longer than 255s from the wait-minutes bits', () => {
        const recipe = new Recipe(buildCard(TEA_CARD));
        expect(recipe.pours.map(p => p.pauseTime)).toEqual([300, 180, 0]);
    });

    it('caps reconstructed pause at 360 seconds', () => {
        const recipe = new Recipe(buildCard({
            ...TEA_CARD,
            pours: [{...TEA_CARD.pours[0], pauseSeconds: 999}, ...TEA_CARD.pours.slice(1)]
        }));
        expect(recipe.pours[0].pauseTime).toBe(360);
    });

    it('clamps RPM outside 60-120 back to 120', () => {
        expect(new Recipe(buildCard({...XPOD_CARD, grindRPM: 200})).grindRPM).toBe(120);
        expect(new Recipe(buildCard({...XPOD_CARD, grindRPM: 30})).grindRPM).toBe(120);
        expect(new Recipe(buildCard({...XPOD_CARD, grindRPM: 60})).grindRPM).toBe(60);
    });
});

describe('grind size encoding', () => {
    it('stores grind size with a 40 offset', () => {
        const card = buildCard({...XPOD_CARD, grindSize: 65});
        const recipe = new Recipe(card);

        expect(recipe.grindSize).toBe(65);
        const grindByteIndex = 41 + XPOD_CARD.pours.length * 8;
        expect(card[grindByteIndex]).toBe(65 - GRIND_SIZE_OFFSET);
    });

    it('treats the GRINDER_OFF sentinel as a disabled grinder', () => {
        const recipe = new Recipe(buildCard({...XPOD_CARD, grindSize: GRIND_SIZE_OFFSET + GRINDER_OFF}));
        expect(recipe.grinder).toBe(false);
    });

    it('re-encodes a disabled grinder as the sentinel rather than a grind size', () => {
        const card = buildCard(XPOD_CARD);
        const recipe = new Recipe(card);
        recipe.grinder = false;

        const encoded = recipe.getData(card.slice(0, HASH_LENGTH), true);
        const grindByteIndex = 41 + recipe.pours.length * 8;
        expect(encoded[grindByteIndex]).toBe(GRINDER_OFF);
    });
});

describe('cup type byte 39', () => {
    it('stores non-tea cup types in the low nibble with an empty high nibble', () => {
        for (const cupType of [CUP_TYPE.XPOD, CUP_TYPE.OTHER, CUP_TYPE.OMNI]) {
            const card = buildCard({...XPOD_CARD, cupType});
            expect(new Recipe(card).cupType).toBe(cupType);
            expect(card[39]).toBe(cupType);
        }
    });

    it('packs the tea cup count into the high nibble', () => {
        const card = buildCard(TEA_CARD);
        expect(card[39]).toBe((3 - 1) << 4 | CUP_TYPE.TEA);

        const recipe = new Recipe(card);
        expect(recipe.cupType).toBe(CUP_TYPE.TEA);
        expect(recipe.isTea()).toBe(true);
    });

    it('re-encodes the tea cup count from the pour count', () => {
        const card = buildCard(TEA_CARD);
        const recipe = new Recipe(card);
        const encoded = recipe.getData(card.slice(0, HASH_LENGTH), true);

        expect(encoded[39]).toBe((recipe.pours.length - 1) << 4 | CUP_TYPE.TEA);
    });

    it('always writes the default grind size for tea cards', () => {
        const card = buildCard(TEA_CARD);
        const recipe = new Recipe(card);
        recipe.grindSize = 80;

        const encoded = recipe.getData(card.slice(0, HASH_LENGTH), true);
        const grindByteIndex = 41 + recipe.pours.length * 8;
        expect(encoded[grindByteIndex]).toBe(DEFAULT_GRIND_SIZE - GRIND_SIZE_OFFSET);
    });
});

describe('round-trip: card bytes -> Recipe -> card bytes', () => {
    it.each([
        ['xPod', XPOD_CARD],
        ['tea', TEA_CARD]
    ])('re-encodes a %s card byte-for-byte', (_label, spec) => {
        const original = buildCard(spec);
        const recipe = new Recipe(original);
        const encoded = recipe.getData(original.slice(0, HASH_LENGTH), true);

        expect(encoded).toEqual(original);
    });

    it('strips the 32-byte signature unless explicitly asked to keep it', () => {
        const original = buildCard(XPOD_CARD);
        const recipe = new Recipe(original);

        const withSignature = recipe.getData(original.slice(0, HASH_LENGTH), true);
        const withoutSignature = recipe.getData(original.slice(0, HASH_LENGTH), false);

        expect(withSignature).toHaveLength(withoutSignature.length + HASH_LENGTH);
        expect(withoutSignature).toEqual(withSignature.slice(HASH_LENGTH));
    });

    it('falls back to a zeroed signature when no prefix and no backup exist', () => {
        const original = buildCard(XPOD_CARD);
        const recipe = new Recipe(original);

        const encoded = recipe.getData(null, true);
        expect(encoded.slice(0, HASH_LENGTH)).toEqual(new Array(HASH_LENGTH).fill(0));
    });

    it('reuses the stored backup signature when no prefix is supplied', () => {
        const original = buildCard(XPOD_CARD);
        const recipe = new Recipe(original);
        recipe.backup = original;

        const encoded = recipe.getData(null, true);
        expect(encoded.slice(0, HASH_LENGTH)).toEqual(makeHash());
    });

    it('survives a single-pour card', () => {
        const spec = {...XPOD_CARD, ratio: 10, pours: [XPOD_CARD.pours[0]]};
        const original = buildCard(spec);

        expect(new Recipe(original).getData(original.slice(0, HASH_LENGTH), true)).toEqual(original);
    });
});

describe('XID encoding', () => {
    it('trims the zero padding when decoding', () => {
        expect(new Recipe(buildCard({...XPOD_CARD, xid: 'AB'})).xid).toBe('AB');
    });

    it('pads short XIDs back to 7 bytes when encoding', () => {
        const original = buildCard({...XPOD_CARD, xid: 'AB'});
        const recipe = new Recipe(original);

        expect(recipe.getData(original.slice(0, HASH_LENGTH), true)).toEqual(original);
    });

    it('rejects XIDs longer than the 7-byte field', () => {
        const original = buildCard(XPOD_CARD);
        const recipe = new Recipe(original);
        recipe.xid = 'TOOLONGXID';

        expect(() => recipe.getData(original.slice(0, HASH_LENGTH), true)).toThrow(/XID must be at most 7/);
    });

    it('rejects an 8-character XID rather than overflowing the field', () => {
        // The XID occupies bytes 32-38 inclusive. An 8-character XID used to be
        // accepted and written as 8 bytes, shifting cup type, pour count and every
        // pour record one byte along and corrupting the whole recipe.
        const original = buildCard(XPOD_CARD);
        const recipe = new Recipe(original);
        recipe.xid = 'EIGHTCHR';

        expect(() => recipe.getData(original.slice(0, HASH_LENGTH), true)).toThrow(/XID must be at most 7/);
    });

    it('keeps every later field in place for a maximum-length XID', () => {
        const original = buildCard(XPOD_CARD);
        const recipe = new Recipe(original);
        recipe.xid = 'SEVENCH';

        const encoded = recipe.getData(original.slice(0, HASH_LENGTH), true);

        expect(encoded.length).toBe(original.length);
        expect(encoded.slice(32, 39)).toEqual([...'SEVENCH'].map((c) => c.charCodeAt(0)));
        // Byte 39 up to the trailing CRC must still line up with the untouched
        // original; only the checksum legitimately changes with the XID.
        expect(encoded.slice(39, -1)).toEqual(original.slice(39, -1));
    });
});
