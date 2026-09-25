import BrewDatabase, {ensureBrewTables} from "@/library/BrewDatabase";
import BrewRecorder, {type RecorderMachine} from "@/library/brew/BrewRecorder";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import {unobservedBrew} from "@/library/brew/BrewRecord";
import {
    MAX_BEAN_TAG_LENGTH,
    MAX_BEAN_TAGS,
    MAX_ORIGIN_LENGTH,
    resolvedOrigin,
    resolvedProcess
} from "@/library/brew/beanTags";
import type {BrewPhase} from "@/library/machine/Machine";
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

/**
 * An in-memory stand-in for expo-sqlite, in the same spirit as the one in
 * RecipeDatabase.test.ts: expo-sqlite is a native module with no working
 * implementation under Jest, so the mock understands exactly the literal query
 * shapes BrewDatabase sends and nothing else. If you add a query, teach the
 * mock about it — do not loosen the matching.
 */
type BrewRow = Record<string, string | number | null>;
type SampleRow = {brewId: string; stream: string};
type FrameRow = {brewId: string; frames: string};
type TagRow = {brewId: string; tag: string; tagKey: string};
const mockDb = {brews: [] as BrewRow[]};
let sampleReads = 0;
let tagRowsRead = 0;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => {
        const brews: BrewRow[] = [];
        const samples: SampleRow[] = [];
        const frames: FrameRow[] = [];
        const tags: TagRow[] = [];
        const countsAsBrewed = (b: BrewRow) =>
            b.outcome === "done" || b.outcome === "endedOnMachine";
        const isMeasured = (b: BrewRow) => countsAsBrewed(b) && b.watched !== 0;
        const isTimed = (b: BrewRow) =>
            isMeasured(b) && typeof b.pouringAt === "number" && b.pouringAt > 0;
        const isRated = (b: BrewRow) => countsAsBrewed(b) && (b.rating as number) > 0;
        mockDb.brews = brews;
        return {
            execSync: () => {
                // CREATE TABLE / PRAGMA only; in memory there is nothing to do.
            },
            withTransactionSync: (task: () => void) => {
                const brewSnapshot = brews.map((row) => ({...row}));
                const sampleSnapshot = samples.map((row) => ({...row}));
                const frameSnapshot = frames.map((row) => ({...row}));
                const tagSnapshot = tags.map((row) => ({...row}));
                try {
                    task();
                } catch (error) {
                    brews.length = 0;
                    brews.push(...brewSnapshot);
                    samples.length = 0;
                    samples.push(...sampleSnapshot);
                    frames.length = 0;
                    frames.push(...frameSnapshot);
                    tags.length = 0;
                    tags.push(...tagSnapshot);
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
                } else if (/^\s*INSERT INTO brew_frames/i.test(source)) {
                    frames.push({brewId: params[0] as string, frames: params[1] as string});
                } else if (/^\s*INSERT OR IGNORE INTO brew_tags/i.test(source)) {
                    if (!tags.some((row) =>
                        row.brewId === params[0] && row.tagKey === params[2])) {
                        tags.push({
                            brewId: params[0] as string,
                            tag: params[1] as string,
                            tagKey: params[2] as string
                        });
                    }
                } else if (/^\s*DELETE FROM brew_frames WHERE brewId/i.test(source)) {
                    for (let i = frames.length - 1; i >= 0; i -= 1) {
                        if (frames[i].brewId === params[0]) frames.splice(i, 1);
                    }
                } else if (/^\s*DELETE FROM brew_frames\s*$/i.test(source)) {
                    frames.length = 0;
                } else if (/^\s*DELETE FROM brew_tags WHERE brewId/i.test(source)) {
                    for (let i = tags.length - 1; i >= 0; i -= 1) {
                        if (tags[i].brewId === params[0]) tags.splice(i, 1);
                    }
                } else if (/^\s*DELETE FROM brew_tags\s*$/i.test(source)) {
                    tags.length = 0;
                } else if (/^\s*UPDATE brews SET/i.test(source)) {
                    // Generic because `judge` builds its SET list from the
                    // fields it was given, so there is no one literal to match:
                    // each assignment is either a bound `?` or a literal, and
                    // the trailing `WHERE id = ?` takes the last parameter.
                    const assignments = source
                        .match(/SET\s+(.+?)\s+WHERE/is)![1]
                        .split(",").map((a) => a.trim());
                    const row = brews.find((b) => b.id === params[params.length - 1]);
                    let next = 0;
                    assignments.forEach((assignment) => {
                        const [column, value] = assignment.split("=").map((p) => p.trim());
                        const bound = value === "?" ? params[next++] : Number(value);
                        if (row) row[column] = bound as string | number;
                    });
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
                } else {
                    throw new Error(`Unexpected SQL: ${source}`);
                }
            },
            getAllSync: (source: string, params: (string | number)[] = []) => {
                if (/FROM brew_samples/i.test(source)) {
                    sampleReads += 1;
                    return samples.filter((s) => s.brewId === params[0]);
                }
                if (/FROM brew_frames/i.test(source)) {
                    return frames.filter((f) => f.brewId === params[0]);
                }
                if (/FROM brew_tags/i.test(source)) {
                    if (/WHERE brewId = \?/i.test(source)) {
                        return tags.filter((row) => row.brewId === params[0]);
                    }
                    if (/WHERE brewId IN/i.test(source)) {
                        return tags.filter((row) => params.includes(row.brewId));
                    }
                    return tags;
                }
                const ordered = [...brews]
                    .sort((a, b) => (b.startedAt as number) - (a.startedAt as number));
                if (/^SELECT \* FROM brews WHERE recipeUuid = \?/i.test(source)) {
                    return ordered.filter((b) => b.recipeUuid === params[0]);
                }
                if (/AS meanBrewSeconds/i.test(source)) {
                    const mine = ordered.filter((b) => b.recipeUuid === params[0]);
                    const counted = mine.filter(countsAsBrewed);
                    const measured = mine.filter(isMeasured);
                    const timed = mine.filter(isTimed);
                    const rated = mine.filter(isRated);
                    return [{
                        times:  counted.length,
                        rated:  rated.length,
                        // AVG over no rows is NULL as well, and over
                        // CASE WHEN rated that is what an unrated recipe
                        // gives: the caller has to survive it here too.
                        avgRating: rated.length === 0
                            ? null
                            : rated.reduce((sum, b) => sum + (b.rating as number), 0)
                                / rated.length,
                        meanBrewSeconds: timed.length === 0
                            ? null
                            : timed.reduce(
                                (sum, b) => sum
                                    + ((b.endedAt as number) - (b.pouringAt as number)) / 1000,
                                0
                            ) / timed.length,
                        timed: timed.length,
                        meanCupMl: measured.length === 0
                            ? null
                            : measured.reduce((sum, b) => sum + (b.cupTotal as number), 0)
                                / measured.length,
                        measured: measured.length,
                        abandoned: mine.filter((b) => !countsAsBrewed(b)).length,
                        // SQL's MAX over no rows is NULL, not 0, and the caller
                        // has to survive that: the mock must say so too.
                        lastAt: counted.length === 0
                            ? null
                            : Math.max(...counted.map((b) => b.startedAt as number))
                    }];
                }
                if (/SELECT id FROM brews/i.test(source)) {
                    const [uuid, from, until] = params as [string, number, number];
                    return ordered
                        .filter((b) => b.recipeUuid === uuid
                            && (b.startedAt as number) >= from
                            && (b.startedAt as number) < until
                            && countsAsBrewed(b))
                        .slice(0, 1)
                        .map((b) => ({id: b.id}));
                }
                if (/WHERE id = \?/i.test(source)) {
                    return ordered.filter((b) => b.id === params[0]);
                }
                return ordered;
            }
        };
    }
}));

