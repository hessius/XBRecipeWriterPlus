import Recipe from "./Recipe";

/**
 * The recipe index: every column derived from a recipe's JSON blob.
 *
 * The blob in `recipes.recipeJSON` is the only source of truth. Everything
 * declared here is a cache of it and may be dropped and rebuilt at any time
 * without loss, which is what makes a mistake in this file recoverable rather
 * than destructive.
 *
 * The column list exists here and nowhere else. The DDL, the indices, the
 * INSERT column list and the rebuild are all generated from this array, so
 * adding something filterable is one entry and nothing more. The alternative
 * -- the same list written out in four places -- is the failure that produced
 * `Settings.DEFAULTS`, when `showHints` went missing from backups by being
 * named in some places and not others.
 */
export type IndexValue = string | number | null;

export type IndexColumn = {
    name: string;
    type: "TEXT" | "INTEGER" | "REAL";
    collate?: "NOCASE";
    indexed?: boolean;
    from: (recipe: Recipe) => IndexValue;
};

/**
 * Bump this whenever you change the body of a `from` function without
 * changing any column's name, type or collation.
 *
 * The schema hash below covers the shape of the array, which is all it can
 * cover: Hermes compiles to bytecode and `Function.prototype.toString()`
 * returns "[bytecode]" in a release build, so hashing the source of a `from`
 * would work in development and silently stop working in production. A
 * mechanism that is correct in dev and quietly wrong in release is worse than
 * one that asks for a number.
 *
 * A forgotten bump is caught by the golden-projection test in
 * `recipeIndex.test.ts`, which pins the projected value of every column. The
 * pinned *hash* cannot do it: the hash covers column shape only, so a changed
 * `from` body leaves it identical. Changing a projection therefore fails on
 * the golden values, which is the prompt to bump this number.
 */
export const INDEX_REVISION = 3;

/**
 * The Nordic letters that survive folding unchanged, because they are genuinely
 * separate letters of their alphabets rather than accented forms of a base
 * letter.
 *
 * In Swedish, Danish and Norwegian, `Å Ä Ö Æ Ø` are distinct letters that sort
 * *after* Z. In French, German and English, `É ñ ü` are the same letter with a
 * mark and sort *as* the base letter. `foldSortKey` folds the second group and
 * preserves the first, which is correct in every one of those languages at
 * once: `É` is not a separate letter in Swedish either, so folding it is right
 * there too. The one case this cannot satisfy is German `Ä`→`A`, which
 * conflicts head-on with Swedish `Ä`-after-Z; Swedish wins deliberately.
 *
 * Do NOT "finish the job" by folding these as well. Full folding would break
 * the Nordic alphabets (`Öland` would sort under O instead of after Z); no
 * folding at all breaks French (`Étna` sorts after Z because its code point is
 * above `z`). This hybrid is the only shape correct for all of them together.
 *
 * `Æ æ Ø ø` are single code points with no combining mark, so NFD leaves them
 * alone for free and they would survive even without this list. `Å å Ä ä Ö ö`
 * DO decompose under NFD (verified empirically, not assumed), so they must be
 * protected explicitly or the diacritic strip would fold them to A/O.
 */
const PRESERVED_LETTERS = new Set([
    "Å", "å", "Ä", "ä", "Ö", "ö", "Æ", "æ", "Ø", "ø"
]);

/**
 * The sort key for a display name: the name with combining diacritics folded
 * away, except the Nordic letters `PRESERVED_LETTERS` keeps intact.
 *
 * SQLite's `NOCASE` collation folds only ASCII, so an accented letter has a
 * code point above `z` and sorts after every unaccented name -- "Étna" lands
 * after "Zambia". Storing this folded key instead of the display name makes
 * "Étna" sort as "Etna" while leaving the display name in the blob untouched.
 *
 * NFC-normalise first so a precomposed "Å" and a decomposed "A"+ring fold
 * identically; then iterate by code point so a preserved letter is matched as a
 * whole before the per-character NFD strip can reach its combining mark.
 *
 * Lower-cased, and that is load-bearing twice over rather than cosmetic. NOCASE
 * folds ASCII only, so a preserved letter left in its written case both sorts
 * and matches apart from its own other case: "Åland" and "åland" landed in two
 * different places in the list, and a search for "öland" could not find a
 * recipe named "Öland" -- which is to say, a Nordic user could not find a
 * recipe by typing its name. Case-folding here in JavaScript is what NOCASE
 * cannot do, so both halves of the problem close at the same point. It also
 * means every caller matching against this key must fold its term through this
 * same function rather than lower-casing by hand.
 */
