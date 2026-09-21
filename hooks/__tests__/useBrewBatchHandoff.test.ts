import {act, renderHook} from "@testing-library/react-native";
import {gunzipSync} from "fflate";
import {Linking} from "react-native";

import {
    BATCH_HANDOFF_EMPTY,
    BATCH_HANDOFF_OPEN_FAILED,
    BATCH_HANDOFF_TOO_LARGE,
    useBrewBatchHandoff
} from "@/hooks/useBrewBatchHandoff";
import {notify} from "@/components/XbrwToast";
import * as handoffEncode from "@/library/brew/handoff/encode";
import type {HandoffBatch} from "@/library/brew/handoff/encode";
import {brew, samples} from "@/library/brew/handoff/__tests__/fixtures";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";
import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/library/RecipeDatabase", () => jest.fn());

const notifyMock = notify as jest.MockedFunction<typeof notify>;
const RecipeDatabaseMock = RecipeDatabase as jest.MockedClass<typeof RecipeDatabase>;
let openURL: jest.SpiedFunction<typeof Linking.openURL>;

type BatchSource = {record: StoredBrew; samples: BrewSample[]};

function recipeStore(found: Recipe | null): RecipeDatabase {
    return {
        getRecipe: jest.fn(() => found)
    } as unknown as RecipeDatabase;
}

function source(records: Record<string, BatchSource>): (id: string) => BatchSource | null {
    return (id) => records[id] ?? null;
}

function decode(url: string): HandoffBatch {
    const params = new URL(url).searchParams;
    const joined = [...params.keys()]
        .filter((key) => /^shareBrew\d+$/.test(key))
        .map((key) => Number(key.slice("shareBrew".length)))
        .sort((a, b) => a - b)
        .map((index) => params.get(`shareBrew${index}`) ?? "")
        .join("");
    const padded = joined
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(joined.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));

    return JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as HandoffBatch;
}

