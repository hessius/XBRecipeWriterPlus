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

export function createTestDatabase(): FakeSQLiteDatabase {
    const db = new DatabaseSync(":memory:");
    return {
        execSync: (source) => {
            db.exec(source);
        },
        runSync: (source, params = []) => {
            const result = db.prepare(source).run(...(params as never[]));
            return {
                changes: Number(result.changes),
                lastInsertRowId: Number(result.lastInsertRowid)
            };
        },
        getFirstSync: (source, params = []) =>
            plain(db.prepare(source).get(...(params as never[]))),
        getAllSync: (source, params = []) =>
            db.prepare(source).all(...(params as never[])).map(plain),
        withTransactionSync: (task) => {
            db.exec("BEGIN");
            try {
                task();
                db.exec("COMMIT");
            } catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
        }
    };
}
