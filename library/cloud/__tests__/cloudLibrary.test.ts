import {post} from "../transport";
import {fetchCloudRecipes} from "../cloudLibrary";

jest.mock("../transport", () => ({
    ...jest.requireActual("../transport"),
    post: jest.fn(),
}));

const mockPost = post as jest.MockedFunction<typeof post>;
const session = {memberId: 7, token: "tok", email: "a@b.c"};
const rows = (n: number, from = 0) =>
    Array.from({length: n}, (_, i) => ({tableId: from + i, theName: `R${from + i}`}));

describe("fetchCloudRecipes", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns a single short page without asking for another", async () => {
        mockPost.mockResolvedValue({result: "success", list: rows(3)});

        const out = await fetchCloudRecipes(session);

        expect(out).toHaveLength(3);
        expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it("walks every page until one comes back short", async () => {
        mockPost
            .mockResolvedValueOnce({result: "success", list: rows(100, 0)})
            .mockResolvedValueOnce({result: "success", list: rows(100, 100)})
            .mockResolvedValueOnce({result: "success", list: rows(4, 200)});

        const out = await fetchCloudRecipes(session);

        expect(out).toHaveLength(204);
        expect(mockPost).toHaveBeenCalledTimes(3);
        expect(
            (mockPost.mock.calls[2][1] as {pageNumber: number}).pageNumber
        ).toBe(3);
    });

    it("stops on an exactly-full final page rather than looping forever", async () => {
        // A library that is an exact multiple of the page size returns a full
        // page and then an empty one. Without the empty-page stop this walks
        // until the page cap and makes a request for nothing every time.
        mockPost
            .mockResolvedValueOnce({result: "success", list: rows(100, 0)})
            .mockResolvedValueOnce({result: "success", list: []});

        const out = await fetchCloudRecipes(session);

        expect(out).toHaveLength(100);
        expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it("refuses to page forever if the server keeps returning full pages", async () => {
        mockPost.mockResolvedValue({result: "success", list: rows(100)});

        // 20 pages of 100 is far past any real library; a server that never
        // runs out is a bug on one side or the other, and the app must not
        // answer it with an unbounded request loop.
        //
        // It fails rather than returning the 2,000 rows it has. A capped walk
        // that returns quietly is indistinguishable from a complete one, and
        // the recipes beyond the cap would read as "not in your account".
        await expect(fetchCloudRecipes(session)).rejects.toMatchObject({
            kind: "server",
        });
        expect(mockPost).toHaveBeenCalledTimes(20);
    });

    it("fails rather than truncating when a page part way through is unreadable", async () => {
        mockPost
            .mockResolvedValueOnce({result: "success", list: rows(100)})
            .mockResolvedValueOnce({result: "success"});

        await expect(fetchCloudRecipes(session)).rejects.toMatchObject({
            kind: "server",
        });
    });

    it("passes the abort signal through rather than swallowing it", async () => {
        const failure = new Error("Aborted");
        failure.name = "AbortError";
        mockPost.mockRejectedValue(failure);

        const controller = new AbortController();
        // Straight out, not a short list dressed up as a complete one.
        await expect(
            fetchCloudRecipes(session, controller.signal)
        ).rejects.toMatchObject({name: "AbortError"});
    });

    it("sends the auth fields and the adaptedModel filter in every request", async () => {
        mockPost.mockResolvedValue({result: "success", list: []});

        await fetchCloudRecipes(session);

        expect(mockPost).toHaveBeenCalledWith(
            "tuMyTeaRecipeCreated.tuhtml",
            expect.objectContaining({
                memberId: 7,
                token: "tok",
                skey: "testskey",
                pageNumber: 1,
                countPerPage: 100,
                adaptedModel: 1,
            }),
            true,
            undefined
        );
    });

    it("treats a missing list as an empty page rather than throwing", async () => {
        mockPost.mockResolvedValue({result: "success"});
        await expect(fetchCloudRecipes(session)).resolves.toEqual([]);
    });

    it("drops rows that are not objects", async () => {
        mockPost.mockResolvedValue({
            result: "success",
            list: [{tableId: 1}, null, "nonsense", {tableId: 2}],
        });

        const out = await fetchCloudRecipes(session);
        expect(out).toHaveLength(2);
    });
});
