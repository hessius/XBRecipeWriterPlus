import RecipeDatabase from "@/library/RecipeDatabase";
import BrewDatabase from "@/library/BrewDatabase";
import type {BrewOutcome, BrewRecord} from "@/library/brew/BrewRecord";
import {createTestDatabase as mockCreateTestDatabase} from "@/test-utils/sqlite";

// `brewEvidence` reads the brews table from the recipe database's own handle,
// which is only meaningful because both classes open the one file. The mock
// therefore hands out a single shared database rather than a fresh one per
// call: a test where the two saw different files could not fail the way the
// app would.
// The `mock` prefix is what lets the hoisted factory close over it.
const mockShared = mockCreateTestDatabase();
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockShared
}));

function brewFor(
    uuid: string,
    rating: number,
    at: number,
    outcome: BrewOutcome = "done"
): void {
    const record: BrewRecord = {
        id: `${uuid}-${at}-${outcome}`,
        recipeUuid: uuid,
        recipeName: uuid,
        accent: "amber",
        startedAt: at,
        pouringAt: at,
        endedAt: at + 60_000,
        outcome,
        failure: null,
        pours: 1,
        waterTotal: 120,
        cupTotal: 110,
        heldSeconds: 0,
        rating
    };
    new BrewDatabase().insert(record, []);
}

describe("RecipeDatabase.brewEvidence", () => {
    beforeEach(() => {
        // Constructing it is what creates the tables, so the sweep below has
        // something to sweep on the very first test.
        new RecipeDatabase();
        mockShared.execSync("DELETE FROM brews;");
    });

    it("has no entry at all for a recipe nobody has brewed", () => {
        expect(new RecipeDatabase().brewEvidence()).toEqual({});
    });

    it("counts the brews of each recipe separately", () => {
        brewFor("a", 4, 1_000);
        brewFor("a", 2, 2_000);
        brewFor("b", 5, 3_000);

        const evidence = new RecipeDatabase().brewEvidence();

        expect(evidence["a"].brews).toBe(2);
        expect(evidence["b"].brews).toBe(1);
    });

    it("reports the most recent brew, not the first", () => {
        brewFor("a", 4, 5_000);
        brewFor("a", 4, 1_000);

        expect(new RecipeDatabase().brewEvidence()["a"].lastBrewedAt).toBe(5_000);
    });

    it("reports the most recent counted brew, not a later cancelled one", () => {
        brewFor("a", 4, 5_000);
        brewFor("a", 5, 9_000, "cancelled");

        expect(new RecipeDatabase().brewEvidence()["a"].lastBrewedAt).toBe(5_000);
    });

    it("averages only the brews somebody rated", () => {
        // 0 is the app's word for unrated. Averaging it in would report a
        // verdict nobody gave.
        brewFor("a", 4, 1_000);
        brewFor("a", 0, 2_000);

        const evidence = new RecipeDatabase().brewEvidence();

        expect(evidence["a"].avgRating).toBe(4);
        expect(evidence["a"].brews).toBe(2);
    });

    it("averages only ratings on brews that counted as cups", () => {
        brewFor("a", 2, 1_000);
        brewFor("a", 5, 2_000, "cancelled");

        const evidence = new RecipeDatabase().brewEvidence();

        expect(evidence["a"].avgRating).toBe(2);
        expect(evidence["a"].brews).toBe(1);
    });

    it("reports no rating when every brew of a recipe is unrated", () => {
        brewFor("a", 0, 1_000);

        expect(new RecipeDatabase().brewEvidence()["a"].avgRating).toBe(0);
    });
});
