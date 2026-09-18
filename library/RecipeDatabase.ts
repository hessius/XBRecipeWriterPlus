import * as SQLite from 'expo-sqlite';

import Recipe from './Recipe';
import {reassignIfCrossed} from './accent';
import {copyName} from './duplicates';
import {tagKey} from './tagKey';
import {ensureBrewTables} from './BrewDatabase';
import {buildLibraryQuery, type FilterResolver, type LibraryQuery,
        type RecipeEvidence} from './libraryQuery';
import {columnDefinitions, indexStatements, INDEX_COLUMNS, type IndexValue,
        projectRecipe, schemaHash} from './recipeIndex';

class RecipeDatabase {
    private db: SQLite.SQLiteDatabase;
    private inTransaction = false;

    /** SQLite has no nested transactions; the outermost one wins. */
    private atomically(task: () => void): void {
        if (this.inTransaction) {
            task();
            return;
        }
        this.inTransaction = true;
        try {
            this.db.withTransactionSync(task);
        } finally {
            this.inTransaction = false;
        }
    }

    /**
     * Write a recipe's blob, its index columns and its tags as one unit.
     *
     * One statement rather than a blob write followed by an index write: a row
     * must never carry an index describing a different recipe than its blob.
     * `INSERT OR REPLACE` covers both insert and update, so the projection is
     * expressed once.
     */
    private writeRow(recipe: Recipe): void {
        const projected = projectRecipe(recipe);
        const names = Object.keys(projected);
        const placeholders = names.map(() => "?").join(", ");

        this.db.runSync(
            `INSERT OR REPLACE INTO recipes (uuid, recipeJSON, ${names.join(", ")})
             VALUES (?, ?, ${placeholders});`,
            [recipe.uuid, JSON.stringify(recipe), ...names.map((name) => projected[name])]
        );

        this.writeTags(recipe.uuid, recipe.tags);
    }

