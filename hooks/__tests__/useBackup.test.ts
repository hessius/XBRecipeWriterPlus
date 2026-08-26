import {renderHook, act} from "@testing-library/react-native";

import {useBackup} from "@/hooks/useBackup";
import Recipe from "@/library/Recipe";

/**
 * expo-file-system's SDK 57 API replaced `documentDirectory` /
 * `writeAsStringAsync` / `readAsStringAsync` with a `File`/`Directory`/`Paths`
 * object model, all synchronous except the streaming/network helpers. This
 * mocks that current shape rather than the retired one, per the plan's own
 * warning not to reach for the legacy path just to keep an old test shape.
 */
const mockCreate = jest.fn();
const mockWrite = jest.fn();
const mockText = jest.fn();
const mockShareAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockGetDocumentAsync = jest.fn();
// Set by the fake File constructor so a test can assert on the path a real
// File instance would have been created with.
let mockLastFileUri = "";

jest.mock("expo-file-system", () => ({
    Paths: {document: {uri: "file:///docs"}},
    File: class {
        uri: string;

        constructor(...uris: unknown[]) {
            this.uri = uris
                .map((part) => (typeof part === "string" ? part : (part as {uri: string}).uri))
                .join("/");
            mockLastFileUri = this.uri;
        }

        create(...args: unknown[]) {
            return mockCreate(...args);
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
        mockIsAvailableAsync.mockResolvedValue(true);
        mockShareAsync.mockResolvedValue(undefined);
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
});

describe("pickBackup", () => {
    beforeEach(() => jest.clearAllMocks());

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
