import * as SQLite from 'expo-sqlite';

import Recipe from './Recipe';
import {accentGroupFor, reassignIfCrossed} from './accent';
import {copyName} from './duplicates';

class RecipeDatabase {
    private db: SQLite.SQLiteDatabase;

    constructor() {
        this.db = SQLite.openDatabaseSync('xbrecipewriter.db')
        this.createTable();
    }


    private createTable(): void {
        this.db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS recipes (uuid TEXT PRIMARY KEY NOT NULL,recipeJSON TEXT);`
        );
    }

    public insertRecipe(recipe: Recipe): void {
        if (recipe && !this.getRecipe(recipe.uuid)) {
            recipe.accentIndex = reassignIfCrossed(recipe, this.accentsInUse(recipe));
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
            updatedRecipe.accentIndex =
                reassignIfCrossed(updatedRecipe, this.accentsInUse(updatedRecipe));
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

    /**
     * The accent indices already taken in a recipe's half of the palette.
     *
     * Only the same half counts: the coffee library is larger, and letting its
     * indices into the tea tally would skew tea towards colours nothing uses.
     */
    private accentsInUse(recipe: Recipe): number[] {
        const group = accentGroupFor(recipe);
        return (this.retrieveAllRecipes() ?? [])
            .filter((other) => other.uuid !== recipe.uuid &&
                               accentGroupFor(other) === group)
            .map((other) => other.accentIndex)
            .filter((index): index is number => typeof index === "number");
    }

}

export default RecipeDatabase;
