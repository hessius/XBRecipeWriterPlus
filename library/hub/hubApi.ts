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

/**
 * Anything that stopped an answer from arriving.
 *
 * Not always the hub's fault: a removed recipe comes back as envelope code 400
 * with "The recipe has been removed by the person who shared it", which is an
 * ordinary thing for a screen to render calmly rather than a fault to retry.
 * `code` is kept so a caller can tell those apart without matching on English.
 *
 * `message` is ours. `serverMessage` is the hub's and is for diagnosis only:
 * it is server controlled, ungrammatical in places ("Community Recipe don't
 * exist"), sometimes contentless ("Operation Failed"), and may one day
 * localise. xBloom does not get to write this app's sentences.
 */
export class HubApiError extends Error {
    constructor(message: string, readonly detail: {
        status?: number;
        code?: number;
        serverMessage?: string;
    } = {}) {
        super(message);
        this.name = "HubApiError";
    }

    get status(): number | undefined { return this.detail.status; }
    get code(): number | undefined { return this.detail.code; }

    /** True when the hub understood and answered no, rather than falling over. */
    get isRefusal(): boolean {
        return this.detail.code !== undefined && this.detail.code >= 400 && this.detail.code < 500;
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
    /**
     * Never observed null across all 2,966 coffee rows, but left nullable:
     * this is the wire, and `hubRow.ts` is where a missing author is given a
     * name. Tightening it here would only move the cast.
     */
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
    /** A string even though it is a number, on every row. Never null. */
    volume: string;
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
    /**
     * Required, not optional. Leaving it out returns 3,020 rows instead of
     * 2,966, and the extra 54 are tea, which this screen does not browse. A
     * caller who forgets it gets tea quietly, so it cannot be forgettable.
     */
    recipeType: number;
    recipeUserType?: number;
    sort?: number;
    /**
     * The direction, not a second sort: 1 ascending, 2 descending. It does
     * nothing on its own, so it is only meaningful alongside `sort`.
     */
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
    let response: Response;
    try {
        response = await fetch(`${BASE}${path}`, {
            method: "POST",
            headers: {"content-type": "application/json", accept: "application/json"},
            body: JSON.stringify(body),
            signal
        });
    } catch (error) {
        // An abort is not a failure. A screen that cancelled its own load on
        // unmount must stay silent, so this is the one thing that escapes as
        // itself rather than as a `HubApiError`.
        if (error instanceof Error && error.name === "AbortError") throw error;
        // React Native's `fetch` throws a bare `TypeError: Network request
        // failed` with no status when the phone is offline, which is the most
        // likely failure of all and would otherwise escape untyped past a
        // caller catching `HubApiError`.
        throw new HubApiError("Could not reach the recipe hub. Check your connection.");
    }

    if (!response.ok) {
        throw new HubApiError("The recipe hub is not answering right now.",
                              {status: response.status});
    }

    const envelope = await response.json() as {code?: number; msg?: string; data?: T};
    if (envelope.code !== 200) {
        throw new HubApiError("The recipe hub could not answer that.",
                              {code: envelope.code, serverMessage: envelope.msg});
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
 * The id is the **community** id, not the recipe id. A list row carries both
 * as plain numbers: `communityRecipeId: 164` and `recipeId: 576`. Passing the
 * wrong one compiles, answers HTTP 200 with envelope code 200, and hands back
 * a real recipe that is not the one somebody tapped. Hence the parameter name.
 *
 * `type: 1` is what the detail endpoint wants for a catalogue recipe; it is
 * not the coffee-versus-tea switch. Tea is excluded by `recipeType` on the
 * list request, and a tea row fetches perfectly well through here.
 */
export function fetchHubDetail(communityRecipeId: number,
                               signal?: AbortSignal): Promise<HubDetailRow> {
    return post<HubDetailRow>("/communityRecipe/recipe/detail",
                              {id: communityRecipeId, type: 1}, signal);
}