beforeEach(() => {
    sampleReads = 0;
    tagRowsRead = 0;
});

function corruptStoredRow(id: string, update: Partial<BrewRow>): void {
    const row = mockDb.brews.find((b) => b.id === id);
    if (row === undefined) throw new Error(`No brew row ${id} to corrupt`);
    Object.assign(row, update);
}

function record(overrides: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "brew-1",
        recipeUuid: "uuid-1",
        recipeName: "Ethiopia Guji",
        accent: "#C86A3B",
        startedAt: 1_000_000,
        pouringAt: 1_045_000,
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

/**
 * A database on real SQLite that also counts reads of `brew_samples`.
 *
 * The counting has to happen here rather than on the `expo-sqlite` mock. The
 * mock's counter only moves when the mock answers a query, so a test using this
 * database would leave it at zero however much of the stream the code loaded:
 * the assertion would hold because nothing could touch it, which is not the same
 * as holding because the code behaved.
 */
function realBrewDatabase(): BrewDatabase {
    const raw = createTestDatabase();
    ensureBrewTables(raw as Parameters<typeof ensureBrewTables>[0]);
    const readAll = raw.getAllSync.bind(raw);
    raw.getAllSync = ((source: string, params?: (string | number)[]) => {
        if (/FROM brew_samples/i.test(source)) sampleReads += 1;
        const rows = readAll(source, params);
        if (/FROM brew_tags/i.test(source)) tagRowsRead += rows.length;
        return rows;
    }) as typeof raw.getAllSync;
    const database = Object.create(BrewDatabase.prototype) as BrewDatabase;
    (database as unknown as {db: FakeSQLiteDatabase}).db = raw;
    return database;
}

const stream: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 1000, water: 4, cup: 2, pour: 1}
];

/**
 * A record built by the real recorder rather than by hand, so the one presence
 * rule the two layers express separately — BrewRecorder's `grindSize > 0` and
 * hydrate's — is checked against each other rather than against a fixture.
 */
function recorderRecord(recipe: Recipe, id: string): BrewRecord {
    let phase: (p: BrewPhase) => void = () => {};
    let saved: BrewRecord | undefined;
    const machine: RecorderMachine = {
        onNotification: () => () => {},
        onPhase: (l) => { phase = l; return () => { phase = () => {}; }; }
    };
    const recorder = new BrewRecorder({
        machine,
        recipe,
        now: () => 1_000_000,
        newId: () => id,
        onRecord: (emitted) => { saved = emitted; }
    });
    recorder.start();
    phase({name: "done"});
    recorder.stop();
    if (saved === undefined) throw new Error("Recorder did not emit a brew");
    return saved;
}

function recorderRecipe(): Recipe {
    const r = new Recipe();
    r.name = "Recorder recipe";
    r.pours = [new Pour(1, 40, 93, 40, 0, 0, 20)];
    return r;
}