export function foldSortKey(name: string): string {
    return Array.from(name.normalize("NFC").toLowerCase(), (character) =>
        PRESERVED_LETTERS.has(character)
            ? character
            : character.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    ).join("");
}

/** Temperatures are stored as -1 until set; see Pour. */
function temperatures(recipe: Recipe): number[] {
    return recipe.pours
        .map((pour) => pour.temperature)
        .filter((temperature) => temperature >= 0);
}

export const INDEX_COLUMNS: IndexColumn[] = [
    {
        name: "sortName", type: "TEXT", collate: "NOCASE", indexed: true,
        // NULL rather than the placeholder: placeholderName() formats a date
        // with toLocaleDateString, so indexing it would freeze the device's
        // language into the sort key and leave it stale if that changed. NULL
        // also lets "sort by name" put unnamed recipes deliberately last
        // instead of scattering them under a localised string.
        //
        // The stored value is the diacritic-folded key, not the display name,
        // so "Étna" sorts as "Etna" under NOCASE (which folds ASCII only). NULL
        // for an unnamed recipe is preserved exactly; foldSortKey never runs on
        // it. See foldSortKey for why the Nordic letters are exempt.
        from: (r) => (r.hasName() ? foldSortKey(r.displayName()) : null)
    },
    {name: "createdAt", type: "INTEGER", indexed: true, from: (r) => r.createdAt},
    {name: "source", type: "TEXT", indexed: true, from: (r) => r.source},
    {name: "accentIndex", type: "INTEGER", from: (r) => r.accentIndex ?? null},
    {name: "cupType", type: "INTEGER", indexed: true, from: (r) => r.cupType},
    {
        name: "isTea", type: "INTEGER", indexed: true,
        // Asks the recipe rather than comparing cupType here. Legacy tea
        // cards arrive as 0x13 or 0x23 with the cup count in the high nibble;
        // the JSON constructor folds those to 0x03, and isTea() is the single
        // predicate over the result. Comparing cupType inline would be a
        // second copy of that predicate, which accent.ts warns would silently
        // miss the next such fix.
        from: (r) => (r.isTea() ? 1 : 0)
    },
    {name: "dosage", type: "REAL", from: (r) => r.dosage},
    {name: "ratio", type: "INTEGER", indexed: true, from: (r) => r.ratio},
    {name: "grindSize", type: "INTEGER", indexed: true, from: (r) => r.grindSize},
    {name: "grinder", type: "INTEGER", from: (r) => (r.grinder ? 1 : 0)},
    {name: "grindRPM", type: "INTEGER", from: (r) => r.grindRPM},
    {name: "pourCount", type: "INTEGER", indexed: true, from: (r) => r.pours.length},
    {
        name: "totalVolume", type: "REAL",
        // The sum of the pours, not getTotalVolume(), which is dose x ratio --
        // the target the machine validates against. They agree on a valid
        // recipe and diverge on a half-authored one, where a stageless recipe
        // would otherwise claim to make 240 ml while dispensing nothing.
        from: (r) => r.getPourTotalVolume()
    },
    {
        name: "minTemp", type: "INTEGER",
        from: (r) => {
            const set = temperatures(r);
            return set.length === 0 ? null : Math.min(...set);
        }
    },
    {
        name: "maxTemp", type: "INTEGER",
        from: (r) => {
            const set = temperatures(r);
            return set.length === 0 ? null : Math.max(...set);
        }
    },
    {name: "bypassEnabled", type: "INTEGER", from: (r) => (r.bypassEnabled ? 1 : 0)},
    // Reserved ground for cloud sync: the one column here that is not a
    // filterable recipe property. Sync state is not recipe content, so it is
    // a real column under any scheme.
    {name: "sharedTableId", type: "INTEGER", from: (r) => r.sharedTableId ?? null},
    // `|| null` rather than `?? null` throughout, and the two fields below do
    // not even reach it the same way: `xid` defaults to the empty string while
    // `sharedBy` is optional and defaults to undefined. `??` would be enough
    // for the second and wrong for the first, because an empty string is a
    // value to SQL just as much as a real one, and a shelf asking "which
    // recipes came from someone" must not match every recipe that came from
    // nobody. `||` covers both, so the two columns answer that question
    // identically instead of a reader having to remember which needs which.
    {name: "xid", type: "TEXT", indexed: true, from: (r) => r.xid || null},
    {
        name: "sharedBy", type: "TEXT", collate: "NOCASE", indexed: true,
        // NOCASE folds ASCII only, so "CAFE" and "cafe" group together but
        // "CAFÉ" and "café" do not, the same latent bug that recipe_tags
        // had before tagKey.ts gave it a JS-folded key column. No shelf
        // queries sharedBy yet; when one does, it needs that same treatment
        // rather than trusting this collation.
        from: (r) => r.sharedBy || null
    },
    {name: "favourite", type: "INTEGER", indexed: true, from: (r) => (r.favourite ? 1 : 0)},
    // Both the flag and the text, deliberately, because they answer different
    // questions. `hasDescription` is what a filter asks -- "does this recipe
    // carry a note" -- and a 0/1 integer answers that without carrying the words
    // twice. `description` is what search reads: phase 5 is where a user first
    // gets somewhere to type a note, and a search that could not find one would
    // be a bug nobody would trace back to this table. Neither is indexed: a
    // presence filter over a boolean scans cheaply, and LIKE '%term%' cannot use
    // an index at all, so one would only cost writes.
    {name: "hasDescription", type: "INTEGER", from: (r) => (r.description ? 1 : 0)},
    {name: "description", type: "TEXT", collate: "NOCASE", from: (r) => r.description || null}
];

