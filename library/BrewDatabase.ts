import * as SQLite from "expo-sqlite";

import {
    COUNTED_SQL,
    MEASURED_SQL,
    RATED_SQL,
    TIMED_SQL
} from "@/library/brew/brewPopulation";
import type {BrewFailure} from "./machine/Machine";
import {isRating} from "./brew/BrewRecord";
import {
    BEAN_FIELDS,
    isFermentation,
    isProcess,
    isRoast,
    MAX_ORIGIN_LENGTH,
    normaliseBeanTags
} from "./brew/beanTags";
import type {
    BeanProfile,
    BeanProfileRow,
    ProfileField
} from "@/library/beanProfile";
import type {
    BrewOutcome,
    BrewRecord,
    BrewSample,
    BypassRecord,
    PlanStage
} from "./brew/BrewRecord";
import type {Stall} from "./brew/stalls";
import type {PodCoffee} from "./podCoffee";
import {podCoffeeFromStored} from "./podCoffee";
import {tagKey} from "./tagKey";

/** A record as it comes back out, with whether its stream survived retention. */
export type StoredBrew = BrewRecord & {hasStream: boolean};

/** How a recipe has gone: how many cups, and what the evidence says. */
export type BrewSummary = {
    /** Counted brews only: cups the user could drink. */
    times: number;
    /** The latest counted brew, or 0 when there is no such cup. */
    lastAt: number;
    /**
     * The average over rated brews only, or 0 where none were.
     *
     * Rated means counted and `rating > 0`: a verdict on a cancelled brew does
     * not move the average printed beside a count it did not join.
     */
    avgRating: number;
    /** How many rated brews entered `avgRating`. */
    rated: number;
    /** How many timed brews entered `meanBrewSeconds`; when 0, the mean is meaningless. */
    timed: number;
    /** Mean seconds over timed brews: counted, watched, and with a first drop. */
    meanBrewSeconds: number;
    /** How many measured brews entered `meanCupMl`; when 0, the mean is meaningless. */
    measured: number;
    /** Mean cup volume over measured brews: counted and watched. */
    meanCupMl: number;
    /** Rows for this recipe that did not count as cups. */
    abandoned: number;
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
    /** JSON, the bypass as it stood. `''` on rows written before it. */
    bypass: string;
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
    /** The user's own description of the coffee. `''` when they have not said. */
    origin: string;
    roast: string;
    process: string;
    fermentation: string;
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
            );
            CREATE TABLE IF NOT EXISTS brew_samples (
                brewId TEXT PRIMARY KEY NOT NULL,
                stream TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS brew_frames (
                brewId TEXT PRIMARY KEY NOT NULL,
                frames TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS brew_tags (
                brewId TEXT NOT NULL,
                tag TEXT NOT NULL,
                tagKey TEXT NOT NULL,
                PRIMARY KEY (brewId, tagKey)
            );
            CREATE INDEX IF NOT EXISTS idx_brew_tags_key ON brew_tags(tagKey);
            CREATE INDEX IF NOT EXISTS idx_brews_recipeUuid ON brews(recipeUuid);`);
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
    // The coffee the user said this was. `''` is "nobody has said", the same
    // sentinel `coffee` already uses on this table.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN origin TEXT NOT NULL DEFAULT '';");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN roast TEXT NOT NULL DEFAULT '';");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN process TEXT NOT NULL DEFAULT '';");
    } catch {
        // Already there.
    }
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN fermentation TEXT NOT NULL DEFAULT '';");
    } catch {
        // Already there.
    }
    // Rows written before `bypass` existed read as "no bypass", exactly as
    // every recipe without one does; an empty string is the JSON-column
    // sentinel already used by `coffee`.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN bypass TEXT NOT NULL DEFAULT '';");
    } catch {
        // Already there.
    }
}

/**
 * The column each preset field lives in.
 *
 * A literal map this module owns, not a name taken from anything a caller
 * passed. The four happen to match their field names today, and writing them
 * out is what keeps that a coincidence rather than a rule a later reader could
 * extend to a fifth field whose name came from somewhere else.
 */
const PROFILE_COLUMN: Record<typeof BEAN_FIELDS[number], string> = {
    origin: "origin",
    roast: "roast",
    process: "process",
    fermentation: "fermentation"
};

/**
 * A counted brew carrying nothing about its coffee.
 *
 * All four columns empty *and* no custom tag. The `NOT EXISTS` is the half that
 * is easy to forget, and forgetting it would file every custom-tagged brew
 * under NOT TAGGED, which is the one row the design leans on being right.
 */
const UNTAGGED_SQL = `(b.origin = '' AND b.roast = '' AND b.process = ''
    AND b.fermentation = ''
    AND NOT EXISTS (SELECT 1 FROM brew_tags t WHERE t.brewId = b.id))`;

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
    /**
     * The one statement that writes a brew row, for both a live brew and a
     * restore. Shared rather than written twice because it already went wrong
     * once: the restore path named a shorter column list, so a brew that came
     * back from a backup silently lost its dose, ratio, grinder and bypass --
     * the very figures an export hands to another app.
     *
     * @param hasStream whether a stream is being written alongside. A restore
     * never carries one: a backup holds records, not the sample streams, which
     * is what `false` says here.
     */
    private writeBrewRow(record: BrewRecord, hasStream: boolean): void {
        this.db.runSync(
            `INSERT INTO brews (id, recipeUuid, recipeName, accent, startedAt, pouringAt,
                                endedAt, outcome, failure, pours, waterTotal, cupTotal,
                                heldSeconds, stalls, plan, stageWater, bypass,
                                rating, note, pinned, watched, dose, ratio,
                                grindSize, grinderRpm, grinderUsed, coffee,
                                origin, roast, process, fermentation, hasStream)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
                record.id, record.recipeUuid, record.recipeName, record.accent,
                record.startedAt, record.pouringAt ?? 0,
                record.endedAt, record.outcome, record.failure,
                record.pours, record.waterTotal, record.cupTotal, record.heldSeconds,
                JSON.stringify(record.stalls ?? []),
                JSON.stringify(record.plan ?? []),
                JSON.stringify(record.stageWater ?? []),
                record.bypass ? JSON.stringify(record.bypass) : "",
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
                originForColumn(record.origin),
                isRoast(record.roast) ? record.roast : "",
                isProcess(record.process) ? record.process : "",
                isFermentation(record.fermentation) ? record.fermentation : "",
                hasStream ? 1 : 0
            ]
        );
    }

    public insert(record: BrewRecord, samples: BrewSample[], frames = ""): void {
        // One transaction, so a brew never half-exists: a record with a
        // truncated stream would draw a trace that stops in mid-air.
        this.db.withTransactionSync(() => {
            this.writeBrewRow(record, samples.length > 0);
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
            this.writeTags(record.id, record.tags ?? []);
        });
    }

    public all(): StoredBrew[] {
        const brews = this.db
            .getAllSync<BrewRow>("SELECT * FROM brews ORDER BY startedAt DESC;")
            .map(hydrate);
        return this.attachTags(brews);
    }

    /**
     * The rows for one recipe, newest first.
     *
     * Unlike `summaryFor`, this deliberately returns cancelled, failed and
     * lost-contact rows too. Aggregates answer "how many cups"; history is a
     * diary, and a stopped brew is still something the user may need to see.
     */
    public brewsFor(recipeUuid: string): StoredBrew[] {
        const brews = this.db
            .getAllSync<BrewRow>(
                "SELECT * FROM brews WHERE recipeUuid = ? ORDER BY startedAt DESC;",
                [recipeUuid]
            )
            .map(hydrate);
        return this.attachTags(brews);
    }

    /**
     * How a recipe has gone, in the figures the ABOUT deck asks for.
     *
     * Counted in SQL rather than by reading the rows, because the editor asks
     * this on open and the answer is a few numbers: pulling every brew of a
     * much-used recipe across to count them would be work done to throw away.
     *
     * `lastAt` is 0 for a recipe never brewed, matching the sentinel the rest
     * of the app uses for a timestamp that does not exist.
     */
    public summaryFor(recipeUuid: string): BrewSummary {
        const rows = this.db.getAllSync<{
            times: number; lastAt: number | null;
            avgRating: number | null; rated: number;
            timed: number; measured: number;
            meanBrewSeconds: number | null; meanCupMl: number | null;
            abandoned: number;
        }>(
            `SELECT
                    COALESCE(SUM(CASE WHEN ${COUNTED_SQL} THEN 1 ELSE 0 END), 0) AS times,
                    MAX(CASE WHEN ${COUNTED_SQL} THEN startedAt END) AS lastAt,
                    AVG(CASE WHEN ${RATED_SQL} THEN rating END) AS avgRating,
                    COUNT(CASE WHEN ${RATED_SQL} THEN 1 END) AS rated,
                    COUNT(CASE WHEN ${TIMED_SQL} THEN 1 END) AS timed,
                    AVG(CASE WHEN ${TIMED_SQL} THEN (endedAt - pouringAt) / 1000.0 END)
                        AS meanBrewSeconds,
                    COUNT(CASE WHEN ${MEASURED_SQL} THEN 1 END) AS measured,
                    AVG(CASE WHEN ${MEASURED_SQL} THEN cupTotal END) AS meanCupMl,
                    COALESCE(SUM(CASE WHEN NOT (${COUNTED_SQL}) THEN 1 ELSE 0 END), 0)
                        AS abandoned
             FROM brews WHERE recipeUuid = ?;`,
            [recipeUuid]
        );
        const row = rows[0];
        if (row === undefined) {
            return {
                times: 0, lastAt: 0, avgRating: 0, rated: 0,
                timed: 0, meanBrewSeconds: 0, measured: 0, meanCupMl: 0,
                abandoned: 0
            };
        }
        // SQL means over empty populations are NULL. The app's summary
        // sentinel is 0 here too: it means "nothing to average", not zero ml
        // in the cup or a zero-second brew.
        return {
            times: row.times,
            lastAt: row.lastAt ?? 0,
            avgRating: row.avgRating ?? 0,
            rated: row.rated,
            timed: row.timed,
            meanBrewSeconds: row.meanBrewSeconds ?? 0,
            measured: row.measured,
            meanCupMl: row.meanCupMl ?? 0,
            abandoned: row.abandoned
        };
    }

    /**
     * What this recipe has been brewed with, and how those brews went.
     *
     * The one place that knows how a profile is derived, for the reason #98
     * gives about answering "what has this recipe done?" once rather than four
     * times in four screens. Derived at query time and written nowhere: re-rating
     * a brew changes the answer with no migration and no repair step.
     *
     * Five sources in one union -- the four preset columns and `brew_tags` --
     * every one of them scoped by `COUNTED_SQL` and rated by `RATED_SQL` spliced
     * from `brewPopulation.ts` rather than restated here. A cancelled brew
     * cannot inflate a row exactly as it cannot inflate the card's evidence
     * line, and it cannot come to differ from it either.
     *
     * The custom rows group on `tagKey`, the folded form, so two spellings of
     * one tag are one row; `MIN(t.tag)` picks the displayed spelling
     * deterministically rather than letting SQLite hand back whichever row it
     * reached first.
     *
     * Origin is the recorded column only and deliberately does not follow
     * `resolvedOrigin`'s fallback into the stored pod blob. The library filter
     * compares the column, so a row derived from the blob would be a row the
     * filter cannot reproduce, and tapping it would open an empty library.
     */
    public beanProfileFor(recipeUuid: string): BeanProfile {
        const presets = BEAN_FIELDS.map((field) => `
            SELECT '${field}' AS field, ${PROFILE_COLUMN[field]} AS value,
                   COUNT(*) AS brews,
                   COUNT(CASE WHEN ${RATED_SQL} THEN 1 END) AS rated,
                   AVG(CASE WHEN ${RATED_SQL} THEN rating END) AS avgRating
            FROM brews
            WHERE recipeUuid = ? AND ${COUNTED_SQL}
              AND ${PROFILE_COLUMN[field]} <> ''
            GROUP BY ${PROFILE_COLUMN[field]}`);

        const custom = `
            SELECT 'custom' AS field, MIN(t.tag) AS value,
                   COUNT(*) AS brews,
                   COUNT(CASE WHEN ${RATED_SQL} THEN 1 END) AS rated,
                   AVG(CASE WHEN ${RATED_SQL} THEN rating END) AS avgRating
            FROM brews b JOIN brew_tags t ON t.brewId = b.id
            WHERE b.recipeUuid = ? AND ${COUNTED_SQL}
            GROUP BY t.tagKey`;

        const rows = this.db.getAllSync<{
            field: string; value: string; brews: number;
            rated: number; avgRating: number | null;
        }>(
            `${[...presets, custom].join("\nUNION ALL\n")};`,
            [...BEAN_FIELDS.map(() => recipeUuid), recipeUuid]
        ).map((row): BeanProfileRow => ({
            field: row.field as ProfileField,
            value: row.value,
            brews: row.brews,
            rated: row.rated,
            // SQL's AVG over an empty population is NULL. 0 is the app's
            // sentinel for "nothing to average" throughout, and the ledger
            // prints the figure only when it is above 0.
            avgRating: row.avgRating ?? 0
        }));

        const totals = this.db.getFirstSync<{
            counted: number; untaggedBrews: number;
            untaggedRated: number; untaggedAvg: number | null;
        }>(
            `SELECT COUNT(*) AS counted,
                    COUNT(CASE WHEN ${UNTAGGED_SQL} THEN 1 END) AS untaggedBrews,
                    COUNT(CASE WHEN ${UNTAGGED_SQL} AND ${RATED_SQL} THEN 1 END)
                        AS untaggedRated,
                    AVG(CASE WHEN ${UNTAGGED_SQL} AND ${RATED_SQL} THEN rating END)
                        AS untaggedAvg
             FROM brews b
             WHERE b.recipeUuid = ? AND ${COUNTED_SQL};`,
            [recipeUuid]
        );

        return {
            rows,
            untagged: {
                brews: totals?.untaggedBrews ?? 0,
                rated: totals?.untaggedRated ?? 0,
                avgRating: totals?.untaggedAvg ?? 0
            },
            counted: totals?.counted ?? 0
        };
    }

    /**
     * The latest brew of this recipe on the same day as `at`, if there is one.
     *
     * The recipe screen's star has one gesture and two outcomes: it rates
     * today's brew where there is one, and writes a hand-logged brew where
     * there is not. This is the question that chooses between them, and the
     * brew it returns must be one a rating can mean something on: judging a
     * cancelled brew would be a verdict the recipe's average rightly ignores.
     *
     * Asked in local days rather than in hours because "today" is what the user
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
             AND ${COUNTED_SQL}
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
                this.writeBrewRow(record, false);
                this.writeTags(record.id, record.tags ?? []);
            });
        });
        return toAdd.length;
    }

    public get(id: string): StoredBrew | null {
        const rows = this.db.getAllSync<BrewRow>(
            "SELECT * FROM brews WHERE id = ?;", [id]
        );
        return rows.length > 0 ? {...hydrate(rows[0]), tags: this.tagsFor(id)} : null;
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
            this.db.runSync("DELETE FROM brew_tags WHERE brewId = ?;", [id]);
            this.db.runSync("DELETE FROM brews WHERE id = ?;", [id]);
        });
    }

    public clear(): void {
        // One transaction, not a loop over remove(): a half-cleared history
        // (some brews gone, some still there) is worse than a failed clear.
        this.db.withTransactionSync(() => {
            this.db.runSync("DELETE FROM brew_frames");
            this.db.runSync("DELETE FROM brew_samples");
            this.db.runSync("DELETE FROM brew_tags");
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

    /**
     * Replace a brew's rows in `brew_tags`, delete then insert.
     *
     * Delete first so an edit cannot leave a tag the user removed, and shared
     * by every path that writes tags so an update and a rebuild produce
     * identical rows.
     */
    private writeTags(brewId: string, tags: readonly string[]): void {
        this.db.runSync("DELETE FROM brew_tags WHERE brewId = ?;", [brewId]);
        for (const tag of normaliseBeanTags(tags)) {
            this.db.runSync(
                "INSERT OR IGNORE INTO brew_tags (brewId, tag, tagKey) VALUES (?, ?, ?);",
                [brewId, tag, tagKey(tag)]
            );
        }
    }

    /** One brew's tags, in the order they were written. */
    public tagsFor(brewId: string): string[] {
        return this.db
            .getAllSync<{tag: string}>(
                "SELECT tag FROM brew_tags WHERE brewId = ? ORDER BY rowid;",
                [brewId]
            )
            .map((row) => row.tag);
    }

    /**
     * The tags for a set of brews, in one query.
     *
     * One query rather than one per brew: a much-used recipe's history is
     * hundreds of rows and this runs when the history screen opens.
     */
    private tagsForAll(brewIds: readonly string[]): Map<string, string[]> {
        const byBrew = new Map<string, string[]>();
        if (brewIds.length === 0) return byBrew;
        const holes = brewIds.map(() => "?").join(", ");
        const rows = this.db.getAllSync<{brewId: string; tag: string}>(
            `SELECT brewId, tag FROM brew_tags WHERE brewId IN (${holes}) ORDER BY rowid;`,
            [...brewIds]
        );
        for (const row of rows) {
            const existing = byBrew.get(row.brewId);
            if (existing === undefined) byBrew.set(row.brewId, [row.tag]);
            else existing.push(row.tag);
        }
        return byBrew;
    }

    private attachTags(brews: StoredBrew[]): StoredBrew[] {
        const tags = this.tagsForAll(brews.map((brew) => brew.id));
        return brews.map((brew) => ({...brew, tags: tags.get(brew.id) ?? []}));
    }
}