describe("BrewDatabase", () => {
    it("indexes brews by recipe uuid", () => {
        const db = createTestDatabase();

        ensureBrewTables(db as Parameters<typeof ensureBrewTables>[0]);

        expect(db.getAllSync(`
            SELECT name, sql
            FROM sqlite_master
            WHERE type = 'index' AND tbl_name = 'brews'
            ORDER BY name;
        `)).toContainEqual({
            name: "idx_brews_recipeUuid",
            sql: "CREATE INDEX idx_brews_recipeUuid ON brews(recipeUuid)"
        });
    });

    it("counts a recipe's brews and dates the last of them", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", startedAt: 1_000}), []);
        db.insert(record({id: "b", recipeUuid: "uuid-1", startedAt: 9_000}), []);
        db.insert(record({id: "c", recipeUuid: "uuid-2", startedAt: 5_000}), []);

        expect(db.summaryFor("uuid-1"))
            .toEqual({
                times: 2, lastAt: 9_000, avgRating: 0, rated: 0,
                timed: 2, meanBrewSeconds: 195, measured: 2, meanCupMl: 244,
                abandoned: 0
            });
    });

    it("answers for a recipe never brewed without inventing a date", () => {
        // MAX over no rows is NULL. Left as it comes back it would reach the
        // deck as a date, and 1970 is not when this recipe was last brewed.
        const db = realBrewDatabase();
        db.insert(record({recipeUuid: "uuid-2"}), []);

        expect(db.summaryFor("uuid-1"))
            .toEqual({
                times: 0, lastAt: 0, avgRating: 0, rated: 0,
                timed: 0, meanBrewSeconds: 0, measured: 0, meanCupMl: 0,
                abandoned: 0
            });
    });

    it("round-trips a record", () => {
        const db = new BrewDatabase();
        db.insert(record(), []);
        // Every stored brew reports a verdict, even the empty one: unrated is
        // a value the readers have to be able to see, not an absence.
        expect(db.get("brew-1")).toEqual({
            ...record(), rating: 0, note: "", pinned: false, tags: [], hasStream: false
        });
    });

    it("restores a brew that never poured with no zero rather than a wrong one", () => {
        // A refusal or a failure before the first drop has no sample zero. It
        // must come back as 0 — meaning "fall back to the start" — and never
        // as the start dressed up as a first drop.
        const db = new BrewDatabase();
        db.insert(record({id: "brew-dry", pouringAt: 0}), []);
        expect(db.get("brew-dry")?.pouringAt).toBe(0);
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

    it("round-trips the stalls, one list per stage", () => {
        // The column list and the parameter array are written out separately,
        // so a stall that survives the trip is also proof the two still line up.
        const stalls = [[{atMl: 20, seconds: 11}], []];
        const db = new BrewDatabase();
        db.insert(record({stalls}), []);
        expect(db.get("brew-1")?.stalls).toEqual(stalls);
    });

    it("reads a row written before stalls existed as a brew that stalled nowhere", () => {
        // Not as one whose stalls are unknown: an older brew draws no amber,
        // and must not throw history away for want of a column.
        const db = new BrewDatabase();
        db.insert(record(), []);
        expect(db.get("brew-1")?.stalls).toBeUndefined();
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

    it("keeps a judged brew's trace through a sweep that takes the rest", () => {
        // The whole point of the pin: a 5 star brew with no trace left is a
        // judgement the user cannot act on.
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.insert(record({id: "b", startedAt: 2}), stream);
        db.insert(record({id: "c", startedAt: 3}), stream);

        db.judge("a", {rating: 5});
        db.sweep(1);

        expect(db.samples("a")).toEqual(stream);
        expect(db.get("a")?.hasStream).toBe(true);
        expect(db.samples("b")).toEqual([]);
    });

    it("does not spend the keep count on a pinned brew", () => {
        // Pinning the oldest brew must not push the newest ordinary one over
        // the edge; the pinned row is outside the sweep, not ahead of it.
        const db = new BrewDatabase();
        db.insert(record({id: "a", startedAt: 1}), stream);
        db.insert(record({id: "b", startedAt: 2}), stream);

        db.judge("a", {rating: 4});
        db.sweep(1);

        expect(db.samples("a")).toEqual(stream);
        expect(db.samples("b")).toEqual(stream);
    });

    it("reads a row written before the judgement columns as unrated", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a"}), stream);
        const brew = db.get("a");
        expect(brew?.rating).toBe(0);
        expect(brew?.note).toBe("");
        expect(brew?.pinned).toBe(false);
    });

    it("writes a rating and a note, and pins on either", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a"}), stream);
        db.insert(record({id: "b"}), stream);

        db.judge("a", {rating: 4});
        db.judge("b", {note: "Too sour, grind finer."});

        expect(db.get("a")?.rating).toBe(4);
        expect(db.get("a")?.pinned).toBe(true);
        expect(db.get("b")?.note).toBe("Too sour, grind finer.");
        expect(db.get("b")?.pinned).toBe(true);
    });

    it("refuses a rating off the scale rather than clamping it", () => {
        // A 9 reaching here is a caller that is wrong. Clamping would write a
        // verdict nobody gave, and pin the brew on the strength of it.
        const db = new BrewDatabase();
        db.insert(record({id: "a"}), stream);

        db.judge("a", {rating: 9});
        db.judge("a", {rating: 2.5});

        expect(db.get("a")?.rating).toBe(0);
        expect(db.get("a")?.pinned).toBe(false);
    });

    it("releases a pin without touching the judgement", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "a"}), stream);
        db.judge("a", {rating: 3, note: "Fine."});

        db.setPinned("a", false);

        expect(db.get("a")?.pinned).toBe(false);
        expect(db.get("a")?.rating).toBe(3);
        expect(db.get("a")?.note).toBe("Fine.");
    });

    it("carries a judgement in with a restored record", () => {
        // A restore inserts a record that already has a verdict on it, which a
        // live brew never does: nothing has been drunk when that row is written.
        const db = new BrewDatabase();
        db.insert(record({id: "a", rating: 5, note: "The best one.", pinned: true}), []);
        const brew = db.get("a");
        expect(brew?.rating).toBe(5);
        expect(brew?.note).toBe("The best one.");
        expect(brew?.pinned).toBe(true);
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

describe("the plan and the delivered water", () => {
    it("gives them back as they went in", () => {
        const db = new BrewDatabase();
        const plan = [
            {pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
             agitation: 1, pourPattern: 0, pauseTime: 20}
        ];

        db.insert(record({plan, stageWater: [38]}), stream);

        const [back] = db.all();
        expect(back.plan).toEqual(plan);
        expect(back.stageWater).toEqual([38]);
    });

    it("leaves both absent on a row that never had them", () => {
        // Rows written before these columns fall back to the live recipe, which
        // is what they did before. Absent, not empty: the screen tests for
        // undefined to decide whether it has a snapshot at all.
        const db = new BrewDatabase();

        db.insert(record(), stream);

        const [back] = db.all();
        expect(back.plan).toBeUndefined();
        expect(back.stageWater).toBeUndefined();
    });
});

describe("the bypass snapshot", () => {
    it("round-trips the bypass with its start time", () => {
        const bypass = {volume: 35, temperature: 88, delivered: 32, startedAt: 174_000};
        const db = new BrewDatabase();

        db.insert(record({bypass}), []);

        expect(db.get("brew-1")?.bypass).toEqual(bypass);
    });

    it("round-trips a bypass that never started", () => {
        const bypass = {volume: 35, temperature: 88, delivered: 0, startedAt: null};
        const db = new BrewDatabase();

        db.insert(record({bypass}), []);

        expect(db.get("brew-1")?.bypass).toEqual(bypass);
    });

    it("leaves bypass absent when it was not recorded", () => {
        const db = new BrewDatabase();

        db.insert(record(), []);

        expect(db.get("brew-1")?.bypass).toBeUndefined();
    });

    it("ignores a bypass column that is not JSON", () => {
        const db = new BrewDatabase();
        db.insert(record({
            bypass: {volume: 35, temperature: 88, delivered: 32, startedAt: 174_000}
        }), []);

        corruptStoredRow("brew-1", {bypass: "not JSON"});

        const back = db.get("brew-1");
        expect(back).toMatchObject({
            recipeName: "Ethiopia Guji",
            waterTotal: 250,
            cupTotal: 244
        });
        expect(back?.bypass).toBeUndefined();
    });
});

describe("the recipe snapshot for export", () => {
    it("round-trips the brew recipe and pod coffee fields", () => {
        const coffee = {
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry · strawberry · blueberry",
            note: "Producer notes",
            beanMix: "Single Origin",
            imageUrl: "https://example.com/coffee.png"
        };
        const db = new BrewDatabase();

        db.insert(record({
            dose: 15,
            ratio: 16,
            grindSize: 55,
            grinderRpm: 120,
            grinderUsed: true,
            coffee
        }), []);

        expect(db.get("brew-1")).toMatchObject({
            dose: 15,
            ratio: 16,
            grindSize: 55,
            grinderRpm: 120,
            grinderUsed: true,
            coffee
        });
    });

    it("leaves the recipe snapshot absent when it was not recorded", () => {
        const db = new BrewDatabase();

        db.insert(record(), []);

        const back = db.get("brew-1");
        expect(back?.dose).toBeUndefined();
        expect(back?.ratio).toBeUndefined();
        expect(back?.grindSize).toBeUndefined();
        expect(back?.grinderRpm).toBeUndefined();
        expect(back?.grinderUsed).toBeUndefined();
        expect(back?.coffee).toBeUndefined();
    });

    it("keeps a recorded disabled grinder distinct from an unrecorded one", () => {
        const db = new BrewDatabase();

        db.insert(record({grindSize: 55, grinderUsed: false}), []);

        expect(db.get("brew-1")?.grinderUsed).toBe(false);
    });

    it("copies the coffee snapshot instead of holding the original object", () => {
        const coffee = {name: "Original coffee", imageUrl: "https://example.com/old.png"};
        const db = new BrewDatabase();

        db.insert(record({coffee}), []);
        coffee.name = "Mutated coffee";
        coffee.imageUrl = "https://example.com/new.png";

        expect(db.get("brew-1")?.coffee).toEqual({
            name: "Original coffee",
            imageUrl: "https://example.com/old.png"
        });
    });

    it("round-trips a full recipe snapshot from the recorder", () => {
        const db = new BrewDatabase();
        const fullRecipe = recorderRecipe();
        fullRecipe.dosage = 15;
        fullRecipe.ratio = 16;
        fullRecipe.grindSize = 62;
        fullRecipe.grindRPM = 90;
        fullRecipe.grinder = true;
        fullRecipe.coffee = {name: "Kenya Sakami"};
        const full = recorderRecord(fullRecipe, "brew-full");

        db.insert(full, []);
        const fullBack = db.get("brew-full");
        expect(fullBack).toMatchObject({
            dose: full.dose,
            ratio: full.ratio,
            grindSize: full.grindSize,
            grinderRpm: full.grinderRpm,
            grinderUsed: full.grinderUsed,
            coffee: full.coffee
        });
    });

    it("keeps the recorder's omissions omitted through the database", () => {
        const db = new BrewDatabase();
        const defaults = recorderRecord(recorderRecipe(), "brew-defaults");
        db.insert(defaults, []);
        const defaultsBack = db.get("brew-defaults");
        expect(defaultsBack?.ratio).toBeUndefined();
        expect(defaultsBack?.grindSize).toBeUndefined();
        expect(defaultsBack?.grinderUsed).toBeUndefined();
        expect(defaultsBack?.coffee).toBeUndefined();
        expect(defaultsBack?.dose).toBe(15);
        expect(defaultsBack?.grinderRpm).toBe(120);
    });

    it("ignores a coffee column that is not JSON", () => {
        const db = new BrewDatabase();
        db.insert(record({coffee: {name: "Kenya Sakami"}}), []);

        corruptStoredRow("brew-1", {coffee: "not JSON"});

        const back = db.get("brew-1");
        expect(back).toMatchObject({
            recipeName: "Ethiopia Guji",
            waterTotal: 250,
            cupTotal: 244
        });
        expect(back?.coffee).toBeUndefined();
    });

    it("drops a stored coffee image that is not HTTPS", () => {
        const db = new BrewDatabase();
        db.insert(record(), []);

        corruptStoredRow("brew-1", {
            coffee: JSON.stringify({
                name: "Kenya Sakami",
                imageUrl: "http://example.com/coffee.png"
            })
        });

        expect(db.get("brew-1")?.coffee).toEqual({name: "Kenya Sakami"});
    });
});

describe("what the coffee was", () => {
    it("stores and reads back the preset fields", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "a", recipeUuid: "uuid-1",
            origin: "Nyeri, Kenya", roast: "Medium",
            process: "Washed", fermentation: "Anaerobic"
        }), []);

        expect(db.brewsFor("uuid-1")[0]).toMatchObject({
            origin: "Nyeri, Kenya", roast: "Medium",
            process: "Washed", fermentation: "Anaerobic"
        });
    });

    it("leaves an unset field absent rather than empty", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1"}), []);

        const [brew] = db.brewsFor("uuid-1");
        expect(brew.origin).toBeUndefined();
        expect(brew.roast).toBeUndefined();
        expect(brew.process).toBeUndefined();
        expect(brew.fermentation).toBeUndefined();
    });

    it("refuses a preset value outside its vocabulary on the way in", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "a", recipeUuid: "uuid-1",
            roast: "Cremated" as never, process: "washed" as never
        }), []);

        const raw = (db as unknown as {db: FakeSQLiteDatabase}).db;
        const stored = raw.getAllSync(
            "SELECT roast, process FROM brews WHERE id = ?;", ["a"]
        )[0] as {roast: string; process: string};
        expect(stored).toEqual({roast: "", process: ""});

        const [brew] = db.brewsFor("uuid-1");
        expect(brew.roast).toBeUndefined();
        expect(brew.process).toBeUndefined();
    });

    it("trims an origin and drops one that is absurdly long", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", origin: "  Huila  "}), []);
        db.insert(record({
            id: "b", recipeUuid: "uuid-1", origin: "x".repeat(MAX_ORIGIN_LENGTH + 1)
        }), []);

        const byId = Object.fromEntries(
            db.brewsFor("uuid-1").map((brew) => [brew.id, brew]));
        expect(byId.a.origin).toBe("Huila");
        expect(byId.b.origin).toBeUndefined();
    });

    it("never writes a pod's values into the columns", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "a",
            recipeUuid: "uuid-1",
            coffee: {name: "Pod", origin: "Huila", process: "washed"}
        }), []);

        // The pod's values resolve at read time. Writing them here would turn
        // xBloom's description into the user's assertion, permanently.
        const raw = (db as unknown as {db: FakeSQLiteDatabase}).db;
        const stored = raw.getAllSync(
            "SELECT origin, process FROM brews WHERE id = ?;", ["a"]
        )[0] as {origin: string; process: string};
        expect(stored).toEqual({origin: "", process: ""});

        const [brew] = db.brewsFor("uuid-1");
        expect(brew.origin).toBeUndefined();
        expect(brew.process).toBeUndefined();
        expect(resolvedOrigin(brew)).toBe("Huila");
        expect(resolvedProcess(brew)).toBe("Washed");
    });
});

