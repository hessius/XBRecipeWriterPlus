import {isValidXID, XID_LENGTH} from '@/library/Recipe';

describe('isValidXID', () => {
    it('accepts an empty XID, which just means no online lookup', () => {
        expect(isValidXID('')).toBe(true);
        expect(isValidXID('   ')).toBe(true);
    });

    it('accepts a vendor code followed by two or three digits', () => {
        expect(isValidXID('CGL12')).toBe(true);
        expect(isValidXID('CGL123')).toBe(true);
    });

    it('accepts the optional tea marker', () => {
        expect(isValidXID('CGLT12')).toBe(true);
        expect(isValidXID('CGLT123')).toBe(true);
    });

    // The grammar used to demand exactly three letters and at most three
    // digits. A real shared recipe carrying XB0001 -- xBloom's own house code,
    // two letters and four digits -- was refused by the very app that had just
    // imported it, and the editor then flagged the XID it had filled in itself.
    it("accepts xBloom's own two-letter house code", () => {
        expect(isValidXID('XB0001')).toBe(true);
    });

    it('rejects a truncated XID', () => {
        expect(isValidXID('CGL')).toBe(false);
        expect(isValidXID('CGL1')).toBe(false);
        expect(isValidXID('C123')).toBe(false);
    });

    it('rejects anything longer than the card field', () => {
        expect('CGLT1234'.length).toBeGreaterThan(XID_LENGTH);
        expect(isValidXID('CGLT1234')).toBe(false);
    });

    it('rejects digits before letters, which no observed code does', () => {
        expect(isValidXID('CG7T12')).toBe(false);
        expect(isValidXID('12ABC')).toBe(false);
    });
});
