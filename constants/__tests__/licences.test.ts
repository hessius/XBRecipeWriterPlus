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

    it("resolves a real licence and version for (nearly) every entry", () => {
        // toBeTruthy() above passes for the sentinels the generator itself
        // writes when a lookup fails ("unknown", "not installed", "See
        // package") — this is the assertion a broken resolver still passes.
        // A handful of "See package" is an honest admission that a package
        // ships no licence file to point to (verified against the tree: 5,
        // all published without one), which is different from the generator
        // having failed to look at 27% of the tree. "unknown" and
        // "not installed" mean exactly that failure, so those get no
        // allowance at all.
        const noVersion = LICENCES.filter((entry) => entry.version === "not installed");
        const noLicence = LICENCES.filter((entry) => entry.licence === "unknown");
        const unresolved = LICENCES.filter((entry) => entry.licence === "See package");

        expect(noVersion).toHaveLength(0);
        expect(noLicence).toHaveLength(0);
        expect(unresolved.length).toBeLessThanOrEqual(10);
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

    it("is the right order of magnitude next to the real dependency tree", () => {
        // The generator used to resolve only node_modules/<name>/package.json
        // and silently drop everything nested (node_modules/expo/node_modules/
        // @expo/cli and its whole subtree, for instance) — a coverage bug
        // this list's length can't catch on its own, so it is pinned against
        // the real tree instead of just against zero. `npm ls --omit=dev --all`
        // reports 831 unique package names on this machine (12 of which are
        // optional natives for a different platform and were never installed
        // here), so anything well under 800 means the walk is dropping
        // subtrees again.
        expect(LICENCES.length).toBeGreaterThan(750);
        expect(LICENCES.length).toBeLessThan(900);
    });
});
