import {renderHook, act} from "@testing-library/react-native";

import {useBackup} from "@/hooks/useBackup";
import Recipe from "@/library/Recipe";

/**
 * expo-file-system's SDK 57 API replaced `documentDirectory` /
 * `writeAsStringAsync` / `readAsStringAsync` with a `File`/`Directory`/`Paths`
 * object model, all synchronous except the streaming/network helpers. This
 * mocks that current shape rather than the retired one, per the plan's own
 * warning not to reach for the legacy path just to keep an old test shape.
 *
 * It keeps a real set of paths rather than a bag of bare jest.fn()s, because a
 * mock with no notion of a filesystem cannot disagree with the SDK — and the
 * one behaviour that matters here is a disagreement: `File.create()` throws
 * when the path already exists unless `overwrite` is passed. A stateless mock
 * reports a green suite for an export that fails the second time it is used.
 */
const mockWrite = jest.fn();
const mockText = jest.fn();
const mockShareAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockGetDocumentAsync = jest.fn();
const mockFiles = new Set<string>();
// Set by the fake File constructor so a test can assert on the path a real
// File instance would have been created with.
let mockLastFileUri = "";
let mockLastCreateOptions: unknown;

jest.mock("expo-file-system", () => ({
    Paths: {document: {uri: "file:///docs"}, cache: {uri: "file:///cache"}},
    File: class {
        uri: string;

        constructor(...uris: unknown[]) {
            this.uri = uris
                .map((part) => (typeof part === "string" ? part : (part as {uri: string}).uri))
                .join("/");
            mockLastFileUri = this.uri;
        }

        create(options?: {overwrite?: boolean}) {
            mockLastCreateOptions = options;
            if (mockFiles.has(this.uri) && options?.overwrite !== true) {
                throw new Error("file already exists");
            }
            mockFiles.add(this.uri);
        }

        delete() {
            mockFiles.delete(this.uri);
        }

        write(...args: unknown[]) {
            return mockWrite(...args);
        }

        text(...args: unknown[]) {
            return mockText(...args);
        }
    }
}));
jest.mock("expo-sharing", () => ({
    shareAsync: (...args: unknown[]) => mockShareAsync(...args),
    isAvailableAsync: () => mockIsAvailableAsync()
}));
jest.mock("expo-document-picker", () => ({
    getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args)
}));

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

