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

    it("preserves the raw card bytes, which nothing else can regenerate", () => {
        // backup, offline_backup and uid are bytes read off a genuine xBloom
        // card. The 32-byte signature in them is derived from the card's serial
        // and this app never recomputes it, so a recipe that comes back without
        // them cannot be written to that card again. Losing a name is an
        // annoyance; losing these is losing the card.
        const recipe = recipeNamed("Morning", "u1");
        recipe.backup = [0, 127, 128, 255, 1, 2, 3];
        recipe.offline_backup = [9, 8, 7, 6];
        recipe.uid = [224, 4, 1, 80, 8, 0, 0, 0];

        const result = parseBackup(buildBackup([recipe], {}));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const restored = result.payload.recipes[0];
        expect(restored.backup).toEqual(recipe.backup);
        expect(restored.offline_backup).toEqual(recipe.offline_backup);
        expect(restored.uid).toEqual(recipe.uid);
    });

    it("restores a recipe whose UUID went missing rather than dropping it", () => {
        // The constructor mints a UUID when one is absent. Discarding an
        // otherwise readable recipe over a field the model can regenerate is
        // the one outcome this whole feature exists to prevent.
        const entry = JSON.parse(JSON.stringify(recipeNamed("Nameless", "u1")));
        delete entry.uuid;

        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: [entry]
        }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].name).toBe("Nameless");
        expect(result.payload.recipes[0].uuid).toBeTruthy();
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

    it("skips a recipe whose fields are the wrong type", () => {
        // `new Recipe(...)` used to be the validator, and it is written to be
        // forgiving of anything it can repair -- so it kept a numeric name and
        // a string volume, minted a uuid, and the presence of that uuid was
        // then read as proof the entry was sound. Each of these survived that
        // check and would have been inserted into the library.
        const good = JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0];
        const corrupt = [
            {...good, uuid: "u2", name: 5},
            {...good, uuid: "u3", ratio: "sixteen"},
            {...good, uuid: "u4", grinder: "yes"},
            {...good, uuid: "u5", pours: [{...good.pours[0], volume: "lots"}]},
            {...good, uuid: "u6", pours: [{}]},
            {...good, uuid: "u7", pours: "x"},
            {...good, uuid: "u8", dosage: null},
            {...good, uuid: "u9", uid: [1, "2", 3]}
        ];

        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [good, ...corrupt]
        }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes).toHaveLength(1);
        expect(result.payload.skipped).toBe(corrupt.length);
    });

    it("still takes a recipe that merely leaves fields out", () => {
        // The other half of the same guard, and the more important half. The
        // model repairs a long tail of legacy omissions on purpose, and this
        // feature exists so a user does not lose recipes -- so validation
        // checks the type of a field that is there, never that it is there.
        const good = JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0];
        const legacy = {
            pours: good.pours,
            title: "An old name",
            ratio: 16,
            grindSize: 60
        };

        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [legacy]
        }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.skipped).toBe(0);
        expect(result.payload.recipes[0].name).toBe("An old name");
        expect(result.payload.recipes[0].uuid).toBeTruthy();
    });

    it("still takes pours that were stored as JSON strings", () => {
        // A form an older version wrote and the constructor still reads. A
        // validator that only understood objects would reject every recipe in
        // an old library, which is exactly the loss this feature prevents.
        const good = JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0];
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [{...good, pours: good.pours.map((p: unknown) => JSON.stringify(p))}]
        }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.skipped).toBe(0);
        expect(result.payload.recipes[0].pours).toHaveLength(good.pours.length);
    });

    it("refuses another app's file even when its recipes look plausible", () => {
        // The obvious test — a bare {hello:"world"} — is refused by the missing
        // recipes array, so it passes with the format check deleted. This is
        // the input that actually holds that check: everything else is right,
        // and only the name on the envelope is wrong.
        const result = parseBackup(JSON.stringify({
            format: "some-other-app", version: BACKUP_VERSION,
            recipes: [JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0]]
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/not an XBRW\+\+ backup/i);
    });

    it("refuses a version it cannot compare", () => {
        // The field exists to be compared against BACKUP_VERSION. One that is
        // present but not a number bypasses the comparison and is parsed
        // optimistically — which is the silent misreading the version was added
        // to prevent.
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: "2",
            recipes: [JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0]]
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/not an XBRW\+\+ backup/i);
    });

    it("says a backup was unreadable rather than calling it empty", () => {
        // "Nothing was in there" and "none of your forty recipes could be read"
        // ask for opposite things from the user: the first says the file is
        // spent, the second says keep it. Reporting the second as the first is
        // how a user throws away the only copy.
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [{nonsense: true}, null, 42]
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/3 recipes/);
        expect(result.reason).toMatch(/keep the file/i);
        expect(result.reason).not.toMatch(/no recipes/i);
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

describe("the share fields survive a backup", () => {
    it("carries them through the round trip", () => {
        const recipe = recipeNamed("Shared", "u1");
        recipe.sharedTableId = 1353046;
        recipe.shareUrl = "https://share-h5.xbloom.com/?id=abc";
        recipe.shareSnapshot = "{}";
        const result = parseBackup(buildBackup([recipe], {}));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].sharedTableId).toBe(1353046);
        expect(result.payload.recipes[0].shareUrl).toBe("https://share-h5.xbloom.com/?id=abc");
    });

    it("refuses a recipe whose sharedTableId is not a number", () => {
        const doc = JSON.parse(buildBackup([recipeNamed("A", "u1")], {}));
        doc.recipes[0].sharedTableId = "1353046";
        const result = parseBackup(JSON.stringify(doc));
        expect(result.ok).toBe(false);
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

    it("adds a repeated UUID once, and still accounts for both entries", () => {
        // The summary is what the user judges the restore by, so the two counts
        // have to add up to the number of entries in the file. A second copy
        // that appears in neither tally reads as a silently lost recipe.
        const result = mergeRecipes([], [recipeNamed("A", "u1"), recipeNamed("A again", "u1")]);
        expect(result.toAdd).toHaveLength(1);
        expect(result.toAdd.length + result.alreadyPresent).toBe(2);
    });
});
