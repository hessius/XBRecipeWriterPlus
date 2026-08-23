import {DETAILED_TOPICS, RECIPE_HELP, type HelpTopic} from "@/constants/recipeHelp";

describe("the editor's help copy", () => {
    const topics = Object.keys(RECIPE_HELP) as HelpTopic[];

    it("gives every topic a title and a hint", () => {
        topics.forEach((topic) => {
            expect(RECIPE_HELP[topic].title.length).toBeGreaterThan(0);
            expect(RECIPE_HELP[topic].hint.length).toBeGreaterThan(0);
        });
    });

    it("keeps hints to one short line", () => {
        topics.forEach((topic) => {
            expect(RECIPE_HELP[topic].hint.length).toBeLessThanOrEqual(64);
        });
    });

    it("carries the grinder workaround, which is documented nowhere else", () => {
        expect(RECIPE_HELP.grinder.detail).toContain("81");
        expect(RECIPE_HELP.grinder.detail).toContain("load any other recipe");
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
