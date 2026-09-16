import {createTestDatabase} from "@/test-utils/sqlite";

/**
 * These test the harness itself, not SQLite. The harness's whole job is to be
 * faithful to `expo-sqlite`, so faithfulness is what is asserted here: the two
 * places where a naive real-SQLite wrapper diverges from `expo-sqlite`, and the
 * handful of coercions a reader needs proof of.
 */
describe("createTestDatabase", () => {
    describe("withTransactionSync nesting", () => {
        it("surfaces expo-sqlite's masked secondary error, not the meaningful one", () => {
            const db = createTestDatabase();
            db.execSync("CREATE TABLE t (n INTEGER)");
            db.runSync("INSERT INTO t (n) VALUES (?)", [1]);

            let caught: unknown;
            try {
                db.withTransactionSync(() => {
                    db.runSync("INSERT INTO t (n) VALUES (?)", [2]);
                    db.withTransactionSync(() => {
                        db.runSync("INSERT INTO t (n) VALUES (?)", [3]);
                    });
                });
            } catch (error) {
                caught = error;
            }

            // expo-sqlite runs ROLLBACK inside the inner catch, so the outer
            // catch rolls back a now-inactive transaction and throws a second
            // time. The caller sees that secondary error, not the meaningful
            // "cannot start a transaction within a transaction".
            expect((caught as Error).message).toContain(
                "cannot rollback - no transaction is active"
            );

            // Data rollback is identical either way: only the row committed
            // before the transaction survives.
            expect(db.getAllSync("SELECT n FROM t ORDER BY n")).toEqual([{n: 1}]);
        });

        it("commits when the task succeeds", () => {
            const db = createTestDatabase();
            db.execSync("CREATE TABLE t (n INTEGER)");

            db.withTransactionSync(() => {
                db.runSync("INSERT INTO t (n) VALUES (?)", [7]);
            });

            expect(db.getAllSync("SELECT n FROM t")).toEqual([{n: 7}]);
        });
    });

    describe("parameter normalisation", () => {
        function storedValue(param: unknown): unknown {
            const db = createTestDatabase();
            db.execSync("CREATE TABLE t (v)");
            db.runSync("INSERT INTO t (v) VALUES (?)", [param]);
            return (db.getFirstSync("SELECT v FROM t") as {v: unknown}).v;
        }

        it("coerces boolean true to 1 and false to 0, like expo-sqlite", () => {
            expect(storedValue(true)).toBe(1);
            expect(storedValue(false)).toBe(0);
        });

        it("coerces undefined to null", () => {
            expect(storedValue(undefined)).toBeNull();
        });

        it("keeps null as null", () => {
            expect(storedValue(null)).toBeNull();
        });

        it("passes bigint through", () => {
            // normalizeParams leaves bigint untouched; node:sqlite reads
            // integers back as `number` by default.
            expect(storedValue(42n)).toBe(42);
        });

        it("normalises in getFirstSync and getAllSync too", () => {
            const db = createTestDatabase();
            db.execSync("CREATE TABLE t (v)");
            db.runSync("INSERT INTO t (v) VALUES (?)", [1]);

            expect(db.getFirstSync("SELECT v FROM t WHERE v = ?", [true])).toEqual({
                v: 1
            });
            expect(db.getAllSync("SELECT v FROM t WHERE v = ?", [true])).toEqual([
                {v: 1}
            ]);
        });
    });
});
