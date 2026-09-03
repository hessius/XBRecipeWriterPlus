import {act, renderHook} from "@testing-library/react-native";

import {sweepOnLaunch, useBrewHistory} from "@/hooks/useBrewHistory";
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
