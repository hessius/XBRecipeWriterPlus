import {act, renderHook, waitFor} from "@testing-library/react-native";

import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {useShareRecipe} from "@/hooks/useShareRecipe";

function drip(): Recipe {
    const r = new Recipe(undefined, undefined);
    r.name = "Ethiopia Guji";
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 55;
    r.cupType = CUP_TYPE.OMNI;
    r.pours = [new Pour(1, 288, 93, 35, 0, POUR_PATTERN.CENTERED, 0)];
    return r;
}

function respond(body: unknown, status = 200) {
    return jest.fn(async () => ({
        ok: status < 400, status, json: async () => body
    })) as never;
}

describe("useShareRecipe", () => {
    it("starts idle", async () => {
        const {result} = await renderHook(() => useShareRecipe());
        expect(result.current.state).toEqual({status: "idle"});
    });

    it("mints and returns the url", async () => {
        global.fetch = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        const recipe = drip();
        const {result} = await renderHook(() => useShareRecipe());

        let url: string | null = null;
        await act(async () => {
            url = await result.current.share(recipe);
        });

        expect(url).toBe("https://share-h5.xbloom.com/?id=ok");
        expect(recipe.sharedTableId).toBe(42);
        expect(recipe.shareUrl).toBe("https://share-h5.xbloom.com/?id=ok");
        expect(recipe.shareSnapshot).toBeTruthy();
        await waitFor(() => expect(result.current.state).toEqual({status: "idle"}));
    });

    it("reuses the stored link when nothing that is sent has changed", async () => {
        const fetchMock = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        global.fetch = fetchMock;
        const recipe = drip();
        const {result} = await renderHook(() => useShareRecipe());

        await act(async () => { await result.current.share(recipe); });
        await act(async () => { await result.current.share(recipe); });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-mints when a field that is sent changes", async () => {
        const fetchMock = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        global.fetch = fetchMock;
        const recipe = drip();
        const {result} = await renderHook(() => useShareRecipe());

        await act(async () => { await result.current.share(recipe); });
        recipe.pours[0].temperature = 95;
        await act(async () => { await result.current.share(recipe); });

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not re-mint for a change that is never sent", async () => {
        const fetchMock = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        global.fetch = fetchMock;
        const recipe = drip();
        const {result} = await renderHook(() => useShareRecipe());

        await act(async () => { await result.current.share(recipe); });
        recipe.backup = [1, 2, 3];
        await act(async () => { await result.current.share(recipe); });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("maps 429 to limited", async () => {
        global.fetch = respond({error: "limited", scope: "ip"}, 429);
        const {result} = await renderHook(() => useShareRecipe());
        await act(async () => { await result.current.share(drip()); });
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "limited"}));
    });

    it("maps 503 and 502 to unavailable", async () => {
        const failures = [
            {status: 502, body: {error: "upstream"}},
            {status: 503, body: {error: "unavailable"}}
        ];

        for (const {status, body} of failures) {
            global.fetch = respond(body, status);
            const {result} = await renderHook(() => useShareRecipe());
            await act(async () => { await result.current.share(drip()); });
            await waitFor(() =>
                expect(result.current.state).toEqual({status: "failed", reason: "unavailable"}));
        }
    });

    it("maps 400 to unusable", async () => {
        global.fetch = respond({error: "invalid", reason: "dose is out of range"}, 400);
        const {result} = await renderHook(() => useShareRecipe());
        await act(async () => { await result.current.share(drip()); });
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "unusable"}));
    });

    it("maps a thrown fetch to network", async () => {
        global.fetch = jest.fn(async () => { throw new Error("offline"); }) as never;
        const {result} = await renderHook(() => useShareRecipe());
        await act(async () => { await result.current.share(drip()); });
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "network"}));
    });

    it("refuses a recipe the machine would reject, without calling out", async () => {
        const fetchMock = respond({tableId: 1, url: "https://x"});
        global.fetch = fetchMock;
        const recipe = drip();
        recipe.pours[0].volume = 5;
        const {result} = await renderHook(() => useShareRecipe());

        let url: string | null = "unset";
        await act(async () => { url = await result.current.share(recipe); });

        expect(url).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "unusable"}));
    });
});
