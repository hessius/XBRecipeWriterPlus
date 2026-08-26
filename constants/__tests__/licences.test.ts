import {LICENCES} from "@/constants/licences";

describe("the generated licence list", () => {
    it("is not empty", () => {
        expect(LICENCES.length).toBeGreaterThan(0);
    });

    it("names a licence and a version for every entry", () => {
        for (const entry of LICENCES) {
            expect(entry.name).toBeTruthy();
            expect(entry.version).toBeTruthy();
            expect(entry.licence).toBeTruthy();
        }
    });

    it("is sorted, so a regeneration produces a readable diff", () => {
        const names = LICENCES.map((entry) => entry.name);
        expect([...names].sort()).toEqual(names);
    });

    it("lists no package twice", () => {
        const names = LICENCES.map((entry) => entry.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("covers the dependencies this app actually declares", () => {
        // A generator that quietly misses the tree is worse than no list: it
        // produces a confident, wrong one, and the obligation here is legal.
        const names = new Set(LICENCES.map((entry) => entry.name));
        for (const declared of ["expo", "react", "react-native", "tamagui"]) {
            expect(names.has(declared)).toBe(true);
        }
    });
});
