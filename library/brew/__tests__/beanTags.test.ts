import {
    BEAN_FIELDS, ROASTS, PROCESSES, FERMENTATIONS,
    isRoast, isProcess, isFermentation, processFromPodText,
    normaliseBeanTags, MAX_BEAN_TAGS, MAX_BEAN_TAG_LENGTH, MAX_ORIGIN_LENGTH,
    resolvedOrigin, resolvedProcess
} from "../beanTags";
import type {BrewRecord} from "../BrewRecord";

const brew = (over: Partial<BrewRecord> = {}) =>
    ({id: "a", ...over}) as BrewRecord;

describe("the vocabulary", () => {
    it("names every preset field once", () => {
        expect(BEAN_FIELDS).toEqual(["origin", "roast", "process", "fermentation"]);
    });

    it("offers the roast levels the design settled on", () => {
        expect(ROASTS).toEqual(["Light", "Medium", "Dark"]);
    });

    it("keeps fruit removal and fermentation as separate vocabularies", () => {
        expect(PROCESSES).toEqual(["Washed", "Natural", "Honey"]);
        expect(FERMENTATIONS).toEqual([
            "Anaerobic", "Carbonic maceration", "Lactic", "Co-ferment", "Experimental"
        ]);
    });
});

describe("the guards", () => {
    it("accepts a value from its own vocabulary", () => {
        expect(isRoast("Medium")).toBe(true);
        expect(isProcess("Washed")).toBe(true);
        expect(isFermentation("Co-ferment")).toBe(true);
    });

    it("refuses a value from another field's vocabulary", () => {
        expect(isProcess("Anaerobic")).toBe(false);
        expect(isFermentation("Washed")).toBe(false);
    });

    it("refuses the empty string, which is how unset is stored", () => {
        expect(isRoast("")).toBe(false);
        expect(isProcess("")).toBe(false);
    });

    it("refuses a near miss rather than repairing it", () => {
        expect(isProcess("washed")).toBe(false);
        expect(isRoast("Medium Dark")).toBe(false);
    });
});

describe("reading a process out of a pod", () => {
    it("matches a pod's wording case-insensitively", () => {
        expect(processFromPodText("washed")).toBe("Washed");
        expect(processFromPodText("  NATURAL  ")).toBe("Natural");
    });

    it("finds the fruit removal term inside a longer description", () => {
        expect(processFromPodText("anaerobic natural")).toBe("Natural");
    });

    it("gives nothing rather than guessing when no term matches", () => {
        expect(processFromPodText("experimental lot 4")).toBeUndefined();
        expect(processFromPodText("")).toBeUndefined();
        expect(processFromPodText(undefined)).toBeUndefined();
    });

    it("gives nothing when two terms match, because the pod is ambiguous", () => {
        expect(processFromPodText("washed and natural blend")).toBeUndefined();
    });
});

describe("custom tags", () => {
    it("trims, drops blanks and dedupes by folded form", () => {
        expect(normaliseBeanTags(["  Kenya ", "kenya", "", "   "]))
            .toEqual(["Kenya"]);
    });

    it("keeps the first spelling seen", () => {
        expect(normaliseBeanTags(["KENYA", "Kenya"])).toEqual(["KENYA"]);
    });

    it("drops a tag longer than the limit rather than truncating it", () => {
        const long = "x".repeat(MAX_BEAN_TAG_LENGTH + 1);
        expect(normaliseBeanTags([long, "fine"])).toEqual(["fine"]);
    });

    it("stops at the ceiling", () => {
        const many = Array.from({length: MAX_BEAN_TAGS + 5}, (_, i) => `tag${i}`);
        expect(normaliseBeanTags(many)).toHaveLength(MAX_BEAN_TAGS);
    });

    it("refuses anything that is not a string", () => {
        expect(normaliseBeanTags([1, null, {}, "ok"] as unknown as string[]))
            .toEqual(["ok"]);
    });
});

describe("origin", () => {
    it("has a ceiling so a backup cannot smuggle a document through it", () => {
        expect(MAX_ORIGIN_LENGTH).toBeGreaterThan(0);
    });
});

describe("resolving what the coffee was", () => {
    it("prefers what the user said", () => {
        const record = brew({
            origin: "Nyeri",
            process: "Honey",
            coffee: {name: "Pod", origin: "Huila", process: "washed"}
        });
        expect(resolvedOrigin(record)).toBe("Nyeri");
        expect(resolvedProcess(record)).toBe("Honey");
    });

    it("falls back to the pod when the user has not said", () => {
        const record = brew({coffee: {name: "Pod", origin: "Huila", process: "washed"}});
        expect(resolvedOrigin(record)).toBe("Huila");
        expect(resolvedProcess(record)).toBe("Washed");
    });

    it("ignores non-string origins from untrusted records and pods", () => {
        const withBadUserOrigin = brew({
            origin: 42,
            coffee: {name: "Pod", origin: "Huila"}
        } as unknown as Partial<BrewRecord>);
        const withBadPodOrigin = brew({
            coffee: {name: "Pod", origin: 42}
        } as unknown as Partial<BrewRecord>);

        expect(resolvedOrigin(withBadUserOrigin)).toBe("Huila");
        expect(resolvedOrigin(withBadPodOrigin)).toBeUndefined();
    });

    it.each([
        ["pod field present but empty", {coffee: {name: "Pod", origin: ""}}, undefined],
        ["pod field only whitespace", {coffee: {name: "Pod", origin: "   "}}, undefined],
        ["user field present but empty", {origin: "", coffee: {name: "Pod", origin: "Huila"}}, "Huila"],
        ["user field only whitespace", {origin: "   ", coffee: {name: "Pod", origin: "Huila"}}, "Huila"]
    ])("treats %s as unset", (_label, record, expected) => {
        expect(resolvedOrigin(brew(record as Partial<BrewRecord>))).toBe(expected);
    });

    it("is unset when neither has said", () => {
        expect(resolvedOrigin(brew())).toBeUndefined();
        expect(resolvedProcess(brew())).toBeUndefined();
    });

    it("stays unset rather than guessing at a process it cannot match", () => {
        const record = brew({coffee: {name: "Pod", process: "experimental lot 4"}});
        expect(resolvedProcess(record)).toBeUndefined();
    });

    it("takes only the half of a pod's wording that it understands", () => {
        // "anaerobic natural" names both axes. Only the fruit removal term is
        // ours to read. There is deliberately no pod fermentation resolver, so
        // the fermentation stays for the user to state.
        const record = brew({coffee: {name: "Pod", process: "anaerobic natural"}});
        expect(resolvedProcess(record)).toBe("Natural");
    });
});
