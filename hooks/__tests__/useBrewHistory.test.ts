import {act, renderHook} from "@testing-library/react-native";

import {sweepOnLaunch, useBrewHistory, useRecipeBrewSummary} from "@/hooks/useBrewHistory";
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

describe("useRecipeBrewSummary", () => {
    it("asks the store about the recipe in hand", async () => {
        const summaryFor = jest.fn(() => ({times: 4, lastAt: 9_000}));
        const {result} = await renderHook(
            () => useRecipeBrewSummary("uuid-1", {summaryFor})
        );

        expect(summaryFor).toHaveBeenCalledWith("uuid-1");
        expect(result.current).toEqual({times: 4, lastAt: 9_000});
    });

    it("reads once, because a brew cannot be recorded from inside the editor", async () => {
        // Held in a state initialiser rather than read on every render: the
        // screen it feeds has no way to change the answer while it is open.
        const summaryFor = jest.fn(() => ({times: 1, lastAt: 1}));
        const {rerender} = await renderHook(
            () => useRecipeBrewSummary("uuid-1", {summaryFor})
        );

        await act(async () => { rerender({}); });

        expect(summaryFor).toHaveBeenCalledTimes(1);
    });
});
