/**
 * The hub's three endpoints, and nothing else.
 *
 * `fetch` is mocked the way `library/__tests__/XBloomRecipe.test.ts` mocks it,
 * which is the house pattern: assign `global.fetch` in a `beforeEach` and read
 * the request back out of the mock's calls.
 */
import {fetchHubCriteria, fetchHubDetail, fetchHubPage, HubApiError} from "@/library/hub/hubApi";

const PAGE = "https://collective-api.xbloom.com/communityRecipe/index/page";
const CRITERIA = "https://collective-api.xbloom.com/communityRecipe/recipe/criteria";
const DETAIL = "https://collective-api.xbloom.com/communityRecipe/recipe/detail";

function respond(data: unknown, code = 200) {
    return {ok: true, status: 200, json: async () => ({code, msg: "Operation Successful", data})};
}

function lastRequest() {
    const calls = (global.fetch as jest.Mock).mock.calls;
    return {url: calls[calls.length - 1][0], init: calls[calls.length - 1][1]};
}

beforeEach(() => {
    global.fetch = jest.fn(async () => respond({})) as unknown as typeof fetch;
});

describe("asking the hub for a page", () => {
    it("posts the search to the page endpoint", async () => {
        global.fetch = jest.fn(async () =>
            respond({pageIndex: 1, pageSize: 100, totalPage: 3, total: 280, list: []})
        ) as unknown as typeof fetch;

        const page = await fetchHubPage({pageIndex: 1, pageSize: 100, recipeType: 1, machineList: ["J15"]});

        const {url, init} = lastRequest();
        expect(url).toBe(PAGE);
        expect(init.method).toBe("POST");
        expect(init.headers["content-type"]).toBe("application/json");
        expect(JSON.parse(init.body)).toEqual({pageIndex: 1, pageSize: 100, recipeType: 1, machineList: ["J15"]});
        expect(page.total).toBe(280);
        expect(page.list).toEqual([]);
    });

    it("passes an abort signal through", async () => {
        // Every screen that fetches here can be left before the answer arrives.
        const controller = new AbortController();

        await fetchHubPage({pageIndex: 1, pageSize: 1, recipeType: 1}, controller.signal);

        expect(lastRequest().init.signal).toBe(controller.signal);
    });

    it("refuses a page the transport did not deliver", async () => {
        global.fetch = jest.fn(async () => ({
            ok: false, status: 503, json: async () => ({})
        })) as unknown as typeof fetch;

        // Asserting the status, not just the class: an envelope check alone
        // also throws a `HubApiError` here, so a bare `toThrow` would pass
        // with the transport check deleted.
        await expect(fetchHubPage({pageIndex: 1, pageSize: 1, recipeType: 1}))
            .rejects.toMatchObject({name: "HubApiError", status: 503});
    });

    it("refuses a page the server answered with a failure code", async () => {
        // The transport says 200 and the envelope says otherwise. Reading
        // `data` off that would hand a screen an undefined list and call it an
        // empty catalogue.
        global.fetch = jest.fn(async () =>
            ({ok: true, status: 200, json: async () => ({code: 500, msg: "boom", data: null})})
        ) as unknown as typeof fetch;

        // The hub's own words are kept for diagnosis and deliberately are not
        // the message: they are server controlled, sometimes ungrammatical and
        // may localise, and this app writes its own copy.
        await expect(fetchHubPage({pageIndex: 1, pageSize: 1, recipeType: 1}))
            .rejects.toMatchObject({code: 500, detail: {serverMessage: "boom"}});
    });

    it("tells a refusal apart from a fault, without reading English", async () => {
        // Live, inside an HTTP 200: code 400 "The recipe has been removed by
        // the person who shared it" is an ordinary thing to render calmly,
        // code 500 "Operation Failed" is worth retrying. A screen must not
        // have to match on prose to know which it has.
        global.fetch = jest.fn(async () => ({
            ok: true, status: 200,
            json: async () => ({code: 400, msg: "Community Recipe don't exist", data: null})
        })) as unknown as typeof fetch;

        await expect(fetchHubDetail(164)).rejects.toMatchObject({isRefusal: true});

        global.fetch = jest.fn(async () => ({
            ok: true, status: 200,
            json: async () => ({code: 500, msg: "Operation Failed", data: null})
        })) as unknown as typeof fetch;

        await expect(fetchHubDetail(164)).rejects.toMatchObject({isRefusal: false});
    });

    it("turns being offline into something a caller can catch", async () => {
        // React Native's fetch throws a bare TypeError with no status when the
        // phone has no connection, which is the likeliest failure of all and
        // would otherwise sail past a caller catching HubApiError.
        global.fetch = jest.fn(async () => {
            throw new TypeError("Network request failed");
        }) as unknown as typeof fetch;

        await expect(fetchHubPage({pageIndex: 1, pageSize: 1, recipeType: 1}))
            .rejects.toThrow(HubApiError);
    });

    it("lets an abort through as itself, so an unmount stays quiet", async () => {
        // A screen that cancelled its own load has nothing to tell anybody.
        global.fetch = jest.fn(async () => {
            const aborted = new Error("Aborted");
            aborted.name = "AbortError";
            throw aborted;
        }) as unknown as typeof fetch;

        await expect(fetchHubPage({pageIndex: 1, pageSize: 1, recipeType: 1}))
            .rejects.toMatchObject({name: "AbortError"});
    });
});

describe("asking the hub for its vocabularies", () => {
    it("posts an empty body to the criteria endpoint", async () => {
        global.fetch = jest.fn(async () => respond({
            originList: [{name: "Brazil", value: "1"}],
            varietalList: [], roastList: [], flavorList: [],
            machineList: [], cupTypeList: [], processingList: [], coffeeTypeList: []
        })) as unknown as typeof fetch;

        const criteria = await fetchHubCriteria();

        expect(lastRequest().url).toBe(CRITERIA);
        expect(JSON.parse(lastRequest().init.body)).toEqual({});
        expect(criteria.originList[0]).toEqual({name: "Brazil", value: "1"});
    });
});

describe("asking the hub about one recipe", () => {
    it("posts the id and the coffee type", async () => {
        global.fetch = jest.fn(async () =>
            respond({communityRecipeId: 164, recipeName: "Brian's Recipe"})
        ) as unknown as typeof fetch;

        const detail = await fetchHubDetail(164);

        expect(lastRequest().url).toBe(DETAIL);
        expect(JSON.parse(lastRequest().init.body)).toEqual({id: 164, type: 1});
        expect(detail.recipeName).toBe("Brian's Recipe");
    });

    it("hands back a detail row that carries no stage count", async () => {
        // Verified live against recipe 164: every list row has a `pourCount`
        // and the detail endpoint sends none, so `HubDetailRow` omits it and
        // the stage count comes from `pourList.length` instead. If this ever
        // starts arriving, the type can inherit it again.
        global.fetch = jest.fn(async () => respond({
            communityRecipeId: 164,
            recipeName: "Brian's Recipe",
            pourList: [{theName: "Bloom", volume: 60, temperature: 95, pausing: 40, pattern: 3}]
        })) as unknown as typeof fetch;

        const detail = await fetchHubDetail(164);

        expect("pourCount" in detail).toBe(false);
        expect(detail.pourList).toHaveLength(1);
    });
});
