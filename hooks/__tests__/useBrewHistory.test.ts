import {act, renderHook} from "@testing-library/react-native";

import {sweepOnLaunch, useBrewHistory, useRecipeRating} from "@/hooks/useBrewHistory";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";

function record(id: string): StoredBrew {
    return {
        id, recipeUuid: "uuid-1", recipeName: "Ethiopia Guji", accent: "#C86A3B",
        startedAt: 1, endedAt: 2, outcome: "done", failure: null, pours: 2,
        waterTotal: 250, cupTotal: 244, heldSeconds: 0, hasStream: true
    };
}

function fakeStore(seed: StoredBrew[] = []) {
    let rows = [...seed];
    const swept: number[] = [];
    return {
        swept,
        all: () => rows,
        get: (id: string) => rows.find((r) => r.id === id) ?? null,
        samples: (_id: string): BrewSample[] => [{at: 0, water: 0, cup: 0, pour: 1}],
        frames: (_id: string): string => "",
        remove: (id: string) => { rows = rows.filter((r) => r.id !== id); },
        clear: () => { rows = []; },
        insert: (_r: BrewRecord, _s: BrewSample[]) => {},
        sweep: (keep: number) => { swept.push(keep); }
    };
}

describe("useBrewHistory", () => {
    it("lists what the store has", async () => {
        const store = fakeStore([record("a"), record("b")]);
        const {result} = await renderHook(() => useBrewHistory(store));
        expect(result.current.brews.map((b) => b.id)).toEqual(["a", "b"]);
    });

    it("opens a record with its stream", async () => {
        const store = fakeStore([record("a")]);
        const {result} = await renderHook(() => useBrewHistory(store));
        expect(result.current.open("a")?.samples).toHaveLength(1);
    });

    it("returns null for a record that is not there", async () => {
        // The mini-bar can outlive a record the user has just deleted.
        const store = fakeStore([]);
        const {result} = await renderHook(() => useBrewHistory(store));
        expect(result.current.open("gone")).toBeNull();
    });

    it("drops a brew from the list as well as the store", async () => {
        const store = fakeStore([record("a"), record("b")]);
        const {result} = await renderHook(() => useBrewHistory(store));
        await act(async () => result.current.remove("a"));
        expect(result.current.brews.map((b) => b.id)).toEqual(["b"]);
    });

    it("sweeps to the retention the user chose", () => {
        const store = fakeStore([]);
        sweepOnLaunch(store, 10);
        expect(store.swept).toEqual([10]);
    });

    it("sweeps everything when retention is zero", () => {
        // Zero is a real choice and must not fall through to a default.
        const store = fakeStore([]);
        sweepOnLaunch(store, 0);
        expect(store.swept).toEqual([0]);
    });
});

/**
 * A store that behaves the way the table does, so the hook's one decision --
 * judge today's brew or write one nobody watched -- is tested against
 * something that can actually answer the question.
 */
function ratingStore(seed: BrewRecord[] = []) {
    const rows: BrewRecord[] = [...seed];
    return {
        rows,
        summaryFor: (uuid: string) => {
            const mine = rows.filter((r) => r.recipeUuid === uuid);
            const rated = mine.filter((r) => (r.rating ?? 0) > 0);
            return {
                times: mine.length,
                lastAt: mine.reduce((max, r) => Math.max(max, r.startedAt), 0),
                avgRating: rated.length === 0
                    ? 0
                    : rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length,
                rated: rated.length
            };
        },
        brewOn: (uuid: string, at: number) => {
            const day = new Date(at);
            day.setHours(0, 0, 0, 0);
            const mine = rows.filter((r) => r.recipeUuid === uuid
                && r.startedAt >= day.getTime());
            return mine.length === 0 ? null : mine[mine.length - 1].id;
        },
        judge: (id: string, judgement: {rating?: number}) => {
            const row = rows.find((r) => r.id === id);
            if (row && judgement.rating !== undefined) row.rating = judgement.rating;
        },
        insert: (record: BrewRecord, _samples: BrewSample[]) => { rows.push(record); }
    };
}

describe("useRecipeRating", () => {
    const recipe = {uuid: "uuid-1", name: "Ethiopia", accent: "#C86A3B"};

    it("writes a brew nobody watched when there is none from today", async () => {
        const store = ratingStore();
        const {result} = await renderHook(() => useRecipeRating(recipe, store));

        await act(async () => { result.current.rate(4); });

        expect(store.rows).toHaveLength(1);
        expect(store.rows[0].watched).toBe(false);
        expect(store.rows[0].rating).toBe(4);
    });

    it("rates today's brew rather than inventing a second one", async () => {
        // The one rule that keeps the figures honest: there is never a second
        // number for one cup, so there is nothing to reconcile.
        const store = ratingStore([{
            id: "today", recipeUuid: "uuid-1", recipeName: "Ethiopia",
            accent: "#C86A3B", startedAt: Date.now(), endedAt: Date.now(),
            outcome: "done", failure: null, pours: 2, waterTotal: 250,
            cupTotal: 244, heldSeconds: 0
        }]);
        const {result} = await renderHook(() => useRecipeRating(recipe, store));

        await act(async () => { result.current.rate(5); });

        expect(store.rows).toHaveLength(1);
        expect(store.rows[0].rating).toBe(5);
    });

    it("reports the average back without a re-read of the screen", async () => {
        const store = ratingStore();
        const {result} = await renderHook(() => useRecipeRating(recipe, store));

        await act(async () => { result.current.rate(3); });

        expect(result.current.summary.avgRating).toBe(3);
        expect(result.current.summary.times).toBe(1);
    });

    it("does not clear, and does not write a brew of nothing", async () => {
        // BrewStars sends 0 when the lit star is pressed again. On a record
        // that unrates it; here the stars summarise several brews, so a tap
        // that erased would have to choose whose verdict to erase.
        const store = ratingStore();
        const {result} = await renderHook(() => useRecipeRating(recipe, store));

        await act(async () => { result.current.rate(0); });

        expect(store.rows).toHaveLength(0);
    });

    it("asks the store about the recipe in hand, once", async () => {
        // Held in a state initialiser rather than read on every render: a brew
        // cannot be recorded from inside the editor, so nothing but the star
        // itself can change the answer while the screen is open.
        const store = ratingStore();
        const summaryFor = jest.spyOn(store, "summaryFor");
        const {rerender} = await renderHook(() => useRecipeRating(recipe, store));

        await act(async () => { rerender({}); });

        expect(summaryFor).toHaveBeenCalledWith("uuid-1");
        expect(summaryFor).toHaveBeenCalledTimes(1);
    });

    it("re-reads once a verdict has been given, so the line agrees with it", async () => {
        const store = ratingStore();
        const {result} = await renderHook(() => useRecipeRating(recipe, store));

        await act(async () => { result.current.rate(2); });

        expect(result.current.summary.rated).toBe(1);
    });

    it("refuses a rating off the scale rather than writing it", async () => {
        const store = ratingStore();
        const {result} = await renderHook(() => useRecipeRating(recipe, store));

        await act(async () => { result.current.rate(9); });

        expect(store.rows).toHaveLength(0);
    });
});
