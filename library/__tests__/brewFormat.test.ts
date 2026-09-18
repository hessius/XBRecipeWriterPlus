import {formatBrewAgo} from "@/library/brew/brewFormat";

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

    it("does not report the future as ages ago", () => {
        // A clock moved back, or a restored file from a phone set wrong.
        expect(formatBrewAgo(now + 5 * DAY, now)).toBe("TODAY");
    });
});
