import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {fingerprint} from "../fingerprint";

function make(): Recipe {
    const recipe = new Recipe(undefined, undefined);
    recipe.name = "Kenya";
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.pours = [new Pour(1, 150, 93, 3, 0, 0, 30)];
    return recipe;
}

describe("fingerprint", () => {
    it("is stable across two calls on the same recipe", async () => {
        const recipe = make();
        expect(fingerprint(recipe)).toBe(fingerprint(recipe));
    });

    it("is equal for two recipes with the same brewing content", async () => {
        expect(fingerprint(make())).toBe(fingerprint(make()));
    });

    it("changes when the dose changes", async () => {
        const a = make();
        const b = make();
        b.dosage = 19;
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("changes when a pour volume changes", async () => {
        const a = make();
        const b = make();
        b.pours[0].volume = 151;
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("changes when the name changes", async () => {
        const a = make();
        const b = make();
        b.name = "Ethiopia";
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("ignores the uuid", async () => {
        // Two copies of one imported recipe are the same recipe.
        const a = make();
        const b = make();
        b.uuid = "a-completely-different-uuid";
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores the accent", async () => {
        // We assign the accent ourselves at import. If it were covered, every
        // recipe would be marked edited the instant it arrived, and the whole
        // feature would report that the user had changed everything.
        const a = make();
        const b = make();
        b.accentIndex = 5;
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores the card backup buffers", async () => {
        // These change when a card is written. Writing a card is not editing
        // a recipe, and treating it as such would mark a recipe edited for
        // having been used.
        const a = make();
        const b = make();
        b.backup = [1, 2, 3];
        b.offline_backup = [4, 5, 6];
        b.uid = [7, 8];
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores cloudId and cloudFingerprint", async () => {
        // Stamping the fingerprint must not change the fingerprint.
        const a = make();
        const b = make();
        b.cloudId = 12;
        b.cloudFingerprint = "whatever";
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores createdAt", async () => {
        const a = make();
        const b = make();
        b.createdAt = 1700000000000;
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("does not confuse two pours with the same values in a different order", async () => {
        const a = make();
        a.pours = [new Pour(1, 100, 90, 3, 0, 0, 30), new Pour(2, 50, 95, 3, 0, 0, 20)];
        const b = make();
        b.pours = [new Pour(1, 50, 95, 3, 0, 0, 20), new Pour(2, 100, 90, 3, 0, 0, 30)];
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("distinguishes a field boundary rather than concatenating blindly", async () => {
        // "1" + "23" must not collide with "12" + "3".
        const a = make();
        a.dosage = 1;
        a.ratio = 23;
        const b = make();
        b.dosage = 12;
        b.ratio = 3;
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });
});
