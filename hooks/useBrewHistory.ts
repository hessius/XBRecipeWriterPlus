import {useState} from "react";

import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import BrewDatabase, {type BrewSummary, type StoredBrew} from "@/library/BrewDatabase";

/** The part of `BrewDatabase` history reads. Injected, so tests need no SQLite. */
export type HistoryStore = {
    all: () => StoredBrew[];
    get: (id: string) => StoredBrew | null;
    samples: (id: string) => BrewSample[];
    frames: (id: string) => string;
    remove: (id: string) => void;
    clear: () => void;
    insert: (record: BrewRecord, samples: BrewSample[], frames?: string) => void;
    sweep: (keep: number) => void;
};

let shared: BrewDatabase | undefined;

/** One database for the app, opened on first use rather than on import. */
export function sharedBrewDatabase(): BrewDatabase {
    if (shared === undefined) shared = new BrewDatabase();
    return shared;
}

/** The one method the recipe screen's summary needs. Injected by its tests. */
export type BrewSummaryStore = {summaryFor: (recipeUuid: string) => BrewSummary};

/**
 * How one recipe has gone, read once when the editor opens.
 *
 * Read in a state initialiser rather than an effect, which this codebase does
 * not allow to seed state, and not re-read while the screen is open: a brew
 * cannot be recorded from inside the editor, so there is nothing for a
 * subscription to hear.
 */
export function useRecipeBrewSummary(
    recipeUuid: string, store?: BrewSummaryStore
): BrewSummary {
    const [summary] = useState(
        () => (store ?? sharedBrewDatabase()).summaryFor(recipeUuid)
    );
    return summary;
}

/** The two writes a judgement makes. Injected by tests. */
export type JudgementStore = {
    judge: (id: string, judgement: {rating?: number; note?: string}) => void;
    setPinned: (id: string, pinned: boolean) => void;
};

export type Judgement = {rating: number; note: string; pinned: boolean};

/**
 * A verdict on a brew, held locally and written through.
 *
 * The id is resolved when the user acts rather than when the screen renders,
 * which is what lets the finished-brew screen use this hook at all: at the
 * moment it draws, the run may not have written its row yet, and reading the
 * store in render would be both a purity problem and a wrong answer. The same
 * rule the export already follows, for the same reason.
 *
 * A note that has not changed is not written. A text field commits on blur
 * whether or not it was edited, so without this a user who tapped into the
 * field and out again would pin a brew they never judged.
 */
export function useBrewJudgement(
    resolveId: () => string | null,
    initial: Judgement,
    store?: JudgementStore
) {
    const [judgement, setJudgement] = useState<Judgement>(initial);
    // Resolved per write, not in render, so a screen that draws without ever
    // being judged never opens the database.
    const database = () => store ?? sharedBrewDatabase();

    function rate(rating: number): void {
        const id = resolveId();
        if (id === null) return;
        setJudgement((was) => ({...was, rating, pinned: true}));
        database().judge(id, {rating});
    }

    function annotate(note: string): void {
        if (note === judgement.note) return;
        const id = resolveId();
        if (id === null) return;
        setJudgement((was) => ({...was, note, pinned: true}));
        database().judge(id, {note});
    }

    function setPinned(pinned: boolean): void {
        const id = resolveId();
        if (id === null) return;
        setJudgement((was) => ({...was, pinned}));
        database().setPinned(id, pinned);
    }

    return {...judgement, rate, annotate, setPinned};
}

/**
 * The brew history: list, open, delete.
 *
 * @param store Injected by tests. Production call sites omit it.
 */
export function useBrewHistory(store?: HistoryStore) {
    const database = store ?? sharedBrewDatabase();
    const [brews, setBrews] = useState<StoredBrew[]>(() => database.all());

    function open(
        id: string
    ): {record: StoredBrew; samples: BrewSample[]; frames: string} | null {
        const found = database.get(id);
        // The mini-bar and a deep link can both outlive the record they name.
        if (found === null) return null;
        return {record: found, samples: database.samples(id), frames: database.frames(id)};
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
