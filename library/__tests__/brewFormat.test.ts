import {formatBrewAgo, spokenBrewAgo} from "@/library/brew/brewFormat";

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 19, 12);

/**
 * The card's evidence has a few characters at the end of a row of figures, and
 * a glance is asking whether this is a recipe the user has been brewing lately.
 * A date answers a different question, in more space.
 */
describe("formatBrewAgo", () => {
    it("says today rather than nothing", () => {
        expect(formatBrewAgo(now - 3_600_000, now)).toBe("TODAY");
    });

    it("counts the first week in days", () => {
        expect(formatBrewAgo(now - 3 * DAY, now)).toBe("3D");
    });

    it("does not round six days up to a week", () => {
        expect(formatBrewAgo(now - 6 * DAY, now)).toBe("6D");
    });

    it("turns a week into a week", () => {
        expect(formatBrewAgo(now - 7 * DAY, now)).toBe("1W");
    });

    it("counts in weeks until months read better", () => {
        expect(formatBrewAgo(now - 40 * DAY, now)).toBe("5W");
    });

    it("counts the months after that", () => {
        expect(formatBrewAgo(now - 100 * DAY, now)).toBe("3MO");
    });

    it("counts the years after that", () => {
        expect(formatBrewAgo(now - 800 * DAY, now)).toBe("2Y");
    });

    // Twenty minutes apart and a different day. Elapsed time says today; the
    // user, who went to bed in between, says yesterday. The word on the card
    // has to mean the thing the user means by it.
    it("calls last night yesterday, not today", () => {
        const lastNight = new Date(2026, 8, 18, 23, 50).getTime();
        const justAfterMidnight = new Date(2026, 8, 19, 0, 10).getTime();

        expect(formatBrewAgo(lastNight, justAfterMidnight)).toBe("1D");
    });

    it("calls this morning today, however early it was", () => {
        const earlyToday = new Date(2026, 8, 19, 0, 5).getTime();
        const lateToday = new Date(2026, 8, 19, 23, 55).getTime();

        expect(formatBrewAgo(earlyToday, lateToday)).toBe("TODAY");
    });

    it("does not report the future as ages ago", () => {
        // A clock moved back, or a restored file from a phone set wrong.
        expect(formatBrewAgo(now + 5 * DAY, now)).toBe("TODAY");
    });
});

/**
 * The card draws `3D`, which nobody can hear. The design puts three facts in
 * the evidence and requires all three to be spoken, so recency needs a form
 * made of words rather than of characters.
 */
describe("spokenBrewAgo", () => {
    it("says today in a word", () => {
        expect(spokenBrewAgo(now - 3_600_000, now)).toBe("today");
    });

    it("says one day in the singular", () => {
        expect(spokenBrewAgo(now - DAY, now)).toBe("1 day ago");
    });

    it("counts the days aloud", () => {
        expect(spokenBrewAgo(now - 3 * DAY, now)).toBe("3 days ago");
    });

    it("moves to weeks where the drawn form does", () => {
        expect(spokenBrewAgo(now - 7 * DAY, now)).toBe("1 week ago");
        expect(spokenBrewAgo(now - 40 * DAY, now)).toBe("5 weeks ago");
    });

    it("moves to months and years where the drawn form does", () => {
        expect(spokenBrewAgo(now - 100 * DAY, now)).toBe("3 months ago");
        expect(spokenBrewAgo(now - 800 * DAY, now)).toBe("2 years ago");
    });

    it("does not report the future as ages ago", () => {
        expect(spokenBrewAgo(now + 5 * DAY, now)).toBe("today");
    });
});
