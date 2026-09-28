/**
 * The community catalogue's three endpoints.
 *
 * A different backend from `client-api.xbloom.com`, which the rest of the app
 * uses: no auth, no RSA, no `skey`, and a bare `Content-Type: application/json`
 * POST is enough. Endpoint names were taken from `saya6k/hacs-xbloom` (MIT) and
 * then verified live.
 *
 * This file performs every fetch in `library/hub/` and makes no judgements
 * about what a row means, so the normaliser, the vocabularies and the query
 * builder are all testable without a network stand-in.
 */

const BASE = "https://collective-api.xbloom.com";

/** A failure that is the hub's fault rather than the caller's. */
export class HubApiError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = "HubApiError";
    }
}

/** One entry in a facet vocabulary. `value` is a string even when it is a number. */
export type HubCriteriaItem = {name: string; value: string};

export type HubCriteria = {
    originList: HubCriteriaItem[];
    varietalList: HubCriteriaItem[];
    roastList: HubCriteriaItem[];
    flavorList: HubCriteriaItem[];
    machineList: HubCriteriaItem[];
    cupTypeList: HubCriteriaItem[];
    processingList: HubCriteriaItem[];
    coffeeTypeList: HubCriteriaItem[];
};

/**
 * A row as the server sends it, before `hubRow.ts` has cleaned it up.
 *
 * Deliberately permissive about the facet arrays: they arrive as arrays of
 * strings, but official rows pack a whole joined list into element zero, and
 * some elements are unparsed JSON. That is the normaliser's problem, not this
 * file's.
 */
export type HubListRow = {
    communityRecipeId: number;
    recipeId: number;
    recipeName: string;
    imageUrl: string | null;
    userName: string | null;
    userAvatar: string | null;
    official: number;
    model: string;
    cupType: string;
    cupTypeInt: number;
    type: string | null;
    origin: string[] | null;
    varietal: string[] | null;
    process: string[] | null;
    flavor: string[] | null;
    roast: number | null;
    dose: number;
    grinderSize: number;
    rpm: number;
    pourCount: number;
    grandWater: number;
    volume: string | number | null;
    likesCount: number;
    shareRecipeLink: string;
};

/** One stage of a detail row's plan. */
export type HubPour = {
    theName: string;
    volume: number;
    temperature: number;
    pausing: number;
    pattern: number;
};

/**
 * One recipe in full.
 *
 * `pourCount` is dropped rather than inherited: the detail endpoint genuinely
 * does not send it, verified live against recipe 164, even though every list
 * row carries one. Omitting it makes `normaliseRow(detail)` a compile error
 * instead of a row whose stage count is silently `undefined`, and the answer
 * is to supply `pourList.length`, which is the same number the list row means.
 */
export type HubDetailRow = Omit<HubListRow, "pourCount"> & {
    uploadDate: string | null;
    introduce: string | null;
    pourList: HubPour[] | null;
};

export type HubPageRequest = {
    pageIndex: number;
    pageSize: number;
    keyword?: string;
    recipeType?: number;
    recipeUserType?: number;
    sort?: number;
    sortType?: number;
    originIds?: string[];
    varietalIds?: string[];
    processIds?: string[];
    roastList?: string[];
    flavorIds?: string[];
    machineList?: string[];
    cupTypeList?: string[];
};

export type HubPage = {
    pageIndex: number;
    pageSize: number;
    totalPage: number;
    total: number;
    list: HubListRow[];
};

/**
 * POST a JSON body and unwrap the envelope.
 *
 * Two failures, not one. A transport failure never reached the server; an
 * envelope whose `code` is not 200 did, and carries a reason worth showing.
 * Both become a `HubApiError` so a caller has one thing to catch, but the
 * message differs because the user-facing sentence does.
 */
async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {"content-type": "application/json", accept: "application/json"},
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        throw new HubApiError(`The recipe hub is not answering (${response.status}).`,
                              response.status);
    }

    const envelope = await response.json() as {code?: number; msg?: string; data?: T};
    if (envelope.code !== 200) {
        throw new HubApiError(envelope.msg ?? "The recipe hub refused that request.");
    }
    return envelope.data as T;
}

export function fetchHubPage(request: HubPageRequest, signal?: AbortSignal): Promise<HubPage> {
    return post<HubPage>("/communityRecipe/index/page", request, signal);
}

export function fetchHubCriteria(signal?: AbortSignal): Promise<HubCriteria> {
    return post<HubCriteria>("/communityRecipe/recipe/criteria", {}, signal);
}

/**
 * One recipe in full.
 *
 * `type: 1` is the coffee catalogue. The tea catalogue is `2` and is not
 * browsed here: a tea recipe has no grind and no dose, so most of what this
 * screen shows about a row would be blank.
 */
export function fetchHubDetail(id: number, signal?: AbortSignal): Promise<HubDetailRow> {
    return post<HubDetailRow>("/communityRecipe/recipe/detail", {id, type: 1}, signal);
}
