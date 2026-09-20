import * as SQLite from "expo-sqlite";

import type {BrewFailure} from "./machine/Machine";
import {isRating} from "./brew/BrewRecord";
import type {BrewOutcome, BrewRecord, BrewSample, PlanStage} from "./brew/BrewRecord";
import type {Stall} from "./brew/stalls";
import type {PodCoffee} from "./podCoffee";
import {podCoffeeFromStored} from "./podCoffee";

/** A record as it comes back out, with whether its stream survived retention. */
export type StoredBrew = BrewRecord & {hasStream: boolean};

/** How a recipe has gone: how many brews, and when the last of them was. */
export type BrewSummary = {
    times: number;
    lastAt: number;
    /**
     * The average of the ratings actually given, or 0 where none were.
     *
     * 0 is "nobody has said", not a verdict of nothing, which is why the
     * average is taken over `NULLIF(rating, 0)`: counting silence as a nought
     * would rank a much-brewed recipe below a once-disliked one for no reason
     * but that it was brewed more often without comment.
     */
    avgRating: number;
    /** How many of those brews carry a rating. */
    rated: number;
};

type BrewRow = {
    id: string;
    recipeUuid: string;
    recipeName: string;
    accent: string;
    startedAt: number;
    /** 0 on a brew that never poured, and on rows written before the column. */
    pouringAt: number | null;
    endedAt: number;
    outcome: string;
    failure: string | null;
    pours: number;
    waterTotal: number;
    cupTotal: number;
    heldSeconds: number;
    /** JSON, one list of stalls per stage. `[]` on rows written before it. */
    stalls: string | null;
    /** JSON, the plan as it stood. `[]` on rows written before it. */
    plan: string | null;
    /** JSON, one delivered volume per stage. `[]` on rows written before it. */
    stageWater: string | null;
    /** 0 on a brew nobody judged, and on rows written before the column. */
    rating: number | null;
    note: string | null;
    pinned: number | null;
    /** 1 on a brew the app saw; 0 only on one a person logged by hand. */
    watched: number | null;
    /** 0 on rows written before it, which reads as "not recorded". */
    dose: number;
    /** 0 on rows written before it, which reads as "not recorded". */
    ratio: number;
    /** 0 on rows written before it, which reads as "not recorded". */
    grindSize: number;
    /** 0 on rows written before it, which reads as "not recorded". */
    grinderRpm: number;
    /** 0 on rows written before it and when recorded as false; grindSize > 0 marks recordedness. */
    grinderUsed: number;
    /** JSON, the pod coffee as it stood. `''` on rows written before it. */
    coffee: string;
    hasStream: number;
};

/**
 * Create the brew tables if they are not already there.
 *
 * Exported and shared because two database objects need these tables to exist,
 * and only one of them owns the writes. `RecipeDatabase.queryRecipes` joins the
 * recipe index to an aggregate over `brews` -- both classes open the same
 * `xbrecipewriter.db` file, which is what makes that join possible -- but the
 * library screen opens `RecipeDatabase` before any brew screen has mounted a
 * `BrewDatabase`, so on a fresh install the join would reference a table that
 * does not exist yet and every library render would throw. Ensuring the schema
 * from both entry points fixes that without either duplicating or drifting from
 * the other, since there is exactly one copy of the DDL and it lives here with
 * the class that owns it. A partial stand-in would be worse than nothing: the
 * inserts below name every column, so a `brews` created with a subset would
 * make this class's own writes fail.
 */