describe("a brew's custom tags", () => {
    it("stores and reads them back in the order given", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", tags: ["Kenya", "filter"]}), []);

        expect(db.brewsFor("uuid-1")[0].tags).toEqual(["Kenya", "filter"]);
    });

    it("gives an empty list for a brew nobody tagged", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1"}), []);

        expect(db.brewsFor("uuid-1")[0].tags).toEqual([]);
    });

    it("folds two spellings of one tag into one row", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", tags: ["Kenya", "kenya"]}), []);

        expect(db.brewsFor("uuid-1")[0].tags).toEqual(["Kenya"]);
    });

    it("normalises restored tags before writing tag rows", () => {
        const db = realBrewDatabase();
        const many = Array.from({length: MAX_BEAN_TAGS + 2}, (_, index) =>
            `tag-${index}`);
        const hostileTags = [
            "  Kenya  ",
            "",
            "   ",
            "x".repeat(MAX_BEAN_TAG_LENGTH + 1),
            42,
            ...many
        ] as unknown as string[];
        const expectedTags = ["Kenya", ...many.slice(0, MAX_BEAN_TAGS - 1)];

        db.restore([record({id: "a", recipeUuid: "uuid-1", tags: hostileTags})]);

        const raw = (db as unknown as {db: FakeSQLiteDatabase}).db;
        const rows = raw.getAllSync(
            "SELECT tag, tagKey FROM brew_tags WHERE brewId = ? ORDER BY rowid;",
            ["a"]
        );
        expect(rows).toEqual(expectedTags.map((tag) => ({
            tag,
            tagKey: tag.toLowerCase()
        })));
        expect(db.get("a")?.tags).toEqual(expectedTags);
    });

    it("keeps one brew's tags off another", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", tags: ["Kenya"]}), []);
        db.insert(record({id: "b", recipeUuid: "uuid-1", tags: ["Brazil"]}), []);
        db.insert(record({id: "c", recipeUuid: "uuid-2", tags: ["Ghost"]}), []);

        tagRowsRead = 0;
        const byId = Object.fromEntries(
            db.brewsFor("uuid-1").map((brew) => [brew.id, brew]));
        expect(byId.a.tags).toEqual(["Kenya"]);
        expect(byId.b.tags).toEqual(["Brazil"]);
        expect(tagRowsRead).toBe(2);
    });

    it("takes a brew's tags with it when the brew is deleted", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", tags: ["Kenya"]}), []);
        db.remove("a");

        expect(db.tagsFor("a")).toEqual([]);
    });

    it("clears custom tag rows with the history", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", tags: ["Kenya"]}), []);
        db.insert(record({id: "b", recipeUuid: "uuid-1", tags: ["Brazil"]}), []);

        db.clear();

        const raw = (db as unknown as {db: FakeSQLiteDatabase}).db;
        expect(raw.getAllSync("SELECT brewId, tag FROM brew_tags ORDER BY rowid;"))
            .toEqual([]);
    });
});

