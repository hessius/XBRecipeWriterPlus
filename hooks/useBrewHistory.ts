import {useState} from "react";

import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import BrewDatabase, {type StoredBrew} from "@/library/BrewDatabase";

/** The part of `BrewDatabase` history reads. Injected, so tests need no SQLite. */
export type HistoryStore = {
    all: () => StoredBrew[];
    get: (id: string) => StoredBrew | null;
    samples: (id: string) => BrewSample[];
    remove: (id: string) => void;
    clear: () => void;
    insert: (record: BrewRecord, samples: BrewSample[]) => void;
    sweep: (keep: number) => void;
};

let shared: BrewDatabase | undefined;

/** One database for the app, opened on first use rather than on import. */
export function sharedBrewDatabase(): BrewDatabase {
    if (shared === undefined) shared = new BrewDatabase();
    return shared;
}

/**
 * The brew history: list, open, delete.
 *
 * @param store Injected by tests. Production call sites omit it.
 */
export function useBrewHistory(store?: HistoryStore) {
    const database = store ?? sharedBrewDatabase();
    const [brews, setBrews] = useState<StoredBrew[]>(() => database.all());

    function open(id: string): {record: StoredBrew; samples: BrewSample[]} | null {
        const found = database.get(id);
        // The mini-bar and a deep link can both outlive the record they name.
        if (found === null) return null;
        return {record: found, samples: database.samples(id)};
    }

    function remove(id: string): void {
        database.remove(id);
        setBrews(database.all());
    }

    function clear(): void {
        database.clear();
        setBrews([]);
    }

    return {brews, open, remove, clear, refresh: () => setBrews(database.all())};
}

/**
 * Expire old streams, once, at launch.
 *
 * `keep` is the number of recent brews whose streams to preserve. When it is
 * zero every stream is swept — that is an explicit user choice and must not
 * silently fall back to a default.
 *
 * Not after each brew: it is a tidy-up, and running it on the way out of a brew
 * puts a delete in the moment the user most wants the app to be drawing them a
 * chart.
 */
export function sweepOnLaunch(store: Pick<HistoryStore, "sweep">, keep: number): void {
    store.sweep(keep);
}

export default useBrewHistory;
