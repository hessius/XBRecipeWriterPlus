/**
 * Which endpoint gets called, and whether a request can be called off.
 *
 * The endpoint used to be guessed from the length of the id, which sent a short
 * share id to the pod endpoint. `parseImportInput` has already decided by the
 * time this class is built, so it is told rather than left to infer.
 */
import {XBloomRecipe} from "@/library/XBloomRecipe";

const POD_ENDPOINT = "https://client-api.xbloom.com/tRecipeDetailOfPods.thtml";
const SHARE_ENDPOINT = "https://client-api.xbloom.com/RecipeDetail.html";

function okResponse() {
    return {ok: true, status: 200, json: async () => ({recipeVo: null})};
}

beforeEach(() => {
    global.fetch = jest.fn(async () => okResponse()) as unknown as typeof fetch;
});

it("calls the pod endpoint for a pod code", async () => {
    await new XBloomRecipe({kind: "xid", xid: "ETH120"}).fetchRecipeDetail();

    expect(global.fetch).toHaveBeenCalledWith(POD_ENDPOINT, expect.anything());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).xid).toBe("ETH120");
});

it("calls the share endpoint for a share id, however short it is", async () => {
    // Six characters. The old length heuristic sent this to the pod endpoint.
    await new XBloomRecipe({kind: "share", id: "ab12cd"}).fetchRecipeDetail();

    expect(global.fetch).toHaveBeenCalledWith(SHARE_ENDPOINT, expect.anything());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).tableIdOfRSA)
        .toBe("ab12cd");
});

it("passes an abort signal through to fetch", async () => {
    const controller = new AbortController();

    await new XBloomRecipe({kind: "xid", xid: "ETH120"})
        .fetchRecipeDetail(controller.signal);

    expect((global.fetch as jest.Mock).mock.calls[0][1].signal).toBe(controller.signal);
});

it("yields no recipe when the machine reports the pod does not exist", async () => {
    // The live pod endpoint answers HTTP 200 with `{result: "fail"}` and no
    // `recipeVo` for a code it does not recognise (e.g. the machine's own
    // "the xPod does not exist"). `getRecipe` must read that as nothing found --
    // returning null so the hook shows "No recipe with that code." -- rather
    // than hanging or building a blank recipe. Its `recipeVo`-less access throws
    // and the method's catch turns that into the null this pins.
    global.fetch = jest.fn(async () => ({
        ok: true, status: 200,
        json: async () => ({info: "The machine detected that the xPod does not exist", result: "fail"})
    })) as unknown as typeof fetch;

    const xb = new XBloomRecipe({kind: "xid", xid: "ETH120"});
    await xb.fetchRecipeDetail();

    expect(xb.getRecipe()).toBeNull();
});
