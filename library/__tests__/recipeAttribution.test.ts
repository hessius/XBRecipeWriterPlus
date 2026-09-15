import {buildBackup, parseBackup} from "@/library/backup";
import Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";

/**
 * Attribution and artwork exist only in the import response.
 *
 * A share link expires, so a recipe imported before these fields were read has
 * lost them for good -- there is nothing left to re-ask. That is the whole
 * reason they are captured now rather than when something draws them, and it
 * is what these tests are guarding: not a feature, but a one-way door.
 */

/** The shape `RecipeDetail.html` returns, per docs/machine-integration/cloud-api.md. */
function detailResponse(): Record<string, unknown> {
    return {
        shareMemberName: "XBRW++",
        shareMemberHead: "https://xbloom-source.s3.amazonaws.com/avatar.jpg",
        recipeVo: {
            theName:    "Morning",
            dose:       18,
            grandWater: 16,
            grinderSize: 55,
            isSetGrinderSize: 1,
            rpm:        90,
            cupType:    1,
            pourCount:  2,
            podsVo:     {
                id:        "AB12CD",
                subtitle:  "Ethiopia",
                imagePath: "https://xbloom-source.s3.amazonaws.com/pod.jpg"
            },
            pourList: [
                {
                    volume: 144, temperature: 93, pattern: 1, flowRate: 3,
                    pausing: 30, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
                },
                {
                    volume: 144, temperature: 93, pattern: 2, flowRate: 3,
                    pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
                }
            ]
        }
    };
}

function importedRecipe(response: Record<string, unknown>): Recipe {
    const xb = XBloomRecipe.fromAccountRow({}) as unknown as {
        xbRecipeJSON: unknown; getRecipe(): Recipe | null;
    };
    xb.xbRecipeJSON = response;
    const recipe = xb.getRecipe();
    expect(recipe).not.toBeNull();
    return recipe!;
}

describe("capturing attribution at import", () => {
    it("reads the sharer, the avatar and the artwork off the response", async () => {
        const recipe = importedRecipe(detailResponse());

        expect(recipe.sharedBy).toBe("XBRW++");
        expect(recipe.sharedByAvatar)
            .toBe("https://xbloom-source.s3.amazonaws.com/avatar.jpg");
        expect(recipe.imageURL).toBe("https://xbloom-source.s3.amazonaws.com/pod.jpg");
    });

    it("survives a response that carries none of them", async () => {
        const bare = detailResponse();
        delete bare.shareMemberName;
        delete bare.shareMemberHead;
        delete (bare.recipeVo as Record<string, any>).podsVo.imagePath;

        const recipe = importedRecipe(bare);

        expect(recipe.sharedBy).toBeUndefined();
        expect(recipe.sharedByAvatar).toBeUndefined();
        expect(recipe.imageURL).toBeUndefined();
        // The brew itself is unaffected: these are decoration, and their
        // absence must not cost the recipe.
        expect(recipe.pours).toHaveLength(2);
        expect(recipe.dosage).toBe(18);
    });

    it("keeps them through Recipe -> JSON -> Recipe", async () => {
        const recipe = importedRecipe(detailResponse());

        const revived = new Recipe(undefined, JSON.stringify(recipe));

        expect(revived.sharedBy).toBe("XBRW++");
        expect(revived.sharedByAvatar).toBe(recipe.sharedByAvatar);
        expect(revived.imageURL).toBe(recipe.imageURL);
    });

    it("loads a recipe stored before these fields existed", async () => {
        const old = JSON.parse(JSON.stringify(importedRecipe(detailResponse())));
        delete old.sharedBy;
        delete old.sharedByAvatar;
        delete old.imageURL;

        const revived = new Recipe(undefined, JSON.stringify(old));

        expect(revived.sharedBy).toBeUndefined();
        expect(revived.dosage).toBe(18);
        expect(revived.pours).toHaveLength(2);
    });

    /**
     * They are metadata. The card is the part that cannot be un-written, so
     * these must not reach it -- not as bytes and not through the checksum.
     */
    it("does not let them touch the card bytes", async () => {
        const without = importedRecipe(detailResponse());
        without.sharedBy = undefined;
        without.sharedByAvatar = undefined;
        without.imageURL = undefined;

        const withThem = importedRecipe(detailResponse());

        const prefix = new Array(32).fill(0);
        expect(withThem.getData(prefix)).toEqual(without.getData(prefix));
    });
});

describe("attribution arriving in an untrusted backup", () => {
    function backupCarrying(fields: Record<string, unknown>): string {
        const recipe = importedRecipe(detailResponse());
        recipe.uuid = "u1";
        const envelope = JSON.parse(buildBackup([recipe], {}));
        Object.assign(envelope.recipes[0], fields);
        return JSON.stringify(envelope);
    }

    function restoredFrom(json: string): Recipe {
        const result = parseBackup(json);
        expect(result.ok).toBe(true);
        const recipes = (result as {ok: true; payload: {recipes: Recipe[]}}).payload.recipes;
        expect(recipes).toHaveLength(1);
        return recipes[0];
    }

    it.each([
        ["http, a downgrade the user cannot see", "http://example.com/a.jpg"],
        ["a file URL aimed at the device", "file:///etc/passwd"],
        ["a data URL carrying its own payload", "data:image/png;base64,AAAA"],
        ["something that is not a URL at all", "not a url"],
        ["a number", 5]
    ])("drops an avatar that is %s, and keeps the recipe", async (_label, value) => {
        const restored = restoredFrom(backupCarrying({sharedByAvatar: value}));

        expect(restored.sharedByAvatar).toBeUndefined();
        // The point of dropping rather than rejecting: a picture must not cost
        // a recipe that carries real card bytes.
        expect(restored.dosage).toBe(18);
        expect(restored.pours).toHaveLength(2);
        expect(restored.sharedBy).toBe("XBRW++");
        expect(restored.imageURL).toBe("https://xbloom-source.s3.amazonaws.com/pod.jpg");
    });

    it("drops a non-https pod image on the same terms", async () => {
        const restored = restoredFrom(backupCarrying({imageURL: "http://example.com/p.jpg"}));

        expect(restored.imageURL).toBeUndefined();
        expect(restored.pours).toHaveLength(2);
    });

    it("drops an implausibly long sharer name", async () => {
        const restored = restoredFrom(backupCarrying({sharedBy: "x".repeat(5000)}));

        expect(restored.sharedBy).toBeUndefined();
        expect(restored.dosage).toBe(18);
    });

    it("keeps an https avatar", async () => {
        const restored = restoredFrom(
            backupCarrying({sharedByAvatar: "https://example.com/a.jpg"})
        );

        expect(restored.sharedByAvatar).toBe("https://example.com/a.jpg");
    });
});