/**
 * The frame log is kept per brew because the machine's own history is in
 * memory and dies with a JS reload — which is exactly how the first field
 * capture of a false out-of-water report was lost, after the brew that
 * produced it had already ended.
 */
describe("the frame log of a brew", () => {
    const log = "18:51:44.123  ←  58 02 07 0C  state 0x0c no_water";

    it("comes back with the brew it belongs to", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream, log);
        expect(db.frames("brew-1")).toBe(log);
    });

    it("is empty for a brew recorded without one", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream);
        expect(db.frames("brew-1")).toBe("");
    });

    it("goes when the brew it belongs to is deleted", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream, log);
        db.remove("brew-1");
        expect(db.frames("brew-1")).toBe("");
    });

    it("goes when the history is cleared", () => {
        const db = new BrewDatabase();
        db.insert(record(), stream, log);
        db.clear();
        expect(db.frames("brew-1")).toBe("");
    });

    /**
     * Swept with the stream rather than kept forever: a log is a few tens of
     * kilobytes of hex, and the record it hangs off is the thing history is
     * made of. The retention setting already says how much detail the user
     * wants to keep.
     */
    it("expires with the stream it was recorded beside", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "old", startedAt: 1}), stream, log);
        db.insert(record({id: "new", startedAt: 2}), stream, log);
        db.sweep(1);
        expect(db.frames("old")).toBe("");
        expect(db.frames("new")).toBe(log);
    });
});

