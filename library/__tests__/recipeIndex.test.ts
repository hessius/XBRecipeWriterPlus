import Recipe from "@/library/Recipe";
import Pour from "@/library/Pour";
import {
    INDEX_COLUMNS,
    INDEX_REVISION,
    columnDefinitions,
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
        // This value is expected to change whenever INDEX_COLUMNS changes.
        // When it does: confirm the change was intended, bump INDEX_REVISION
        // if you altered a `from` body rather than the column shape, then
        // paste the new hash here. See recipeIndex.ts for why the revision
        // cannot be derived automatically.
        expect(schemaHash()).toBe("f409112d");
    });

    it("folds the revision into the hash", () => {
        expect(typeof INDEX_REVISION).toBe("number");
        expect(schemaHash()).not.toBe(schemaHash(INDEX_REVISION + 1));
    });
});

describe("projectRecipe", () => {
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
        expect(projectRecipe(recipe).sortName).toBe("Morning");
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
