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

    it("keeps the local identity when an unchanged row is ticked by hand", async () => {
        // `unchanged` is the one status a user reaches only deliberately, so
        // it is also the one that would fork quietly if its clause were ever
        // dropped from `replacing`: `updateRecipe` finds the row by the uuid
        // it is handed and stores the recipe's own, and a fresh uuid leaves
        // the two disagreeing.
        const local = imported();
        const plan = buildImportPlan([row()], [local]);

        expect(plan.entries[0].status).toBe("unchanged");
        expect(plan.entries[0].existingUuid).toBe(local.uuid);
        expect(plan.entries[0].recipe.uuid).toBe(local.uuid);
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

    it("keeps the local identity when an edited row is ticked by hand", async () => {
        // Ticking an `edited` box *is* the consent -- there is no second
        // dialog -- so this is a path the user reaches deliberately, not an
        // edge case. It forked in exactly the way the `replacing` comment
        // describes: the entry named a local uuid to replace while carrying a
        // freshly minted one, so `updateRecipe` keyed the row on the old uuid
        // and stored a blob claiming the new one. The recipe then split in two
        // on the next save, and with two locals sharing a cloud id it would
        // read `edited` for ever after -- the very corruption this feature
        // exists to prevent, reached through its own consent path.
        const local = imported();
        local.dosage = 22;

        const plan = buildImportPlan([row()], [local]);

        expect(plan.entries[0].status).toBe("edited");
        expect(plan.entries[0].existingUuid).toBe(local.uuid);
        expect(plan.entries[0].recipe.uuid).toBe(local.uuid);
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
            // Naming one of the two copies would aim a hand-ticked write at
            // whichever the database returned first.
            expect(plan.entries[0].existingUuid).toBeUndefined();
            // And with nothing named, the entry must keep an identity of its
            // own. Borrowing one of the two locals' uuids here would send an
            // *insert* carrying a uuid the library already holds, which is the
            // same fork from the other end: two rows, one uuid.
            expect(plan.entries[0].recipe.uuid).not.toBe("a");
            expect(plan.entries[0].recipe.uuid).not.toBe("b");
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

    /**
     * Accents are chosen against the existing library as well as against this
     * import. Without that, a first-ever import into a library already skewed
     * onto one colour would happily pile onto it -- and the whole point of
     * `assignAccent` is that a new recipe is visually distinguishable from the
     * ones already there.
     */
    it("avoids an accent the local library is already crowded with", async () => {
        const crowded: Recipe[] = [];
        for (let i = 0; i < 6; i += 1) {
            const local = new Recipe();
            local.uuid = `local-${i}`;
            local.accentIndex = 0;
            crowded.push(local);
        }

        // A colour far from every palette accent, so this goes down the
        // `assignAccent` path rather than the fidelity path.
        const plan = buildImportPlan([row({theColor: "#808080"})], crowded);

        expect(plan.entries[0].status).toBe("new");
        expect(plan.entries[0].recipe.accentIndex).not.toBe(0);
    });
    /**
     * The case the device pass found.
     *
     * A recipe can reach the library by two roads: an account import, which
     * stamps `cloudId`, and a share link, which does not. Opening your own
     * recipe's link takes the second road, so the local copy carries no cloud
     * id at all and the first account import offers it back as `new` -- and a
     * tick then inserts a second copy of a recipe already sitting there.
     *
     * The bridge is not a heuristic. Both roads store the same value: the
     * account row's `shareRecipeLink` carries a `?id=` token, `mapRow` decodes
     * it into `shareId`, and `parseImportInput` decodes the pasted link into
     * exactly the same string. It is the server's own name for the row, so a
     * match is identity rather than resemblance.
     */
    const SHARE_LINK = "https://share-h5.xbloom.com/?id=hmFKjxldtOFbZ2Kve%2BlxKw%3D%3D";
    const SHARE_ID = "hmFKjxldtOFbZ2Kve+lxKw==";

    /** What a share-link import leaves behind: a share id and no cloud id. */
    function fromShareLink(uuid: string): Recipe {
        const local = imported();
        local.uuid = uuid;
        local.cloudId = undefined;
        local.cloudFingerprint = undefined;
        local.shareId = SHARE_ID;
        return local;
    }

    it("recognises a local that arrived by share link", async () => {
        const plan = buildImportPlan(
            [row({shareRecipeLink: SHARE_LINK})],
            [fromShareLink("local-1")]
        );

        expect(plan.entries[0].status).not.toBe("new");
    });

    it("names the share-link local as the one it would replace", async () => {
        const plan = buildImportPlan(
            [row({shareRecipeLink: SHARE_LINK})],
            [fromShareLink("local-1")]
        );

        expect(plan.entries[0].existingUuid).toBe("local-1");
    });

    /**
     * `edited`, not `unchanged`, and this is the honest answer rather than a
     * shortcut. A share-link import stores no `cloudFingerprint`, so there is
     * no record of the state the recipe arrived in and no way to show it has
     * not been touched since. `classify` already draws exactly that
     * conclusion for a local with no fingerprint; adoption simply lets it see
     * the recipe at all.
     */
    it("leaves a share-link local unticked, having no proof it is untouched", async () => {
        const plan = buildImportPlan(
            [row({shareRecipeLink: SHARE_LINK})],
            [fromShareLink("local-1")]
        );

        expect(plan.entries[0].status).toBe("edited");
        expect(plan.entries[0].selected).toBe(false);
    });

    /**
     * The fork guard, on the adoption path. `updateRecipe` finds the row by
     * the uuid it is handed but stores the recipe's own, so an entry naming a
     * local uuid while carrying a fresh one splits the recipe in two the
     * moment somebody ticks it.
     */
    it("carries the local uuid, so an adopted recipe cannot fork", async () => {
        const plan = buildImportPlan(
            [row({shareRecipeLink: SHARE_LINK})],
            [fromShareLink("local-1")]
        );

        expect(plan.entries[0].recipe.uuid).toBe("local-1");
    });

    it("ignores a local whose share id names some other recipe", async () => {
        const stranger = fromShareLink("local-1");
        stranger.shareId = "a-different-token";

        const plan = buildImportPlan([row({shareRecipeLink: SHARE_LINK})], [stranger]);

        expect(plan.entries[0].status).toBe("new");
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    /**
     * An empty share id is the value every hand-made recipe carries, so
     * matching on it would adopt an arbitrary local into a stranger's recipe.
     * This is the same rule as `cloudId: 0` never matching.
     */
    it("never matches on an empty share id", async () => {
        const handMade = new Recipe();
        handMade.uuid = "local-1";
        handMade.shareId = "";

        const plan = buildImportPlan([row({shareRecipeLink: ""})], [handMade]);

        expect(plan.entries[0].status).toBe("new");
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    /**
     * Cloud id first. A local that carries one has been through an account
     * import, which is the stronger statement of the two, and a share id left
     * over from an earlier road must not pull the row onto a different local.
     */
    it("prefers the cloud id when a local carries both", async () => {
        const byCloud = imported();
        byCloud.uuid = "by-cloud";
        byCloud.cloudId = 1;

        const byShare = fromShareLink("by-share");

        const plan = buildImportPlan([row({shareRecipeLink: SHARE_LINK})], [byCloud, byShare]);

        expect(plan.entries[0].existingUuid).toBe("by-cloud");
    });

    /**
     * A local that has been through an account import is spoken for. Its share
     * id may still name the link it first arrived by, but it belongs to the
     * cloud recipe it was last imported as, and letting a different row claim
     * it on the strength of that leftover would overwrite one recipe with
     * another.
     */
    it("ignores a local already claimed by a different cloud id", async () => {
        const claimed = fromShareLink("local-1");
        claimed.cloudId = 99;

        const plan = buildImportPlan([row({shareRecipeLink: SHARE_LINK})], [claimed]);

        expect(plan.entries[0].status).toBe("new");
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    it("declines to choose between two locals holding the same share id", async () => {
        const plan = buildImportPlan(
            [row({shareRecipeLink: SHARE_LINK})],
            [fromShareLink("local-1"), fromShareLink("local-2")]
        );

        expect(plan.entries[0].status).toBe("edited");
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    /**
     * One local, one adopter. Two rows sharing a link would otherwise both
     * name the same local, and the second write would silently undo the first.
     */
    it("lets only the first row adopt a given local", async () => {
        const plan = buildImportPlan(
            [
                row({tableId: 1, shareRecipeLink: SHARE_LINK}),
                row({tableId: 2, shareRecipeLink: SHARE_LINK}),
            ],
            [fromShareLink("local-1")]
        );

        expect(plan.entries[0].existingUuid).toBe("local-1");
        expect(plan.entries[1].existingUuid).toBeUndefined();
    });
});
