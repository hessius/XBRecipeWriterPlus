import {DatabaseSync} from "node:sqlite";

/**
 * A real SQLite database presenting `expo-sqlite`'s synchronous surface.
 *
 * `expo-sqlite` is a native module with no implementation under Jest. The
 * previous stand-in was an in-memory array that pattern-matched a handful of
 * query shapes, which was enough while the schema was one table of two
 * columns and became useless the moment the schema had columns, collations
 * and migrations to get right.
 *
 * Node ships SQLite, so the tests can simply use it. A test that says a
 * migration worked now means it.
 */
/**
 * The database behind this type is now real (`node:sqlite`), so the `Fake`
 * prefix is a slight misnomer; it is kept because ten downstream tasks and the
 * plan doc reference the name, and renaming it buys nothing but churn.
 */
export type FakeSQLiteDatabase = {
    execSync: (source: string) => void;
    runSync: (source: string, params?: unknown[]) => {changes: number; lastInsertRowId: number};
    getFirstSync: (source: string, params?: unknown[]) => unknown;
    getAllSync: (source: string, params?: unknown[]) => unknown[];
    withTransactionSync: (task: () => void) => void;
};

/**
 * Rows come back from `node:sqlite` with a null prototype, which Jest's
 * `toEqual` reports as unequal to a plain object literal. Copying them makes
 * failures readable.
 */
function plain(row: unknown): unknown {
    return row === undefined || row === null ? null : {...(row as object)};
}

/**
 * `node:sqlite` throws on a `boolean` or `undefined` bind value, but
 * `expo-sqlite` does not: its `normalizeParams` (paramUtils.js) coerces
 * `boolean` to `1`/`0` and `undefined` to `null` via `value ?? null`, and
 * `boolean` is part of the public `SQLiteBindValue` type. Reproducing that here
 * keeps the harness faithful — a call site binding a JS boolean or an
 * occasionally-`undefined` field works on a device and must work here too, so a
 * test never demands that working device code be "fixed" to satisfy it. Blobs
 * and every other type (including `bigint`) pass through unchanged, matching the
 * real coercion exactly; no extra coercions are invented.
 */
function normalizeParams(params: unknown[]): unknown[] {
    return params.map((value) => {
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
            return value;
        }
        if (typeof value === "boolean") {
            return value ? 1 : 0;
        }
        return value ?? null;
    });
}

export function createTestDatabase(): FakeSQLiteDatabase {
    const db = new DatabaseSync(":memory:");
    return {
        execSync: (source) => {
            db.exec(source);
        },
        runSync: (source, params = []) => {
            // Note: on a SELECT this returns no rows and a stale `changes`;
            // callers wanting rows must use getFirst/getAllSync.
            const result = db
                .prepare(source)
                .run(...(normalizeParams(params) as never[]));
            return {
                changes: Number(result.changes),
                lastInsertRowId: Number(result.lastInsertRowid)
            };
        },
        getFirstSync: (source, params = []) =>
            plain(db.prepare(source).get(...(normalizeParams(params) as never[]))),
        getAllSync: (source, params = []) =>
            db
                .prepare(source)
                .all(...(normalizeParams(params) as never[]))
                .map(plain),
        withTransactionSync: (task) => {
            // BEGIN is deliberately inside the try, mirroring expo-sqlite's
            // withTransactionSync (SQLiteDatabase.js). It matters on a nested
            // transaction: the inner BEGIN throws, its own catch runs ROLLBACK
            // and rethrows, then this outer catch runs ROLLBACK again on a
            // now-inactive transaction and throws "cannot rollback - no
            // transaction is active" — a secondary error that masks the
            // meaningful "cannot start a transaction within a transaction".
            // That masking is expo-sqlite's real behaviour and is copied on
            // purpose; do not move BEGIN out of the try to "improve" the error.
            try {
                db.exec("BEGIN");
                task();
                db.exec("COMMIT");
            } catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
        }
    };
}
