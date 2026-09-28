/**
 * The catalogue loader owns paging and cache state. Network is mocked at the
 * hubApi boundary so these tests never depend on the live community endpoint.
 */
import {loadHubCriteria, __resetHubCriteria} from "@/library/hub/hubCriteria";
import {
    loadHubCatalogue,
    __resetHubCatalogue
} from "@/library/hub/hubCatalogue";
import type {HubCatalogueProgress} from "@/library/hub/hubCatalogue";
import type {HubCriteria, HubListRow, HubPage, HubPageRequest} from "@/library/hub/hubApi";

const mockFetchPage = jest.fn();
const mockFetchCriteria = jest.fn();

jest.mock("@/library/hub/hubApi", () => ({
    ...jest.requireActual("@/library/hub/hubApi"),
    fetchHubPage: (...args: unknown[]) => mockFetchPage(...args),
    fetchHubCriteria: (...args: unknown[]) => mockFetchCriteria(...args)
}));

const CRITERIA: HubCriteria = {
    originList: [{name: "Costa Rica", value: "1"}],
    varietalList: [{name: "Bourbon", value: "2"}],
    roastList: [{name: "Light Roast", value: "1"}],
    flavorList: [{name: "Peach", value: "3"}],
    machineList: [{name: "Studio", value: "J15"}, {name: "Original", value: "J20"}],
    cupTypeList: [{name: "xPod", value: "4"}],
    processingList: [{name: "Washed", value: "5"}, {name: "Natural", value: "6"}],
    coffeeTypeList: [{name: "Single", value: "7"}, {name: "Origin", value: "8"}]
};

function rawRow(id: number, patch: Partial<HubListRow> = {}): HubListRow {
    return {
        communityRecipeId: id,
        recipeId: id + 1000,
        recipeName: `Recipe ${id}`,
        imageUrl: null,
        userName: "Author",
        userAvatar: null,
        official: 0,
        model: "J15",
        cupType: "xPod",
        cupTypeInt: 1,
        type: "Single Origin",
        origin: ["Costa Rica"],
        varietal: ["Bourbon"],
        process: ["Washed"],
        flavor: ["Peach"],
        roast: 2,
        dose: 15,
        grinderSize: 55,
        rpm: 60,
        pourCount: 3,
        grandWater: 16,
        volume: "240",
        likesCount: 12,
        shareRecipeLink: `https://example.com/${id}`,
        ...patch
    };
}

function page(pageIndex: number, totalPage: number, list: HubListRow[]): HubPage {
    return {
        pageIndex,
        pageSize: 100,
        totalPage,
        total: totalPage * 100,
        list
    };
}

function pageIndexes(): number[] {
    return mockFetchPage.mock.calls.map(([request]: [HubPageRequest]) => request.pageIndex);
}

function ids(progress: HubCatalogueProgress): number[] {
    return progress.rows.map((row) => row.id);
}

type Deferred<T> = {promise: Promise<T>; resolve: (value: T) => void};

function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((settleWith) => {
        resolve = settleWith;
    });
    return {promise, resolve};
}

/**
 * A fetch that honours the signal it is handed, the way the real one does.
 *
 * Without this the mock ignores `signal` entirely, and a test cannot tell a
 * loader that cancels the shared fetch from one that only detaches a listener.
 */
function heldPage(hold: Deferred<HubPage>) {
    return (_request: HubPageRequest, signal?: AbortSignal): Promise<HubPage> =>
        Promise.race([
            hold.promise,
            new Promise<never>((_resolve, reject) => {
                signal?.addEventListener("abort", () => {
                    reject(new DOMException("cancelled", "AbortError"));
                });
            })
        ]);
}

/** Let every already-queued microtask run, so a late page cannot slip past. */
async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    __resetHubCatalogue();
    __resetHubCriteria();
    mockFetchPage.mockReset();
    mockFetchCriteria.mockReset();
    mockFetchCriteria.mockResolvedValue(CRITERIA);
});