function hydrate(row: BrewRow): StoredBrew {
    const stalls = jsonOf<Stall[]>(row.stalls);
    const plan = jsonOf<PlanStage>(row.plan);
    const stageWater = jsonOf<number>(row.stageWater);
    const bypass = bypassFromStoredColumn(row.bypass);
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
        ...(bypass !== null ? {bypass} : {}),
        ...(row.dose > 0 ? {dose: row.dose} : {}),
        ...(row.ratio > 0 ? {ratio: row.ratio} : {}),
        ...(row.grindSize > 0 ? {grindSize: row.grindSize} : {}),
        ...(row.grinderRpm > 0 ? {grinderRpm: row.grinderRpm} : {}),
        // The boolean's 0 default is indistinguishable from a recorded false.
        // A recorded grind size is the marker that this row knew the column.
        ...(row.grindSize > 0 ? {grinderUsed: row.grinderUsed === 1} : {}),
        ...(coffee !== null ? {coffee} : {}),
        ...(row.origin !== "" ? {origin: row.origin} : {}),
        ...(isRoast(row.roast) ? {roast: row.roast} : {}),
        ...(isProcess(row.process) ? {process: row.process} : {}),
        ...(isFermentation(row.fermentation) ? {fermentation: row.fermentation} : {}),
        hasStream: row.hasStream === 1
    };
}

/**
 * An origin fit to store: trimmed, and refused if it is not a plausible one.
 *
 * Refused rather than truncated. A truncated origin is a different place, and
 * #104 would group it on its own.
 */
function originForColumn(value: string | undefined): string {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return trimmed.length === 0 || trimmed.length > MAX_ORIGIN_LENGTH ? "" : trimmed;
}

function coffeeFromStoredColumn(value: string): PodCoffee | null {
    if (value === "") return null;
    try {
        return podCoffeeFromStored(JSON.parse(value));
    } catch {
        return null;
    }
}

function bypassFromStoredColumn(value: string): BypassRecord | null {
    if (value === "") return null;
    try {
        const parsed = JSON.parse(value) as Partial<BypassRecord>;
        if (
            typeof parsed.volume !== "number"
            || typeof parsed.temperature !== "number"
            || typeof parsed.delivered !== "number"
            || !(typeof parsed.startedAt === "number" || parsed.startedAt === null)
        ) {
            return null;
        }
        return {
            volume: parsed.volume,
            temperature: parsed.temperature,
            delivered: parsed.delivered,
            startedAt: parsed.startedAt
        };
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
