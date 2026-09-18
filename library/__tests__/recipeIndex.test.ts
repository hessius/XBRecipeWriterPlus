import Recipe from "@/library/Recipe";
import Pour from "@/library/Pour";
import {
    INDEX_COLUMNS,
    INDEX_REVISION,
    columnDefinitions,
    foldSortKey,
    indexStatements,
    projectRecipe,
    schemaHash
} from "@/library/recipeIndex";

function pour(volume: number, temperature: number): Pour {
    const p = new Pour(0);
    p.volume = volume;
    p.temperature = temperature;
    return p;
}

describe("recipeIndex descriptors", () => {
    it("declares unique column names", () => {
        const names = INDEX_COLUMNS.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("never collides with the two base columns", () => {
        const names = INDEX_COLUMNS.map((c) => c.name);
        expect(names).not.toContain("uuid");
        expect(names).not.toContain("recipeJSON");
    });

    it("emits a nullable definition for every column", () => {
        // Nullability is what makes ADD COLUMN re-runnable and a partially
        // completed previous run self-healing.
        for (const definition of columnDefinitions()) {
            expect(definition).not.toMatch(/NOT NULL/i);
            expect(definition).not.toMatch(/DEFAULT/i);
        }
    });

    it("emits one CREATE INDEX per indexed column", () => {
        const indexed = INDEX_COLUMNS.filter((c) => c.indexed).length;
        const statements = indexStatements();
        expect(statements).toHaveLength(indexed);
        for (const statement of statements) {
            expect(statement).toMatch(/^CREATE INDEX IF NOT EXISTS/);
        }
    });

    it("pins the schema hash", () => {
        // This value covers the *shape* of INDEX_COLUMNS only -- name, type,
        // collation, indexed -- plus INDEX_REVISION. It does NOT cover the
        // `from` bodies, so changing a projection leaves this green; the
        // golden-projection test below is what catches that. When this does
        // fail: confirm the change was intended, then paste the new hash.
        expect(schemaHash()).toBe("c2b17255");
    });

    it("folds the revision into the hash", () => {
        expect(typeof INDEX_REVISION).toBe("number");
        expect(schemaHash()).not.toBe(schemaHash(INDEX_REVISION + 1));
    });
});

describe("projectRecipe", () => {
    it("pins the projected value of every column", () => {
        // The guard the schema hash cannot be. The hash covers column shape
        // only -- a changed `from` body leaves it identical -- so without
        // this a projection could change semantics, no rebuild would be
        // triggered, and every existing install would keep stale index values
        // until some unrelated change happened to bump INDEX_REVISION.
        //
        // If this fails: a projection changed. Confirm it was intended, bump
        // INDEX_REVISION in recipeIndex.ts so installed devices rebuild, then
        // update both this expectation and the pinned hash above.
        const recipe = new Recipe();
        recipe.name = "Reference";
        recipe.createdAt = 1700000000000;
        recipe.dosage = 15;
        recipe.ratio = 16;
        recipe.grindSize = 60;
        recipe.grindRPM = 120;
        recipe.grinder = true;
        recipe.accentIndex = 3;
        recipe.bypassEnabled = false;
        recipe.pours = [pour(100, 93), pour(120, 88)];

        expect(projectRecipe(recipe)).toEqual({
            sortName: "reference",
            createdAt: 1700000000000,
            source: "manual",
            accentIndex: 3,
            cupType: recipe.cupType,
            isTea: 0,
            dosage: 15,
            ratio: 16,
            grindSize: 60,
            grinder: 1,
            grindRPM: 120,
            pourCount: 2,
            totalVolume: 220,
            brewSeconds: 69,
            minTemp: 88,
            maxTemp: 93,
            bypassEnabled: 0,
            sharedTableId: null,
            xid: null,
            sharedBy: null,
            sharedByKey: null,
            favourite: 0,
            hasDescription: 0,
            description: null
        });
    });

    it("produces a value for every declared column", () => {
        const projected = projectRecipe(new Recipe());
        expect(Object.keys(projected).sort())
            .toEqual(INDEX_COLUMNS.map((c) => c.name).sort());
    });

    it("stores NULL rather than the placeholder for a nameless recipe", () => {
        // placeholderName() is locale-dependent; indexing it would freeze the
        // device language into the sort key at save time.
        const recipe = new Recipe();
        expect(recipe.hasName()).toBe(false);
        expect(projectRecipe(recipe).sortName).toBeNull();
    });

    it("stores the display name for a named recipe", () => {
        const recipe = new Recipe();
        recipe.name = "Morning";
        expect(projectRecipe(recipe).sortName).toBe("morning");
    });

    it("stores the diacritic-folded key, not the display name, for an accented name", () => {
        // The sort key is folded so "Étna" sorts near "E" under NOCASE rather
        // than after "Z". The display name in the blob is untouched; only this
        // derived column changes. Preserved exactly: NULL for a nameless recipe.
        const recipe = new Recipe();
        recipe.name = "Étna";
        expect(projectRecipe(recipe).sortName).toBe("etna");
    });

    it("does not fold a Nordic letter when projecting the sort key", () => {        const recipe = new Recipe();
        recipe.name = "Öland";
        expect(projectRecipe(recipe).sortName).toBe("öland");
    });

    it("counts pours", () => {
        const recipe = new Recipe();
        recipe.pours = [pour(100, 93), pour(120, 92)];
        expect(projectRecipe(recipe).pourCount).toBe(2);
    });

    it("takes totalVolume from the pours, not from dose times ratio", () => {
        // getTotalVolume() is the target the machine validates against. The
        // two agree on a valid recipe and diverge on a half-authored one; the
        // index must never advertise water that will not arrive.
        const recipe = new Recipe();
        recipe.dosage = 15;
        recipe.ratio = 16;
        recipe.pours = [pour(100, 93)];
        expect(projectRecipe(recipe).totalVolume).toBe(100);
    });

    it("gives a stageless recipe no volume", () => {
        expect(projectRecipe(new Recipe()).totalVolume).toBe(0);
    });

    it("gives a stageless recipe no duration at all", () => {
        // NULL, not 0. Zero is a duration, and SQLite would have put a
        // half-authored recipe on the QUICK BREW shelf as the fastest thing
        // in the library.
        expect(projectRecipe(new Recipe()).brewSeconds).toBeNull();
    });

    it("counts pouring and steeping into brewSeconds", () => {
        // 128 ml at 3.2 ml/s is 40 seconds, plus a 90 second pause.
        const recipe = new Recipe();
        const steep = pour(128, 93);
        steep.flowRate = 32;
        steep.pauseTime = 90;
        recipe.pours = [steep];
        expect(projectRecipe(recipe).brewSeconds).toBe(130);
    });

    it("ignores the -1 sentinels when timing a half-filled stage", () => {
        // `flowRate` and `pauseTime` both initialise to -1. A negative flow
        // divides to a negative duration and a negative pause subtracts from
        // it, so an unset stage would have come out faster than an empty one.
        const recipe = new Recipe();
        recipe.pours = [pour(32, 93)];
        expect(projectRecipe(recipe).brewSeconds).toBe(10);
    });

    it("ignores the -1 sentinel when taking temperature bounds", () => {
        // Pour.temperature initialises to -1, the same never-set sentinel as
        // agitation. One half-filled stage would otherwise drag minTemp to -1
        // and every range filter would silently match it.
        const recipe = new Recipe();
        recipe.pours = [pour(100, 93), pour(100, -1), pour(100, 88)];
        const projected = projectRecipe(recipe);
        expect(projected.minTemp).toBe(88);
        expect(projected.maxTemp).toBe(93);
    });

    it("leaves temperature null when no pour has one set", () => {
        const recipe = new Recipe();
        recipe.pours = [pour(100, -1)];
        const projected = projectRecipe(recipe);
        expect(projected.minTemp).toBeNull();
        expect(projected.maxTemp).toBeNull();
    });

    it("asks the recipe whether it is tea rather than reading cupType", () => {
        // The tea byte carries the cup count in its high nibble and legacy
        // cards arrive as 0x13 or 0x23; isTea() owns every one of those
        // normalisations and must not be reimplemented as a cupType compare.
        // The normalisation runs in the JSON constructor (see Recipe), not in
        // isTea() itself, so a legacy byte must arrive through it -- the same
        // idiom accent.test.ts and Recipe.persistence.test.ts use -- rather
        // than being poked onto a fresh object, which would bypass it.
        const recipe = new Recipe(undefined, JSON.stringify({...new Recipe(), cupType: 0x13}));
        expect(recipe.isTea()).toBe(true);
        expect(projectRecipe(recipe).isTea).toBe(1);
    });

    it("stores booleans as 0 and 1", () => {
        const recipe = new Recipe();
        recipe.grinder = false;
        recipe.bypassEnabled = true;
        const projected = projectRecipe(recipe);
        expect(projected.grinder).toBe(0);
        expect(projected.bypassEnabled).toBe(1);
    });

    it("stores an absent accent index as NULL", () => {
        const recipe = new Recipe();
        recipe.accentIndex = undefined;
        expect(projectRecipe(recipe).accentIndex).toBeNull();
    });
});

describe("M5 descriptors", () => {
    it("projects every authored and attribution field", () => {
        const recipe = new Recipe();
        recipe.xid = "ABC12345";
        recipe.sharedBy = "BrewMind";
        recipe.favourite = true;
        recipe.description = "Sunday morning";

        const projected = projectRecipe(recipe);

        expect(projected.xid).toBe("ABC12345");
        expect(projected.sharedBy).toBe("BrewMind");
        expect(projected.sharedByKey).toBe("brewmind");
        expect(projected.favourite).toBe(1);
        expect(projected.hasDescription).toBe(1);
        expect(projected.description).toBe("Sunday morning");
    });

    it("folds an author's name the way tags are folded, not the way SQL would", () => {
        // COLLATE NOCASE folds ASCII only, so under it these two would become
        // two shelves holding different halves of one person's recipes.
        const upper = new Recipe();
        upper.sharedBy = "CAFÉ";
        const lower = new Recipe();
        lower.sharedBy = "café";

        expect(projectRecipe(upper).sharedByKey)
            .toBe(projectRecipe(lower).sharedByKey);
        // And the display name is untouched, so a shelf is labelled the way the
        // sharer spelled it.
        expect(projectRecipe(upper).sharedBy).toBe("CAFÉ");
    });

    it("stores absence as null rather than an empty string", () => {
        const recipe = new Recipe();

        const projected = projectRecipe(recipe);

        // An empty string sorts and groups as a value. Null does not, which is
        // what "this recipe has no XID" has to mean to a shelf query.
        expect(projected.xid).toBeNull();
        expect(projected.sharedBy).toBeNull();
        expect(projected.sharedByKey).toBeNull();
        expect(projected.favourite).toBe(0);
        expect(projected.hasDescription).toBe(0);
        // The note's own column mirrors the presence flag: no note, no text to
        // search, so null rather than an empty string that would match "".
        expect(projected.description).toBeNull();
    });

    it("indexes the three columns a shelf groups by", () => {
        const indexed = INDEX_COLUMNS
            .filter((column) => column.indexed)
            .map((column) => column.name);

        expect(indexed).toEqual(expect.arrayContaining(
            ["xid", "sharedBy", "favourite"]
        ));
        // Presence only, never grouped by, so it earns no index of its own.
        expect(indexed).not.toContain("hasDescription");
    });
});

describe("foldSortKey", () => {
    it("folds a combining diacritic to its base letter", () => {
        // The French/Spanish/German case: an accented letter is the same
        // letter with a mark and must sort as its base. This is what stops
        // "Étna" landing after "Zambia".
        expect(foldSortKey("Étna")).toBe("etna");
        expect(foldSortKey("Éléphant")).toBe("elephant");
        expect(foldSortKey("Jalapeño")).toBe("jalapeno");
        expect(foldSortKey("Müller")).toBe("muller");
        expect(foldSortKey("Français")).toBe("francais");
    });

    it("preserves each Nordic letter, folding only its case", () => {
        // These are separate letters of the Swedish/Danish/Norwegian alphabets
        // that sort after Z, not accented forms. Their code points keep them
        // there only if folding leaves the letter alone. Å/Ä/Ö decompose under
        // NFD and are protected explicitly; Æ/Ø are single code points and
        // survive for free -- both must come through as themselves. Case is the
        // one thing that does change, and it has to: NOCASE cannot fold these,
        // so an unfolded "Å" would sort and match apart from "å".
        for (const letter of ["Å", "å", "Ä", "ä", "Ö", "ö", "Æ", "æ", "Ø", "ø"]) {
            expect(foldSortKey(letter)).toBe(letter.toLowerCase());
        }
        // Both cases of one letter reach one key, which is the point.
        expect(foldSortKey("Å")).toBe(foldSortKey("å"));
    });

    it("preserves a Nordic letter while folding an accent in the same name", () => {
        // The hybrid working on one string: the Nordic letter stays, the French
        // accent goes.
        expect(foldSortKey("ÖlÉ")).toBe("öle");
    });

    it("folds a decomposed input the same as a precomposed one", () => {
        // NFC-normalising first means "A" + combining ring folds to "A" only if
        // it is not one of the preserved letters; a precomposed "Å" is
        // recognised and kept. Both spellings of "Å" reach the same key.
        const precomposed = "Å";
        const decomposed = "A\u030A";
        expect(foldSortKey(precomposed)).toBe(foldSortKey(decomposed));
        expect(foldSortKey(precomposed)).toBe("å");
    });

    it("leaves an ASCII name untouched", () => {
        expect(foldSortKey("Morning")).toBe("morning");
    });
});
