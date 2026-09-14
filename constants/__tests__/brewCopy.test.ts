import {
    BLOCKED_HEADLINE,
    BLOCKED_WATER_HEADLINE,
    FAILURE_COPY,
    FIRST_BREW_REMINDER,
    AGITATION_SENTENCE,
    MINI_FAILURE_WHY,
    PATTERN_SENTENCE,
    PHASE_COPY,
    PRO_MODE_PROMPT,
    blockedWaterCopy
} from "@/constants/brewCopy";
import {AGITATION} from "@/library/Pour";

/** Every string the user can read, flattened. */
const ALL: string[] = [
    ...Object.values(PHASE_COPY),
    ...Object.values(FAILURE_COPY),
    ...Object.values(BLOCKED_HEADLINE),
    ...Object.values(MINI_FAILURE_WHY),
    ...Object.values(PATTERN_SENTENCE),
    ...Object.values(AGITATION_SENTENCE),
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

    it("has a non-terminal line for the drawdown after the pour", () => {
        // Settling sits between the last pour and "Enjoy.", so it must read as
        // still in progress rather than finished.
        expect(PHASE_COPY.settling).toBe("Letting the last of the coffee drain…");
        expect(PHASE_COPY.settling).not.toBe(PHASE_COPY.done);
    });

    it("describes agitation relative to the pour", () => {
        expect(AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_OFF])
            .toBe("Agitates the bed before pouring.");
        expect(AGITATION_SENTENCE[AGITATION.BEFORE_OFF_AFTER_ON])
            .toBe("Agitates the bed after pouring.");
        expect(AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_ON])
            .toBe("Agitates the bed before and after pouring.");
    });
});
