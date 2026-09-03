import Pour, {AGITATION} from "@/library/Pour";

/**
 * `Pour` defaults every field to -1 to mean "never set". Agitation is the one
 * field where that is a bit pattern rather than an out-of-range number, and
 * every bit of -1 is set — so the sentinel has to be read as neither bit
 * rather than both. See issue #85.
 */
describe("Pour agitation with the unset sentinel", () => {
    it("reads a stage nobody has touched as agitated at neither end", () => {
        const pour = new Pour(1);

        expect(pour.agitation).toBe(-1);
        expect(pour.getAgitationBefore()).toBe(false);
        expect(pour.getAgitationAfter()).toBe(false);
    });

    it("does not turn the after agitation on by switching the before one off", () => {
        // The old arithmetic was `-1 & 0b10`, which is 2: asking for less
        // agitation gave you some.
        const pour = new Pour(1);

        pour.setAgitationBefore(false);

        expect(pour.getAgitationAfter()).toBe(false);
        expect(pour.agitation).toBe(AGITATION.ALL_OFF);
    });

    it("does not turn the before agitation on by switching the after one off", () => {
        const pour = new Pour(1);

        pour.setAgitationAfter(false);

        expect(pour.getAgitationBefore()).toBe(false);
        expect(pour.agitation).toBe(AGITATION.ALL_OFF);
    });

    it("settles on a real value the card writer will accept", () => {
        // -1 is rejected by `cardWriteProblems`, so a pour that has been given
        // an agitation must no longer be carrying the sentinel.
        const pour = new Pour(1);

        pour.setAgitationBefore(true);

        expect(pour.agitation).toBe(AGITATION.BEFORE_ON_AFTER_OFF);
    });

    it("still keeps the two sides independent once they are set", () => {
        const pour = new Pour(1, 40, 93, 30, AGITATION.ALL_OFF, 0, 0);

        pour.setAgitationAfter(true);
        expect(pour.agitation).toBe(AGITATION.BEFORE_OFF_AFTER_ON);

        pour.setAgitationBefore(true);
        expect(pour.agitation).toBe(AGITATION.BEFORE_ON_AFTER_ON);

        pour.setAgitationAfter(false);
        expect(pour.agitation).toBe(AGITATION.BEFORE_ON_AFTER_OFF);
        expect(pour.getAgitationBefore()).toBe(true);
        expect(pour.getAgitationAfter()).toBe(false);
    });
});