describe("exportBackup", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFiles.clear();
        mockLastCreateOptions = undefined;
        // clearAllMocks keeps implementations, and one of these tests makes
        // write() throw; without this the next test inherits a full disk.
        mockWrite.mockReset();
        mockIsAvailableAsync.mockResolvedValue(true);
        mockShareAsync.mockResolvedValue(undefined);
    });

    it("writes to the cache, not to the documents the user keeps", async () => {
        // The share sheet takes a copy to wherever the user chose; this file is
        // scaffolding. In the document directory it would be a permanent second
        // copy of the whole library, inside the device's own cloud backup, that
        // the app never shows and never prunes.
        const {result} = await renderHook(() => useBackup());

        await act(async () => {
            await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(mockLastFileUri).toMatch(/^file:\/\/\/cache\//);
    });

    it("can be run twice on the same day", async () => {
        // The name carries only the date, so the second export of any day meets
        // a file this app wrote an hour ago. create() throws on an existing
        // path unless told otherwise, and the failure it produced blamed the
        // device for the app's own leftovers.
        const {result} = await renderHook(() => useBackup());

        let first;
        let second;
        await act(async () => {
            first = await result.current.exportBackup([recipeNamed("A", "u1")], {});
            second = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(first).toEqual({ok: true});
        expect(second).toEqual({ok: true});
        expect(mockLastCreateOptions).toEqual({overwrite: true});
    });

    it("writes a dated file and opens the share sheet", async () => {
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(outcome).toEqual({ok: true});
        expect(mockLastFileUri).toMatch(/xbrw-backup-\d{4}-\d{2}-\d{2}\.json$/);
        const [contents] = mockWrite.mock.calls[0];
        expect(JSON.parse(contents).format).toBe("xbrw-backup");
        expect(mockShareAsync).toHaveBeenCalledWith(mockLastFileUri, expect.anything());
    });

    it("says so when there is no share sheet, rather than leaving a dead button", async () => {
        mockIsAvailableAsync.mockResolvedValue(false);
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(outcome).toEqual({ok: false, reason: expect.stringMatching(/cannot share/i)});
    });

    it("reports a write that failed instead of claiming success", async () => {
        mockWrite.mockImplementation(() => {
            throw new Error("disk full");
        });
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(outcome).toEqual({ok: false, reason: expect.stringMatching(/could not be written/i)});
    });

    it("leaves no half-written file behind when the write fails", async () => {
        // A truncated file that looks like a backup is worse than no file: the
        // user finds it later and trusts it.
        mockWrite.mockImplementation(() => {
            throw new Error("disk full");
        });
        const {result} = await renderHook(() => useBackup());

        await act(async () => {
            await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(mockFiles.size).toBe(0);
    });

    it("says so when the share sheet itself fails, and clears up after itself", async () => {
        mockShareAsync.mockRejectedValue(new Error("no handler"));
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(outcome).toEqual({ok: false, reason: expect.stringMatching(/could not be shared/i)});
        expect(mockFiles.size).toBe(0);
    });
});

describe("pickBackup", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFiles.clear();
    });

    it("tells apart a browser that would not open from a file that would not read", async () => {
        // Three ways of failing arrived as one sentence, which left the user
        // retrying the one thing that cannot work.
        mockGetDocumentAsync.mockRejectedValue(new Error("no activity"));
        const {result} = await renderHook(() => useBackup());

        let outcome: Awaited<ReturnType<typeof result.current.pickBackup>>;
        await act(async () => {
            outcome = await result.current.pickBackup();
        });

        expect(outcome!.cancelled).toBe(false);
        if (outcome!.cancelled) return;
        if (outcome!.result.ok) throw new Error("expected a failure");
        expect(outcome!.result.reason).toMatch(/file browser/i);
    });

    it("says nothing when the picker was cancelled", async () => {
        // The user withdrew. There is no failure to report and a message would
        // be the app arguing with a decision.
        mockGetDocumentAsync.mockResolvedValue({canceled: true});
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.pickBackup();
        });

        expect(outcome).toEqual({cancelled: true});
    });

    it("parses the chosen file", async () => {
        mockGetDocumentAsync.mockResolvedValue({
            canceled: false, assets: [{uri: "file:///picked.json"}]
        });
        mockText.mockResolvedValue(JSON.stringify({
            format: "xbrw-backup", version: 1,
            recipes: [JSON.parse(JSON.stringify(recipeNamed("A", "u1")))]
        }));
        const {result} = await renderHook(() => useBackup());

        let outcome: Awaited<ReturnType<typeof result.current.pickBackup>>;
        await act(async () => {
            outcome = await result.current.pickBackup();
        });

        expect(outcome!.cancelled).toBe(false);
        if (outcome!.cancelled) return;
        expect(outcome!.result.ok).toBe(true);
    });

    it("reports a file it could not read", async () => {
        mockGetDocumentAsync.mockResolvedValue({
            canceled: false, assets: [{uri: "file:///picked.json"}]
        });
        mockText.mockRejectedValue(new Error("gone"));
        const {result} = await renderHook(() => useBackup());

        let outcome: Awaited<ReturnType<typeof result.current.pickBackup>>;
        await act(async () => {
            outcome = await result.current.pickBackup();
        });

        expect(outcome!.cancelled).toBe(false);
        if (outcome!.cancelled) return;
        expect(outcome!.result.ok).toBe(false);
        if (outcome!.result.ok) return;
        expect(outcome!.result.reason).toMatch(/could not be read/i);
    });
});
