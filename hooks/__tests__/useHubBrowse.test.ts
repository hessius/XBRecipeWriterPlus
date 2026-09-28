import {act, renderHook} from "@testing-library/react-native";

import {useHubBrowse} from "@/hooks/useHubBrowse";
import {sharedSettings} from "@/hooks/useSetting";
import type {HubCatalogueProgress} from "@/library/hub/hubCatalogue";
import type {HubRecipe} from "@/library/hub/hubRow";
import type {MachineModel} from "@/library/machine/machineModel";

type Progress = (progress: HubCatalogueProgress) => void;

const mockLoad = jest.fn();

// The hook's contract starts at the progressive catalogue, not the wire.
jest.mock("@/library/hub/hubCatalogue", () => ({
    loadHubCatalogue: (...args: unknown[]) => mockLoad(...args),
    __resetHubCatalogue: () => {}
}));
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

function row(id: number, patch: Partial<HubRecipe> = {}): HubRecipe {
    return {
        id,
        name: `Recipe ${id}`,
        imageURL: null,
        author: "xBloom",
        official: false,
        machine: "J15",
        cupType: "Omni",
        coffeeType: "Arabica",
        origin: [],
        varietal: [],
        process: [],
        flavour: [],
        roast: null,
        dose: 15,
        grind: 55,
        rpm: 120,
        pourCount: 3,
        ratio: 16,
        volume: 240,
        shareLink: `https://share/${id}`,
        ...patch
    };
}

