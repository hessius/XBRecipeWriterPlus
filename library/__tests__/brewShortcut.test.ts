import {asBrewShortcut, BREW_SHORTCUTS, DEFAULT_BREW_SHORTCUT} from "@/library/brewShortcut";

describe("asBrewShortcut", () => {
    it.each(BREW_SHORTCUTS)("keeps %s", (shape) => {
        expect(asBrewShortcut(shape)).toBe(shape);
    });

    it.each([
        ["a value from a build that had different shapes", "capsule"],
        ["the boolean this replaced being restored into the wrong key", true],
        ["nothing at all", undefined],
        ["a hand-edited row", ""]
    ])("falls back to the default given %s", (_why, value) => {
        // Settings.get only compares typeof against the default, and every
        // candidate here is a string, so nothing upstream rejects a wrong one.
        expect(asBrewShortcut(value)).toBe(DEFAULT_BREW_SHORTCUT);
    });
});
