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
        const names = (this.retrieveAllRecipes() ?? []).map((r) => r.name);
        copy.generateNewUUID();
        copy.name = copyName(copy.name, names);
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
