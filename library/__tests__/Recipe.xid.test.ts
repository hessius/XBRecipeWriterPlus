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

    it('rejects a truncated XID', () => {
        expect(isValidXID('CGL')).toBe(false);
        expect(isValidXID('CGL1')).toBe(false);
        expect(isValidXID('CG12')).toBe(false);
    });

    it('rejects anything longer than the card field', () => {
        expect('CGLT1234'.length).toBeGreaterThan(XID_LENGTH);
        expect(isValidXID('CGLT1234')).toBe(false);
    });

    it('rejects a vendor code that is not three letters', () => {
        expect(isValidXID('CG7T12')).toBe(false);
        expect(isValidXID('CGLX12')).toBe(false);
    });
});
