import {
    HANDOFF_ALREADY_SENT,
    RATING_CAN_WAIT,
    RATING_PROMPT
} from "@/constants/brewCopy";

const copy = [
    RATING_CAN_WAIT,
    ...Object.values(RATING_PROMPT),
    HANDOFF_ALREADY_SENT("2 March")
];

describe("the rating and handoff copy", () => {
    it("uses no dashes, which read as machine written", () => {
        for (const line of copy) {
            expect(line).not.toMatch(/[\u2013\u2014]/);
            expect(line).not.toMatch(/ - /);
        }
    });

    it("says a rating can wait without naming a screen", () => {
        expect(RATING_CAN_WAIT.toLowerCase()).toContain("later");
    });

    it("names the day a brew went over, and warns about a second", () => {
        const line = HANDOFF_ALREADY_SENT("2 March");
        expect(line).toContain("2 March");
        expect(line.toLowerCase()).toContain("second");
    });
});
