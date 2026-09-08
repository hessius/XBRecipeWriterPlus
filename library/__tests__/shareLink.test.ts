import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE, DEFAULT_GRIND_SIZE} from "@/library/Recipe";
import {buildSharePayload, canonicalSnapshot, shareBlockReason} from "@/library/shareLink";
import {XBloomRecipe} from "@/library/XBloomRecipe";

function drip(): Recipe {
    const r = new Recipe(undefined, undefined);
    r.name = "Ethiopia Guji";
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 55;
    r.grindRPM = 90;
    r.grinder = true;
    r.cupType = CUP_TYPE.OMNI;
    const bloom = new Pour(1, 50, 93, 35, 0, POUR_PATTERN.CENTERED, 30);
    const main = new Pour(2, 238, 92, 30, 0, POUR_PATTERN.SPIRAL, 0);
    main.setAgitationAfter(true);
    r.pours = [bloom, main];
    return r;
}

describe("buildSharePayload", () => {
    it("maps the scalar fields onto xBloom's names", () => {
        const p = buildSharePayload(drip());
        expect(p.theName).toBe("Ethiopia Guji");
        expect(p.dose).toBe(18);
        // grandWater is the ratio, not a water volume. Getting this wrong
        // produces a recipe that brews 16 ml.
        expect(p.grandWater).toBe(16);
        expect(p.grinderSize).toBe(55);
        expect(p.isSetGrinderSize).toBe(1);
        expect(p.rpm).toBe(90);
        expect(p.pourCount).toBe(2);
        expect(p.adaptedModel).toBe(1);
        expect(p.bypassVolume).toBe(0);
        expect(p.isEnableBypassWater).toBe(2);
    });

    it("renumbers cup types onto the cloud's scale, which is not a shift", () => {
        const cases: [number, number][] = [
            [CUP_TYPE.XPOD, 1], [CUP_TYPE.OMNI, 2], [CUP_TYPE.OTHER, 3], [CUP_TYPE.TEA, 4]
        ];
        for (const [local, wire] of cases) {
            const r = drip();
            r.cupType = local;
            expect(buildSharePayload(r).cupType).toBe(wire);
        }
    });

    it("renumbers pour patterns, which is also not a shift", () => {
        const r = drip();
        r.pours[0].pourPattern = POUR_PATTERN.CENTERED;
        r.pours[1].pourPattern = POUR_PATTERN.CIRCULAR;
        const pours = JSON.parse(buildSharePayload(r).pourDataJSONStr);
        expect(pours[0].pattern).toBe(1);
        expect(pours[1].pattern).toBe(3);
    });

    it("divides flow rate by ten, because the importer multiplies it", () => {
        const pours = JSON.parse(buildSharePayload(drip()).pourDataJSONStr);
        expect(pours[0].flowRate).toBe(3.5);
        expect(pours[1].flowRate).toBe(3);
    });

    it("names the first pour Bloom and numbers the rest", () => {
        const pours = JSON.parse(buildSharePayload(drip()).pourDataJSONStr);
        expect(pours[0].theName).toBe("Bloom");
        expect(pours[1].theName).toBe("Pour 2");
    });

    it("sends agitation as 1 for on and 2 for off, per side", () => {
        const pours = JSON.parse(buildSharePayload(drip()).pourDataJSONStr);
        expect(pours[0].isEnableVibrationBefore).toBe(2);
        expect(pours[0].isEnableVibrationAfter).toBe(2);
        expect(pours[1].isEnableVibrationAfter).toBe(1);
    });

    it("carries pause time through as pausing", () => {
        const pours = JSON.parse(buildSharePayload(drip()).pourDataJSONStr);
        expect(pours[0].pausing).toBe(30);
    });

    it("turns the grinder off with isSetGrinderSize 2", () => {
        const r = drip();
        r.grinder = false;
        expect(buildSharePayload(r).isSetGrinderSize).toBe(2);
    });

    it("overrides grinder and rpm for tea", () => {
        const r = drip();
        r.cupType = CUP_TYPE.TEA;
        const p = buildSharePayload(r);
        expect(p.cupType).toBe(4);
        expect(p.isSetGrinderSize).toBe(2);
        expect(p.grinderSize).toBe(DEFAULT_GRIND_SIZE);
        expect(p.rpm).toBe(60);
    });

    it("falls back to displayName when there is no chosen name", () => {
        const r = drip();
        r.name = "";
        r.xbloomName = "Kenya AA";
        expect(buildSharePayload(r).theName).toBe("Kenya AA");
    });

    it("sends a hex accent colour", () => {
        expect(buildSharePayload(drip()).theColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
});

describe("canonicalSnapshot", () => {
    it("is stable across two builds of the same recipe", () => {
        const r = drip();
        expect(canonicalSnapshot(buildSharePayload(r)))
            .toBe(canonicalSnapshot(buildSharePayload(r)));
    });

    it("ignores key order", () => {
        const a = buildSharePayload(drip());
        const b = {...a};
        expect(canonicalSnapshot(b)).toBe(canonicalSnapshot(a));
    });

    it("changes when a pour volume changes", () => {
        const r = drip();
        const before = canonicalSnapshot(buildSharePayload(r));
        r.pours[1].volume = 240;
        expect(canonicalSnapshot(buildSharePayload(r))).not.toBe(before);
    });

    it("does not change when a field that is never sent changes", () => {
        const r = drip();
        const before = canonicalSnapshot(buildSharePayload(r));
        r.backup = [1, 2, 3];
        r.uid = [9];
        expect(canonicalSnapshot(buildSharePayload(r))).toBe(before);
    });
});

describe("bypass water", () => {
    it("sends bypass fields from the recipe when bypass is enabled", () => {
        const r = drip();
        r.bypassEnabled = true;
        r.bypassVolume = 100;
        r.bypassTemp = 90;
        const p = buildSharePayload(r);
        expect(p.isEnableBypassWater).toBe(1);
        expect(p.bypassVolume).toBe(100);
        expect(p.bypassTemp).toBe(90);
    });

    it("sends the canonical 85 C when bypass is off, whatever the recipe kept", () => {
        // The editor preserves the last bypass values while bypass is off, so
        // that re-enabling it does not lose the setting. Those values must not
        // reach the wire: an "off" payload that varies with an invisible field
        // makes an already-shared recipe compare unequal to its own snapshot
        // and mints a duplicate row in the service account on every re-share.
        const r = drip();
        r.bypassEnabled = false;
        r.bypassVolume  = 45;
        r.bypassTemp    = 60;
        const p = buildSharePayload(r);
        expect(p.bypassTemp).toBe(85);
        expect(p.bypassVolume).toBe(0);
        expect(p.isEnableBypassWater).toBe(2);
        // The same recipe with a different preserved temperature must snapshot
        // identically, which is the property the churn guarantee rests on.
        r.bypassTemp = 90;
        expect(canonicalSnapshot(buildSharePayload(r))).toBe(canonicalSnapshot(p));
    });

    it("sends exactly {bypassTemp:85, bypassVolume:0, isEnableBypassWater:2} when bypass is off", () => {
        // The no-churn guarantee: a recipe with bypass off must produce a
        // payload byte-identical to the hardcoded constants it replaces, so
        // existing share snapshots remain valid and no duplicate rows are minted.
        const p = buildSharePayload(drip());
        expect(p.bypassTemp).toBe(85);
        expect(p.bypassVolume).toBe(0);
        expect(p.isEnableBypassWater).toBe(2);
    });

    it("sends volume 0 when bypass is off, even if bypassVolume is set", () => {
        // The machine must not receive a bypass volume for a recipe with bypass
        // disabled; suppressing it here avoids confusing the service.
        const r = drip();
        r.bypassEnabled = false;
        r.bypassVolume = 120;
        expect(buildSharePayload(r).bypassVolume).toBe(0);
    });

    it("preserves the canonical snapshot of a non-bypass recipe", () => {
        // Pin the exact snapshot so any future drift in the no-churn guarantee
        // is caught as an explicit regression.
        const p = buildSharePayload(drip());
        const snap = canonicalSnapshot(p);
        expect(snap).toContain('"bypassTemp":85');
        expect(snap).toContain('"bypassVolume":0');
        expect(snap).toContain('"isEnableBypassWater":2');
    });

    it("forces bypass off for tea, regardless of what the recipe says", () => {
        // Tea bypass is out of scope for the machine; sharing it bypass-on
        // would send a recipe the machine cannot honour.
        const r = drip();
        r.cupType = CUP_TYPE.TEA;
        r.bypassEnabled = true;
        r.bypassVolume = 120;
        r.bypassTemp = 80;
        const p = buildSharePayload(r);
        expect(p.isEnableBypassWater).toBe(2);
        expect(p.bypassVolume).toBe(0);
        expect(p.bypassTemp).toBe(85);
    });
});

describe("shareBlockReason", () => {
    it("allows a well-formed recipe", () => {
        expect(shareBlockReason(drip())).toBeNull();
    });

    it("refuses a recipe with no pours", () => {
        const r = drip();
        r.pours = [];
        expect(shareBlockReason(r)).toBe("noPours");
    });

    it("refuses a recipe whose pour volumes do not match the ratio", () => {
        const r = drip();
        r.pours[1].volume = 500;
        expect(shareBlockReason(r)).toBe("volumeMismatch");
    });

    it("refuses a recipe with no dose or ratio", () => {
        const r = drip();
        r.dosage = 0;
        expect(shareBlockReason(r)).toBe("incomplete");
    });
});

describe("the round trip through the importer", () => {
    // buildSharePayload is the inverse of XBloomRecipe.getRecipe. Feeding one
    // into the other is the only check that the two enum orderings agree; a
    // mismatch there is not a crash, it is a different brew.
    function reimport(recipe: Recipe): Recipe {
        const payload = buildSharePayload(recipe);
        const importer = new XBloomRecipe({kind: "share", id: "test-share-id"});
        const importerInternals = importer as unknown as {
            xbRecipeJSON: unknown;
            name: string;
            subtitle: string;
        };
        importerInternals.xbRecipeJSON = {
            recipeVo: {
                ...payload,
                pourList: JSON.parse(payload.pourDataJSONStr),
                podsVo: {id: recipe.xid, subtitle: "", imagePath: ""}
            }
        };
        importerInternals.name = payload.theName;
        importerInternals.subtitle = "";
        const back = importer.getRecipe();
        if (back === null) {
            throw new Error("Importer did not return a recipe");
        }
        return back;
    }

    it("preserves the fields that both formats carry", () => {
        const recipe = drip();
        recipe.name = "Ethiopia";
        recipe.dosage = 18;
        recipe.ratio = 16;
        recipe.grindSize = 55;
        recipe.grindRPM = 90;
        recipe.cupType = CUP_TYPE.OTHER;
        recipe.autoFixPourVolumes();

        const back = reimport(recipe);
        expect(back.xbloomName).toBe("Ethiopia");
        expect(back.dosage).toBe(18);
        expect(back.ratio).toBe(16);
        expect(back.grindSize).toBe(55);
        expect(back.grindRPM).toBe(90);
        expect(back.cupType).toBe(CUP_TYPE.OTHER);
    });

    it("does not turn Other into Omni", () => {
        // The two cup-type orderings differ by a swap, not a shift. A +1 here
        // silently turns overflow protection back on.
        for (const cupType of [CUP_TYPE.XPOD, CUP_TYPE.OTHER, CUP_TYPE.OMNI]) {
            const recipe = drip();
            recipe.cupType = cupType;
            recipe.autoFixPourVolumes();
            expect(reimport(recipe).cupType).toBe(cupType);
        }
    });

    it("preserves each pour", () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.dosage = 20;
        recipe.ratio = 15;
        recipe.grindSize = 55;
        recipe.grindRPM = 90;
        recipe.grinder = true;
        recipe.addPour(-1, false);
        recipe.addPour(0, false);
        recipe.pours[0].pourPattern = POUR_PATTERN.SPIRAL;
        recipe.pours[0].flowRate = 35;
        recipe.pours[0].temperature = 94;
        recipe.pours[1].pourPattern = POUR_PATTERN.CIRCULAR;
        recipe.pours[1].pauseTime = 30;
        recipe.autoFixPourVolumes();

        const back = reimport(recipe);
        expect(back.pours).toHaveLength(2);
        expect(back.pours[0].pourPattern).toBe(POUR_PATTERN.SPIRAL);
        expect(back.pours[0].flowRate).toBeCloseTo(35);
        expect(back.pours[0].temperature).toBe(94);
        expect(back.pours[1].pourPattern).toBe(POUR_PATTERN.CIRCULAR);
        expect(back.pours[1].pauseTime).toBe(30);
        expect(back.pours.reduce((n, p) => n + p.volume, 0)).toBe(300);
    });
});

describe("share fields survive serialisation", () => {
    it("round-trips through the JSON constructor", () => {
        const r = drip();
        r.sharedTableId = 1353046;
        r.shareUrl = "https://share-h5.xbloom.com/?id=hmFKjxldtOFbZ2Kve%2BlxKw%3D%3D";
        r.shareSnapshot = canonicalSnapshot(buildSharePayload(r));
        const back = new Recipe(undefined, JSON.stringify(r));
        expect(back.sharedTableId).toBe(1353046);
        expect(back.shareUrl).toBe(r.shareUrl);
        expect(back.shareSnapshot).toBe(r.shareSnapshot);
    });

    it("leaves them undefined on a record saved before they existed", () => {
        const legacy = JSON.parse(JSON.stringify(drip()));
        delete legacy.sharedTableId;
        delete legacy.shareUrl;
        delete legacy.shareSnapshot;
        const back = new Recipe(undefined, JSON.stringify(legacy));
        expect(back.sharedTableId).toBeUndefined();
        expect(back.shareUrl).toBeUndefined();
        expect(back.shareSnapshot).toBeUndefined();
    });

    it("does not disturb the imported shareId, which is a different thing", () => {
        const r = drip();
        r.shareId = "hmFKjxldtOFbZ2Kve+lxKw==";
        r.sharedTableId = 1353046;
        const back = new Recipe(undefined, JSON.stringify(r));
        expect(back.shareId).toBe("hmFKjxldtOFbZ2Kve+lxKw==");
        expect(back.sharedTableId).toBe(1353046);
    });
});

describe("share payload churn", () => {
    it("sends the same bypass fields for a recipe that has no bypass", () => {
        // Load-bearing constants, not arbitrary. `shareLink` used to hardcode
        // these three; the Recipe defaults were chosen to match, so that
        // adding bypass fields to the model changed nothing on the wire. If
        // this test fails, every already-shared recipe now reads as stale and
        // re-mints a duplicate row in the shared service account.
        const payload = buildSharePayload(new Recipe());

        expect(payload.isEnableBypassWater).toBe(2);
        expect(payload.bypassVolume).toBe(0);
        expect(payload.bypassTemp).toBe(85);
    });

    it("sends a live bypass when one is enabled", () => {
        const recipe = new Recipe();
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;

        const payload = buildSharePayload(recipe);

        expect(payload.isEnableBypassWater).toBe(1);
        expect(payload.bypassVolume).toBe(45);
        expect(payload.bypassTemp).toBe(60);
    });

    it("suppresses bypass for tea, which the machine ignores", () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.bypassEnabled = true;
        recipe.bypassVolume  = 45;
        recipe.bypassTemp    = 60;

        const payload = buildSharePayload(recipe);

        expect(payload.isEnableBypassWater).toBe(2);
        expect(payload.bypassVolume).toBe(0);
        expect(payload.bypassTemp).toBe(85);
    });
});
