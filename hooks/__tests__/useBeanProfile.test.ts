import {act, renderHook} from "@testing-library/react-native";

import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

/* eslint-disable import/first */
import {useBeanProfile, type BeanProfileStore} from "@/hooks/useBrewHistory";
import BrewDatabase from "@/library/BrewDatabase";
import type {BeanProfile} from "@/library/beanProfile";
import {tagKey} from "@/library/tagKey";
/* eslint-enable import/first */

const RECIPE = "recipe-under-test";

const ZERO_PROFILE: BeanProfile = {
    rows: [],
    untagged: {brews: 0, rated: 0, avgRating: 0},
    counted: 0
};

type Seed = {
    id: string;
    recipeUuid?: string;
    process?: string;
    rating?: number;
    tags?: string[];
};

beforeEach(() => {
    mockBacking = createTestDatabase();
});

function seed(rows: Seed[]): BrewDatabase {
    const database = new BrewDatabase();
    rows.forEach((row, index) => {
        mockBacking.runSync(
            `INSERT INTO brews (
                id, recipeUuid, recipeName, accent, startedAt, pouringAt, endedAt,
                outcome, failure, pours, waterTotal, cupTotal, heldSeconds,
                rating, watched, process, hasStream
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
                row.id, row.recipeUuid ?? RECIPE, "Fixture", "#000000",
                1_000 + index, 0, 2_000 + index, "done", null,
                1, 1, 1, 0, row.rating ?? 0, 1, row.process ?? "", 0
            ]
        );
        for (const tag of row.tags ?? []) {
            mockBacking.runSync(
                "INSERT INTO brew_tags (brewId, tag, tagKey) VALUES (?, ?, ?);",
                [row.id, tag, tagKey(tag)]
            );
        }
    });
    return database;
}

function countingStore(profiles: Record<string, BeanProfile>): BeanProfileStore & {
    calls: string[];
} {
    const calls: string[] = [];
    return {
        calls,
        beanProfileFor(uuid: string) {
            calls.push(uuid);
            return profiles[uuid] ?? ZERO_PROFILE;
        }
    };
}

describe("useBeanProfile", () => {
    it("reads the profile once on mount from the lazy initialiser", async () => {
        const database = seed([{id: "a", process: "Natural", rating: 5}]);
        const beanProfileFor = jest.spyOn(database, "beanProfileFor");

        const {result, unmount} =
            await renderHook(() => useBeanProfile(RECIPE, database));

        expect(result.current.profile).toMatchObject({
            counted: 1,
            rows: [{field: "process", value: "Natural", brews: 1, rated: 1, avgRating: 5}]
        });
        expect(beanProfileFor).toHaveBeenCalledWith(RECIPE);
        expect(beanProfileFor).toHaveBeenCalledTimes(1);

        await act(async () => { unmount(); });
    });

    it("returns a zero profile for a recipe with no brews", async () => {
        const database = seed([]);

        const {result} = await renderHook(() => useBeanProfile(RECIPE, database));

        expect(result.current.profile).toEqual(ZERO_PROFILE);
    });

    it("re-reads on refresh, picking up a rating written between reads", async () => {
        const database = seed([{id: "a", process: "Natural", tags: ["mornings"]}]);
        const {result} = await renderHook(() => useBeanProfile(RECIPE, database));

        mockBacking.runSync("UPDATE brews SET rating = 4 WHERE id = ?;", ["a"]);
        await act(async () => { result.current.refresh(); });

        expect(result.current.profile.rows.find((row) => row.field === "process"))
            .toMatchObject({value: "Natural", rated: 1, avgRating: 4});
        expect(result.current.profile.rows.find((row) => row.field === "custom"))
            .toMatchObject({value: "mornings", rated: 1, avgRating: 4});
    });

    it("does not re-read when an unrelated render happens", async () => {
        const store = countingStore({
            [RECIPE]: {
                rows: [{field: "process", value: "Natural", brews: 1, rated: 0,
                        avgRating: 0}],
                untagged: {brews: 0, rated: 0, avgRating: 0},
                counted: 1
            }
        });
        let uuid = RECIPE;
        const {rerender} = await renderHook(() => useBeanProfile(uuid, store));

        await act(async () => { rerender({}); });

        expect(store.calls).toEqual([RECIPE]);
    });

    it("reads a different recipe when the uuid changes", async () => {
        const first: BeanProfile = {
            rows: [{field: "process", value: "Natural", brews: 1, rated: 0,
                    avgRating: 0}],
            untagged: {brews: 0, rated: 0, avgRating: 0},
            counted: 1
        };
        const second: BeanProfile = {
            rows: [{field: "process", value: "Washed", brews: 2, rated: 2,
                    avgRating: 4}],
            untagged: {brews: 0, rated: 0, avgRating: 0},
            counted: 2
        };
        const store = countingStore({"one": first, "two": second});
        let uuid = "one";
        const {result, rerender} = await renderHook(() => useBeanProfile(uuid, store));

        uuid = "two";
        await act(async () => { rerender({}); });

        expect(result.current.profile).toBe(second);
        expect(store.calls).toEqual(["one", "two"]);
    });
});
