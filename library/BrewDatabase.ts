import * as SQLite from "expo-sqlite";

import type {BrewFailure} from "./machine/Machine";
import type {BrewOutcome, BrewRecord, BrewSample} from "./brew/BrewRecord";

/** A record as it comes back out, with whether its stream survived retention. */
export type StoredBrew = BrewRecord & {hasStream: boolean};

type BrewRow = {
    id: string;
    recipeUuid: string;
    recipeName: string;
    accent: string;
    startedAt: number;
    endedAt: number;
    outcome: string;
    failure: string | null;
    pours: number;
    waterTotal: number;
    cupTotal: number;
    heldSeconds: number;
    hasStream: number;
};

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
        this.createTable();
    }

    private createTable(): void {
        this.db.execSync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS brews (
                id TEXT PRIMARY KEY NOT NULL,
                recipeUuid TEXT NOT NULL,
                recipeName TEXT NOT NULL,
                accent TEXT NOT NULL,
                startedAt INTEGER NOT NULL,
                endedAt INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                failure TEXT,
                pours INTEGER NOT NULL,
                waterTotal REAL NOT NULL,
                cupTotal REAL NOT NULL,
                heldSeconds INTEGER NOT NULL,
                hasStream INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS brew_samples (
                brewId TEXT PRIMARY KEY NOT NULL,
                stream TEXT NOT NULL
            );`);
    }

    public insert(record: BrewRecord, samples: BrewSample[]): void {
        // One transaction, so a brew never half-exists: a record with a
        // truncated stream would draw a trace that stops in mid-air.
        this.db.withTransactionSync(() => {
            this.db.runSync(
                `INSERT INTO brews (id, recipeUuid, recipeName, accent, startedAt, endedAt,
                                    outcome, failure, pours, waterTotal, cupTotal,
                                    heldSeconds, hasStream)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                    record.id, record.recipeUuid, record.recipeName, record.accent,
                    record.startedAt, record.endedAt, record.outcome, record.failure,
                    record.pours, record.waterTotal, record.cupTotal, record.heldSeconds,
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
        });
    }

    public all(): StoredBrew[] {
        return this.db
            .getAllSync<BrewRow>("SELECT * FROM brews ORDER BY startedAt DESC;")
            .map(hydrate);
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

    public remove(id: string): void {
        this.db.withTransactionSync(() => {
            this.db.runSync("DELETE FROM brew_samples WHERE brewId = ?;", [id]);
            this.db.runSync("DELETE FROM brews WHERE id = ?;", [id]);
        });
    }

    public clear(): void {
        // One transaction, not a loop over remove(): a half-cleared history
        // (some brews gone, some still there) is worse than a failed clear.
        this.db.withTransactionSync(() => {
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
        const expiring = this.all().slice(Math.max(0, keep)).filter((b) => b.hasStream);
        if (expiring.length === 0) return;
        this.db.withTransactionSync(() => {
            expiring.forEach((brew) => {
                this.db.runSync("DELETE FROM brew_samples WHERE brewId = ?;", [brew.id]);
                this.db.runSync("UPDATE brews SET hasStream = 0 WHERE id = ?;", [brew.id]);
            });
        });
    }
}

function hydrate(row: BrewRow): StoredBrew {
    return {
        id: row.id,
        recipeUuid: row.recipeUuid,
        recipeName: row.recipeName,
        accent: row.accent,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        outcome: row.outcome as BrewOutcome,
        // SQLite has no undefined and no boolean; a missing reason must come
        // back as null, not as the string "null".
        failure: (row.failure ?? null) as BrewFailure | null,
        pours: row.pours,
        waterTotal: row.waterTotal,
        cupTotal: row.cupTotal,
        heldSeconds: row.heldSeconds,
        hasStream: row.hasStream === 1
    };
}

export default BrewDatabase;
