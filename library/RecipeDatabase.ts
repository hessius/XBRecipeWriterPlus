import * as SQLite from 'expo-sqlite';

import Recipe from './Recipe';
import {reassignIfCrossed} from './accent';
import {copyName} from './duplicates';
import {columnDefinitions, indexStatements, projectRecipe, schemaHash} from './recipeIndex';

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
                "INSERT OR IGNORE INTO recipe_tags (uuid, tag) VALUES (?, ?);",
                [uuid, tag]
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
    private reindexRow(uuid: string, recipe: Recipe): void {
        const projected = projectRecipe(recipe);
        const names = Object.keys(projected);
        const assignments = names.map((name) => `${name} = ?`).join(", ");

        this.db.runSync(
            `UPDATE recipes SET ${assignments} WHERE uuid = ?;`,
            [...names.map((name) => projected[name]), uuid]
        );

        this.writeTags(uuid, recipe.tags);
    }

    constructor() {
        this.db = SQLite.openDatabaseSync('xbrecipewriter.db')
        this.createTable();
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
        this.db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS recipes (uuid TEXT PRIMARY KEY NOT NULL,recipeJSON TEXT);
            CREATE TABLE IF NOT EXISTS recipe_tags (
                uuid TEXT NOT NULL,
                tag TEXT NOT NULL COLLATE NOCASE,
                PRIMARY KEY (uuid, tag)
            );
            CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag ON recipe_tags(tag);
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
     * Rebuild the index when the descriptor array has changed.
     *
     * The blob is never written here — `reindexRow` updates only the index
     * columns and tags — so the worst a wrong descriptor can do is produce a
     * wrong index over intact data, which the next rebuild corrects. The hash
     * The hash is stored last and inside the same transaction, so a failure
     * leaves it stale and the next open simply tries again: a half-rebuilt
     * index cannot persist. Those are two independent defences — ordering
     * alone survives a lost transaction, and the transaction alone survives a
     * reordering — so a test can only catch losing both at once, which is what
     * "leaves the hash unstored when a rebuild fails" does. Keep both.
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
            const rows = this.db.getAllSync(
                "SELECT uuid, recipeJSON FROM recipes;"
            ) as {uuid: string; recipeJSON: string}[];

            for (const row of rows) {
                this.reindexRow(row.uuid, new Recipe(undefined, row.recipeJSON));
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
        let recipe = this.getRecipe(uuid);
        if (!recipe) {
            this.insertRecipe(updatedRecipe);
            return;
        }
        updatedRecipe.accentIndex =
            reassignIfCrossed(updatedRecipe, this.accentsInUse(updatedRecipe));
        this.atomically(() => {
            // No caller rewrites a uuid today, so this branch is dormant. It
            // exists because writeRow's INSERT OR REPLACE keys on the blob's
            // own uuid: without the delete, a rewrite would leave the old row
            // orphaned under the old key. A caller that ever does rewrite one
            // must still ensure the new uuid is not already taken, or the
            // replace silently clobbers whichever recipe holds it.
            if (updatedRecipe.uuid !== uuid) {
                this.db.runSync("DELETE FROM recipes WHERE uuid = ?;", [uuid]);
                this.db.runSync("DELETE FROM recipe_tags WHERE uuid = ?;", [uuid]);
            }
            this.writeRow(updatedRecipe);
        });
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