export function ensureBrewTables(db: SQLite.SQLiteDatabase): void {
    db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS brews (
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
                dose REAL NOT NULL DEFAULT 0,
                ratio REAL NOT NULL DEFAULT 0,
                grindSize INTEGER NOT NULL DEFAULT 0,
                grinderRpm INTEGER NOT NULL DEFAULT 0,
                grinderUsed INTEGER NOT NULL DEFAULT 0,
                coffee TEXT NOT NULL DEFAULT '',
                hasStream INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS brew_samples (
                brewId TEXT PRIMARY KEY NOT NULL,
                stream TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS brew_frames (
                brewId TEXT PRIMARY KEY NOT NULL,
                frames TEXT NOT NULL
            );`);
    // Rows written before `pouringAt` existed keep the 0 default, which
    // reads as "no first drop recorded" and falls back to `startedAt`.
    // `IF NOT EXISTS` on ADD COLUMN is not portable across the SQLite
    // versions Expo ships, so the failure is caught instead.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN pouringAt INTEGER NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    // Rows written before `stalls` existed get an empty list, which reads
    // as "nothing recorded" rather than "nothing happened" -- a brew from
    // before this column simply draws no amber.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN stalls TEXT NOT NULL DEFAULT '[]';");
    } catch {
        // Already there.
    }
    // Rows written before these two fall back to the live recipe, exactly
    // as every row did until now.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN plan TEXT NOT NULL DEFAULT '[]';");
    } catch {
        // Already there.
    }
    try {
        db.execSync(
            "ALTER TABLE brews ADD COLUMN stageWater TEXT NOT NULL DEFAULT '[]';");
    } catch {
        // Already there.
    }
    // Every brew recorded before these is unrated, un-noted and unpinned, which
    // is the truth about them: nobody was ever offered the chance to say.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN rating INTEGER NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN note TEXT NOT NULL DEFAULT '';");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    // Defaulting to 1, because every brew recorded before a person could log
    // one by hand is a brew the app watched. The column exists so the ones it
    // did not watch can say so; it is not a flag anything else has to set.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN watched INTEGER NOT NULL DEFAULT 1;");
    } catch {
        // Already there.
    }
    // Rows written before these six existed keep zero or an empty string,
    // which reads as "not recorded"; zero is not a live dose, ratio, grind
    // or RPM value, and SQLite has no undefined or boolean.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN dose REAL NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN ratio REAL NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN grindSize INTEGER NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN grinderRpm INTEGER NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    try {
        db.execSync(
            "ALTER TABLE brews ADD COLUMN grinderUsed INTEGER NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN coffee TEXT NOT NULL DEFAULT '';");
    } catch {
        // Already there.
    }
}

/**
 * Brew history, in two tables because they have two lifetimes.
 *
 * `brews` is one short row per brew and is kept until the user deletes it.
 * `brew_samples` is roughly 2 400 rows per brew and is swept by the retention
 * setting, which is why `hasStream` exists: a record whose stream has gone
 * still shows its figures, it just has no trace to draw.
 *
 * The values are copied, not joined to the recipe. A brew is a thing that
 * happened; editing the recipe afterwards, or deleting it, must not rewrite
 * history.
 */
class BrewDatabase {
    private db: SQLite.SQLiteDatabase;

    constructor() {
        this.db = SQLite.openDatabaseSync("xbrecipewriter.db");
        ensureBrewTables(this.db);
    }

    /**
     * @param frames the machine's frame log covering this brew, as text. Kept
     * because `Machine.frameHistory` lives in memory and dies with a JS
     * reload, which is how the first field capture of a false out-of-water
     * report was lost — after the brew had already ended and there was nothing
     * left to ask.
     */
    public insert(record: BrewRecord, samples: BrewSample[], frames = ""): void {
        // One transaction, so a brew never half-exists: a record with a
        // truncated stream would draw a trace that stops in mid-air.
        this.db.withTransactionSync(() => {
            this.db.runSync(
                `INSERT INTO brews (id, recipeUuid, recipeName, accent, startedAt, pouringAt,
                                    endedAt, outcome, failure, pours, waterTotal, cupTotal,
                                    heldSeconds, stalls, plan, stageWater, rating,
                                    note, pinned, watched, dose, ratio,
                                    grindSize, grinderRpm, grinderUsed, coffee, hasStream)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                         ?, ?, ?, ?, ?, ?, ?);`,
                [
                    record.id, record.recipeUuid, record.recipeName, record.accent,
                    record.startedAt, record.pouringAt ?? 0,
                    record.endedAt, record.outcome, record.failure,
                    record.pours, record.waterTotal, record.cupTotal, record.heldSeconds,
                    JSON.stringify(record.stalls ?? []),
                    JSON.stringify(record.plan ?? []),
                    JSON.stringify(record.stageWater ?? []),
                    // A restore carries a judgement in with the record, so the
                    // insert has to take one. A live brew never does: nothing
                    // has been drunk yet at the moment the row is written.
                    isRating(record.rating) ? record.rating : 0,
                    record.note ?? "",
                    record.pinned ? 1 : 0,
                    record.watched === false ? 0 : 1,
                    record.dose ?? 0,
                    record.ratio ?? 0,
                    record.grindSize ?? 0,
                    record.grinderRpm ?? 0,
                    record.grinderUsed === true ? 1 : 0,
                    record.coffee ? JSON.stringify(record.coffee) : "",
                    samples.length > 0 ? 1 : 0
                ]
            );
            if (samples.length > 0) {
                // One JSON row rather than 2 400 rows per brew. Nothing ever
                // queries inside a stream — it is read whole to draw a line, and
                // deleted whole by the retention sweep.
                this.db.runSync(
                    "INSERT INTO brew_samples (brewId, stream) VALUES (?, ?);",
                    [record.id, JSON.stringify(samples)]
                );
            }
            if (frames.length > 0) {
                this.db.runSync(
                    "INSERT INTO brew_frames (brewId, frames) VALUES (?, ?);",
                    [record.id, frames]
                );
            }
        });
    }

    public all(): StoredBrew[] {
        return this.db
            .getAllSync<BrewRow>("SELECT * FROM brews ORDER BY startedAt DESC;")
            .map(hydrate);
    }

    /**
     * How a recipe has gone, in the two figures the ABOUT deck asks for.
     *
     * Counted in SQL rather than by reading the rows, because the editor asks
     * this on open and the answer is two numbers: pulling every brew of a
     * much-used recipe across to count them would be work done to throw away.
     *
     * `lastAt` is 0 for a recipe never brewed, matching the sentinel the rest
     * of the app uses for a timestamp that does not exist.
     */
    public summaryFor(recipeUuid: string): BrewSummary {
        const rows = this.db.getAllSync<{
            times: number; lastAt: number | null;
            avgRating: number | null; rated: number;
        }>(
            `SELECT COUNT(*) AS times, MAX(startedAt) AS lastAt,
                    AVG(NULLIF(rating, 0)) AS avgRating,
                    COUNT(NULLIF(rating, 0)) AS rated
             FROM brews WHERE recipeUuid = ?;`,
            [recipeUuid]
        );
        const row = rows[0];
        if (row === undefined) return {times: 0, lastAt: 0, avgRating: 0, rated: 0};
        return {
            times: row.times,
            lastAt: row.lastAt ?? 0,
            avgRating: row.avgRating ?? 0,
            rated: row.rated
        };
    }

    /**
     * The latest brew of this recipe on the same day as `at`, if there is one.
     *
     * The recipe screen's star has one gesture and two outcomes: it rates
     * today's brew where there is one, and writes a hand-logged brew where
     * there is not. This is the question that chooses between them, and it is
     * asked in local days rather than in hours because "today" is what the user
     * means -- a cup at breakfast is still today's at supper, and a cup at
     * 23:50 is not still today's at 00:10.
     */
    public brewOn(recipeUuid: string, at: number): string | null {
        const start = new Date(at);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime());
        end.setDate(end.getDate() + 1);
        const rows = this.db.getAllSync<{id: string}>(
            `SELECT id FROM brews
             WHERE recipeUuid = ? AND startedAt >= ? AND startedAt < ?
             ORDER BY startedAt DESC LIMIT 1;`,
            [recipeUuid, start.getTime(), end.getTime()]
        );
        return rows[0]?.id ?? null;
    }

    /**
     * The user's verdict on a brew, and the pin that comes with it.
     *
     * One statement, so the pin cannot lag the judgement it is there to
     * protect: a rating whose trace the next sweep took is a rating the user
     * cannot act on. A rating outside the scale is refused rather than clamped,
     * because a 9 arriving here means a caller is wrong, and clamping it to 5
     * would write a verdict nobody gave.
     */
    public judge(id: string, judgement: {rating?: number; note?: string}): void {
        const {rating, note} = judgement;
        if (rating !== undefined && !isRating(rating)) return;
        const sets: string[] = [];
        const params: (string | number)[] = [];
        if (rating !== undefined) {
            sets.push("rating = ?");
            params.push(rating);
        }
        if (note !== undefined) {
            sets.push("note = ?");
            params.push(note);
        }
        if (sets.length === 0) return;
        // Clearing a rating back to 0 still pins: the user has been here and
        // said something about this brew, and taking the trace away underneath
        // them for changing their mind is the same loss by another route.
        sets.push("pinned = 1");
        this.db.runSync(
            `UPDATE brews SET ${sets.join(", ")} WHERE id = ?;`, [...params, id]
        );
    }

    /**
     * Let a brew back into the sweep, or hold it out of one by hand.
     *
     * Releasing does not bring back a stream that has already gone, and nothing
     * here pretends it might: `hasStream` already tells a record whether its
     * trace survived.
     */
    public setPinned(id: string, pinned: boolean): void {
        this.db.runSync(
            "UPDATE brews SET pinned = ? WHERE id = ?;", [pinned ? 1 : 0, id]
        );
    }

    /**
     * Put records from a backup into the history, and say how many landed.
     *
     * Never overwrites: a row already here may carry a rating and a note the
     * user gave it after the backup was made, and replacing it would delete a
     * verdict to put back the absence of one. Streams are not carried in a
     * backup, so every restored record is inserted with none and says so.
     *
     * One transaction, so a restore is all or nothing rather than a history
     * that is half somebody else's.
     */
    public restore(records: readonly BrewRecord[]): number {
        // Deduped here rather than through `library/backup`'s `mergeBrews`,
        // which the restore screen uses for its preview: the database must not
        // depend on the file format to protect its own rows, and a second
        // copy of the same id inside one file has to be caught too.
        const known = new Set(this.all().map((brew) => brew.id));
        const toAdd: BrewRecord[] = [];
        for (const record of records) {
            if (known.has(record.id)) continue;
            known.add(record.id);
            toAdd.push(record);
        }
        if (toAdd.length === 0) return 0;
        this.db.withTransactionSync(() => {
            toAdd.forEach((record) => {
                this.db.runSync(
                    `INSERT INTO brews (id, recipeUuid, recipeName, accent, startedAt, pouringAt,
                                        endedAt, outcome, failure, pours, waterTotal, cupTotal,
                                        heldSeconds, stalls, plan, stageWater, rating,
                                        note, pinned, watched, hasStream)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
                    [
                        record.id, record.recipeUuid, record.recipeName, record.accent,
                        record.startedAt, record.pouringAt ?? 0,
                        record.endedAt, record.outcome, record.failure,
                        record.pours, record.waterTotal, record.cupTotal, record.heldSeconds,
                        JSON.stringify(record.stalls ?? []),
                        JSON.stringify(record.plan ?? []),
                        JSON.stringify(record.stageWater ?? []),
                        isRating(record.rating) ? record.rating : 0,
                        record.note ?? "",
                        record.pinned ? 1 : 0,
                        record.watched === false ? 0 : 1
                    ]
                );
            });
        });
        return toAdd.length;
    }

    public get(id: string): StoredBrew | null {
        const rows = this.db.getAllSync<BrewRow>(
            "SELECT * FROM brews WHERE id = ?;", [id]
        );
        return rows.length > 0 ? hydrate(rows[0]) : null;
    }

    public samples(id: string): BrewSample[] {
        const rows = this.db.getAllSync<{stream: string}>(
            "SELECT stream FROM brew_samples WHERE brewId = ?;", [id]
        );
        if (rows.length === 0) return [];
        // A stream that will not parse is a stream that is gone. Losing a trace
        // is a shrug; throwing here would take the history screen down with it.
        try {
            return JSON.parse(rows[0].stream) as BrewSample[];
        } catch {
            return [];
        }
    }

    /** The frame log covering a brew, or empty if none was kept or it expired. */
    public frames(id: string): string {
        const rows = this.db.getAllSync<{frames: string}>(
            "SELECT frames FROM brew_frames WHERE brewId = ?;", [id]
        );
        return rows.length > 0 ? rows[0].frames : "";
    }

    public remove(id: string): void {
        this.db.withTransactionSync(() => {
            this.db.runSync("DELETE FROM brew_frames WHERE brewId = ?;", [id]);
            this.db.runSync("DELETE FROM brew_samples WHERE brewId = ?;", [id]);
            this.db.runSync("DELETE FROM brews WHERE id = ?;", [id]);
        });
    }

    public clear(): void {
        // One transaction, not a loop over remove(): a half-cleared history
        // (some brews gone, some still there) is worse than a failed clear.
        this.db.withTransactionSync(() => {
            this.db.runSync("DELETE FROM brew_frames");
            this.db.runSync("DELETE FROM brew_samples");
            this.db.runSync("DELETE FROM brews");
        });
    }

    /**
     * Drop the streams of every brew older than the `keep` most recent, and
     * mark those records as having no trace. The records themselves stay:
     * history is complete, only the detail behind it expires.
     *
     * Written as a read then a loop rather than one nested DELETE because the
     * row counts are dozens and this version can be checked by reading it.
     */
    public sweep(keep: number): void {
        // A nonsense keep count would slice from zero and quietly expire every
        // trace the user has. Refuse rather than delete on a bad number.
        if (!Number.isFinite(keep) || keep < 0) return;
        // A pinned brew is outside the sweep entirely, and is not counted
        // against `keep` either: holding one back must not push an unpinned
        // brew over the edge, or pinning a favourite would quietly cost the
        // most recent ordinary brew its trace.
        const expiring = this.all()
            .filter((b) => !b.pinned)
            .slice(keep)
            .filter((b) => b.hasStream);
        if (expiring.length === 0) return;
        this.db.withTransactionSync(() => {
            expiring.forEach((brew) => {
                this.db.runSync("DELETE FROM brew_frames WHERE brewId = ?;", [brew.id]);
                this.db.runSync("DELETE FROM brew_samples WHERE brewId = ?;", [brew.id]);
                this.db.runSync("UPDATE brews SET hasStream = 0 WHERE id = ?;", [brew.id]);
            });
        });
    }
}

