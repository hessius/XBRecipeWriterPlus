/**
 * The facet vocabularies, and the one fetch that gets them.
 *
 * `fetchHubCriteria` is mocked at the module boundary rather than through
 * `global.fetch`, because what is being tested here is the caching and the
 * roast mapping, not the wire.
 */
import {
    loadHubCriteria,
    roastLabel,
    vocabularyNames,
    __resetHubCriteria
} from "@/library/hub/hubCriteria";

const mockFetch = jest.fn();
jest.mock("@/library/hub/hubApi", () => ({
    ...jest.requireActual("@/library/hub/hubApi"),
    fetchHubCriteria: (...args: unknown[]) => mockFetch(...args)
}));

const CRITERIA = {
    originList: [{name: "Brazil", value: "1"}, {name: "Colombia", value: "5"}],
    varietalList: [{name: "Bourbon", value: "23"}],
    roastList: [
        {name: "Light Roast", value: "1"},
        {name: "Medium-Light Roast", value: "2"},
        {name: "Medium Roast", value: "3"}
    ],
    flavorList: [{name: "Apple", value: "47"}],
    machineList: [{name: "Studio", value: "J15"}, {name: "Original", value: "J20"}],
    cupTypeList: [{name: "xPod", value: "1"}],
    processingList: [{name: "Washed", value: "87"}],
    coffeeTypeList: [{name: "Single Origin", value: "95"}]
};

beforeEach(() => {
    __resetHubCriteria();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(CRITERIA);
});

describe("loading the vocabularies", () => {
    it("fetches them once and holds them for the session", async () => {
        // 28 origins, 49 varietals and 93 flavours do not change while
        // somebody is browsing, and every chip needs them.
        await loadHubCriteria();
        await loadHubCriteria();

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does not fetch twice for two callers that overlap", async () => {
        // The screen opens and asks; a chip mounts and asks before the first
        // answer has landed. One request, both answered.
        const [a, b] = await Promise.all([loadHubCriteria(), loadHubCriteria()]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(a).toBe(b);
    });

    it("lets a failed load be retried", async () => {
        // A cached rejection would mean one flight-mode moment cost the chips
        // for the whole session.
        mockFetch.mockRejectedValueOnce(new Error("offline"));

        await expect(loadHubCriteria()).rejects.toThrow("offline");
        await expect(loadHubCriteria()).resolves.toBe(CRITERIA);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});

describe("naming a roast", () => {
    it("names one the row stated", () => {
        expect(roastLabel(2, CRITERIA)).toBe("Medium-Light Roast");
    });

    it("says nothing about a roast the row left unset", () => {
        // `normaliseHubRow` has already turned 0 into null. This is the other
        // half of the same rule: no label, rather than a guessed one.
        expect(roastLabel(null, CRITERIA)).toBeNull();
    });

    it("says nothing about a roast outside the vocabulary", () => {
        expect(roastLabel(9, CRITERIA)).toBeNull();
    });

    it("says nothing before the vocabularies have loaded", () => {
        // Defends the null-criteria guard: deleting it turns an unloaded
        // vocabulary into a crash instead of "no label yet".
        expect(roastLabel(2, null)).toBeNull();
    });
});

describe("reading vocabulary names", () => {
    it("treats a missing vocabulary as empty", () => {
        // Defends the fallback used while criteria are unavailable.
        expect(vocabularyNames(undefined)).toEqual([]);
    });
});
