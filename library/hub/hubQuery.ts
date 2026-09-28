/**
 * The rail's question, and the single request that answers it.
 *
 * `library/libraryQuery.ts` is the same idea for the library: one statement, in
 * one place, so no screen assembles its own. The reason is stronger here,
 * because the endpoint is undocumented and every extra field sent to it is a
 * guess about a server nobody has the source of.
 */
import type {MachineModel} from "@/library/machine/machineModel";

import type {HubPageRequest} from "./hubApi";

/** How many rows a page holds. The server honours 100. */
export const HUB_PAGE_SIZE = 100;

/**
 * The orders the catalogue can be put in.
 *
 * Likes are missing on purpose. Every `likesCount` in the catalogue sits in one
 * narrow band, so an order by likes would be an order by noise wearing the
 * clothes of a popularity ranking.
 */
export const HUB_SORTS = {
    date: {label: "NEWEST", sort: 1, sortType: 2},
    downloads: {label: "MOST SAVED", sort: 3, sortType: 2}
} as const;

export type HubSort = keyof typeof HUB_SORTS;

export type HubQuery = {
    keyword: string;
    originIds: readonly string[];
    roastIds: readonly string[];
    processIds: readonly string[];
    flavourIds: readonly string[];
    sort: HubSort;
};

export const EMPTY_HUB_QUERY: HubQuery = {
    keyword: "",
    originIds: [],
    roastIds: [],
    processIds: [],
    flavourIds: [],
    sort: "date"
};

/** Whether the rail is asking for anything narrower than the whole catalogue. */
export function hubQueryIsNarrowed(query: HubQuery): boolean {
    return query.keyword.trim() !== ""
        || query.originIds.length > 0
        || query.roastIds.length > 0
        || query.processIds.length > 0
        || query.flavourIds.length > 0;
}

/** The catalogue's code for a machine. */
export function machineCode(model: MachineModel): string {
    return model === "original" ? "J20" : "J15";
}

/**
 * Build the page request.
 *
 * The machine is not a filter the user can change. The catalogue publishes the
 * same recipe once per machine with independently retuned grind numbers, so
 * browsing the other machine's half would hand somebody a grind that is wrong
 * for the machine they own, and nothing in the app can correct it: the scales
 * do not convert. Across 1,053 pairs the best linear fit is R^2 = 0.444 and
 * lands within two grind steps one time in five.
 *
 * Empty fields are omitted rather than sent empty. The endpoint is
 * undocumented, and an empty array or an empty string is still an instruction.
 */
export function buildHubRequest(
    query: HubQuery, model: MachineModel, pageIndex: number
): HubPageRequest {
    const order = HUB_SORTS[query.sort];
    const request: HubPageRequest = {
        pageIndex,
        pageSize: HUB_PAGE_SIZE,
        recipeType: 1,
        machineList: [machineCode(model)],
        sort: order.sort,
        sortType: order.sortType
    };

    const keyword = query.keyword.trim();
    if (keyword !== "") request.keyword = keyword;
    if (query.originIds.length > 0) request.originIds = [...query.originIds];
    if (query.roastIds.length > 0) request.roastList = [...query.roastIds];
    if (query.processIds.length > 0) request.processIds = [...query.processIds];
    if (query.flavourIds.length > 0) request.flavorIds = [...query.flavourIds];

    return request;
}
