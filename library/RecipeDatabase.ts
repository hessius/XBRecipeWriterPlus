import * as SQLite from 'expo-sqlite';

import Recipe from './Recipe';
import {assignAccent} from './accent';
import {copyName} from './duplicates';
import {columnDefinitions, indexStatements} from './recipeIndex';

class RecipeDatabase {
    private db: SQLite.SQLiteDatabase;

    constructor() {
        this.db = SQLite.openDatabaseSync('xbrecipewriter.db')
        this.createTable();
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

    public insertRecipe(recipe: Recipe): void {
        if (recipe && !this.getRecipe(recipe.uuid)) {
            assignAccent(recipe, this.retrieveAllRecipes() ?? []);
            let recipeJson = JSON.stringify(recipe);
            this.db.runSync(`
                        INSERT INTO recipes (uuid, recipeJSON)
                        VALUES (?, ?);`,
                [
                    recipe.uuid,
                    recipeJson
                ]
            );
        } else {
            throw new Error("DB: Recipe already exists");
        }
    }

    public updateRecipe(uuid: string, updatedRecipe: Recipe): void {
        let recipe = this.getRecipe(uuid);
        if (!recipe) {
            this.insertRecipe(updatedRecipe);
            return;
        } else {
            assignAccent(updatedRecipe, this.retrieveAllRecipes() ?? []);
            let updatedRecipeJson = JSON.stringify(updatedRecipe);
            this.db.runSync(`
                        UPDATE recipes
                        SET recipeJSON = ?
                        WHERE uuid = ?;`,
                [
                    updatedRecipeJson,
                    uuid
                ]
            );
        }
    }

    public deleteRecipe(uuid: string): void {
        this.db.runSync(`
                    DELETE
                    FROM recipes
                    WHERE uuid = ?;`,
            [
                uuid
            ]
        );
    }

    /**
     * Empties the library.
     *
     * `DELETE FROM` rather than dropping the table: the schema is created in the
     * constructor and a dropped table would leave every other database object in
     * this process holding a handle to something that no longer exists.
     */
    public deleteAllRecipes(): void {
        this.db.runSync("DELETE FROM recipes");
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
        this.db.withTransactionSync(() => {
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
        this.db.withTransactionSync(() => {
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
