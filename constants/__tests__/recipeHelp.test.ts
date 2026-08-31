import {DETAILED_TOPICS, RECIPE_HELP, type HelpTopic} from "@/constants/recipeHelp";
import {CARD_GRIND_MIN, grindBand} from "@/library/grindBands";
import {CELSIUS_RANGE, displayRange} from "@/library/units";

describe("the editor's help copy", () => {
    const topics = Object.keys(RECIPE_HELP) as HelpTopic[];

    it("gives every topic a title", () => {
        topics.forEach((topic) => {
            expect(RECIPE_HELP[topic].title.length).toBeGreaterThan(0);
        });
    });

    it("writes a hint or none at all, never an empty one", () => {
        // A hint is optional -- a field whose label says everything is better
        // off without one -- but the absence has to be the absence, not a blank
        // string that draws an empty line under the label.
        topics.forEach((topic) => {
            const hint = RECIPE_HELP[topic].hint;
            if (hint !== undefined) expect(hint.trim().length).toBeGreaterThan(0);
        });
    });

    it("keeps hints to two lines of the row", () => {
        // 64 was one line, and it was a cap on the writing rather than on the
        // layout: the notes that had most to say were the ones being squeezed.
        // The row wraps, so two lines is the real limit.
        topics.forEach((topic) => {
            expect(RECIPE_HELP[topic].hint?.length ?? 0).toBeLessThanOrEqual(96);
        });
    });

    it("carries the grinder workaround, which is documented nowhere else", () => {
        expect(RECIPE_HELP.grinder.detail).toContain("81");
        expect(RECIPE_HELP.grinder.detail).toContain("load any other recipe");
    });

    it("requires the workaround recipe to have its grinder enabled", () => {
        expect(RECIPE_HELP.grinder.detail).toContain("with the grinder enabled");
    });

    it("gives the temperature range in both units", () => {
        // Tied to the ranges themselves, not hard-coded literals, so a change
        // to the card's storable range would leave this failing rather than
        // leave the help copy silently describing a range the card no longer
        // has.
        const fahrenheit = displayRange("F");
        expect(RECIPE_HELP.temperature.hint).toContain(String(CELSIUS_RANGE.min));
        expect(RECIPE_HELP.temperature.hint).toContain(String(CELSIUS_RANGE.max));
        expect(RECIPE_HELP.temperature.hint).toContain(String(fahrenheit.min));
        expect(RECIPE_HELP.temperature.hint).toContain(String(fahrenheit.max));
    });

    it("describes the grind bands the lookup actually returns", () => {
        // The prose names 55/56 as the pourover-to-French-press boundary, which
        // `grindBands` also decides. Two places holding the same number is how
        // the row label and the help sheet come to disagree while every other
        // test still passes.
        const detail = RECIPE_HELP.grindSize.detail ?? "";

        expect(grindBand(55)?.label).toBe("Pourover");
        expect(grindBand(56)?.label).toBe("French press");
        expect(detail).toContain(`${CARD_GRIND_MIN} to 55`);
        expect(detail).toContain("56 to 80");
        expect(detail).toContain(String(CARD_GRIND_MIN));
    });

    it("offers changing the dose or ratio as an alternative to rescaling stage volumes", () => {
        expect(RECIPE_HELP.volume.detail).toMatch(/dose or (the )?ratio/);
    });

    it("does not claim auto fix puts the rounding error on the last stage", () => {
        expect(RECIPE_HELP.volume.detail).not.toMatch(/rounding error on the last/);
    });

    it("explains that a card without a recipe ID reads back nameless", () => {
        expect(RECIPE_HELP.xid.detail).toContain("nameless");
    });

    it("explains the tea siphon's extra volume", () => {
        expect(RECIPE_HELP.tea.detail).toContain("30");
    });
});

describe("the shape of an entry", () => {
    it("lets a consumer ask any topic whether it has a long form", () => {
        // Not a tautology: RECIPE_HELP is declared through an inner `as const`
        // object and re-exported as Record<HelpTopic, HelpEntry> precisely so
        // that this compiles. Read directly, the const object gives each entry
        // its own literal type and `detail` does not exist on the short ones.
        expect(RECIPE_HELP.dose.detail).toBeUndefined();
        expect(RECIPE_HELP.grinder.detail).toBeDefined();
    });

    it("lists exactly the topics that have a long form", () => {
        expect(DETAILED_TOPICS).toEqual(
            (Object.keys(RECIPE_HELP) as HelpTopic[])
                .filter((topic) => RECIPE_HELP[topic].detail !== undefined)
        );
        expect(DETAILED_TOPICS).toContain("grinder");
        expect(DETAILED_TOPICS).not.toContain("dose");
    });
});
