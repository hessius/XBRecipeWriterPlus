import {buildBackup, mergeRecipes, parseBackup, BACKUP_FORMAT, BACKUP_VERSION}
    from "@/library/backup";
import Recipe, {MAX_DESCRIPTION} from "@/library/Recipe";
import {DEFAULTS, NOT_IN_BACKUP, type SettingKey} from "@/library/Settings";

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

/**
 * A backup file whose single recipe carries the given extra keys verbatim,
 * bypassing `Recipe` so a value the model would never produce can be tested.
 */
function backupFileWithRecipeFields(extra: Record<string, unknown>): string {
    const valid = JSON.parse(
        buildBackup([new Recipe(undefined,
            JSON.stringify({pours: [], ratio: 16, dosage: 18, grindSize: 60}))], {})
    );
    valid.recipes[0] = {...valid.recipes[0], ...extra};
    return JSON.stringify(valid);
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

describe("the fields a card cannot do without", () => {
    // The complement of the "leaves fields out" case above, and the sharper
    // edge of it. Most absent fields are safe because the constructor has a
    // fallback the model can live with. These two do not: the constructor
    // assigns `jsonRecipe.grindSize` and `jsonRecipe.ratio` straight through
    // with no default, and `getData` then does unguarded arithmetic on the
    // result on its way to a genuine card -- so an absent one is not repaired,
    // it is written to the card as a broken byte a user cannot un-brew.
    //
    // Requiring presence here is only safe because it can never reject an
    // honest file: both are plain `Recipe` properties with numeric
    // initialisers, so `JSON.stringify` emits them for every recipe this app
    // has ever exported, and even the oldest legacy blob in
    // RecipeDatabase.migration.test carries both.
    function backupMissing(field: string): string {
        const good = JSON.parse(buildBackup([new Recipe(undefined, JSON.stringify({
            pours: [{pourNumber: 0, volume: 120, temperature: 93, flowRate: 3,
                     agitation: 0, pourPattern: 0, pauseTime: 0}],
            ratio: 16, dosage: 18, grindSize: 60
        }))], {})).recipes[0];
        delete good[field];
        return JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: [good]
        });
    }

    it("refuses a recipe with no grindSize instead of writing NaN to a card", () => {
        // grindSize absent leaves `this.grindSize` undefined, and
        // `this.grindSize - GRIND_SIZE_OFFSET` in getData is NaN.
        const result = parseBackup(backupMissing("grindSize"));
        expect(result.ok).toBe(false);
    });

    it("refuses a recipe with no ratio instead of writing a hole to a card", () => {
        // ratio absent leaves `this.ratio` undefined, which getData pushes
        // straight into the byte array as an undefined byte.
        const result = parseBackup(backupMissing("ratio"));
        expect(result.ok).toBe(false);
    });

    it("never lets a recipe it accepted produce a broken card byte", () => {
        // The property that actually matters, asserted directly so it keeps
        // holding as the card format changes: whatever survives parseBackup can
        // be handed to the NFC write path, so every byte getData emits must be a
        // real number. getData takes the 32-byte card signature as its prefix.
        const good = JSON.parse(buildBackup([new Recipe(undefined, JSON.stringify({
            pours: [{pourNumber: 0, volume: 120, temperature: 93, flowRate: 3,
                     agitation: 0, pourPattern: 0, pauseTime: 0}],
            ratio: 16, dosage: 18, grindSize: 60
        }))], {})).recipes[0];
        const entries: Record<string, unknown>[] = [good];
        for (const field of ["grindSize", "ratio", "dosage", "grindRPM", "cupType", "xid"]) {
            const stripped = {...good};
            delete stripped[field];
            entries.push(stripped);
        }

        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: entries
        }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        for (const recipe of result.payload.recipes) {
            const data = recipe.getData(new Array(32).fill(0));
            expect(data.every((byte) => Number.isFinite(byte))).toBe(true);
        }
    });

    it("still accepts a complete legacy backup that carries both", () => {
        // The regression guard: the fix must not turn a real backup into a
        // corruption report. A legacy recipe shape -- `title` not `name`, a
        // pre-rename cup byte, no createdAt or tags -- but with the two fields
        // this fix requires, and with a fully serialised pour, which is what
        // buildBackup has always emitted because Pour holds all six as plain
        // properties.
        const legacy = {
            uuid: "uuid-a",
            title: "Legacy Coffee",
            cupType: 0,
            ratio: 16,
            dosage: 15,
            grindSize: 60,
            grindRPM: 120,
            pours: [JSON.stringify({pourNumber: 0, volume: 120, temperature: 93,
                                    flowRate: 3, agitation: 0, pourPattern: 0,
                                    pauseTime: 0})]
        };
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: [legacy]
        }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.skipped).toBe(0);
        expect(result.payload.recipes[0].name).toBe("Legacy Coffee");
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