describe("a history restored from a backup", () => {
    it("adds the records it was given, without a stream", () => {
        const db = new BrewDatabase();
        const added = db.restore([record({id: "b1"}), record({id: "b2"})]);

        expect(added).toBe(2);
        expect(db.all().map((brew) => brew.id).sort()).toEqual(["b1", "b2"]);
        expect(db.get("b1")?.hasStream).toBe(false);
        expect(db.samples("b1")).toEqual([]);
    });

    /**
     * The restore used to name a shorter column list than the live insert, so
     * a brew that came back from a backup arrived with no dose, no ratio, no
     * grinder and no bypass -- and an export of it handed another app a brew
     * with no coffee in it. Both paths write through one statement now, and
     * this is what says so.
     */
    it("carries the recipe snapshot an export needs", () => {
        const db = new BrewDatabase();
        db.restore([record({
            id: "b1",
            dose: 18,
            ratio: 16,
            grindSize: 62,
            grinderRpm: 90,
            grinderUsed: true,
            coffee: {name: "Ethiopia Guji", origin: "Ethiopia"},
            bypass: {volume: 40, temperature: 88, delivered: 40, startedAt: 190_000}
        })]);

        const restored = db.get("b1");
        expect(restored?.dose).toBe(18);
        expect(restored?.ratio).toBe(16);
        expect(restored?.grindSize).toBe(62);
        expect(restored?.grinderRpm).toBe(90);
        expect(restored?.grinderUsed).toBe(true);
        expect(restored?.coffee).toMatchObject({name: "Ethiopia Guji"});
        expect(restored?.bypass).toMatchObject({volume: 40});
    });

    it("carries the judgement in with the record", () => {
        const db = new BrewDatabase();
        db.restore([record({id: "b1", rating: 4, note: "Too sour", pinned: true})]);

        const restored = db.get("b1");
        expect(restored?.rating).toBe(4);
        expect(restored?.note).toBe("Too sour");
        expect(restored?.pinned).toBe(true);
    });

    /**
     * The sharpest rule in the restore: the row here may carry a verdict the
     * user gave after the backup was made, and replacing it would delete a
     * rating to put back the absence of one.
     */
    it("never overwrites a brew already here", () => {
        const db = new BrewDatabase();
        db.insert(record({id: "b1"}), []);
        db.judge("b1", {rating: 5, note: "Best yet"});

        const added = db.restore([record({id: "b1", rating: 0, note: ""})]);

        expect(added).toBe(0);
        expect(db.get("b1")?.rating).toBe(5);
        expect(db.get("b1")?.note).toBe("Best yet");
    });

    it("inserts a brew a file carries twice only once", () => {
        const db = new BrewDatabase();
        const added = db.restore([record({id: "b1"}), record({id: "b1"})]);

        expect(added).toBe(1);
        expect(db.all()).toHaveLength(1);
    });

    it("refuses an off-scale rating rather than writing it", () => {
        const db = new BrewDatabase();
        db.restore([record({id: "b1", rating: 9 as unknown as number})]);

        expect(db.get("b1")?.rating).toBe(0);
    });
});