    /**
     * Replace a recipe's rows in `recipe_tags`, delete-then-insert.
     *
     * Shared by `writeRow` and `reindexRow` so the tag projection lives in one
     * place: an update and a rebuild must produce identical tag rows for the
     * same recipe, and the surest way to guarantee that is to have them run the
     * same code.
     */
    private writeTags(uuid: string, tags: string[]): void {
        this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [uuid]);
        for (const tag of tags) {
            this.db.runSync(
                "INSERT OR IGNORE INTO recipe_tags (uuid, tag, tagKey) VALUES (?, ?, ?);",
                [uuid, tag, tagKey(tag)]
            );
        }
    }

    /**
     * Rewrite one row's index columns and tags from an already-parsed recipe,
     * without touching its blob.
     *
     * This is the rebuild's counterpart to `writeRow`, and the difference is
     * the whole point: it never names `recipeJSON` and uses UPDATE, not
     * INSERT OR REPLACE, so it cannot rewrite the blob under any circumstance —
     * not even a bug in the projection. A rebuild touches every recipe in the
     * library at once; routing every blob through parse-then-reserialise would
     * mean a single serialisation regression rewrites the user's whole library
     * with no backup, which is the one unrecoverable outcome the "blob is the
     * only truth" rule exists to prevent. The `recipe` here is read-only.
     *
     * The SET clause is generated from `projectRecipe`'s keys so the column
     * list still lives only in recipeIndex.ts.
     */
    private applyIndex(
        uuid: string,
        projected: Record<string, IndexValue>,
        tags: string[]
    ): void {
        const names = Object.keys(projected);
        const assignments = names.map((name) => `${name} = ?`).join(", ");

        this.db.runSync(
            `UPDATE recipes SET ${assignments} WHERE uuid = ?;`,
            [...names.map((name) => projected[name]), uuid]
        );

        this.writeTags(uuid, tags);
    }

    /**
     * Blank every derived value for one row.
     *
     * The counterpart to `applyIndex`, for a row the rebuild cannot read.
     * Skipping such a row must leave it *unindexed*, and doing nothing does not
     * achieve that: the columns and tag rows from the previous schema are still
     * sitting there, so a recipe whose blob has since become unreadable would
     * go on matching filters and appearing in shelves on the strength of a
     * reading nobody can reproduce or correct. Worse, it would do so silently,
     * because the row looks indexed.
     *
     * The column list comes from the descriptor array like every other one
     * here, so this cannot drift out of step with what `applyIndex` writes.
     */
    private clearIndex(uuid: string): void {
        const assignments = INDEX_COLUMNS
            .map((column) => `${column.name} = NULL`)
            .join(", ");

        this.db.runSync(`UPDATE recipes SET ${assignments} WHERE uuid = ?;`, [uuid]);
        this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [uuid]);
    }

    constructor() {
        this.db = SQLite.openDatabaseSync('xbrecipewriter.db')
        this.createTable();
        // The library query joins the recipe index to an aggregate over the
        // brew tables, which `BrewDatabase` owns. On a fresh install the
        // library screen opens this class before any brew screen has created
        // those tables, so ensure them here too: the join would otherwise
        // reference a table that does not exist and throw on first render. The
        // DDL is shared, not copied, so the two openers cannot drift.
        ensureBrewTables(this.db);
        this.migrateIndex();
    }


    /**
     * Bring the schema up to date.
     *
     * The base table is created exactly as it always was, so an existing
     * database is untouched by the first statement. Everything after it is
     * additive: every index column is nullable with no default, which makes
     * this method a no-op on re-run and makes a partially completed previous
     * run self-healing.
     *
     * `IF NOT EXISTS` on ADD COLUMN is not portable across the SQLite versions
     * Expo ships, so a duplicate is caught rather than avoided — the same
     * pattern BrewDatabase already uses.
     */
    private createTable(): void {
        this.dropLegacyTagTable();
        this.db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS recipes (uuid TEXT PRIMARY KEY NOT NULL,recipeJSON TEXT);
            CREATE TABLE IF NOT EXISTS recipe_tags (
                uuid TEXT NOT NULL,
                tag TEXT NOT NULL,
                tagKey TEXT NOT NULL,
                PRIMARY KEY (uuid, tagKey)
            );
            CREATE INDEX IF NOT EXISTS idx_recipe_tags_key ON recipe_tags(tagKey);
            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );`
        );

        for (const definition of columnDefinitions()) {
            try {
                this.db.execSync(`ALTER TABLE recipes ADD COLUMN ${definition};`);
            } catch {
                // Already there.
            }
        }

        for (const statement of indexStatements()) {
            this.db.execSync(statement);
        }
    }

    /**
     * Replace the first shape of `recipe_tags`, which matched with COLLATE
     * NOCASE, with the one that carries a folded `tagKey`.
     *
     * Dropped rather than altered because the table is derived: every row in it
     * can be recomputed from the blobs, so there is nothing in it to preserve
     * and a rebuild is the simplest correct migration. Clearing the stored
     * schema hash is what books that rebuild — `migrateIndex` runs immediately
     * after this and will find its hash missing.
     *
     * Detected by column rather than by a version number so it is idempotent
     * and self-healing: a run interrupted between the drop and the rebuild
     * leaves no `tagKey` to find, and the next open simply does it again.
     */
    private dropLegacyTagTable(): void {
        const columns = this.db.getAllSync(
            "PRAGMA table_info(recipe_tags);"
        ) as {name: string}[];

        if (columns.length === 0) return;
        if (columns.some((column) => column.name === "tagKey")) return;

        this.db.execSync("DROP TABLE recipe_tags;");
        this.db.execSync(`
            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );
            DELETE FROM schema_meta WHERE key = 'indexHash';`
        );
    }

    /**
     * Rebuild the index when the descriptor array has changed.
     *
     * The blob is never written here — `reindexRow` updates only the index
     * columns and tags — so the worst a wrong descriptor can do is produce a
     * wrong index over intact data, which the next rebuild corrects.
     *
     * A row whose blob will not parse is skipped rather than allowed to throw.
     * This runs unattended on launch, before anything can be shown, so a single
     * corrupt blob would otherwise make the database unopenable — and because a
     * failed rebuild deliberately leaves the hash stale, it would retry and
     * fail again on every subsequent launch. Skipping leaves that row's index
     * columns NULL, which is the recoverable failure this whole design is built
     * around; the blob is untouched and still there to be recovered from.
     *
     * The hash is stored last and inside the same transaction, so a failure
     * that is *not* one bad row — a genuine SQL error — leaves it stale and the
     * next open simply tries again: a half-rebuilt index cannot persist. Those
     * are two independent defences — ordering alone survives a lost
     * transaction, and the transaction alone survives a reordering — so a test
     * can only catch losing both at once, which is what "leaves the hash
     * unstored when a rebuild fails" does. Keep both.
     *
     * A legacy blob is not upgraded in place by a rebuild, deliberately. That
     * is the status quo: Recipe's constructor migrates lazily on every read,
     * and an actual save writes the upgraded form through writeRow.
     */
    private migrateIndex(): void {
        const current = schemaHash();
        const stored = this.db.getFirstSync(
            "SELECT value FROM schema_meta WHERE key = 'indexHash';"
        ) as {value: string} | null;

        if (stored && stored.value === current) return;

        this.atomically(() => {
            // `ORDER BY rowid` is the backfill's whole basis: it is the order
            // the rows were inserted in, it does not change, and it is
            // therefore the same on every rebuild.
            const rows = this.db.getAllSync(
                "SELECT uuid, recipeJSON FROM recipes ORDER BY rowid;"
            ) as {uuid: string; recipeJSON: string}[];

            let legacyOrdinal = 0;
            for (const row of rows) {
                let projected: Record<string, IndexValue>;
                let tags: string[];
                try {
                    const recipe = new Recipe(undefined, row.recipeJSON);
                    projected = projectRecipe(recipe);
                    tags = recipe.tags;
                } catch {
                    // Unreadable blob: leave this row unindexed and carry on,
                    // rather than take the whole library down with it.
                    //
                    // Both statements are inside the try on purpose. Parsing is
                    // not the boundary -- `Recipe` is forgiving by design, so a
                    // corrupt blob can construct successfully and only fail in
                    // a projection, as a numeric `name` does by reaching
                    // `hasName().trim()`. Catching the parse alone left that
                    // second failure to escape into the transaction and take
                    // the library down on this and every later launch, which is
                    // precisely the outcome this catch exists to prevent.
                    this.clearIndex(row.uuid);
                    continue;
                }
                // A recipe that predates the column hydrates with createdAt 0,
                // so left alone every legacy recipe ties and "Date added"
                // becomes an exact copy of "Name" -- correct, and
                // indistinguishable from a bug. A small ascending ordinal in
                // rowid order gives the axis a stable and plausible day one:
                // distinct, in the order the recipes were added, and below
                // every genuine millisecond timestamp, so the undated library
                // sits before the dated one, which is where it belongs.
                //
                // The index only. Nothing outside it reads createdAt, so
                // rewriting the blobs would put a manufactured date in the
                // user's own file to settle a sort order.
                if (projected.createdAt === 0) projected.createdAt = ++legacyOrdinal;
                // Outside the try, and that is the other half of the rule. A
                // failure here is SQL failing, not a bad row, and it must stay
                // fatal: it rolls the transaction back and leaves the hash
                // unstored so the next open retries. Widening the catch to
                // cover these would turn a transient database error into a
                // permanently half-built index that believes it is complete.
                this.applyIndex(row.uuid, projected, tags);
            }

            this.db.runSync(
                `INSERT INTO schema_meta (key, value) VALUES ('indexHash', ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
                [current]
            );
        });
    }

    /**
     * The accent indices already taken in a recipe's half of the palette.
     *
     * The SQL half of `accentsInUseAmong`. `isTea` is a column precisely so
     * this does not reimplement `Recipe.isTea()`, which owns the 0x13/0x23
     * legacy normalisations -- `accent.ts` warns that a second copy of that
     * predicate would silently miss the next such fix.
     *
     * The recipe is excluded from its own tally, or it would count as
     * competition for the colour it already holds. Repeats are kept: a
     * repeated index is what makes one colour more used than another.
     */
    private accentsInUse(recipe: Recipe): number[] {
        const rows = this.db.getAllSync(
            `SELECT accentIndex FROM recipes
             WHERE isTea = ? AND uuid != ? AND accentIndex IS NOT NULL;`,
            [recipe.isTea() ? 1 : 0, recipe.uuid]
        ) as {accentIndex: number}[];
        return rows.map((row) => row.accentIndex);
    }

    public insertRecipe(recipe: Recipe): void {
        if (recipe && !this.getRecipe(recipe.uuid)) {
            recipe.accentIndex = reassignIfCrossed(recipe, this.accentsInUse(recipe));
            this.atomically(() => this.writeRow(recipe));
        } else {
            throw new Error("DB: Recipe already exists");
        }
    }

    public updateRecipe(uuid: string, updatedRecipe: Recipe): void {
        // Refused rather than handled. An earlier version deleted the old row
        // and let writeRow insert the new one, which is correct only while no
        // caller ever does it: writeRow's INSERT OR REPLACE keys on the blob's
        // own uuid, so if the new uuid already belongs to another recipe, that
        // recipe is replaced immediately after the original was deleted. One
        // call, two recipes gone, no error.
        //
        // No caller rewrites a uuid, and the cloud import path goes out of its
        // way not to: importPlan.ts assigns `recipe.uuid = replacing.uuid`
        // precisely so this stays true. So there is nothing to support here,
        // only a dormant way to lose data, and a throw is cheaper than the
        // uniqueness check the working version would need.
        if (updatedRecipe.uuid !== uuid) {
            throw new Error(
                `updateRecipe cannot rewrite a uuid (${uuid} -> ${updatedRecipe.uuid})`
            );
        }

        let recipe = this.getRecipe(uuid);
        if (!recipe) {
            this.insertRecipe(updatedRecipe);
            return;
        }
        updatedRecipe.accentIndex =
            reassignIfCrossed(updatedRecipe, this.accentsInUse(updatedRecipe));
        this.atomically(() => this.writeRow(updatedRecipe));
    }

    public deleteRecipe(uuid: string): void {
        this.atomically(() => {
            this.db.runSync("DELETE FROM recipes WHERE uuid = ?;", [uuid]);
            this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [uuid]);
        });
    }

    /**
     * Empties the library.
     *
     * `DELETE FROM` rather than dropping the table: the schema is created in the
     * constructor and a dropped table would leave every other database object in
     * this process holding a handle to something that no longer exists.
     */
    public deleteAllRecipes(): void {
        this.atomically(() => {
            this.db.runSync("DELETE FROM recipes");
            this.db.runSync("DELETE FROM recipe_tags");
        });
    }

    /**
     * Insert several recipes as one unit, or none of them.
     *
     * `insertRecipe` throws by design on a duplicate uuid, and it also consults
     * the palette before it writes, so a loop of bare inserts can fail partway
     * and leave the library half-changed. Wrapping the loop in a transaction
     * means a throw rolls the whole batch back — the restore either happened or
     * it did not, and the exception still reaches the caller so it can be shown
     * rather than swallowed.
     */
    public insertRecipes(recipes: Recipe[]): void {
        this.atomically(() => {
            for (const recipe of recipes) this.insertRecipe(recipe);
        });
    }

    /**
     * Empty the library and repopulate it in a single transaction.
     *
     * This is the destructive half of a restore, and the reason it exists as one
     * method rather than a delete followed by a loop of inserts: if any insert
     * throws, the delete is rolled back with it, so a failed replace leaves the
     * original library exactly as it was instead of an emptied, half-filled one.
     */
    public replaceAllRecipes(recipes: Recipe[]): void {
        this.atomically(() => {
            this.deleteAllRecipes();
            for (const recipe of recipes) this.insertRecipe(recipe);
        });
    }

    public getRecipe(uuid: string): Recipe | null {
        let recipeJSON: any = this.db.getFirstSync(
            `SELECT *
             FROM recipes
             WHERE uuid = ?;`,
            [
                uuid
            ]
        );
        if (recipeJSON) {
            return new Recipe(undefined, recipeJSON.recipeJSON);
        }
        return null;

    }

    /**
     * Insert a copy of a recipe value.
     *
     * Takes the recipe rather than a uuid so that duplicating does not depend
     * on the original having been saved: a recipe just read off a card or
     * imported from a link has no row to re-read, and one being edited has
     * changes the row does not know about.
     *
     * The value is deep-copied through its own JSON form before anything is
     * changed, so the caller's recipe keeps its uuid, name and colour.
     */
    public duplicateRecipe(source: Recipe): void {
        const copy = new Recipe(undefined, JSON.stringify(source));
        // Named from what the user actually sees, not from `name`. An imported
        // recipe has an empty `name` -- xBloom's name lives in `xbloomName`
        // and `displayName()` falls through to it -- so naming the copy from
        // `name` named it from an empty string. It stayed empty, fell through
        // to the same `xbloomName`, and the library showed two rows with the
        // same title and nothing to tell them apart. A user who cannot see
        // that anything happened presses the button again.
        //
        // A recipe with no name from any source keeps none: its label is a
        // generated placeholder drawn muted, and copying it must not bake that
        // placeholder into the name field as though someone had typed it.
        const names = (this.retrieveAllRecipes() ?? []).map((r) => r.displayName());
        copy.generateNewUUID();
        if (source.hasName()) copy.name = copyName(source.displayName(), names);
        copy.source = "duplicate";
        copy.createdAt = Date.now();
        // Cleared so the copy is assigned its own colour on insert rather
        // than sitting on the original's.
        copy.accentIndex = undefined;
        // A duplicate is a new local recipe, not a second copy of the account
        // recipe. Carrying the id over would leave two rows both claiming to
        // be the same xBloom recipe, and the import matches on exactly that
        // id: the next sync would find two locals for one account row and
        // have no basis to choose between them. The fingerprint records what
        // the account's copy looked like, so it goes with the id it belongs to.
        copy.cloudId = undefined;
        copy.cloudFingerprint = undefined;
        this.insertRecipe(copy);
    }

    public cloneRecipe(uuid: string): void {
        let recipe = this.getRecipe(uuid);
        if (recipe) {
            this.duplicateRecipe(recipe);
        }
    }


    /**
     * The library, as the answer to a rail query rather than "everything,
     * sorted in JavaScript".
     *
     * The statement selects each matching recipe's blob and hydrates it, so the
     * result is whole `Recipe` objects in the query's ORDER BY order, not the
     * index rows the query sorts on. The index columns are a derived, lossy
     * cache; the screen needs the real recipe, and the blob is the only source
     * of truth. Selecting the blob alongside the uuid lets this build every
     * result from one pass over the rows, in order, rather than re-reading each
     * recipe by uuid.
     *
     * `resolveFilter` is injected so the pure builder need not know the filter
     * vocabulary; until that vocabulary is wired in, callers pass no filters and
     * the default resolver is never consulted.
     */
    public queryRecipes(query: LibraryQuery, resolveFilter?: FilterResolver): Recipe[] {
        const {sql, params} = buildLibraryQuery(query, resolveFilter);
        const rows = this.db.getAllSync(sql, params) as {recipeJSON: string}[];
        return rows.map((row) => new Recipe(undefined, row.recipeJSON));
    }

    public countRecipes(): number {
        const row = this.db.getFirstSync("SELECT COUNT(*) AS count FROM recipes;") as
            {count: number} | null;
        return row?.count ?? 0;
    }

    public countRecipesByFilter(
        ids: readonly string[],
        resolveFilter: FilterResolver = () => null
    ): Record<string, number> {
        if (ids.length === 0) return {};

        const params: IndexValue[] = [];
        const selections = ids.map((id, index) => {
            const clause = resolveFilter(id);
            if (clause === null) {
                throw new Error(`RecipeDatabase: unknown filter id "${id}"`);
            }
            params.push(...(clause.params ?? []));
            return `COALESCE(SUM(CASE WHEN (${clause.where}) THEN 1 ELSE 0 END), 0) AS c${index}`;
        });

        const row = this.db.getFirstSync(
            `SELECT ${selections.join(", ")} FROM recipes;`,
            params
        ) as Record<string, number> | null;

        const counts: Record<string, number> = {};
        ids.forEach((id, index) => {
            counts[id] = row?.[`c${index}`] ?? 0;
        });
        return counts;
    }

    /**
     * How many recipes sit on each tag, ordered by size then name.
     *
     * The manual half of the shelf grid. `GROUP BY tagKey` and not by `tag`,
     * because the key is the matching form: two spellings of one word are one
     * shelf, and grouping by the display text would draw two tiles that open the
     * same list. The label is `MIN(tag)`, a spelling the user actually typed,
     * because handing back the key would show them a lower-cased version of
     * their own word.
     *
     * Ordered largest first so the grid's own order needs no second opinion, and
     * by folded name within a size so the order is stable rather than whatever
     * SQLite last happened to return. `tagKey` is already lower-cased, so
     * ordering by it is case-insensitive without asking SQLite for a collation
     * it only applies to ASCII.
     *
     * No suppression here. A manual shelf is always offered however small,
     * because a person made it on purpose; `availableFilters` is for shelves the
     * app invented.
     */
    public countRecipesByTag(): {tag: string; count: number}[] {
        return this.db.getAllSync(
            `SELECT MIN(tag) AS tag, COUNT(*) AS count FROM recipe_tags
             GROUP BY tagKey ORDER BY count DESC, tagKey ASC;`
        ) as {tag: string; count: number}[];
    }

    /**
     * How many recipes arrived from each person, largest first.
     *
     * The `SELECT DISTINCT sharedBy` the per-author shelves were waiting on.
     * Grouped on `sharedByKey`, the folded column, so one person who spelled
     * their name two ways is one shelf; the label is `MIN(sharedBy)`, the same
     * arrangement `countRecipesByTag` uses, so the shelf is named the way a
     * human wrote it rather than the way SQL compares it.
     *
     * Recipes that came from nobody are excluded by the column being null for
     * them, which is why `recipeIndex` writes null rather than an empty string.
     */
    public countRecipesByAuthor(): {author: string; count: number}[] {
        return this.db.getAllSync(
            `SELECT MIN(sharedBy) AS author, COUNT(*) AS count FROM recipes
             WHERE sharedByKey IS NOT NULL
             GROUP BY sharedByKey ORDER BY count DESC, sharedByKey ASC;`
        ) as {author: string; count: number}[];
    }

    /**
     * A few members of each shelf, for the art on its tile.
     *
     * At most `perShelf` recipes, taken in the shelf's own order, which is the
     * grid's order: a shelf of forty drawn as forty staircases is a solid block,
     * and the design caps the read at three. The cap is applied in SQL rather
     * than by slicing afterwards, so a large shelf costs the same as a small
     * one.
     *
     * One small query per shelf rather than one clever query for all of them.
     * The alternative is a UNION of per-shelf limited subqueries, which is the
     * same number of scans wearing a disguise, and unreadable. There are twelve
     * stock shelves plus however many tags a person typed, each returning three
     * rows of JSON.
     *
     * An unknown id is skipped rather than thrown on, unlike `countRecipesByFilter`:
     * a count that silently answered zero would misreport the library, whereas a
     * missing mark only costs a tile its picture.
     */
    public shelfMembers(
        ids: readonly string[],
        resolveFilter: FilterResolver = () => null,
        perShelf = 3
    ): Record<string, Recipe[]> {
        const members: Record<string, Recipe[]> = {};
        for (const id of ids) {
            const clause = resolveFilter(id);
            if (clause === null) continue;
            const rows = this.db.getAllSync(
                `SELECT recipeJSON FROM recipes WHERE (${clause.where})
                 ORDER BY sortName ASC LIMIT ?;`,
                [...(clause.params ?? []), perShelf]
            ) as {recipeJSON: string}[];
            members[id] = rows.map((row) => new Recipe(undefined, row.recipeJSON));
        }
        return members;
    }

    /**
     * What each recipe's brews add up to, for the card's evidence suffix.
     *
     * One grouped read over `brews` rather than a column on the library query,
     * because evidence does not depend on what the rail asked: the same three
     * figures are true whichever filter is on and whichever axis is sorted, and
     * a card drawn in a shelf room must say what it says in the list. The join
     * is possible at all because both classes open `xbrecipewriter.db`.
     *
     * Recipes with no brews are simply absent, which is what the card reads as
     * "nothing to show yet". A row of zeroes would have to be told apart from a
     * genuine zero somewhere, and there is no such thing here.
     */
    public brewEvidence(): Record<string, RecipeEvidence> {
        const rows = this.db.getAllSync(
            `SELECT recipeUuid, COUNT(*) AS brews, MAX(startedAt) AS lastBrewedAt,
                    -- NULLIF for the same reason the library query has it:
                    -- 0 is the app's word for unrated, and averaging silence
                    -- as a nought would be a verdict nobody gave.
                    AVG(NULLIF(rating, 0)) AS avgRating
             FROM brews GROUP BY recipeUuid;`
        ) as {
            recipeUuid: string; brews: number;
            lastBrewedAt: number | null; avgRating: number | null;
        }[];

        const evidence: Record<string, RecipeEvidence> = {};
        rows.forEach((row) => {
            evidence[row.recipeUuid] = {
                brews: row.brews,
                lastBrewedAt: row.lastBrewedAt ?? 0,
                avgRating: row.avgRating ?? 0
            };
        });
        return evidence;
    }

    public retrieveAllRecipes(): Recipe[] | null {
        let recipesJSON: any[] = this.db.getAllSync(
            `SELECT *
             FROM recipes;`
        );
        if (recipesJSON && recipesJSON.length > 0) {
            let recipes: Recipe[] = [];
            for (let i = 0; i < recipesJSON.length; i++) {
                recipes.push(new Recipe(undefined, recipesJSON[i].recipeJSON));
            }

            return recipes;
        }
        return null;
    }

}

export default RecipeDatabase;