describe("loading progressively", () => {
    it("calls onProgress after every page with all rows accumulated so far", async () => {
        mockFetchPage
            .mockResolvedValueOnce(page(1, 2, [rawRow(1)]))
            .mockResolvedValueOnce(page(2, 2, [rawRow(2)]));
        const progress = jest.fn();

        const rows = await loadHubCatalogue("studio", progress);

        expect(rows.map((row) => row.id)).toEqual([1, 2]);
        expect(progress).toHaveBeenCalledTimes(2);
        expect(progress.mock.calls.map(([snapshot]) => ({
            page: snapshot.page,
            totalPage: snapshot.totalPage,
            ids: ids(snapshot as HubCatalogueProgress)
        }))).toEqual([
            {page: 1, totalPage: 2, ids: [1]},
            {page: 2, totalPage: 2, ids: [1, 2]}
        ]);
    });

    it("asks for exactly totalPage pages and not one more or one fewer", async () => {
        mockFetchPage
            .mockResolvedValueOnce(page(1, 3, [rawRow(1)]))
            .mockResolvedValueOnce(page(2, 3, [rawRow(2)]))
            .mockResolvedValueOnce(page(3, 3, [rawRow(3)]));

        await loadHubCatalogue("studio", jest.fn());

        expect(pageIndexes()).toEqual([1, 2, 3]);
    });

    it("does not ask for a second page when the partition has one page", async () => {
        mockFetchPage.mockResolvedValueOnce(page(1, 1, [rawRow(1)]));

        await loadHubCatalogue("studio", jest.fn());

        expect(pageIndexes()).toEqual([1]);
    });

    it("normalises rows with held criteria vocabularies without fetching criteria itself", async () => {
        await loadHubCriteria();
        mockFetchCriteria.mockClear();
        mockFetchPage.mockResolvedValueOnce(page(1, 1, [
            rawRow(1, {process: ["Washed Natural"], type: "Single Origin"})
        ]));

        const rows = await loadHubCatalogue("studio", jest.fn());

        expect(mockFetchCriteria).not.toHaveBeenCalled();
        expect(rows[0].process).toEqual(["Washed", "Natural"]);
        expect(rows[0].coffeeType).toBe("Single");
    });
});

describe("handling failed loads", () => {
    it("rethrows a partial failure only after a final progress update with landed rows", async () => {
        const error = new Error("timeout");
        mockFetchPage
            .mockResolvedValueOnce(page(1, 3, [rawRow(1)]))
            .mockResolvedValueOnce(page(2, 3, [rawRow(2)]))
            .mockRejectedValueOnce(error);
        const progress = jest.fn();

        await expect(loadHubCatalogue("studio", progress)).rejects.toBe(error);

        expect(progress.mock.calls.map(([snapshot]) => ({
            page: snapshot.page,
            totalPage: snapshot.totalPage,
            ids: ids(snapshot as HubCatalogueProgress)
        }))).toEqual([
            {page: 1, totalPage: 3, ids: [1]},
            {page: 2, totalPage: 3, ids: [1, 2]},
            {page: 2, totalPage: 3, ids: [1, 2]}
        ]);
    });

    it("propagates a fetch's own AbortError untouched", async () => {
        const abort = new DOMException("cancelled", "AbortError");
        mockFetchPage
            .mockResolvedValueOnce(page(1, 3, [rawRow(1)]))
            .mockRejectedValueOnce(abort);
        const progress = jest.fn();

        await expect(loadHubCatalogue("studio", progress)).rejects.toBe(abort);

        expect(progress).toHaveBeenCalledTimes(1);
        expect(ids(progress.mock.calls[0][0] as HubCatalogueProgress)).toEqual([1]);
    });
});

/**
 * A caller's signal detaches that caller and nothing else.
 *
 * It used to abort the fetch, which wedged the browse screen: leaving and
 * coming straight back joined an in-flight load whose pages the departed
 * screen had just cancelled, so the second screen waited on a load that was
 * never going to finish, drew no rows, and offered no way to try again.
 */
describe("a caller leaving", () => {
    it("rejects the leaver with AbortError and stops its progress", async () => {
        const hold = deferred<HubPage>();
        mockFetchPage.mockImplementationOnce(heldPage(hold))
            .mockResolvedValueOnce(page(2, 2, [rawRow(2)]));
        const progress = jest.fn();
        const controller = new AbortController();

        const leaving = loadHubCatalogue("studio", progress, controller.signal);
        const caught = leaving.catch((error: Error) => error.name);
        controller.abort();
        hold.resolve(page(1, 2, [rawRow(1)]));

        await expect(caught).resolves.toBe("AbortError");
        await settle();
        expect(progress).not.toHaveBeenCalled();
    });

    it("lets the load finish and cache, so the next visit pays nothing", async () => {
        const hold = deferred<HubPage>();
        mockFetchPage.mockImplementationOnce(heldPage(hold))
            .mockResolvedValueOnce(page(2, 2, [rawRow(2)]));
        const controller = new AbortController();

        const leaving = loadHubCatalogue("studio", jest.fn(), controller.signal);
        const swallowed = leaving.catch(() => undefined);
        controller.abort();
        hold.resolve(page(1, 2, [rawRow(1)]));
        await swallowed;
        await settle();

        const returning = jest.fn();
        expect(await loadHubCatalogue("studio", returning)).toHaveLength(2);
        expect(mockFetchPage).toHaveBeenCalledTimes(2);
        expect(ids(returning.mock.calls[0][0] as HubCatalogueProgress)).toEqual([1, 2]);
    });

    it("still answers a second caller that joined the same load", async () => {
        const hold = deferred<HubPage>();
        mockFetchPage.mockImplementationOnce(heldPage(hold))
            .mockResolvedValueOnce(page(2, 2, [rawRow(2)]));
        const first = new AbortController();
        const second = new AbortController();
        const staying = jest.fn();

        const leaving = loadHubCatalogue("studio", jest.fn(), first.signal);
        const swallowed = leaving.catch(() => undefined);
        first.abort();
        const stayed = loadHubCatalogue("studio", staying, second.signal);
        hold.resolve(page(1, 2, [rawRow(1)]));

        await swallowed;
        expect((await stayed).map((row) => row.id)).toEqual([1, 2]);
        expect(mockFetchPage).toHaveBeenCalledTimes(2);
        expect(staying).toHaveBeenCalled();
    });

    it("rejects a caller whose signal was already aborted", async () => {
        mockFetchPage.mockResolvedValue(page(1, 1, [rawRow(1)]));
        const controller = new AbortController();
        controller.abort();
        const progress = jest.fn();

        await expect(loadHubCatalogue("studio", progress, controller.signal))
            .rejects.toMatchObject({name: "AbortError"});
        await settle();
        expect(progress).not.toHaveBeenCalled();
    });
});