describe("a share URL out of a backup file", () => {
    function accepts(url: unknown): boolean {
        const doc = JSON.parse(buildBackup([recipeNamed("A", "u1")], {}));
        doc.recipes[0].shareUrl = url;
        return parseBackup(JSON.stringify(doc)).ok;
    }

    it("keeps a genuine xBloom share link", () => {
        expect(accepts("https://share-h5.xbloom.com/?id=abc")).toBe(true);
    });

    it("keeps an empty one, which is a recipe never shared", () => {
        expect(accepts("")).toBe(true);
    });

    it("rejects a link to somewhere else", () => {
        // `useShareRecipe` hands a stored URL straight to the share sheet when
        // the snapshot still matches, so this would have the app distribute an
        // attacker's link as though it were an xBloom recipe.
        expect(accepts("https://evil.example/?id=abc")).toBe(false);
    });

    it("rejects a lookalike host", () => {
        expect(accepts("https://share-h5.xbloom.com.evil.example/?id=abc")).toBe(false);
    });

    it("rejects plain HTTP", () => {
        expect(accepts("http://share-h5.xbloom.com/?id=abc")).toBe(false);
    });

    it("rejects the right host with no id", () => {
        expect(accepts("https://share-h5.xbloom.com/")).toBe(false);
    });

    it("rejects something that is not a URL at all", () => {
        expect(accepts("javascript:alert(1)")).toBe(false);
    });

    it("rejects a non-string", () => {
        expect(accepts(42)).toBe(false);
    });
});

describe("tags", () => {
    function backupWithTags(tags: unknown): string {
        const recipe = new Recipe();
        recipe.name = "Tagged";
        const envelope = JSON.parse(buildBackup([recipe], {}));
        envelope.recipes[0].tags = tags;
        return JSON.stringify(envelope);
    }

    it("round-trips tags through an export and import", () => {
        const recipe = new Recipe();
        recipe.name = "Tagged";
        recipe.setTags(["morning", "filter"]);

        const result = parseBackup(buildBackup([recipe], {}));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toEqual(["morning", "filter"]);
    });

    it("reads a backup written before tags existed", () => {
        const recipe = new Recipe();
        recipe.name = "Old";
        const envelope = JSON.parse(buildBackup([recipe], {}));
        delete envelope.recipes[0].tags;

        const result = parseBackup(JSON.stringify(envelope));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toEqual([]);
    });

    it("keeps the recipe and drops the tags when the field is malformed", () => {
        // Deliberately unlike every other field in this file. A malformed tag
        // costs the recipe its tags, not its existence: a tag never reaches a
        // card, so rejecting an otherwise-perfect recipe would be the harm.
        for (const hostile of ["nope", 7, null, [1, 2], [{}]]) {
            const result = parseBackup(backupWithTags(hostile));
            expect(result.ok).toBe(true);
            if (!result.ok) continue;
            expect(result.payload.recipes).toHaveLength(1);
            expect(result.payload.recipes[0].tags).toEqual([]);
        }
    });

    it("bounds an absurd number of tags", () => {
        const result = parseBackup(
            backupWithTags(Array.from({length: 500}, (_, i) => `t${i}`))
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toHaveLength(20);
    });

    it("bounds an absurdly long tag", () => {
        const result = parseBackup(backupWithTags(["a".repeat(10000), "ok"]));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].tags).toEqual(["ok"]);
    });
});

