/**
 * Saving catalogue rows into the library.
 *
 * `XBloomRecipe` is mocked at the module boundary: what is under test is the
 * sequencing, the de-duplication and the partial-failure reporting, and the
 * share endpoint has its own tests.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useHubSave} from "@/hooks/useHubSave";
import type {HubRecipe} from "@/library/hub/hubRow";
import Recipe from "@/library/Recipe";

const mockFetchDetail = jest.fn();
const mockGetRecipe = jest.fn();
const mockConstructed: unknown[][] = [];

jest.mock("@/library/XBloomRecipe", () => ({
    __esModule: true,
    XBloomRecipe: class {
        constructor(...args: unknown[]) { mockConstructed.push(args); }
        fetchRecipeDetail(...args: unknown[]) { return mockFetchDetail(...args); }
        getRecipe() { return mockGetRecipe(); }
    }
}));

const mockUpdate = jest.fn();
const mockAll = jest.fn(() => [] as Recipe[]);
const mockOpen = jest.fn();
jest.mock("@/library/RecipeDatabase", () => ({
    __esModule: true,
    default: class {
        constructor() { mockOpen(); }
        updateRecipe(...args: unknown[]) { return mockUpdate(...args); }
        retrieveAllRecipes() { return mockAll(); }
    }
}));

jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

function hubRow(id: number, patch: Partial<HubRecipe> = {}): HubRecipe {
    return {
        id,
        name: `Recipe ${id}`,
        imageURL: null,
        author: "xBloom Official",
        official: true,
        machine: "Studio",
        cupType: "xPod",
        coffeeType: "Single Origin",
        origin: [],
        varietal: [],
        process: [],
        flavour: [],
        roast: null,
        dose: 15,
        grind: 52,
        rpm: 120,
        pourCount: 3,
        ratio: 16,
        volume: 240,
        shareLink: `https://share-h5.xbloom.com/?id=${id}`,
        ...patch
    };
}

function madeUpRecipe(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return {promise, resolve};
}

beforeEach(() => {
    mockFetchDetail.mockReset().mockResolvedValue(undefined);
    mockGetRecipe.mockReset().mockImplementation(() => madeUpRecipe("Saved"));
    mockUpdate.mockReset();
    mockAll.mockReset().mockReturnValue([]);
    mockConstructed.length = 0;
});

describe("saving one row", () => {
    it("parses the share link and writes the recipe", async () => {
        const {result} = await renderHook(() => useHubSave());

        await act(async () => { await result.current.save([hubRow(7)]); });

        expect(mockConstructed[0][0]).toEqual({kind: "share", id: "7"});
        expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it("decodes the percent encoded id before asking xBloom for the recipe", async () => {
        const {result} = await renderHook(() => useHubSave());

        await act(async () => {
            await result.current.save([
                hubRow(8, {
                    shareLink: "https://share-h5.xbloom.com/?id=Nh1muSi2bE%2F0Ttj0jn4eKQ%3D%3D"
                })
            ]);
        });

        expect(mockConstructed[0][0]).toEqual({
            kind: "share",
            id:   "Nh1muSi2bE/0Ttj0jn4eKQ=="
        });
    });

    it("asks the importer for the machine the user owns", async () => {
        // The share endpoint ignores it, but the constructor is required to
        // take it and a literal here is exactly what issue #138 was.
        const {sharedSettings} = require("@/hooks/useSetting");
        sharedSettings().set("machineModel", "original");
        const {result} = await renderHook(() => useHubSave());

        await act(async () => { await result.current.save([hubRow(7)]); });

        expect(mockConstructed[0][1]).toBe("original");
    });

    it("names a missing share link as a row failure", async () => {
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => {
            outcome = await result.current.save([hubRow(9, {shareLink: ""})]);
        });

        expect(outcome.saved).toBe(0);
        expect(outcome.failed).toEqual(["Recipe 9"]);
        expect(mockConstructed).toHaveLength(0);
    });

    it("saves when the library has no rows yet", async () => {
        mockAll.mockReturnValueOnce(null as unknown as Recipe[]);
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => { outcome = await result.current.save([hubRow(10)]); });

        expect(outcome.saved).toBe(1);
        expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
});

describe("saving a batch", () => {
    it("saves them one after another, not all at once", async () => {
        // The endpoint is undocumented and its rate limits are unknown, so a
        // batch of fifty parallel requests is the thing most likely to get the
        // app throttled, with nobody to ask about it.
        let running = 0;
        let mostAtOnce = 0;
        mockFetchDetail.mockImplementation(async () => {
            running += 1;
            mostAtOnce = Math.max(mostAtOnce, running);
            await Promise.resolve();
            running -= 1;
        });
        const {result} = await renderHook(() => useHubSave());

        await act(async () => {
            await result.current.save([hubRow(1), hubRow(2), hubRow(3)]);
        });

        expect(mostAtOnce).toBe(1);
        expect(mockUpdate).toHaveBeenCalledTimes(3);
    });

    it("counts as it goes, so the bar can say where it is", async () => {
        const first = deferred();
        const second = deferred();
        mockFetchDetail
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);
        const {result} = await renderHook(() => useHubSave());

        let saving!: Promise<unknown>;
        await act(async () => { saving = result.current.save([hubRow(1), hubRow(2)]); });
        await waitFor(() => {
            expect(result.current.progress).toEqual({done: 0, total: 2});
        });

        await act(async () => { first.resolve(); await first.promise; });
        await waitFor(() => {
            expect(result.current.progress).toEqual({done: 1, total: 2});
        });

        await act(async () => { second.resolve(); await saving; });
        expect(result.current.progress).toEqual({done: 2, total: 2});
    });

    it("keeps going after one row fails, and names the ones that did not land", async () => {
        // Resolving to a single boolean tells somebody who saved forty rows
        // nothing about which three did not.
        mockFetchDetail
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("timed out"))
            .mockResolvedValueOnce(undefined);
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => {
            outcome = await result.current.save([hubRow(1), hubRow(2), hubRow(3)]);
        });

        expect(outcome.saved).toBe(2);
        expect(outcome.failed).toEqual(["Recipe 2"]);
    });

    it("treats a recipe the endpoint would not give up as a failure, not a save", async () => {
        // `getRecipe()` returning null is the importer saying it could not
        // make a recipe out of the answer. Writing nothing and counting it as
        // saved would be the worst of both.
        mockGetRecipe.mockReturnValueOnce(null);
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => { outcome = await result.current.save([hubRow(4)]); });

        expect(outcome.saved).toBe(0);
        expect(outcome.failed).toEqual(["Recipe 4"]);
        expect(mockAll).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe("saving something already held", () => {
    it("does not add a second copy", async () => {
        // Exactly what any other import does. `resolveOnOpen` hands back the
        // stored recipe rather than making a copy.
        mockGetRecipe.mockReturnValue(madeUpRecipe("Held"));
        mockAll.mockReturnValue([madeUpRecipe("Held")]);
        const {result} = await renderHook(() => useHubSave());

        let outcome!: Awaited<ReturnType<typeof result.current.save>>;
        await act(async () => { outcome = await result.current.save([hubRow(1)]); });

        expect(outcome.alreadyHeld).toBe(1);
        expect(outcome.saved).toBe(0);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe("while it is running", () => {
    it("refuses a second batch rather than interleaving two", async () => {
        let release: () => void = () => {};
        mockFetchDetail.mockImplementation(() => new Promise<void>((resolve) => {
            release = resolve;
        }));
        const {result} = await renderHook(() => useHubSave());

        let first!: Promise<unknown>;
        await act(async () => { first = result.current.save([hubRow(1)]); });
        await waitFor(() => expect(result.current.saving).toBe(true));

        const second = await result.current.save([hubRow(2)]);
        expect(second.saved).toBe(0);
        expect(second.refused).toBe(true);

        await act(async () => { release(); await first; });
    });
});

/**
 * The lockout.
 *
 * Opening the database happens outside the per-row `catch`, so a throw there
 * escapes the whole batch. If the running flag were cleared at the end of the
 * happy path rather than in a `finally`, it would stay latched: the bar would
 * be stuck saying it is saving and every later batch would be refused, for the
 * rest of the session, with no way back short of relaunching.
 */
it("can save again after a batch failed before it started", async () => {
    mockOpen.mockReset();
    mockOpen.mockImplementationOnce(() => {
        throw new Error("no database");
    });

    const {result} = await renderHook(() => useHubSave());

    await expect(
        act(async () => {
            await result.current.save([hubRow(1)]);
        })
    ).rejects.toThrow("no database");

    expect(result.current.saving).toBe(false);

    // And the next batch is not refused.
    const outcome = await act(async () => result.current.save([hubRow(1)]));
    expect(outcome.refused).toBe(false);
    expect(outcome.saved).toBe(1);
});