describe("caching", () => {
    it("caches completed catalogues per machine without refetching", async () => {
        mockFetchPage
            .mockResolvedValueOnce(page(1, 1, [rawRow(1)]))
            .mockResolvedValueOnce(page(1, 1, [rawRow(20, {model: "J20"})]));
        const firstProgress = jest.fn();
        const cachedProgress = jest.fn();

        await loadHubCatalogue("studio", firstProgress);
        const cached = await loadHubCatalogue("studio", cachedProgress);
        const original = await loadHubCatalogue("original", jest.fn());

        expect(mockFetchPage).toHaveBeenCalledTimes(2);
        expect(mockFetchPage.mock.calls.map(([request]: [HubPageRequest]) => request.machineList))
            .toEqual([["J15"], ["J20"]]);
        expect(cached.map((row) => row.id)).toEqual([1]);
        expect(ids(cachedProgress.mock.calls[0][0] as HubCatalogueProgress)).toEqual([1]);
        expect(original.map((row) => row.id)).toEqual([20]);
    });

    it("joins an in-flight load without starting a second request", async () => {
        let answer!: (value: HubPage) => void;
        mockFetchPage.mockReturnValue(new Promise<HubPage>((resolve) => {
            answer = resolve;
        }));
        const firstProgress = jest.fn();
        const secondProgress = jest.fn();

        const first = loadHubCatalogue("studio", firstProgress);
        const second = loadHubCatalogue("studio", secondProgress);
        answer(page(1, 1, [rawRow(1)]));

        await expect(Promise.all([first, second])).resolves.toEqual([
            [expect.objectContaining({id: 1})],
            [expect.objectContaining({id: 1})]
        ]);
        expect(mockFetchPage).toHaveBeenCalledTimes(1);
        expect(firstProgress).toHaveBeenCalledTimes(1);
        expect(secondProgress).toHaveBeenCalledTimes(1);
    });

    it("catches an in-flight joiner up when pages have already landed", async () => {
        let answerSecond!: (value: HubPage) => void;
        mockFetchPage
            .mockResolvedValueOnce(page(1, 2, [rawRow(1)]))
            .mockReturnValueOnce(new Promise<HubPage>((resolve) => {
                answerSecond = resolve;
            }));
        const firstProgress = jest.fn();
        const secondProgress = jest.fn();

        const first = loadHubCatalogue("studio", firstProgress);
        await Promise.resolve();
        await Promise.resolve();
        const second = loadHubCatalogue("studio", secondProgress);

        expect(ids(secondProgress.mock.calls[0][0] as HubCatalogueProgress)).toEqual([1]);
        answerSecond(page(2, 2, [rawRow(2)]));
        await expect(Promise.all([first, second])).resolves.toHaveLength(2);
        expect(mockFetchPage).toHaveBeenCalledTimes(2);
    });

    it("forgets cached catalogues when reset for tests", async () => {
        mockFetchPage
            .mockResolvedValueOnce(page(1, 1, [rawRow(1)]))
            .mockResolvedValueOnce(page(1, 1, [rawRow(2)]));

        await loadHubCatalogue("studio", jest.fn());
        __resetHubCatalogue();
        await loadHubCatalogue("studio", jest.fn());

        expect(pageIndexes()).toEqual([1, 1]);
    });
});