describe("authored fields through backup", () => {
    it("round-trips a description and a favourite", () => {
        const recipe = new Recipe(undefined, JSON.stringify({
            pours: [], ratio: 16, dosage: 18, grindSize: 60,
            favourite: true, description: "Sunday morning"
        }));

        const parsed = parseBackup(buildBackup([recipe], {}));

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.recipes[0].favourite).toBe(true);
        expect(parsed.payload.recipes[0].description).toBe("Sunday morning");
    });

    it("drops an over-long description and keeps the recipe", () => {
        const file = backupFileWithRecipeFields({
            description: "x".repeat(MAX_DESCRIPTION + 1)
        });

        const parsed = parseBackup(file);

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.recipes).toHaveLength(1);
        expect(parsed.payload.recipes[0].description).toBe("");
    });

    it("falls back to a false favourite for a non-boolean value, whether from the boundary validator or Recipe's own guard", () => {
        // This does not discriminate: Recipe's constructor already treats a
        // non-boolean `favourite` as false (see Recipe.ts), so this input
        // reaches the same result even if DROPPABLE_RECIPE_FIELDS.favourite
        // were deleted. It stays because the validator is the trust-boundary
        // layer and should not be judged by whether Recipe happens to agree
        // with it today; a later reader who sees this test green must not
        // conclude the validator line is provably dead code and remove it.
        // The description case above is the one that would actually fail
        // without its validator.
        const file = backupFileWithRecipeFields({favourite: "yes"});

        const parsed = parseBackup(file);

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.recipes).toHaveLength(1);
        expect(parsed.payload.recipes[0].favourite).toBe(false);
    });
});

describe("every setting is carried or deliberately excluded", () => {
    // The showHints bug was a key that lived in DEFAULTS but not in the snapshot
    // the settings screen hands buildBackup, so the backup silently dropped it.
    // The snapshot's type (Record<Exclude<SettingKey, BackupExcluded>, unknown>)
    // now makes that a compile error; this pins the other half of the contract,
    // that buildBackup emits every setting it is handed and NOT_IN_BACKUP names
    // only real keys, so the two lists actually partition DEFAULTS.
    const settingKeys = Object.keys(DEFAULTS) as SettingKey[];

    it("emits every DEFAULTS key that is not on NOT_IN_BACKUP", () => {
        const carried: Record<string, unknown> = {};
        for (const key of settingKeys) {
            if (!NOT_IN_BACKUP.includes(key)) carried[key] = DEFAULTS[key];
        }

        const parsed = JSON.parse(buildBackup([recipeNamed("A", "u1")], carried));

        for (const key of settingKeys) {
            expect(key in parsed.settings).toBe(!NOT_IN_BACKUP.includes(key));
        }
    });

    it("excludes only keys that actually exist in DEFAULTS", () => {
        for (const key of NOT_IN_BACKUP) {
            expect(settingKeys).toContain(key);
        }
    });

    it("carries the three library rail settings rather than excluding them", () => {
        expect(NOT_IN_BACKUP).not.toContain("librarySort");
        expect(NOT_IN_BACKUP).not.toContain("librarySortDirection");
        expect(NOT_IN_BACKUP).not.toContain("libraryFavouritesFirst");

        const parsed = JSON.parse(buildBackup([recipeNamed("A", "u1")], {
            librarySort: "added",
            librarySortDirection: "desc",
            libraryFavouritesFirst: true
        }));

        expect(parsed.settings.librarySort).toBe("added");
        expect(parsed.settings.librarySortDirection).toBe("desc");
        expect(parsed.settings.libraryFavouritesFirst).toBe(true);
    });
});
