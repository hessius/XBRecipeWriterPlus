import {buildBackup, mergeRecipes, parseBackup, BACKUP_FORMAT, BACKUP_VERSION}
    from "@/library/backup";
import Recipe from "@/library/Recipe";

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

describe("buildBackup", () => {
    it("writes an envelope that names its format and version", () => {
        const parsed = JSON.parse(buildBackup([recipeNamed("A", "u1")], {temperatureUnit: "F"}));
        expect(parsed.format).toBe(BACKUP_FORMAT);
        expect(parsed.version).toBe(BACKUP_VERSION);
        expect(parsed.recipes).toHaveLength(1);
        expect(parsed.settings.temperatureUnit).toBe("F");
    });

    it("stamps when it was made and by which app version", () => {
        const parsed = JSON.parse(buildBackup([recipeNamed("A", "u1")], {}, "2.6.0"));
        expect(parsed.appVersion).toBe("2.6.0");
        expect(Number.isNaN(Date.parse(parsed.exportedAt))).toBe(false);
    });
});

describe("the round trip", () => {
    it("gives back the recipes that went in", () => {
        const recipes = [recipeNamed("Morning", "u1"), recipeNamed("Evening", "u2")];
        const result = parseBackup(buildBackup(recipes, {}));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes.map((r) => r.name)).toEqual(["Morning", "Evening"]);
        expect(result.payload.recipes.map((r) => r.uuid)).toEqual(["u1", "u2"]);
    });

    it("preserves the stage temperatures exactly", () => {
        const recipe = recipeNamed("Morning", "u1");
        // A bare `new Recipe()` starts with no pours — they only exist once a
        // card is read or one is added in the editor — so one is added here
        // before its temperature can be set.
        recipe.addPour(-1);
        recipe.pours[0].temperature = 93;
        const result = parseBackup(buildBackup([recipe], {}));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].pours[0].temperature).toBe(93);
    });
});

describe("parseBackup refuses, with a reason", () => {
    // Every failure here is a message the user has to act on. An exception
    // crossing a screen boundary becomes a generic apology.
    it("refuses text that is not JSON", () => {
        const result = parseBackup("{ not json");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/could not be read/i);
    });

    it("refuses a JSON file that is not a backup", () => {
        const result = parseBackup(JSON.stringify({hello: "world"}));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/not an XBRW\+\+ backup/i);
    });

    it("refuses a backup from a newer app by saying which side is old", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, recipes: [{}]
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/newer version/i);
    });

    it("refuses a backup with no recipes rather than restoring nothing", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: []
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/no recipes/i);
    });

    it("refuses a backup whose recipes are not a list", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: "lots"
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/not an XBRW\+\+ backup/i);
    });

    it("skips a recipe blob that will not parse, and keeps the rest", () => {
        // A backup file is a document from anywhere. One bad entry must not
        // cost the user the other forty.
        const good = JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0];
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [good, {nonsense: true}, null]
        }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes).toHaveLength(1);
        expect(result.payload.skipped).toBe(2);
    });

    it("never throws, whatever it is handed", () => {
        for (const input of ["", "null", "[]", "0", '"a string"', "undefined"]) {
            expect(() => parseBackup(input)).not.toThrow();
            expect(parseBackup(input).ok).toBe(false);
        }
    });

    it("treats missing settings as no settings rather than as a fault", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0]]
        }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.settings).toEqual({});
    });
});

describe("mergeRecipes", () => {
    it("adds everything into an empty library", () => {
        const incoming = [recipeNamed("A", "u1"), recipeNamed("B", "u2")];
        const result = mergeRecipes([], incoming);
        expect(result.toAdd).toHaveLength(2);
        expect(result.alreadyPresent).toBe(0);
    });

    it("adds nothing when every recipe is already there", () => {
        const existing = [recipeNamed("A", "u1")];
        const result = mergeRecipes(existing, [recipeNamed("A renamed", "u1")]);
        expect(result.toAdd).toHaveLength(0);
        expect(result.alreadyPresent).toBe(1);
    });

    it("adds only what is new", () => {
        const existing = [recipeNamed("A", "u1")];
        const result = mergeRecipes(existing, [recipeNamed("A", "u1"), recipeNamed("B", "u2")]);
        expect(result.toAdd.map((r) => r.uuid)).toEqual(["u2"]);
        expect(result.alreadyPresent).toBe(1);
    });

    it("never overwrites, so a merge cannot lose an edit", () => {
        const mine = recipeNamed("My careful edit", "u1");
        const result = mergeRecipes([mine], [recipeNamed("Their version", "u1")]);
        expect(result.toAdd).toHaveLength(0);
    });

    it("handles an empty backup", () => {
        const result = mergeRecipes([recipeNamed("A", "u1")], []);
        expect(result.toAdd).toHaveLength(0);
        expect(result.alreadyPresent).toBe(0);
    });
});
