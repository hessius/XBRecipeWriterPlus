/**
 * A progressive local copy of one machine's community catalogue partition.
 *
 * The server's facet filters do not match the rows it returns, so browsing
 * loads the partition once per session and filters locally as pages arrive.
 */
import type {MachineModel} from "@/library/machine/machineModel";

import {fetchHubPage} from "./hubApi";
import type {HubCriteria} from "./hubApi";
import {heldHubCriteria, vocabularyNames} from "./hubCriteria";
import {buildHubRequest} from "./hubQuery";
import {normaliseHubRow} from "./hubRow";
import type {HubRecipe} from "./hubRow";

export type HubCatalogueProgress = {
    rows: HubRecipe[];
    /** Pages answered so far, and the total once the first page has said. */
    page: number;
    totalPage: number;
    total: number;
};

type ProgressListener = (progress: HubCatalogueProgress) => void;

type CachedCatalogue = {
    rows: HubRecipe[];
    page: number;
    totalPage: number;
    total: number;
};

type InFlightCatalogue = CachedCatalogue & {
    listeners: Set<ProgressListener>;
    promise: Promise<HubRecipe[]>;
};

const cached = new Map<MachineModel, CachedCatalogue>();
const inFlight = new Map<MachineModel, InFlightCatalogue>();

function criteriaVocabulary(criteria: HubCriteria | null): Parameters<typeof normaliseHubRow>[1] {
    if (criteria === null) return {};
    return {
        origin: vocabularyNames(criteria.originList),
        process: vocabularyNames(criteria.processingList),
        coffeeType: vocabularyNames(criteria.coffeeTypeList)
    };
}

function snapshot(state: CachedCatalogue): HubCatalogueProgress {
    return {
        rows: [...state.rows],
        page: state.page,
        totalPage: state.totalPage,
        total: state.total
    };
}

function notify(state: InFlightCatalogue | CachedCatalogue): void {
    const progress = snapshot(state);
    if ("listeners" in state) {
        for (const listener of state.listeners) listener(progress);
        return;
    }
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
}

/**
 * Hand one caller the load's progress, and let it stop listening.
 *
 * The signal detaches this caller; it deliberately does not abort the load.
 * The load belongs to the session rather than to whoever happened to ask for
 * it first, and one screen going away must not cancel a partition another
 * screen is still waiting on, nor throw away the pages already paid for.
 */
function attach(state: InFlightCatalogue,
                onProgress: ProgressListener,
                signal?: AbortSignal): Promise<HubRecipe[]> {
    state.listeners.add(onProgress);

    if (signal === undefined) {
        return state.promise.then((rows) => [...rows]);
    }

    return new Promise<HubRecipe[]>((resolve, reject) => {
        const detach = (): void => {
            state.listeners.delete(onProgress);
            signal.removeEventListener("abort", onAbort);
        };
        function onAbort(): void {
            detach();
            const aborted = new Error("Aborted");
            aborted.name = "AbortError";
            reject(aborted);
        }
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener("abort", onAbort);
        state.promise.then(
            (rows) => {
                detach();
                resolve([...rows]);
            },
            (error: unknown) => {
                detach();
                reject(error);
            }
        );
    });
}

async function load(model: MachineModel,
                    state: InFlightCatalogue): Promise<HubRecipe[]> {
    let pageIndex = 1;
    try {
        while (true) {
            const page = await fetchHubPage(buildHubRequest(model, pageIndex));
            const vocabulary = criteriaVocabulary(heldHubCriteria());
            state.rows.push(...page.list.map((row) => normaliseHubRow(row, vocabulary)));
            state.page = pageIndex;
            state.totalPage = page.totalPage;
            state.total = page.total;
            notify(state);

            if (pageIndex >= page.totalPage) break;
            pageIndex += 1;
        }
    } catch (error) {
        inFlight.delete(model);
        if (isAbortError(error)) throw error;
        if (state.page > 0) notify(state);
        throw error;
    }

    inFlight.delete(model);
    const done = {
        rows: [...state.rows],
        page: state.page,
        totalPage: state.totalPage,
        total: state.total
    };
    cached.set(model, done);
    return [...done.rows];
}

/**
 * Load a machine's whole partition, a page at a time.
 *
 * Progressive rather than blocking: about 1 MB over 17 requests for a machine,
 * which is 14 s to finish and under a second to show something. Server paging
 * was never cheaper, since reaching page five costs five round trips either
 * way, and this buys real filters at the end of it.
 *
 * `onProgress` is called after every page with the rows so far, so a screen can
 * draw immediately and keep drawing. Sequential on purpose: the endpoint is
 * undocumented and its rate limits are unknown.
 *
 * `signal` stops this caller listening. It does not abort the load: a second
 * screen may be waiting on the same partition, and the pages already fetched
 * are worth keeping either way. The load runs to the end and caches.
 */
export function loadHubCatalogue(
    model: MachineModel,
    onProgress: ProgressListener,
    signal?: AbortSignal
): Promise<HubRecipe[]> {
    const ready = cached.get(model);
    if (ready) {
        onProgress(snapshot(ready));
        return Promise.resolve([...ready.rows]);
    }

    const loading = inFlight.get(model);
    if (loading) {
        if (loading.page > 0) onProgress(snapshot(loading));
        return attach(loading, onProgress, signal);
    }

    const state: InFlightCatalogue = {
        rows: [],
        page: 0,
        totalPage: 0,
        total: 0,
        listeners: new Set(),
        promise: Promise.resolve([])
    };
    inFlight.set(model, state);
    state.promise = load(model, state);
    state.promise.catch(() => {
        // The joiners own the failure. This only keeps it from going unhandled.
    });
    return attach(state, onProgress, signal);
}

/** Tests only. Production has one session and never needs to forget. */
export function __resetHubCatalogue(): void {
    cached.clear();
    inFlight.clear();
}
