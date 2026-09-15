import {accents} from "@/constants/colors";
import {MAX_ACCENT_DISTANCE, matchAccent} from "../accentMatch";

describe("matchAccent", () => {
    it("finds Sage for the xBloom green", async () => {
        expect(matchAccent("#B8C9A2", "coffee")).toBe(
            accents.coffee.indexOf("#B4D6A8")
        );
    });

    it("finds Peach for the xBloom tan", async () => {
        expect(matchAccent("#DEC3AF", "coffee")).toBe(
            accents.coffee.indexOf("#F0B98E")
        );
    });

    it("finds Lilac for the xBloom violet", async () => {
        expect(matchAccent("#ABACD1", "coffee")).toBe(
            accents.coffee.indexOf("#BDB2E8")
        );
    });

    it("finds Sky for the xBloom blue", async () => {
        expect(matchAccent("#ADBDDB", "coffee")).toBe(
            accents.coffee.indexOf("#9FC3F0")
        );
    });

    it("returns null for a blue-green in the tea palette", async () => {
        // The tea accents are four warm colours. A blue-green has no
        // neighbour among them: every candidate is roughly three times
        // further away than any real match, and they sit within noise of each
        // other, so "nearest" would be a coin toss that confidently returns a
        // pink. No answer is the honest answer.
        expect(matchAccent("#A2C0C2", "tea")).toBeNull();
    });

    it("returns an exact match at zero distance", async () => {
        expect(matchAccent("#9FC3F0", "coffee")).toBe(0);
    });

    it("only ever answers within its own group", async () => {
        // A tea recipe must never be given a coffee accent: the two halves
        // are what tell the library at a glance which is which.
        const index = matchAccent("#CFD6A3", "tea");
        expect(index).not.toBeNull();
        expect(index!).toBeLessThan(accents.tea.length);
    });

    it("accepts a colour without its hash", async () => {
        expect(matchAccent("9FC3F0", "coffee")).toBe(0);
    });

    it("accepts a three-digit hex", async () => {
        expect(matchAccent("#fff", "coffee")).toBeNull();
    });

    it("returns null for anything that is not a colour", async () => {
        expect(matchAccent("", "coffee")).toBeNull();
        expect(matchAccent("rebeccapurple", "coffee")).toBeNull();
        expect(matchAccent("#12345", "coffee")).toBeNull();
    });

    it("keeps the threshold above every real match and below the tea one", async () => {
        // Guards the number itself: the measured matches sit at 0.032-0.045
        // and the nearest tea candidate at 0.093.
        expect(MAX_ACCENT_DISTANCE).toBeGreaterThan(0.045);
        expect(MAX_ACCENT_DISTANCE).toBeLessThan(0.093);
    });
});

describe("colour values a server might actually send", () => {
    // The import loop runs over every recipe in an account. One recipe with no
    // colour, or a colour of a shape nobody anticipated, must cost that one
    // recipe its accent and nothing else -- never the whole import.
    it.each([
        ["null", null],
        ["undefined", undefined],
        ["an empty string", ""],
        ["a colour name", "rebeccapurple"],
        ["short hex", "#fff"],
        ["a number where a string was promised", 16711680 as unknown as string],
        ["an object", {r: 1} as unknown as string],
    ])("answers null for %s rather than throwing", async (_label, value) => {
        expect(() => matchAccent(value as string, "coffee")).not.toThrow();
        expect(matchAccent(value as string, "coffee")).toBeNull();
    });
});
