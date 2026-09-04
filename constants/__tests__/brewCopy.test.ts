import {
    BLOCKED_HEADLINE,
    BLOCKED_WATER_HEADLINE,
    FAILURE_COPY,
    FIRST_BREW_REMINDER,
    MINI_FAILURE_WHY,
    PHASE_COPY,
    PRO_MODE_PROMPT,
    blockedWaterCopy
} from "@/constants/brewCopy";

/** Every string the user can read, flattened. */
const ALL: string[] = [
    ...Object.values(PHASE_COPY),
    ...Object.values(FAILURE_COPY),
    ...Object.values(BLOCKED_HEADLINE),
    ...Object.values(MINI_FAILURE_WHY),
    BLOCKED_WATER_HEADLINE,
    FIRST_BREW_REMINDER,
    PRO_MODE_PROMPT,
    blockedWaterCopy(240)
];

describe("brew copy", () => {
    it("uses no em dashes", () => {
        for (const line of ALL) expect(line).not.toContain("\u2014");
    });

    it("does not claim nothing was sent, because opening a session beeps", () => {
        expect(blockedWaterCopy(240)).not.toContain("nothing has been sent");
    });

    it("says the dose is safe in words the user can act on", () => {
        expect(blockedWaterCopy(240)).toContain("240 ml");
        expect(blockedWaterCopy(240)).toContain("still in the hopper");
    });

    it("has a line for the commanded-but-unmoved window", () => {
        expect(PHASE_COPY.connecting).toBe("Connecting to the machine…");
    });
});
