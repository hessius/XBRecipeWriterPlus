import {brewToRate, RATING_PROMPT_WINDOW_MS} from "@/library/brew/ratingPrompt";
import type {StoredBrew} from "@/library/BrewDatabase";

const NOW = 1_700_000_000_000;

function brew(over: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "b1",
        recipeUuid: "r1",
        recipeName: "Morning Bloem",
        accent: "#ff8800",
        startedAt: NOW - 20 * 60_000,
        pouringAt: NOW - 19 * 60_000,
        endedAt: NOW - 60_000,
        outcome: "done",
        failure: null,
        pours: 3,
        waterTotal: 260,
        cupTotal: 244,
        heldSeconds: 0,
        rating: 0,
        note: "",
        pinned: false,
        hasStream: true,
        ...over
    } as StoredBrew;
}

const ASK = {now: NOW, dismissedId: "", enabled: true};

describe("brewToRate", () => {
    it("asks about a finished, watched, unrated brew", () => {
        const candidate = brew();
        expect(brewToRate({brew: candidate, ...ASK})).toBe(candidate);
    });

    it("has nothing to ask about when there is no brew", () => {
        expect(brewToRate({brew: null, ...ASK})).toBeNull();
    });

    it("does not ask about a brew that is already rated", () => {
        expect(brewToRate({brew: brew({rating: 4}), ...ASK})).toBeNull();
    });

    it("does not ask about a brew that never made a cup", () => {
        expect(brewToRate({brew: brew({outcome: "cancelled"}), ...ASK})).toBeNull();
    });

    it("does not ask about a brew nobody watched", () => {
        expect(brewToRate({brew: brew({watched: false}), ...ASK})).toBeNull();
    });

    it("does not ask again once the question was dismissed", () => {
        expect(brewToRate({brew: brew(), ...ASK, dismissedId: "b1"})).toBeNull();
    });

    it("does not ask when the user has turned the question off", () => {
        expect(brewToRate({brew: brew(), ...ASK, enabled: false})).toBeNull();
    });

    it("still asks a moment inside the window", () => {
        const candidate = brew({endedAt: NOW - RATING_PROMPT_WINDOW_MS + 1_000});
        expect(brewToRate({brew: candidate, ...ASK})).toBe(candidate);
    });

    it("stops asking once the window has passed", () => {
        const candidate = brew({endedAt: NOW - RATING_PROMPT_WINDOW_MS - 1_000});
        expect(brewToRate({brew: candidate, ...ASK})).toBeNull();
    });

    it("ignores a brew that claims to have ended in the future", () => {
        expect(brewToRate({brew: brew({endedAt: NOW + 60_000}), ...ASK})).toBeNull();
    });

    it("counts sixteen hours as the window", () => {
        expect(RATING_PROMPT_WINDOW_MS).toBe(16 * 60 * 60 * 1000);
    });
});
