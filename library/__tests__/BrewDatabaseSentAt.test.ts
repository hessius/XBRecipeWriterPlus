import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord} from "@/library/brew/BrewRecord";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

beforeEach(() => {
    mockBacking = createTestDatabase();
});

function record(over: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1", recipeUuid: "r1", recipeName: "Morning Bloem", accent: "#ff8800",
        startedAt: 1_000, pouringAt: 1_100, endedAt: 2_000, outcome: "done",
        failure: null, pours: 3, waterTotal: 260, cupTotal: 244, heldSeconds: 0,
        ...over
    } as BrewRecord;
}

describe("sentAt", () => {
    it("is absent on a brew nobody has handed over", () => {
        const database = new BrewDatabase();
        database.insert(record(), []);
        expect(database.get("b1")?.sentAt).toBeUndefined();
    });

    it("is remembered once a brew has been handed over", () => {
        const database = new BrewDatabase();
        database.insert(record(), []);
        database.markSent("b1", 5_000);
        expect(database.get("b1")?.sentAt).toBe(5_000);
    });

    it("moves to the most recent send", () => {
        const database = new BrewDatabase();
        database.insert(record(), []);
        database.markSent("b1", 5_000);
        database.markSent("b1", 9_000);
        expect(database.get("b1")?.sentAt).toBe(9_000);
    });

    it("survives a restore, so a second phone knows too", () => {
        const database = new BrewDatabase();
        database.restore([record({sentAt: 5_000})]);
        expect(database.get("b1")?.sentAt).toBe(5_000);
    });

    it("is added to an existing brew table during migration", () => {
        mockBacking.execSync(`
            CREATE TABLE brews (
                id TEXT PRIMARY KEY NOT NULL,
                recipeUuid TEXT NOT NULL,
                recipeName TEXT NOT NULL,
                accent TEXT NOT NULL,
                startedAt INTEGER NOT NULL,
                pouringAt INTEGER NOT NULL DEFAULT 0,
                endedAt INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                failure TEXT,
                pours INTEGER NOT NULL,
                waterTotal REAL NOT NULL,
                cupTotal REAL NOT NULL,
                heldSeconds INTEGER NOT NULL,
                stalls TEXT NOT NULL DEFAULT '[]',
                plan TEXT NOT NULL DEFAULT '[]',
                stageWater TEXT NOT NULL DEFAULT '[]',
                rating INTEGER NOT NULL DEFAULT 0,
                note TEXT NOT NULL DEFAULT '',
                pinned INTEGER NOT NULL DEFAULT 0,
                watched INTEGER NOT NULL DEFAULT 1,
                bypass TEXT NOT NULL DEFAULT '',
                dose REAL NOT NULL DEFAULT 0,
                ratio REAL NOT NULL DEFAULT 0,
                grindSize INTEGER NOT NULL DEFAULT 0,
                grinderRpm INTEGER NOT NULL DEFAULT 0,
                grinderUsed INTEGER NOT NULL DEFAULT 0,
                coffee TEXT NOT NULL DEFAULT '',
                origin TEXT NOT NULL DEFAULT '',
                roast TEXT NOT NULL DEFAULT '',
                process TEXT NOT NULL DEFAULT '',
                fermentation TEXT NOT NULL DEFAULT '',
                hasStream INTEGER NOT NULL
            );`);

        const database = new BrewDatabase();
        database.insert(record(), []);
        database.markSent("b1", 5_000);

        expect(database.get("b1")?.sentAt).toBe(5_000);
    });
});
