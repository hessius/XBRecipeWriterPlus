import Recipe, {CUP_TYPE} from '../Recipe';
import {HASH_LENGTH} from './cardFixtures';

/**
 * Characterisation tests built from dumps of two *genuine* xBloom cards, read off
 * real hardware. `cardFixtures` proves the encoder agrees with an independent
 * reimplementation of the layout; these tests prove it agrees with xBloom itself,
 * which is the only authority that actually matters.
 *
 * The two cards deliberately differ in capacity (128 vs 160 bytes), which is how we
 * learned that card size is a property of the tag rather than of the format. Do not
 * "simplify" them into one fixture.
 *
 * If an assertion here changes, the app is about to write cards the machine rejects.
 * Treat that as a regression until proven otherwise.
 */

/** Expands a dump written as whitespace-separated 32-bit words into bytes. */
function bytesFromDump(dump: string): number[] {
    return dump
        .split(/\s+/)
        .filter(word => word.length > 0)
        .flatMap(word => {
            const value = parseInt(word, 16);
            return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
        });
}

/**
 * Card 1 — UID E0 04 A2 11 2E 9D 2E CA, 32 blocks x 4 bytes = 128 bytes.
 * The cloud copy of this recipe has bypass water enabled; the card does not record
 * it anywhere, which is how we established bypass cannot survive a card round trip.
 */
const XB0001_DUMP = `
    A871480A C82569C5 154BCDB4 0BD83E2D 4EEB7E71 25899BFE BF94FA91 D520ADBA
    58423030 30310000 203C5D01 02F10F78 1E415D00 02F10000 23415D02 00F10000
    23415D00 00FB0000 23191162 00000000 00000000 00000000 00000000 00000000
    00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
`;

/** Card 2 — UID E0 77 3C 02 DC 2D D1 4B, 40 blocks x 4 bytes = 160 bytes. */
const NLC001_DUMP = `
    D4A02FBF 1AB0F888 050AF8F4 ECE633C5 9EAF915F CCA94035 D37C7371 5C954642
    4E4C4330 30310000 201E5E02 02D30F78 234B5D01 00DD0000 1E3C5D00 00F10000
    1E3C5D01 00F10000 1E0F0F9F 00000000 00000000 00000000 00000000 00000000
    00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
    00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
`;

const XB0001 = bytesFromDump(XB0001_DUMP);
const NLC001 = bytesFromDump(NLC001_DUMP);

describe('genuine card dumps', () => {
    it('confirms the two dumps are the sizes the readers reported', () => {
        // Guards the fixtures themselves: a typo in a dump would otherwise quietly
        // change what every assertion below is testing.
        expect(XB0001).toHaveLength(128);
        expect(NLC001).toHaveLength(160);
    });

    describe('XB0001', () => {
        const recipe = new Recipe(XB0001);

        it('decodes to the recipe xBloom shows for this card', () => {
            expect(recipe.xid).toBe('XB0001');
            expect(recipe.cupType).toBe(CUP_TYPE.XPOD);
            expect(recipe.dosage).toBe(15);
            expect(recipe.ratio).toBe(17);
            expect(recipe.grindSize).toBe(65);
            expect(recipe.grindRPM).toBe(120);
            expect(recipe.pours.map(pour => pour.getVolume())).toEqual([60, 65, 65, 65]);
            expect(recipe.pours.map(pour => pour.getTemperature())).toEqual([93, 93, 93, 93]);
        });

        it('holds to the machine\'s rule that the pours sum to dose x ratio', () => {
            expect(recipe.getTotalVolume()).toBe(15 * 17);
        });

        it('re-encodes byte for byte, checksum included', () => {
            const encoded = new Recipe(XB0001).getData(XB0001.slice(0, HASH_LENGTH), true);

            expect(encoded).toEqual(XB0001.slice(0, encoded.length));
        });
    });

    describe('NLC001', () => {
        const recipe = new Recipe(NLC001);

        it('decodes to the recipe xBloom shows for this card', () => {
            expect(recipe.xid).toBe('NLC001');
            expect(recipe.cupType).toBe(CUP_TYPE.XPOD);
            expect(recipe.dosage).toBe(15);
            expect(recipe.ratio).toBe(15);
            expect(recipe.grindSize).toBe(55);
            expect(recipe.grindRPM).toBe(120);
            expect(recipe.pours.map(pour => pour.getVolume())).toEqual([30, 75, 60, 60]);
            expect(recipe.pours.map(pour => pour.getTemperature())).toEqual([94, 93, 93, 93]);
        });

        it('holds to the machine\'s rule that the pours sum to dose x ratio', () => {
            expect(recipe.getTotalVolume()).toBe(15 * 15);
        });

        it('re-encodes byte for byte, checksum included', () => {
            const encoded = new Recipe(NLC001).getData(NLC001.slice(0, HASH_LENGTH), true);

            expect(encoded).toEqual(NLC001.slice(0, encoded.length));
        });
    });

    it('encodes a four-pour recipe into the 44 bytes the layout predicts', () => {
        // Payload is 12 + 8n bytes (XID 7, cup type 1, count 1, pours 8n, then
        // grind, ratio and checksum). The per-card pour ceiling is derived from this,
        // so pin it: 4 pours -> 44 bytes on top of the 32-byte signature.
        const encoded = new Recipe(XB0001).getData(XB0001.slice(0, HASH_LENGTH), true);

        expect(encoded).toHaveLength(HASH_LENGTH + 12 + 8 * 4);
    });
});
