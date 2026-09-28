import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord} from "@/library/brew/BrewRecord";
/* eslint-enable import/first */

beforeEach(() => {
    mockBacking = createTestDatabase();
});

function record(over: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1",
        recipeUuid: "r1",
        recipeName: "Morning Bloem",
        accent: "#ff8800",
        startedAt: 1_000,
        pouringAt: 1_100,
        endedAt: 2_000,
        outcome: "done",
        failure: null,
        pours: 3,
        waterTotal: 260,
        cupTotal: 244,
        heldSeconds: 0,
        ...over
    } as BrewRecord;
}

describe("BrewDatabase.lastMeasuredBrew", () => {
    it("has nothing to offer on an empty history", () => {
        const database = new BrewDatabase();
        expect(database.lastMeasuredBrew()).toBeNull();
    });

    it("returns the most recently ended brew", () => {
        const database = new BrewDatabase();
        database.insert(record({id: "old", endedAt: 1_000}), []);
        database.insert(record({id: "new", endedAt: 9_000}), []);
        expect(database.lastMeasuredBrew()?.id).toBe("new");
    });

    it("skips a brew that never made a cup", () => {
        const database = new BrewDatabase();
        database.insert(record({id: "cup", endedAt: 1_000}), []);
        database.insert(
            record({id: "stopped", endedAt: 9_000, outcome: "cancelled"}), []
        );
        expect(database.lastMeasuredBrew()?.id).toBe("cup");
    });

    it("skips a brew logged by hand", () => {
        const database = new BrewDatabase();
        database.insert(record({id: "seen", endedAt: 1_000}), []);
        database.insert(
            record({id: "logged", endedAt: 9_000, watched: false, rating: 4}), []
        );
        expect(database.lastMeasuredBrew()?.id).toBe("seen");
    });

    it("returns a brew that is already rated, so the rule can end the matter", () => {
        const database = new BrewDatabase();
        database.insert(record({id: "unrated", endedAt: 1_000}), []);
        database.insert(record({id: "rated", endedAt: 9_000, rating: 5}), []);
        expect(database.lastMeasuredBrew()?.id).toBe("rated");
    });

    it("returns the brew's tags", () => {
        const database = new BrewDatabase();
        database.insert(record({id: "tagged", tags: ["Kenya", "Filter"]}), []);
        expect(database.lastMeasuredBrew()?.tags).toEqual(["Kenya", "Filter"]);
    });
});