describe("useBrewBatchHandoff", () => {
    beforeEach(() => {
        RecipeDatabaseMock.mockReset();
        RecipeDatabaseMock.mockImplementation(() => recipeStore(null));
        openURL = jest.spyOn(Linking, "openURL");
        openURL.mockReset();
        openURL.mockResolvedValue(undefined);
        notifyMock.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("opens a Beanconqueror batch handoff URL for several brews", async () => {
        const first = brew({id: "a", recipeName: "First"});
        const second = brew({id: "b", recipeName: "Second"});
        const {result} = await renderHook(() => useBrewBatchHandoff(source({
            a: {record: first, samples},
            b: {record: second, samples: []}
        })));

        await act(async () => {
            await result.current.send(["a", "b"]);
        });

        expect(openURL).toHaveBeenCalledWith(expect.stringMatching(
            /^beanconqueror:\/\/ADD_BREWS\?len=\d+&shareBrew0=/
        ));
        const opened = openURL.mock.calls[0]?.[0];
        if (opened === undefined) throw new Error("batch handoff URL was not opened");
        expect(decode(opened).brews.map((envelope) => envelope.brew.note)).toHaveLength(2);
        expect(decode(opened).brews.map((envelope) => envelope.brew.waterIn.value))
            .toEqual([first.waterTotal, second.waterTotal]);
    });

    it("skips a missing record instead of aborting the batch", async () => {
        const present = brew({id: "b", recipeName: "Second"});
        const {result} = await renderHook(() => useBrewBatchHandoff(source({
            b: {record: present, samples}
        })));

        await act(async () => {
            await result.current.send(["a", "b"]);
        });

        const opened = openURL.mock.calls[0]?.[0];
        if (opened === undefined) throw new Error("batch handoff URL was not opened");
        const batch = decode(opened);
        expect(batch.brews).toHaveLength(1);
        expect(batch.brews[0].brew.waterIn.value).toBe(present.waterTotal);
        expect(notifyMock).not.toHaveBeenCalled();
    });

    it("reports an error when every selected record is missing", async () => {
        const {result} = await renderHook(() => useBrewBatchHandoff(() => null));

        await act(async () => {
            await result.current.send(["a", "b"]);
        });

        expect(openURL).not.toHaveBeenCalled();
        expect(notifyMock).toHaveBeenCalledWith({
            tone: "error",
            message: BATCH_HANDOFF_EMPTY
        });
    });

    it("reports a too large selection without opening a URL", async () => {
        jest.spyOn(handoffEncode, "encodeHandoffBatch").mockImplementationOnce(() => {
            throw new Error("too large");
        });
        const {result} = await renderHook(() => useBrewBatchHandoff(source({
            a: {record: brew({id: "a"}), samples}
        })));

        await act(async () => {
            await result.current.send(["a"]);
        });

        expect(openURL).not.toHaveBeenCalled();
        expect(notifyMock).toHaveBeenCalledWith({
            tone: "error",
            message: BATCH_HANDOFF_TOO_LARGE
        });
        expect(notifyMock).not.toHaveBeenCalledWith({
            tone: "error",
            message: BATCH_HANDOFF_OPEN_FAILED
        });
    });

    it("reports a rejected open to the user as a Beanconqueror error", async () => {
        openURL.mockRejectedValueOnce(new Error("no handler"));
        const {result} = await renderHook(() => useBrewBatchHandoff(source({
            a: {record: brew({id: "a"}), samples}
        })));

        await act(async () => {
            await result.current.send(["a"]);
        });

        expect(notifyMock).toHaveBeenCalledWith({
            tone: "error",
            message: BATCH_HANDOFF_OPEN_FAILED
        });
    });

    it("answers whether the selected ids fit without opening Beanconqueror", async () => {
        const {result} = await renderHook(() => useBrewBatchHandoff(source({
            a: {record: brew({id: "a"}), samples}
        })));

        expect(result.current.fits(["a"])).toBe(true);
        expect(result.current.fits(["missing"])).toBe(false);
        expect(openURL).not.toHaveBeenCalled();
    });

    it("ignores a second press while the first handoff is still in flight", async () => {
        let release!: () => void;
        openURL.mockImplementationOnce(
            () => new Promise<void>((resolve) => { release = resolve; })
        );
        const {result} = await renderHook(() => useBrewBatchHandoff(source({
            a: {record: brew({id: "a"}), samples}
        })));
        let first!: Promise<void>;
        let second!: Promise<void>;

        await act(async () => {
            first = result.current.send(["a"]);
            await Promise.resolve();
        });

        expect(result.current.busy).toBe(true);

        await act(async () => {
            second = result.current.send(["a"]);
            expect(openURL).toHaveBeenCalledTimes(1);
            release();
            await Promise.all([first, second]);
        });

        expect(openURL).toHaveBeenCalledTimes(1);
        expect(result.current.busy).toBe(false);
    });

    it("builds each brew once while the selection is being ticked", async () => {
        const records = {a: {record: brew({id: "a"}), samples},
                         b: {record: brew({id: "b"}), samples}};
        const load = jest.fn(source(records));
        const {result} = await renderHook(() => useBrewBatchHandoff(load));

        await act(async () => { result.current.fits(["a"]); });
        await act(async () => { result.current.fits(["a", "b"]); });

        // Two brews, two reads: ticking the second box must not send the first
        // back to the database, or the work grows with the square of the
        // selection and every tick reads thousands of samples again.
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("reads the database afresh when the batch is actually sent", async () => {
        const records = {a: {record: brew({id: "a"}), samples}};
        const load = jest.fn(source(records));
        const {result} = await renderHook(() => useBrewBatchHandoff(load));

        await act(async () => { result.current.fits(["a"]); });
        load.mockClear();
        await act(async () => { await result.current.send(["a"]); });

        // What is handed over is read at the press, not recovered from the
        // cache that answered the fits question some taps earlier.
        expect(load).toHaveBeenCalledWith("a");
    });

    it("forgets what it built when the selection is reset", async () => {
        const records = {a: {record: brew({id: "a"}), samples}};
        const load = jest.fn(source(records));
        const {result} = await renderHook(() => useBrewBatchHandoff(load));

        await act(async () => { result.current.fits(["a"]); });
        await act(async () => { result.current.reset(); });
        load.mockClear();
        await act(async () => { result.current.fits(["a"]); });

        expect(load).toHaveBeenCalledWith("a");
    });

    it("uses handoff failure copy without any dash characters", () => {
        for (const message of [
            BATCH_HANDOFF_OPEN_FAILED,
            BATCH_HANDOFF_TOO_LARGE,
            BATCH_HANDOFF_EMPTY
        ]) {
            expect(message).not.toMatch(/[-–—]/);
        }
    });
});
