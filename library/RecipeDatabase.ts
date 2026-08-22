import * as SQLite from 'expo-sqlite';

import Recipe from './Recipe';
import {accentGroupFor, reassignIfCrossed} from './accent';

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
            console.log(recipeJson);
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
            console.log(updatedRecipeJson);
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

    public cloneRecipe(uuid: string): void {
        let recipe = this.getRecipe(uuid);
        if (recipe) {
            recipe.generateNewUUID();
            recipe.name = this.createTitle(recipe.name);
            this.insertRecipe(recipe);
        }
    }

    private createTitle(title: string): string {

        let newTitle = title;
        if (!newTitle.includes("(Copy)")) {
            newTitle = `${newTitle} (Copy)(1)`;
        }

        let count = 1;
        while (this.doesTitleExist(newTitle)) {
            count++;
            if (newTitle.includes("(Copy)")) {
                newTitle = newTitle.replace(/\(Copy\)\(\d+\)$/, `(Copy)(${count})`);
            } else {
                newTitle = `${title} (Copy)(${count})`;
            }
        }

        return newTitle;
    }

    public doesTitleExist(title: string): boolean {
        let recipes = this.retrieveAllRecipes();
        if (recipes) {
            for (let i = 0; i < recipes.length; i++) {
                if (recipes[i].name.toLowerCase() === title.toLowerCase()) {
                    return true;
                }
            }
        }
        return false
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