function hydrate(row: BrewRow): StoredBrew {
    const stalls = jsonOf<Stall[]>(row.stalls);
    const plan = jsonOf<PlanStage>(row.plan);
    const stageWater = jsonOf<number>(row.stageWater);
    const coffee = coffeeFromStoredColumn(row.coffee);
    return {
        id: row.id,
        recipeUuid: row.recipeUuid,
        recipeName: row.recipeName,
        accent: row.accent,
        startedAt: row.startedAt,
        pouringAt: row.pouringAt ?? 0,
        endedAt: row.endedAt,
        outcome: row.outcome as BrewOutcome,
        // SQLite has no undefined and no boolean; a missing reason must come
        // back as null, not as the string "null".
        failure: (row.failure ?? null) as BrewFailure | null,
        pours: row.pours,
        waterTotal: row.waterTotal,
        cupTotal: row.cupTotal,
        heldSeconds: row.heldSeconds,
        ...(stalls.length > 0 ? {stalls} : {}),
        ...(plan.length > 0 ? {plan} : {}),
        ...(stageWater.length > 0 ? {stageWater} : {}),
        rating: row.rating ?? 0,
        note: row.note ?? "",
        pinned: row.pinned === 1,
        // Emitted only when false, so a watched brew's record is byte for byte
        // what it was before this column existed and the round trip stays
        // honest about "absent means the app saw it".
        ...(row.watched === 0 ? {watched: false} : {}),
        ...(row.dose > 0 ? {dose: row.dose} : {}),
        ...(row.ratio > 0 ? {ratio: row.ratio} : {}),
        ...(row.grindSize > 0 ? {grindSize: row.grindSize} : {}),
        ...(row.grinderRpm > 0 ? {grinderRpm: row.grinderRpm} : {}),
        // The boolean's 0 default is indistinguishable from a recorded false.
        // A recorded grind size is the marker that this row knew the column.
        ...(row.grindSize > 0 ? {grinderUsed: row.grinderUsed === 1} : {}),
        ...(coffee !== null ? {coffee} : {}),
        hasStream: row.hasStream === 1
    };
}

function coffeeFromStoredColumn(value: string): PodCoffee | null {
    if (value === "") return null;
    try {
        return podCoffeeFromStored(JSON.parse(value));
    } catch {
        return null;
    }
}

function jsonOf<T>(value: string | null): T[] {
    if (value === null) return [];
    try {
        const parsed = JSON.parse(value) as T[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export default BrewDatabase;
