import Recipe from "@/library/Recipe";
import {editsPendingSave, snapshotForSave} from "@/library/recipeDirty";

function recipe(): Recipe {
    const r = new Recipe();
    r.uuid = "u1";
    r.dosage = 18;
    r.ratio = 16;
    r.addOpeningPour();
    return r;
}

describe("recipeDirty", () => {
    it("sees no pending edit in an untouched recipe", () => {
        const r = recipe();
        expect(editsPendingSave(r, snapshotForSave(r, true), true)).toBe(false);
    });

    it("sees a changed dose", () => {
        const r = recipe();
        const opened = snapshotForSave(r, true);
        r.dosage = 19;
        expect(editsPendingSave(r, opened, true)).toBe(true);
    });

    it("sees a changed stage volume", () => {
        const r = recipe();
        const opened = snapshotForSave(r, true);
        r.pours[0].volume = 120;
        expect(editsPendingSave(r, opened, true)).toBe(true);
    });

    it("forgets an edit that was typed back to where it started", () => {
        // A prompt for work that no longer differs from the stored row is a
        // prompt the user cannot act on meaningfully, and it teaches them to
        // dismiss the one that matters.
        const r = recipe();
        const opened = snapshotForSave(r, true);
        r.dosage = 19;
        r.dosage = 18;
        expect(editsPendingSave(r, opened, true)).toBe(false);
    });

    it("ignores the fields that write themselves", () => {
        // Name, note and tags autosave; favourite and the rating already did.
        // A prompt for them would offer to discard something already stored.
        const r = recipe();
        const opened = snapshotForSave(r, true);
        r.name = "Sunday";
        r.description = "Sweet";
        r.setTags(["morning"]);
        r.favourite = true;
        r.accentIndex = 3;
        expect(editsPendingSave(r, opened, true)).toBe(false);
    });

    it("counts metadata when no row is writing it separately", () => {
        // A card read or unfinished import has no stored row, so the metadata
        // cannot autosave. In that case it must stay in the leave-guard
        // projection or it can be lost silently.
        const r = recipe();
        const opened = snapshotForSave(r, false);
        r.name = "Sunday";
        r.description = "Sweet";
        r.setTags(["morning"]);
        expect(editsPendingSave(r, opened, false)).toBe(true);
    });

    it("counts a field nobody thought about", () => {
        // The projection is a denylist on purpose. This test is the reason:
        // it fails if someone turns it into an allowlist of known card fields,
        // because an unlisted field would then go unnoticed and a user's work
        // would be discarded with no prompt.
        const r = recipe();
        const opened = snapshotForSave(r, true);
        (r as unknown as Record<string, unknown>).somethingAddedLater = 7;
        expect(editsPendingSave(r, opened, true)).toBe(true);
    });

    it("does not depend on the order the keys were assigned in", () => {
        // The snapshot is compared as text, so an unstable key order would
        // report a change on every open.
        const opened = snapshotForSave({
            uuid: "u1",
            dosage: 18,
            pours: [{volume: 100, temperature: 93}]
        } as unknown as Recipe, true);
        const rebuilt = {
            pours: [{temperature: 93, volume: 100}],
            dosage: 18,
            uuid: "u1"
        } as unknown as Recipe;
        expect(editsPendingSave(rebuilt, opened, true)).toBe(false);
    });
});