describe("a brew the app never watched", () => {
    it("comes back saying so", () => {
        const db = new BrewDatabase();
        db.insert(unobservedBrew({
            recipeUuid: "uuid-1", recipeName: "Ethiopia", accent: "#f00",
            rating: 4, at: 2_000, id: "hand-1"
        }), []);

        expect(db.get("hand-1")?.watched).toBe(false);
    });

    it("leaves a watched brew saying nothing, because it has nothing to say", () => {
        // Absent rather than true: a record written before the column existed
        // reads identically to one written after it, so nothing has to be
        // migrated to go on being what it always was.
        const db = new BrewDatabase();
        db.insert(record({id: "watched-1"}), []);

        expect(db.get("watched-1")?.watched).toBeUndefined();
    });

    it("counts as a brew, because it is one", () => {
        const db = new BrewDatabase();
        db.insert(unobservedBrew({
            recipeUuid: "uuid-1", recipeName: "Ethiopia", accent: "#f00",
            rating: 4, at: 7_000, id: "hand-1"
        }), []);

        expect(db.summaryFor("uuid-1"))
            .toMatchObject({times: 1, lastAt: 7_000});
    });

    it("keeps its verdict and its pin", () => {
        const db = new BrewDatabase();
        db.insert(unobservedBrew({
            recipeUuid: "uuid-1", recipeName: "Ethiopia", accent: "#f00",
            rating: 5, at: 1_000, id: "hand-1"
        }), []);

        const brew = db.get("hand-1");
        expect(brew?.rating).toBe(5);
        expect(brew?.pinned).toBe(true);
    });

    it("survives a restore still unwatched", () => {
        const db = new BrewDatabase();
        db.restore([unobservedBrew({
            recipeUuid: "uuid-1", recipeName: "Ethiopia", accent: "#f00",
            rating: 3, at: 1_000, id: "hand-1"
        })]);

        expect(db.get("hand-1")?.watched).toBe(false);
    });

    it("restores a watched brew as watched", () => {
        const db = new BrewDatabase();
        db.restore([record({id: "watched-1"})]);

        expect(db.get("watched-1")?.watched).toBeUndefined();
    });
});

describe("what a recipe's history adds up to", () => {
    it("counts only brews that produced a cup", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "done-a", recipeUuid: "uuid-1"}), []);
        db.insert(record({id: "done-b", recipeUuid: "uuid-1"}), []);
        db.insert(record({id: "done-c", recipeUuid: "uuid-1"}), []);
        db.insert(record({id: "cancelled", recipeUuid: "uuid-1", outcome: "cancelled"}), []);
        db.insert(record({id: "failed", recipeUuid: "uuid-1", outcome: "failed"}), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({times: 3});
    });

    it("counts a brew ended on the machine as a cup", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "short", recipeUuid: "uuid-1", outcome: "endedOnMachine"}), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({times: 1});
    });

    it("leaves only cancelled brews out of the brewed figures", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "cancelled", recipeUuid: "uuid-1", startedAt: 9_000,
            outcome: "cancelled", rating: 5
        }), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({
            times: 0, lastAt: 0, avgRating: 0, rated: 0,
            timed: 0, meanBrewSeconds: 0, measured: 0, meanCupMl: 0,
            abandoned: 1
        });
    });

    it("keeps the last brewed date on the last counted brew", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "good", recipeUuid: "uuid-1", startedAt: 2_000}), []);
        db.insert(record({
            id: "cancelled", recipeUuid: "uuid-1", startedAt: 9_000,
            outcome: "cancelled"
        }), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({times: 1, lastAt: 2_000});
    });

    it("keeps hand-logged brews out of measured means", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "watched", recipeUuid: "uuid-1", startedAt: 1_000,
            pouringAt: 2_000, endedAt: 12_000, cupTotal: 200, rating: 4
        }), []);
        db.insert(unobservedBrew({
            id: "hand", recipeUuid: "uuid-1", recipeName: "Ethiopia",
            accent: "#f00", rating: 5, at: 20_000
        }), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({
            times: 2, lastAt: 20_000, avgRating: 4.5, rated: 2,
            timed: 1, meanBrewSeconds: 10, measured: 1, meanCupMl: 200,
            abandoned: 0
        });
    });

    it("lets an untimed measured brew count for cup volume only", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "untimed", recipeUuid: "uuid-1", pouringAt: 0,
            endedAt: 20_000, cupTotal: 180
        }), []);
        db.insert(record({
            id: "timed", recipeUuid: "uuid-1", pouringAt: 5_000,
            endedAt: 20_000, cupTotal: 220
        }), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({
            timed: 1, meanBrewSeconds: 15, measured: 2, meanCupMl: 200
        });
    });

    it("counts every non-cup outcome as abandoned", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "cancelled", outcome: "cancelled"}), []);
        db.insert(record({id: "lost", outcome: "lostContact"}), []);
        db.insert(record({id: "failed", outcome: "failed"}), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({abandoned: 3});
    });

    it("returns zeroes for every aggregate when there is no history", () => {
        const db = realBrewDatabase();

        expect(db.summaryFor("uuid-1")).toEqual({
            times: 0, lastAt: 0, avgRating: 0, rated: 0,
            timed: 0, meanBrewSeconds: 0, measured: 0, meanCupMl: 0,
            abandoned: 0
        });
    });

    it("averages only the brews somebody rated", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "a", recipeUuid: "uuid-1", rating: 5}), []);
        db.insert(record({id: "b", recipeUuid: "uuid-1", rating: 3}), []);
        // Unrated, and it must not drag the average down: 0 is silence, not a
        // verdict of nothing.
        db.insert(record({id: "c", recipeUuid: "uuid-1"}), []);

        const summary = db.summaryFor("uuid-1");
        expect(summary.avgRating).toBe(4);
        expect(summary.rated).toBe(2);
        expect(summary.times).toBe(3);
    });

    it("reports no average at all for a recipe nobody has judged", () => {
        const db = realBrewDatabase();
        db.insert(record({recipeUuid: "uuid-1"}), []);

        expect(db.summaryFor("uuid-1")).toMatchObject({avgRating: 0, rated: 0});
    });
});

