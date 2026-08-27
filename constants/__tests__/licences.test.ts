import {LICENCES, LICENCE_TEXTS} from "@/constants/licences";

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

    it("keeps the full licence body, not just the copyright line", () => {
        // The compliance failure this whole feature exists to fix: MIT obliges
        // "the above copyright notice AND this permission notice" to travel with
        // the software, and the generator used to keep only the copyright. So a
        // package whose body is recorded must carry the permission notice, not a
        // one-line stub of it.
        const mit = LICENCES.find(
            (entry) => entry.licence === "MIT" && entry.text !== undefined
        );
        expect(mit).toBeDefined();
        const body = LICENCE_TEXTS[mit!.text!];
        const flat = body.replace(/\s+/g, " ");
        expect(flat).toContain("Permission is hereby granted");
        expect(flat).toContain("this permission notice shall be included");
    });

    it("points every text key at a body that exists", () => {
        // A dangling key would render an empty sheet — worse than no link,
        // because it looks like the licence was reproduced and was not.
        for (const entry of LICENCES) {
            if (entry.text !== undefined) {
                expect(LICENCE_TEXTS[entry.text]).toBeTruthy();
            }
        }
    });

    it("deduplicates bodies rather than shipping one per package", () => {
        // The point of keying the table on the body: hundreds of MIT packages
        // must collapse onto a handful of distinct bodies, or the file would be
        // megabytes of near-identical text. Far fewer bodies than packages that
        // reference one is the invariant that keeps the bundle small.
        const withText = LICENCES.filter((entry) => entry.text !== undefined);
        expect(withText.length).toBeGreaterThan(100);
        expect(Object.keys(LICENCE_TEXTS).length).toBeLessThan(withText.length / 2);
    });

    it("keeps each package's own copyright even when the body is shared", () => {
        // Deduplicating the body must not take the per-package copyright with
        // it: two MIT packages share the body but name different holders, and
        // both notices have to survive.
        const shared = LICENCES.filter(
            (entry) => entry.text !== undefined && entry.copyright !== undefined
        );
        expect(shared.length).toBeGreaterThan(1);
        const copyrights = new Set(shared.map((entry) => entry.copyright));
        expect(copyrights.size).toBeGreaterThan(1);
    });
});
