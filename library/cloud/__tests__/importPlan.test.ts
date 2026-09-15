import Recipe from "@/library/Recipe";
import {fingerprint} from "../fingerprint";
import {buildImportPlan} from "../importPlan";
import {mapRow} from "../mapRow";

// The plan's fixture used a `pourList` shape the mapper does not read
// (`water`/`pourType`/`speed`/`pauseTime`/`agitation`); the real field names
// are `volume`/`temperature`/`pattern`/`flowRate`/`pausing`/
// `isEnableVibration*`, verified against `mapRow.test.ts` and
// `XBloomRecipe.getRecipe`. A row with the wrong names maps to a recipe with a
// NaN flow rate and no volume, so every fingerprint comparison below would be
// noise.
const row = (over: Record<string, unknown> = {}) => ({
    tableId: 1,
    theName: "Kenya",
    theColor: "#B8C9A2",
    grandWater: 16,
    dose: 18,
    pourCount: 2,
    grinderSize: 60,
    isSetGrinderSize: 1,
    rpm: 100,
    cupType: 1,
    podsVo: {id: "AB12CD"},
    // Two stages, not one of 288 ml: a non-tea stage is capped at 240 ml by
    // `cardLimits.ts`, and the next stop for one of these is a genuine card.
    pourList: [
        {
            pourNumber: 1,
            volume: 144,
            temperature: 93,
            pattern: 1,
            flowRate: 3,
            pausing: 30,
            isEnableVibrationBefore: 0,
            isEnableVibrationAfter: 0,
        },
        {
            pourNumber: 2,
            volume: 144,
            temperature: 93,
            pattern: 2,
            flowRate: 3,
            pausing: 0,
            isEnableVibrationBefore: 0,
            isEnableVibrationAfter: 0,
        },
    ],
    ...over,
});

/**
 * The local recipe that a given row would have produced when imported.
 *
 * The plan hand-reconstructed this recipe, but a hand-built copy has to
 * replicate everything `XBloomRecipe.getRecipe` and `fixRatio` derive, and any
 * drift there makes the fingerprint comparison test something other than what
 * it claims. This is the state we are comparing against, so it is produced by
 * the very mapper the plan uses, then stamped the way `buildImportPlan` stamps
 * a fresh import: accent excluded from the fingerprint on purpose.
 */
function imported(over: Record<string, unknown> = {}): Recipe {
    const mapped = mapRow(row());
    const recipe = mapped!.recipe;
    Object.assign(recipe, over);
    recipe.cloudFingerprint = recipe.cloudFingerprint ?? fingerprint(recipe);
    return recipe;
}

