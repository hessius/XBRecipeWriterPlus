import {openDatabaseSync, type SQLiteDatabase} from "expo-sqlite";

/**
 * The one name, kept for the reason it has always been kept: renaming it would
 * orphan every recipe already on a phone. `RecipeDatabase`, `BrewDatabase` and
 * `Settings` are three views of this single file.
 */
const DATABASE_NAME = "xbrecipewriter.db";

let open: SQLiteDatabase | null = null;

/**
 * The app's database, opened exactly once.
 *
 * `RecipeDatabase`, `BrewDatabase` and `Settings` used to call
 * `openDatabaseSync` themselves, and the call sites build them freely -- a
 * `new RecipeDatabase()` inside a save handler, another inside an effect. On
 * iOS that was merely wasteful. On Android it crashed the process, and the
 * mechanism is worth writing down because the stack trace points nowhere near
 * it.
 *
 * expo-sqlite's Android module keeps a cache of open databases keyed by path,
 * so the second and third `openDatabaseSync` of the same name hand back the
 * *same* native `NativeDatabase` and bump its reference count. But that object
 * is a `SharedRef`, and its `sharedObjectDidRelease` calls `ref.close()`
 * without consulting the reference count. So the first throwaway JS wrapper to
 * be garbage-collected closes the one native handle the whole app is still
 * using, and every query after it dies with
 *
 *   Call to function 'NativeDatabase.prepareSync' has been rejected.
 *   Caused by: java.lang.NullPointerException
 *
 * which is fatal in a release build. It lands on whichever query runs next, so
 * the reported line is never the same twice and never the culprit.
 *
 * Holding one handle for the life of the process removes the second wrapper
 * and with it the collection that closes the first.
 */
export function appDatabase(): SQLiteDatabase {
    return (open ??= openDatabaseSync(DATABASE_NAME));
}

/**
 * Drop the handle so the next caller opens again. Tests only.
 *
 * Every suite that exercises the schema mocks `openDatabaseSync` to return a
 * fresh in-memory database per call, which is what keeps one test's rows out
 * of the next one's. Memoising here would quietly undo that, so
 * `jest.afterEnv.js` calls this between tests.
 */
export function forgetAppDatabase(): void {
    open = null;
}
