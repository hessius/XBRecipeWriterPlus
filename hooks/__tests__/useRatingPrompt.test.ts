import {act, renderHook} from "@testing-library/react-native";
import {AppState} from "react-native";

import {useRatingPrompt, type RatingPromptStore} from "@/hooks/useRatingPrompt";
import {Settings, type SettingsStorage} from "@/library/Settings";
import type {StoredBrew} from "@/library/BrewDatabase";

const NOW = 1_700_000_000_000;

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read: (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

function measuredBrew(id: string, fields: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id,
        recipeUuid: "recipe-1",
        recipeName: "Ethiopia Guji",
        accent: "#C86A3B",
        startedAt: NOW - 20 * 60 * 1000,
        pouringAt: NOW - 19 * 60 * 1000,
        endedAt: NOW - 10 * 60 * 1000,
        outcome: "done",
        failure: null,
        pours: 2,
        waterTotal: 250,
        cupTotal: 244,
        heldSeconds: 0,
        rating: 0,
        note: "",
        pinned: false,
        hasStream: true,
        ...fields
    };
}

type FakePromptStore = RatingPromptStore & {
    next: StoredBrew | null;
    lastMeasuredBrew: jest.Mock<StoredBrew | null, []>;
    judge: jest.Mock<void, [string, {rating?: number; note?: string}]>;
};

function fakeStore(seed: StoredBrew | null): FakePromptStore {
    const store: FakePromptStore = {
        next: seed,
        lastMeasuredBrew: jest.fn<StoredBrew | null, []>(),
        judge: jest.fn()
    };
    store.lastMeasuredBrew.mockImplementation(() => store.next);
    return store;
}

describe("useRatingPrompt", () => {
    beforeEach(() => {
        jest.spyOn(Date, "now").mockReturnValue(NOW);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("offers the last unrated brew", async () => {
        const brew = measuredBrew("b1");
        const store = fakeStore(brew);
        const settings = new Settings(memoryStorage());

        const {result} = await renderHook(() => useRatingPrompt(store, settings));

        expect(result.current.brew?.id).toBe("b1");
    });

    it("offers nothing once that brew is rated", async () => {
        const store = fakeStore(measuredBrew("b1", {rating: 5}));
        const settings = new Settings(memoryStorage());

        const {result} = await renderHook(() => useRatingPrompt(store, settings));

        expect(result.current.brew).toBeNull();
    });

    it("rates through judge and removes the prompt immediately", async () => {
        const store = fakeStore(measuredBrew("b1"));
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useRatingPrompt(store, settings));

        await act(async () => {
            result.current.rate(4);
        });

        expect(store.judge).toHaveBeenCalledWith("b1", {rating: 4});
        expect(result.current.brew).toBeNull();
    });

    it("annotates through judge", async () => {
        const store = fakeStore(measuredBrew("b1"));
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useRatingPrompt(store, settings));

        await act(async () => {
            result.current.annotate("Opened up after it cooled.");
        });

        expect(store.judge).toHaveBeenCalledWith("b1", {
            note: "Opened up after it cooled."
        });
    });

    it("dismisses by storing the brew id and removes the prompt immediately", async () => {
        const store = fakeStore(measuredBrew("b1"));
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useRatingPrompt(store, settings));

        await act(async () => {
            result.current.dismiss();
        });

        expect(settings.get("ratingPromptDismissed")).toBe("b1");
        expect(result.current.brew).toBeNull();
    });

    it("stays quiet when rating prompts are disabled", async () => {
        const store = fakeStore(measuredBrew("b1"));
        const settings = new Settings(memoryStorage());
        settings.set("askForRatings", false);

        const {result} = await renderHook(() => useRatingPrompt(store, settings));

        expect(result.current.brew).toBeNull();
    });

    it("re-reads the candidate only when the app comes back active", async () => {
        let onAppChange: ((state: string) => void) | undefined;
        jest.spyOn(AppState, "addEventListener").mockImplementation(
            ((event: string, handler: (state: string) => void) => {
                if (event === "change") onAppChange = handler;
                return {remove: () => {}};
            }) as typeof AppState.addEventListener
        );
        const store = fakeStore(null);
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useRatingPrompt(store, settings));
        expect(result.current.brew).toBeNull();
        expect(store.lastMeasuredBrew).toHaveBeenCalledTimes(1);

        store.next = measuredBrew("background-brew");
        await act(async () => {
            onAppChange?.("background");
        });
        expect(store.lastMeasuredBrew).toHaveBeenCalledTimes(1);
        expect(result.current.brew).toBeNull();

        store.next = measuredBrew("b2");
        await act(async () => {
            onAppChange?.("active");
        });

        expect(store.lastMeasuredBrew).toHaveBeenCalledTimes(2);
        expect(result.current.brew?.id).toBe("b2");
    });
});