/**
 * Every column is nullable with no default. That is what makes the ADD COLUMN
 * pass in RecipeDatabase a no-op on re-run, and a partially completed previous
 * run self-healing.
 */
export function columnDefinitions(): string[] {
    return INDEX_COLUMNS.map((column) =>
        `${column.name} ${column.type}${column.collate ? ` COLLATE ${column.collate}` : ""}`
    );
}

export function indexStatements(): string[] {
    return INDEX_COLUMNS.filter((column) => column.indexed).map((column) =>
        `CREATE INDEX IF NOT EXISTS idx_recipes_${column.name} ON recipes(${column.name});`
    );
}

export function projectRecipe(recipe: Recipe): Record<string, IndexValue> {
    const projected: Record<string, IndexValue> = {};
    for (const column of INDEX_COLUMNS) {
        const value = column.from(recipe);
        if (!isIndexValue(value)) {
            throw new TypeError(
                `index column ${column.name} projected a value SQLite cannot bind`
            );
        }
        projected[column.name] = value;
    }
    return projected;
}

/**
 * Whether a projected value is something SQLite can actually bind.
 *
 * `IndexValue` says string, number or null, but a type is a claim about
 * well-formed input and a blob is not that. `Recipe`'s constructor is
 * deliberately forgiving so it can migrate its own old shapes, so a corrupt
 * blob can put a number where a string belongs and reach a `from` intact. The
 * resulting value then fails at the bind, which is inside the rebuild's
 * transaction, which is where a recoverable problem turns into an unopenable
 * database.
 *
 * Checking here moves that failure back into JavaScript, where the caller can
 * treat the row the way it already treats an unparseable one. NaN and Infinity
 * are excluded for the same reason: they are numbers to TypeScript and not
 * values SQLite stores meaningfully.
 */
export function isIndexValue(value: unknown): value is IndexValue {
    if (value === null) return true;
    if (typeof value === "string") return true;
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * FNV-1a. accent.ts carries the same constants, but its copy is a private
 * `hashToIndex` that folds straight into a palette modulo and is not exported;
 * lifting a hex-returning hash out of it would mean refactoring accent.ts,
 * which this sub-project deliberately leaves untouched. The duplication is
 * two lines and each site owns its own return shape, so it is cheaper than the
 * coupling. Any stable hash would do.
 */
function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/**
 * A hash of the index's shape. When it differs from the value stored in
 * `schema_meta`, RecipeDatabase rebuilds the index from the blobs.
 */
export function schemaHash(revision: number = INDEX_REVISION): string {
    const shape = INDEX_COLUMNS
        .map((c) => `${c.name}:${c.type}:${c.collate ?? ""}:${c.indexed ? 1 : 0}`)
        .join("|");
    return fnv1a(`${revision}|${shape}`);
}