describe("one recipe's brew list", () => {
    it("returns every brew for the recipe, newest first", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "old", recipeUuid: "uuid-1", startedAt: 1}), []);
        db.insert(record({
            id: "cancelled", recipeUuid: "uuid-1", startedAt: 3, outcome: "cancelled"
        }), []);
        db.insert(record({id: "other", recipeUuid: "uuid-2", startedAt: 4}), []);
        db.insert(record({id: "new", recipeUuid: "uuid-1", startedAt: 5}), []);

        // Aggregates exclude a cancelled brew from evidence, but the history
        // list is a diary: if it happened, the user is entitled to see it.
        expect(db.brewsFor("uuid-1").map((brew) => brew.id))
            .toEqual(["new", "cancelled", "old"]);
    });

    it("returns nothing for a recipe with no brews", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "other", recipeUuid: "uuid-2"}), []);

        expect(db.brewsFor("uuid-1")).toEqual([]);
    });

    it("does not load streams but still reports whether one exists", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "with-stream", recipeUuid: "uuid-1"}), stream);
        sampleReads = 0;

        const [brew] = db.brewsFor("uuid-1");

        expect(sampleReads).toBe(0);
        expect(brew.hasStream).toBe(true);
    });

    it("carries the plan each brew ran", () => {
        const db = realBrewDatabase();
        const oldPlan = [
            {pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
             agitation: 1, pourPattern: 0, pauseTime: 20}
        ];
        const newPlan = [
            {pourNumber: 1, volume: 55, temperature: 92, flowRate: 50,
             agitation: 2, pourPattern: 1, pauseTime: 10}
        ];
        db.insert(record({id: "old", recipeUuid: "uuid-1", startedAt: 1, plan: oldPlan}), []);
        db.insert(record({id: "new", recipeUuid: "uuid-1", startedAt: 2, plan: newPlan}), []);

        expect(db.brewsFor("uuid-1").map((brew) => brew.plan))
            .toEqual([newPlan, oldPlan]);
    });
});

describe("today's brew", () => {
    const noon = new Date(2026, 8, 19, 12, 0, 0).getTime();

    it("finds the latest brew from the same day", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "morning", recipeUuid: "uuid-1",
            startedAt: new Date(2026, 8, 19, 7, 30).getTime()
        }), []);
        db.insert(record({
            id: "elevenses", recipeUuid: "uuid-1",
            startedAt: new Date(2026, 8, 19, 11, 0).getTime()
        }), []);

        expect(db.brewOn("uuid-1", noon)).toBe("elevenses");
    });

    it("does not reach back to yesterday", () => {
        // A cup at 23:50 is not still today's at 00:10, which is the whole
        // reason the window is a local day rather than a span of hours.
        const db = realBrewDatabase();
        db.insert(record({
            id: "last-night", recipeUuid: "uuid-1",
            startedAt: new Date(2026, 8, 18, 23, 50).getTime()
        }), []);

        expect(db.brewOn("uuid-1", new Date(2026, 8, 19, 0, 10).getTime())).toBeNull();
    });

    it("does not answer with another recipe's brew", () => {
        const db = realBrewDatabase();
        db.insert(record({id: "theirs", recipeUuid: "uuid-2", startedAt: noon}), []);

        expect(db.brewOn("uuid-1", noon)).toBeNull();
    });

    it("does not answer with a cancelled brew", () => {
        const db = realBrewDatabase();
        db.insert(record({
            id: "cancelled", recipeUuid: "uuid-1", startedAt: noon,
            outcome: "cancelled"
        }), []);

        expect(db.brewOn("uuid-1", noon)).toBeNull();
    });
});
