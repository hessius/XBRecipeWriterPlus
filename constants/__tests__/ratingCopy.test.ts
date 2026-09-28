import {
    HANDOFF_ALREADY_SENT,
    RATING_CAN_WAIT,
    RATING_PROMPT_DISMISS_LABEL,
    RATING_PROMPT_OPEN_LABEL,
    RATING_PROMPT_QUESTION,
    RATING_SHEET_DONE,
    RATING_SHEET_TITLE
} from "@/constants/brewCopy";

describe("the rating and handoff copy", () => {
    it("says a rating can wait without naming a screen", () => {
        const line = RATING_CAN_WAIT.toLowerCase();
        expect(line).toContain("later");
        expect(line).not.toMatch(/history|settings|library/);
    });

    it("keeps the rating bar question separate from its tap labels", () => {
        expect(RATING_PROMPT_QUESTION).toBe("HOW WAS IT");
        expect(RATING_PROMPT_OPEN_LABEL).toBe("Open the last brew");
        expect(RATING_PROMPT_DISMISS_LABEL).toBe("Not now");
    });

    it("names the rating sheet and its confirm control", () => {
        expect(RATING_SHEET_TITLE).toBe("How was it?");
        expect(RATING_SHEET_DONE).toBe("DONE");
    });

    it("names the day a brew went over, and says another brew will be added rather than updated", () => {
        const line = HANDOFF_ALREADY_SENT("2 March");
        expect(line).toContain("2 March");
        expect(line.toLowerCase()).toContain("another");
        expect(line.toLowerCase()).toContain("rather than");
    });
});
