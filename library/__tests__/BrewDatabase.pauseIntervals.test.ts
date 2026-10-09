import {openDatabaseSync} from "expo-sqlite";
import BrewDatabase, {ensureBrewTables} from "@/library/BrewDatabase";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {PauseInterval} from "@/library/brew/pauseIntervals";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

beforeEach(() => {
    mockBacking = createTestDatabase();
});

const intervals: PauseInterval[] = [
    {from: 100, to: 300, pour: 1, reason: "manual"},
    {from: 500, to: 800, pour: 3, reason: "overflow"}
];

function record(extra: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1", recipeUuid: "r1", recipeName: "Morning", accent: "#ff8800",
        startedAt: 1000, pouringAt: 1100, endedAt: 2100, outcome: "done",
        failure: null, pours: 2, waterTotal: 260, cupTotal: 244, heldSeconds: 0,
        pauseIntervals: intervals,
        ...extra
    };
}

const samples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 1000, water: 260, cup: 244, pour: 2}
];

function expectSchema(): void {
    expect(mockBacking.getAllSync("PRAGMA table_info(brews);")).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                name: "pauseIntervals", type: "TEXT", notnull: 1, dflt_value: "'[]'"
            })
        ])
    );
}

describe("persistent pause intervals", () => {
    it("creates the defaulted column idempotently in real SQLite", () => {
        const db = openDatabaseSync(":memory:");
        ensureBrewTables(db);
        expectSchema();
        ensureBrewTables(db);
        expectSchema();
    });

    it("migrates an old table and preserves an existing row without an emitted key", () => {
        mockBacking.execSync(`
            CREATE TABLE brews (
                id TEXT PRIMARY KEY NOT NULL, recipeUuid TEXT NOT NULL,
                recipeName TEXT NOT NULL, accent TEXT NOT NULL,
                startedAt INTEGER NOT NULL, endedAt INTEGER NOT NULL,
                outcome TEXT NOT NULL, failure TEXT, pours INTEGER NOT NULL,
                waterTotal REAL NOT NULL, cupTotal REAL NOT NULL,
                heldSeconds INTEGER NOT NULL, hasStream INTEGER NOT NULL
            );
            INSERT INTO brews VALUES (
                'old', 'r1', 'Morning', '#ff8800', 1000, 2100,
                'done', NULL, 2, 260, 244, 0, 0
            );`);
        const db = openDatabaseSync(":memory:");
        ensureBrewTables(db);
        ensureBrewTables(db);
        expectSchema();
        expect(mockBacking.getFirstSync(
            "SELECT pauseIntervals FROM brews WHERE id = 'old';"
        )).toEqual({pauseIntervals: "[]"});
        const database = new BrewDatabase();
        expect(database.get("old")).toMatchObject({id: "old", cupTotal: 244});
        expect(database.get("old")).not.toHaveProperty("pauseIntervals");
        database.insert(record(), samples);
        expect(database.get("b1")?.pauseIntervals).toEqual(intervals);
    });

    it("inserts and hydrates both pause reasons through every history read", () => {
        const database = new BrewDatabase();
        database.insert(record(), samples);
        expect(mockBacking.getFirstSync(
            "SELECT pauseIntervals FROM brews WHERE id = 'b1';"
        )).toEqual({pauseIntervals: JSON.stringify(intervals)});
        expect(database.get("b1")).toMatchObject({pauseIntervals: intervals, hasStream: true});
        expect(database.all()[0].pauseIntervals).toEqual(intervals);
        expect(database.brewsFor("r1")[0].pauseIntervals).toEqual(intervals);
        expect(database.samples("b1")).toEqual(samples);
    });

    it.each([undefined, []])("omits the key for an ordinary brew (%p)", (pauseIntervals) => {
        const database = new BrewDatabase();
        database.insert(record({pauseIntervals}), []);
        expect(database.get("b1")).not.toHaveProperty("pauseIntervals");
        expect(mockBacking.getFirstSync(
            "SELECT pauseIntervals FROM brews WHERE id = 'b1';"
        )).toEqual({pauseIntervals: "[]"});
    });

    it("restores intervals without a sample stream and never overwrites a newer judgement", () => {
        const database = new BrewDatabase();
        expect(database.restore([record({rating: 2, note: "Old verdict"})])).toBe(1);
        expect(database.get("b1")).toMatchObject({pauseIntervals: intervals, hasStream: false});
        expect(database.samples("b1")).toEqual([]);
        database.judge("b1", {rating: 5, note: "New verdict"});
        expect(database.restore([record({pauseIntervals: [], rating: 1})])).toBe(0);
        expect(database.get("b1")).toMatchObject({
            pauseIntervals: intervals, rating: 5, note: "New verdict", pinned: true
        });
    });

    it("retains intervals after a sample sweep while judgement pins the other stream", () => {
        const database = new BrewDatabase();
        database.insert(record(), samples);
        database.insert(record({id: "pinned", startedAt: 900}), samples);
        database.judge("pinned", {rating: 4, note: "Keep"});
        database.sweep(0);
        expect(database.get("b1")).toMatchObject({pauseIntervals: intervals, hasStream: false});
        expect(database.samples("b1")).toEqual([]);
        expect(database.get("pinned")).toMatchObject({
            pauseIntervals: intervals, hasStream: true, rating: 4, pinned: true
        });
        expect(database.samples("pinned")).toEqual(samples);
    });

    it.each([
        ["invalid JSON", "{"],
        ["null", "null"],
        ["not an array", "{}"],
        ["invalid reason", '[{"from":0,"to":1,"pour":1,"reason":"unknown"}]'],
        ["backwards interval", '[{"from":2,"to":1,"pour":1,"reason":"manual"}]'],
        ["overlap", JSON.stringify([intervals[0], {...intervals[1], from: 200}])]
    ])("throws a descriptive storage error for %s", (_label, value) => {
        const database = new BrewDatabase();
        database.insert(record(), []);
        mockBacking.runSync("UPDATE brews SET pauseIntervals = ? WHERE id = ?;", [value, "b1"]);
        expect(() => database.get("b1")).toThrow(/stored.*pauseIntervals.*b1/i);
    });
});
