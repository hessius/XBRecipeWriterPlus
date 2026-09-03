import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";

/**
 * An in-memory stand-in for expo-sqlite, in the same spirit as the one in
 * RecipeDatabase.test.ts: expo-sqlite is a native module with no working
 * implementation under Jest, so the mock understands exactly the literal query
 * shapes BrewDatabase sends and nothing else. If you add a query, teach the
 * mock about it — do not loosen the matching.
 */
type BrewRow = Record<string, string | number | null>;
type SampleRow = {brewId: string; stream: string};

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => {
        const brews: BrewRow[] = [];
        const samples: SampleRow[] = [];
        return {
            execSync: () => {
                // CREATE TABLE / PRAGMA only; in memory there is nothing to do.
            },
            withTransactionSync: (task: () => void) => {
                const brewSnapshot = brews.map((row) => ({...row}));
                const sampleSnapshot = samples.map((row) => ({...row}));
                try {
                    task();
                } catch (error) {
                    brews.length = 0;
                    brews.push(...brewSnapshot);
                    samples.length = 0;
                    samples.push(...sampleSnapshot);
                    throw error;
                }
            },
            runSync: (source: string, params: (string | number | null)[] = []) => {
                if (/^\s*INSERT INTO brews/i.test(source)) {
                    const keys = source.match(/\(([^)]+)\)\s*VALUES/i)![1]
                        .split(",").map((k) => k.trim());
                    const row: BrewRow = {};
                    keys.forEach((key, index) => { row[key] = params[index]; });
                    brews.push(row);
                } else if (/^\s*INSERT INTO brew_samples/i.test(source)) {
                    samples.push({brewId: params[0] as string, stream: params[1] as string});
                } else if (/^\s*UPDATE brews SET hasStream/i.test(source)) {
                    const row = brews.find((b) => b.id === params[0]);
                    if (row) row.hasStream = 0;
                } else if (/^\s*DELETE FROM brew_samples WHERE brewId/i.test(source)) {
                    for (let i = samples.length - 1; i >= 0; i -= 1) {
                        if (samples[i].brewId === params[0]) samples.splice(i, 1);
                    }
                } else if (/^\s*DELETE FROM brew_samples\s*$/i.test(source)) {
                    samples.length = 0;
                } else if (/^\s*DELETE FROM brews WHERE id/i.test(source)) {
                    const index = brews.findIndex((b) => b.id === params[0]);
                    if (index >= 0) brews.splice(index, 1);
                } else if (/^\s*DELETE FROM brews\s*$/i.test(source)) {
                    brews.length = 0;
                }
            },
            getAllSync: (source: string, params: (string | number)[] = []) => {
                if (/FROM brew_samples/i.test(source)) {
                    return samples.filter((s) => s.brewId === params[0]);
                }
                const ordered = [...brews]
                    .sort((a, b) => (b.startedAt as number) - (a.startedAt as number));
                if (/WHERE id = \?/i.test(source)) {
                    return ordered.filter((b) => b.id === params[0]);
                }
                return ordered;
            }
        };
    }
}));

function record(overrides: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "brew-1",
        recipeUuid: "uuid-1",
        recipeName: "Ethiopia Guji",
        accent: "#C86A3B",
        startedAt: 1_000_000,
        endedAt: 1_240_000,
        outcome: "done",
        failure: null,
        pours: 2,
        waterTotal: 250,
        cupTotal: 244,
        heldSeconds: 14,
        ...overrides
    };
}

const stream: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 1000, water: 4, cup: 2, pour: 1}
];

describe("BrewDatabase", () => {
    it("round-trips a record", () => {
        const db = new BrewDatabase();
        db.insert(record(), []);
        expect(db.get("brew-1")).toEqual({...record(), hasStream: false});
    });

    it("restores null rather than the string 'null' for a clean brew", () => {
        // SQLite has no boolean and no undefined. A failure column that came
        // back as the four characters "null" would render as a failure banner
        // on a brew that went perfectly.
        const db = new BrewDatabase();
        db.insert(record(), []);
        expect(db.get("brew-1")?.failure).toBeNull();
    });

    it("keeps the failure reason", () => {
        const db = new BrewDatabase();
        db.insert(record({outcome: "failed", failure: "noWater"}), []);
        expect(db.get("brew-1")).toMatchObject({outcome: "failed", failure: "noWater"});
    });

    it("round-trips a stream", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream);
        expect(db.samples("brew-1")).toEqual(stream);
        expect(db.get("brew-1")?.hasStream).toBe(true);
    });

    it("lists the most recent brew first", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "old", startedAt: 1}), []);
        db.insert(record({id: "new", startedAt: 2}), []);
        expect(db.all().map((b) => b.id)).toEqual(["new", "old"]);
    });

    it("deletes a brew and its stream together", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream);
        db.remove("brew-1");
        expect(db.get("brew-1")).toBeNull();
        expect(db.samples("brew-1")).toEqual([]);
    });

    it("sweeps streams beyond the keep count and leaves the records", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.insert(record({id: "b", startedAt: 2}), stream);
        db.insert(record({id: "c", startedAt: 3}), stream);

        db.sweep(2);

        expect(db.all().map((b) => b.id)).toEqual(["c", "b", "a"]);
        expect(db.samples("a")).toEqual([]);
        expect(db.get("a")?.hasStream).toBe(false);
        expect(db.samples("b")).toEqual(stream);
    });

    it("sweeps nothing when the keep count covers everything", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.sweep(10);
        expect(db.samples("a")).toEqual(stream);
    });

    it("drops every stream when told to keep none", () => {
        // The retention picker's "Don't keep traces" position. Zero must mean
        // zero, not fall through to a default.
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.sweep(0);
        expect(db.samples("a")).toEqual([]);
        expect(db.all()).toHaveLength(1);
    });

    it("refuses a nonsense keep count rather than deleting everything", () => {
        // NaN slices from zero, so an unguarded sweep would expire every trace
        // the user has on a single corrupt settings row.
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.sweep(Number.NaN);
        db.sweep(-3);
        expect(db.samples("a")).toEqual(stream);
    });

    it("clears every brew", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.insert(record({id: "b", startedAt: 2}), stream);
        db.clear();
        expect(db.all()).toEqual([]);
        expect(db.samples("a")).toEqual([]);
        expect(db.samples("b")).toEqual([]);
    });
});
