import {useState} from "react";

import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import {isRating, unobservedBrew} from "@/library/brew/BrewRecord";
import BrewDatabase, {type BrewSummary, type StoredBrew} from "@/library/BrewDatabase";
import type {BeanProfile} from "@/library/beanProfile";

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
export type BeanProfileStore = {beanProfileFor: (recipeUuid: string) => BeanProfile};

/**
 * What rating a recipe needs of the database. Injected by tests.
 *
 * Four methods rather than one, because the star on a recipe is one gesture
 * with two outcomes and the choice between them is a question only the table
 * can answer.
 */
export type RecipeRatingStore = BrewSummaryStore & {
    brewOn: (recipeUuid: string, at: number) => string | null;
    judge: (id: string, judgement: {rating?: number; note?: string}) => void;
    insert: (record: BrewRecord, samples: BrewSample[]) => void;
};

/**
 * The star on a recipe: rate today's brew, or record one nobody watched.
 *
 * One entry point, and the mechanism is never explained because it never needs
 * to be. In both cases the user has said this coffee was a four. If the app saw
 * the brew, the verdict lands on it; if it did not -- a card written, a cup made
 * at the machine -- it lands on a record carrying nothing else.
 *
 * It does not clear. `BrewStars` sends 0 when the lit star is pressed again,
 * which is how a brew is returned to unrated, but here the stars are a summary
 * of several brews and a tap that erased would have to choose whose verdict to
 * erase. The brew record screen is where a verdict is taken back.
 *
 * The database is resolved inside the handler, never in render: opening SQLite
 * while drawing is both a purity problem and, in a test, a native module that
 * does not exist.
 */
export function useRecipeRating(
    recipe: {uuid: string; name: string; accent: string},
    store?: RecipeRatingStore
): {summary: BrewSummary; rate: (rating: number) => void} {
    const {uuid, name, accent} = recipe;
    const [summary, setSummary] = useState<BrewSummary>(
        () => (store ?? sharedBrewDatabase()).summaryFor(uuid)
    );

    function rate(rating: number): void {
        // `isRating` admits 0, because 0 is how a brew is returned to unrated.
        // A recipe has no such gesture, so 0 arriving here is the lit star
        // being pressed again and the answer is to do nothing at all.
        if (!isRating(rating) || rating < 1) return;
        const database = store ?? sharedBrewDatabase();
        const at = Date.now();
        const today = database.brewOn(uuid, at);
        if (today !== null) {
            database.judge(today, {rating});
        } else {
            database.insert(
                unobservedBrew({recipeUuid: uuid, recipeName: name, accent, rating, at}),
                []
            );
        }
        setSummary(database.summaryFor(uuid));
    }

    return {summary, rate};
}

/**
 * A recipe's bean profile, and a way to ask for it again.
 *
 * Same shape as `useRecipeRating` above, and for the same two reasons: reading
 * SQLite during render is impure, and seeding state from an effect is what
 * `react-hooks/set-state-in-effect` exists to stop. So the first read happens
 * in a lazy initialiser, and every later one in the handler of the event that
 * could have changed the answer.
 *
 * The only such event is a rating. Tagging a brew happens on the brew record
 * screen, and coming back from it remounts this.
 *
 * The changed-uuid branch is the exception, and it is worth being straight
 * about: it does read the database while rendering, and it does call a setter
 * while rendering. That is React's own "adjusting state when a prop changes",
 * and it is the only door left open here. An effect is forbidden outright, and
 * returning last recipe's profile for one frame would put another recipe's
 * figures on this recipe's card. The read costs one query and only happens on
 * the render where the uuid actually changed, which in this app means the
 * editor being pointed at a different recipe without unmounting.
 */
export function useBeanProfile(
    recipeUuid: string,
    store: BeanProfileStore = sharedBrewDatabase()
): {profile: BeanProfile; refresh: () => void} {
    const [reading, setReading] = useState<{uuid: string; profile: BeanProfile}>(
        () => ({uuid: recipeUuid, profile: store.beanProfileFor(recipeUuid)})
    );

    const current = reading.uuid === recipeUuid
        ? reading
        : {uuid: recipeUuid, profile: store.beanProfileFor(recipeUuid)};
    if (current !== reading) {
        setReading(current);
    }

    function refresh(): void {
        setReading({uuid: recipeUuid, profile: store.beanProfileFor(recipeUuid)});
    }

    return {profile: current.profile, refresh};
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
