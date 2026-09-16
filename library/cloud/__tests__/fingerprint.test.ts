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

/**
 * Every field the digest covers, and how to change it.
 *
 * The hand-written tests above each name one field, which left the other
 * eighteen unguarded: a review proved that `pauseTime` and fifteen others
 * could be deleted from the digest with the whole suite still green. That is
 * the "too blind" failure -- a real edit the fingerprint cannot see, and a
 * sync that overwrites the user's work believing nothing had changed. A table
 * is the only form of this test that does not rot as fields are added.
 */
const COVERED: [string, (r: Recipe) => void][] = [
    ["name",           (r) => { r.name = "Other"; }],
    ["xid",            (r) => { r.xid = "ZZZZ"; }],
    ["dosage",         (r) => { r.dosage += 1; }],
    ["ratio",          (r) => { r.ratio += 1; }],
    ["grindSize",      (r) => { r.grindSize += 1; }],
    ["grindRPM",       (r) => { r.grindRPM += 1; }],
    ["grinder",        (r) => { r.grinder = !r.grinder; }],
    ["cupType",        (r) => { r.cupType = r.cupType === 1 ? 2 : 1; }],
    ["defaultCups",    (r) => { r.defaultCups += 1; }],
    ["bypassEnabled",  (r) => { r.bypassEnabled = !r.bypassEnabled; }],
    ["bypassVolume",   (r) => { r.bypassVolume += 1; }],
    ["bypassTemp",     (r) => { r.bypassTemp += 1; }],
    ["pours.length",   (r) => { r.pours.push(new Pour(2, 100, 90, 3, 0, 0, 20)); }],
    ["pourNumber",     (r) => { r.pours[0].pourNumber += 1; }],
    ["volume",         (r) => { r.pours[0].volume += 1; }],
    ["temperature",    (r) => { r.pours[0].temperature += 1; }],
    ["flowRate",       (r) => { r.pours[0].flowRate += 1; }],
    ["agitation",      (r) => { r.pours[0].setAgitation(3); }],
    ["pourPattern",    (r) => { r.pours[0].pourPattern += 1; }],
    ["pauseTime",      (r) => { r.pours[0].pauseTime += 1; }],
];

describe("every field the digest claims to cover", () => {
    it.each(COVERED)("notices a change to %s", async (_field, change) => {
        const before = make();
        const after = make();
        change(after);
        expect(fingerprint(after)).not.toBe(fingerprint(before));
    });
});

/**
 * The other direction. Touching any of these must NOT move the digest, or
 * importing a recipe, colouring it, or writing it to a card would each mark
 * it as edited by the user before the user had touched it.
 */
const IGNORED: [string, (r: Recipe) => void][] = [
    ["uuid",             (r) => { r.uuid = "different-uuid"; }],
    ["key",              (r) => { r.key = "different-key"; }],
    ["accentIndex",      (r) => { r.accentIndex = 4; }],
    ["createdAt",        (r) => { r.createdAt = 1234567890; }],
    ["source",           (r) => { r.source = "duplicate"; }],
    ["shareId",          (r) => { r.shareId = "abc"; }],
    ["shareUrl",         (r) => { r.shareUrl = "https://example.test/x"; }],
    ["sharedTableId",    (r) => { r.sharedTableId = 77; }],
    ["backup",           (r) => { r.backup = [1, 2, 3]; }],
    ["offline_backup",   (r) => { r.offline_backup = [4, 5, 6]; }],
    ["uid",              (r) => { r.uid = [7, 8, 9]; }],
    ["cloudId",          (r) => { r.cloudId = 4242; }],
    ["cloudFingerprint", (r) => { r.cloudFingerprint = "stamped"; }],
    ["xbloomName",       (r) => { r.xbloomName = "Refreshed From Cloud"; }],
    ["checksum",         (r) => { r.checksum = 123; }],
    ["shareSnapshot",    (r) => { r.shareSnapshot = "snapshot"; }],
];

describe("what the digest must stay blind to", () => {
    it.each(IGNORED)("ignores %s", async (_field, change) => {
        const before = make();
        const after = make();
        change(after);
        expect(fingerprint(after)).toBe(fingerprint(before));
    });
});

it("cannot be forged by a name containing the field separator", async () => {
    // Joining on a separator is only unambiguous if no value can contain it.
    // `name` and `xbloomName` are whatever the user typed, so a name carrying
    // the separator could reproduce another recipe's parts string exactly and
    // the two would hash equal -- "unchanged", which is the state a sync may
    // overwrite without asking. The encoding has to rule it out, not the hash.
    // Both of these join to the same three-part string, "Kenya|Pour|Over".
    const a = make();
    a.name = "Kenya";
    a.xid = "Pour\u001fOver";

    const b = make();
    b.name = "Kenya\u001fPour";
    b.xid = "Over";

    expect(fingerprint(a)).not.toBe(fingerprint(b));
});