function progress(rows: HubRecipe[], page: number, totalPage: number): HubCatalogueProgress {
    return {rows, page, totalPage, total: rows.length};
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

function mockProgressiveLoad(first: HubRecipe[]) {
    const done = deferred<HubRecipe[]>();
    mockLoad.mockImplementation((_model: MachineModel, onProgress: Progress) => {
        onProgress(progress(first, 1, 2));
        return done.promise.then((rows) => {
            onProgress(progress(rows, 2, 2));
            return rows;
        });
    });
    return done;
}

describe("useHubBrowse", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockLoad.mockReset();
        sharedSettings().set("machineModel", "studio");
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("reports rows as they arrive and keeps arriving true until the load settles", async () => {
        const first = [row(1, {name: "First"})];
        const all = [...first, row(2, {name: "Second"})];
        const load = mockProgressiveLoad(first);

        const {result} = await renderHook(() => useHubBrowse());

        expect(result.current.all.map((r) => r.id)).toEqual([1]);
        expect(result.current.rows.map((r) => r.id)).toEqual([1]);
        expect(result.current.arriving).toBe(true);
        expect(result.current.page).toBe(1);
        expect(result.current.totalPage).toBe(2);

        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        expect(result.current.all.map((r) => r.id)).toEqual([1, 2]);
        expect(result.current.rows.map((r) => r.id)).toEqual([1, 2]);
        expect(result.current.arriving).toBe(false);
    });

    it("narrows by a facet locally without loading again", async () => {
        const all = [
            row(1, {origin: ["Colombia"]}),
            row(2, {origin: ["Ethiopia"]}),
            row(3, {origin: ["Colombia", "Huila"]})
        ];
        const load = mockProgressiveLoad([all[0]]);
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        await act(async () => result.current.toggleFacet("origins", "Colombia"));

        expect(result.current.rows.map((r) => r.id)).toEqual([1, 3]);
        expect(mockLoad).toHaveBeenCalledTimes(1);

        await act(async () => result.current.toggleFacet("origins", "Colombia"));

        expect(result.current.rows.map((r) => r.id)).toEqual([1, 2, 3]);
        expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it("replaces a facet selection when the sheet reports one", async () => {
        const all = [
            row(1, {origin: ["Colombia"]}),
            row(2, {origin: ["Ethiopia"]})
        ];
        const load = mockProgressiveLoad(all);
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        await act(async () => result.current.toggleFacet("origins", "Colombia"));
        expect(result.current.rows.map((r) => r.id)).toEqual([1]);

        await act(async () => result.current.setFacet("origins", ["Ethiopia"]));

        expect(result.current.query.origins).toEqual(["Ethiopia"]);
        expect(result.current.rows.map((r) => r.id)).toEqual([2]);
    });

    it("only offers chips whose counts agree with applying that chip", async () => {
        const all = [
            row(1, {origin: ["Colombia"]}),
            row(2, {origin: ["Ethiopia"]}),
            row(3, {origin: ["Colombia", "Huila"]})
        ];
        const load = mockProgressiveLoad(all);
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        const chips = result.current.chips("origins");

        expect(chips).toEqual([
            {value: "Colombia", count: 2},
            {value: "Ethiopia", count: 1},
            {value: "Huila", count: 1}
        ]);
        for (const chip of chips) {
            await act(async () => result.current.setFacet("origins", [chip.value]));
            expect(result.current.rows.length).toBe(chip.count);
        }
    });

    it("counts one facet's chips against the rest of the query", async () => {
        const all = [
            row(1, {origin: ["Ethiopia"], process: ["Washed"]}),
            row(2, {origin: ["Kenya"], process: ["Natural"]})
        ];
        const load = mockProgressiveLoad(all);
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        await act(async () => result.current.setFacet("origins", ["Ethiopia"]));

        // Natural belongs to the Kenyan row, which Ethiopia has already ruled
        // out. Offering it would promise a match and then answer NO MATCHES.
        expect(result.current.chips("processes")).toEqual([{value: "Washed", count: 1}]);

        // A facet still never narrows itself: a second origin widens.
        expect(result.current.chips("origins")).toEqual([
            {value: "Ethiopia", count: 1},
            {value: "Kenya", count: 1}
        ]);
    });

    it("keeps a failed load distinct from a successful empty answer", async () => {
        const error = new Error("offline");
        mockLoad.mockImplementation(() => Promise.reject(error));
        const failed = await renderHook(() => useHubBrowse());
        await act(async () => {
            await Promise.resolve();
        });

        expect(failed.result.current.failed).toBe(error);
        expect(failed.result.current.rows).toEqual([]);
        expect(failed.result.current.arriving).toBe(false);

        mockLoad.mockReset();
        const all = [row(1, {origin: ["Colombia"]})];
        const load = mockProgressiveLoad(all);
        const empty = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });
        await act(async () => empty.result.current.setFacet("origins", ["Kenya"]));

        expect(empty.result.current.failed).toBeNull();
        expect(empty.result.current.rows).toEqual([]);
        expect(empty.result.current.arriving).toBe(false);
    });

    it("retries after a failure and clears the failed state", async () => {
        const error = new Error("offline");
        const all = [row(1, {origin: ["Colombia"]})];
        const retryLoad = deferred<HubRecipe[]>();
        mockLoad
            .mockImplementationOnce(() => Promise.reject(error))
            .mockImplementationOnce((_model: MachineModel, onProgress: Progress) => {
                onProgress(progress(all, 1, 1));
                return retryLoad.promise;
            });
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.failed).toBe(error);

        await act(async () => result.current.retry());

        expect(result.current.failed).toBeNull();
        expect(result.current.arriving).toBe(true);
        await act(async () => {
            retryLoad.resolve(all);
            await retryLoad.promise;
        });
        expect(result.current.rows.map((r) => r.id)).toEqual([1]);
        expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it("does not show one machine's rows after the setting changes to another", async () => {
        const studioRows = [row(1, {machine: "J15", name: "Studio"})];
        const originalRows = [row(2, {machine: "J20", name: "Original"})];
        const studioLoad = deferred<HubRecipe[]>();
        const originalLoad = deferred<HubRecipe[]>();
        let sendOriginal!: Progress;
        mockLoad.mockImplementation((model: MachineModel, onProgress: Progress) => {
            if (model === "studio") {
                onProgress(progress(studioRows, 1, 1));
                return studioLoad.promise;
            }
            sendOriginal = onProgress;
            return originalLoad.promise;
        });
        const {result} = await renderHook(() => useHubBrowse());
        expect(result.current.rows.map((r) => r.machine)).toEqual(["J15"]);

        await act(async () => sharedSettings().set("machineModel", "original"));

        expect(result.current.rows).toEqual([]);
        expect(result.current.all).toEqual([]);
        expect(result.current.arriving).toBe(true);

        await act(async () => sendOriginal(progress(originalRows, 1, 1)));
        expect(result.current.rows.map((r) => r.machine)).toEqual(["J20"]);
        expect(result.current.all.map((r) => r.machine)).toEqual(["J20"]);

        await act(async () => {
            studioLoad.resolve(studioRows);
            await studioLoad.promise;
        });
        expect(result.current.rows.map((r) => r.machine)).toEqual(["J20"]);
    });

    it("sorts locally without loading again", async () => {
        const all = [
            row(1, {name: "Zulu"}),
            row(2, {name: "Alpha"})
        ];
        const load = mockProgressiveLoad(all);
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        await act(async () => result.current.setSort("name"));

        expect(result.current.rows.map((r) => r.name)).toEqual(["Alpha", "Zulu"]);
        expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it("filters roasts locally and clears the whole question", async () => {
        const all = [
            row(1, {name: "Zulu", origin: ["Colombia"], roast: 3}),
            row(2, {name: "Alpha", origin: ["Ethiopia"], roast: 5})
        ];
        const load = mockProgressiveLoad(all);
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        await act(async () => {
            result.current.setSort("name");
            result.current.setFacet("origins", ["Colombia"]);
            result.current.setRoasts([3]);
        });

        expect(result.current.rows.map((r) => r.id)).toEqual([1]);

        await act(async () => result.current.clearQuery());

        expect(result.current.query).toEqual({
            keyword: "",
            origins: [],
            processes: [],
            varietals: [],
            flavours: [],
            roasts: [],
            sort: "newest"
        });
        expect(result.current.rows.map((r) => r.id)).toEqual([1, 2]);
        expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it("does not set state after unmounting mid-load", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
        let sendProgress!: Progress;
        let signal!: AbortSignal;
        const pending = deferred<HubRecipe[]>();
        mockLoad.mockImplementation((
            _model: MachineModel,
            onProgress: Progress,
            receivedSignal: AbortSignal
        ) => {
            sendProgress = onProgress;
            signal = receivedSignal;
            return pending.promise;
        });
        const {unmount} = await renderHook(() => useHubBrowse());

        await act(async () => {
            unmount();
        });
        expect(signal.aborted).toBe(true);
        await act(async () => {
            sendProgress(progress([row(1)], 1, 1));
            pending.resolve([row(1)]);
            await pending.promise;
        });

        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("debounces keyword changes through the shared rail search hook", async () => {
        const all = [
            row(1, {name: "Colombia Sweet"}),
            row(2, {name: "Ethiopia Bright"})
        ];
        const load = mockProgressiveLoad(all);
        const {result} = await renderHook(() => useHubBrowse());
        await act(async () => {
            load.resolve(all);
            await load.promise;
        });

        // Typing waits, so the list does not thrash a character at a time.
        await act(async () => result.current.search.onChangeText("colombia"));

        // Shown at once, because it is what the user typed. The rail draws
        // `text`, so keeping only a setter would leave its field blank and
        // make it arm a second debounce against the same keyword.
        // Upper case because the rail's field is upper case, which is also why
        // `matchesHubQuery` compares without case.
        expect(result.current.search.text).toBe("COLOMBIA");
        expect(result.current.search.active).toBe(true);
        expect(result.current.query.keyword).toBe("");
        expect(result.current.rows.map((r) => r.id)).toEqual([1, 2]);

        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        expect(result.current.query.keyword).toBe("colombia");
        expect(result.current.rows.map((r) => r.id)).toEqual([1]);

        // Setting it outright does not wait, because nobody is typing.
        await act(async () => result.current.setKeyword("ethiopia"));
        expect(result.current.query.keyword).toBe("ethiopia");
        expect(result.current.rows.map((r) => r.id)).toEqual([2]);
    });
});