describe("buildImportPlan", () => {
    it("calls a row with no local counterpart new", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries).toHaveLength(1);
        expect(plan.entries[0].status).toBe("new");
    });

    it("selects new rows by default", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries[0].selected).toBe(true);
    });

    it("calls an unchanged local copy unchanged", async () => {
        const plan = buildImportPlan([row()], [imported()]);
        expect(plan.entries[0].status).toBe("unchanged");
    });

    it("does not select an unchanged row", async () => {
        // Importing it again would do nothing but cost a write.
        const plan = buildImportPlan([row()], [imported()]);
        expect(plan.entries[0].selected).toBe(false);
    });

    it("calls a changed row updated when the local copy is untouched", async () => {
        const plan = buildImportPlan([row({dose: 20})], [imported()]);
        expect(plan.entries[0].status).toBe("updated");
        expect(plan.entries[0].selected).toBe(true);
    });

    it("calls a locally edited recipe edited and does not select it", async () => {
        // The whole promise of the feature. A recipe the user has changed
        // here is never re-imported unless they say so.
        const local = imported();
        local.dosage = 22; // edited after import; fingerprint now stale

        const plan = buildImportPlan([row()], [local]);
        expect(plan.entries[0].status).toBe("edited");
        expect(plan.entries[0].selected).toBe(false);
    });

    it("still calls it edited when the cloud side changed too", async () => {
        const local = imported();
        local.dosage = 22;

        const plan = buildImportPlan([row({dose: 20})], [local]);
        expect(plan.entries[0].status).toBe("edited");
        expect(plan.entries[0].selected).toBe(false);
    });

    it("treats a local copy with no stored fingerprint as edited", async () => {
        // It came from an older version of the app, or from a backup. We
        // cannot prove it is untouched, so we must not overwrite it.
        const local = imported();
        local.cloudFingerprint = undefined;

        const plan = buildImportPlan([row({dose: 20})], [local]);
        expect(plan.entries[0].status).toBe("edited");
    });

    it("matches on cloudId and not on name", async () => {
        const local = imported();
        local.cloudId = 99;

        const plan = buildImportPlan([row()], [local]);
        expect(plan.entries[0].status).toBe("new");
    });

    it("ignores local recipes that never came from an account", async () => {
        const stranger = new Recipe(undefined, undefined);
        stranger.name = "Kenya";

        const plan = buildImportPlan([row()], [stranger]);
        expect(plan.entries[0].status).toBe("new");
    });

    it("carries the local uuid on an entry that would replace one", async () => {
        const local = imported();
        const plan = buildImportPlan([row({dose: 20})], [local]);
        expect(plan.entries[0].existingUuid).toBe(local.uuid);
    });

    it("has no existing uuid on a new entry", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    it("drops a row the mapper cannot read and counts it", async () => {
        const plan = buildImportPlan([row(), {tableId: 2}], []);
        expect(plan.entries).toHaveLength(1);
        expect(plan.unreadable).toBe(1);
    });

    it("gives every entry a recipe with an accent already chosen", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries[0].recipe.accentIndex).toBeGreaterThanOrEqual(0);
    });

    it("matches the accent to the xBloom colour when one is near", async () => {
        const plan = buildImportPlan([row()], []);
        // #B8C9A2 is Sage.
        expect(plan.entries[0].recipe.accentIndex).toBe(3);
    });

    it("falls back to assignAccent when no accent is near", async () => {
        const plan = buildImportPlan([row({theColor: "#123456"})], []);
        const index = plan.entries[0].recipe.accentIndex;
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(8);
    });

    it("reads a recipe it just imported as unchanged", async () => {
        // This is the first of the two fingerprint traps in spec 3.1. We give
        // every import an accent of our own, so if the fingerprint covered the
        // accent, every recipe would come back "edited" the moment it landed
        // and the feature would accuse the user of edits they never made.
        //
        // It does not pin the *order* of the stamp and the accent, despite an
        // earlier title here claiming it did: the fingerprint excludes the
        // accent, so both orders give the same answer. The exclusion is pinned
        // directly in `fingerprint.test.ts`.
        const first = buildImportPlan([row()], []);
        const stored = first.entries[0].recipe;

        const second = buildImportPlan([row()], [stored]);
        expect(second.entries[0].status).toBe("unchanged");
    });

    it("does not give two new recipes the same accent", async () => {
        const plan = buildImportPlan(
            [
                row({tableId: 1, theColor: "#123456"}),
                row({tableId: 2, theColor: "#123456"}),
            ],
            []
        );
        expect(plan.entries[0].recipe.accentIndex).not.toBe(
            plan.entries[1].recipe.accentIndex
        );
    });

    it("summarises the counts", async () => {
        const local = imported();
        local.dosage = 22;

        const plan = buildImportPlan(
            [row({tableId: 1}), row({tableId: 2}), row({tableId: 3})],
            [local, imported({cloudId: 2} as Record<string, unknown>)]
        );

        expect(plan.counts).toEqual({
            new: 1,
            updated: 0,
            unchanged: 1,
            edited: 1,
        });
    });

    /**
     * The spec calls this the one bug in the design that would quietly destroy
     * work: `cloudId: 0` means "did not come from an account", so a hand-made
     * recipe must never be seen as already imported and replaced by a
     * stranger's. Guarded on both sides -- a row cannot claim id 0, and a local
     * recipe holding the sentinel cannot be matched by one.
     */
    it("never matches a recipe carrying the cloudId 0 sentinel", async () => {
        const handMade = new Recipe();
        handMade.name = "My own";
        handMade.uuid = "mine";
        handMade.cloudId = 0;

        const plan = buildImportPlan([row({tableId: 0})], [handMade]);

        // The row itself is not a row we can identify, so it never becomes an
        // entry at all.
        expect(plan.entries).toHaveLength(0);
        expect(plan.unreadable).toBe(1);
    });

    it("does not let a real row claim a local recipe holding the sentinel", async () => {
        const handMade = new Recipe();
        handMade.uuid = "mine";
        handMade.cloudId = 0;

        const plan = buildImportPlan([row({tableId: 7})], [handMade]);

        expect(plan.entries[0].status).toBe("new");
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    /**
     * Two local copies of one cloud id -- from a restore, say -- leave us
     * unable to say which one a row refers to. Letting the map's insertion
     * order decide would make the answer depend on the order the database
     * returned rows, and could pre-select an overwrite while the other copy
     * holds the user's edits.
     */
    it("refuses to choose between two local copies of one cloud id", async () => {
        const untouched = imported();
        untouched.uuid = "a";
        const edited = imported();
        edited.uuid = "b";
        edited.name = "changed here";

        const changedUpstream = row({theName: "Kenya AB"});

        for (const order of [[untouched, edited], [edited, untouched]]) {
            const plan = buildImportPlan([changedUpstream], order);

            expect(plan.entries[0].status).toBe("edited");
            expect(plan.entries[0].selected).toBe(false);
        }
    });

    it("takes one row twice as one decision, and says so", async () => {
        const plan = buildImportPlan([row(), row()], []);

        expect(plan.entries).toHaveLength(1);
        expect(plan.duplicated).toBe(1);
        expect(plan.counts.new).toBe(1);
    });

    // Both of these were completely unguarded: the entry could name any recipe
    // and carry any id with the suite still green, and they are what the
    // import screen lists and what the writer keys on.
    it("names the entry after the recipe it carries", async () => {
        const plan = buildImportPlan([row({theName: "Yirgacheffe"})], []);

        expect(plan.entries[0].name).toBe("Yirgacheffe");
        expect(plan.entries[0].name).toBe(plan.entries[0].recipe.name);
    });

    it("carries the row's own cloud id on the entry", async () => {
        const plan = buildImportPlan([row({tableId: 4242})], []);

        expect(plan.entries[0].cloudId).toBe(4242);
        expect(plan.entries[0].recipe.cloudId).toBe(4242);
    });
});
