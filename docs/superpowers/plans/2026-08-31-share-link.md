# Share a Recipe as an xBloom Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user turn any recipe in XBRW++ into a `share-h5.xbloom.com` link that opens in the official xBloom app, via a serverless mint function backed by an XBRW++ service account.

**Architecture:** Four units. (1) `library/shareLink.ts` maps a `Recipe` to xBloom's wire payload — pure, no network. (2) A Vercel function `api/share.ts` holds the service-account credentials, rate-limits, logs in to `client-api.xbloom.com`, RSA-encrypts the payload, POSTs `tuRecipeAdd.tuhtml`, and returns the link. (3) `hooks/useShareRecipe.ts` owns the app-side state machine and memoises the result on the recipe so re-sharing an unchanged recipe does not re-mint. (4) A Share row in `RecipeOverflowSheet` hands the URL to the RN share sheet.

**Tech Stack:** TypeScript, Expo SDK 57, Tamagui, Jest + jest-expo, Vercel serverless (Web-standard `Request`/`Response` handler, zero runtime deps, `node:crypto` only), optional Upstash Redis REST for cross-instance rate limiting.

---

## Read before starting

- Spec: `docs/superpowers/specs/2026-08-31-share-link-design.md`
- Protocol reference: `docs/machine-integration/cloud-api.md` sections A, B, C
- The *reading* half of this exact API already exists: `library/XBloomRecipe.ts`. Every mapping in this plan is the inverse of what that file does. When in doubt, read it.

## Codebase conventions you must follow

- Import with the `@/` alias (maps to repo root): `import Recipe from "@/library/Recipe"`.
- **All colour comes from `constants/colors.ts`.** No hex literals, no named CSS colours anywhere in `app/` or `components/`.
- Components are declared at **module scope**, never inside another component's body.
- The **React Compiler is on**: do not hand-write `useMemo`/`useCallback`. Do not read whole `props` inside a hook — destructure first.
- Tests use `@testing-library/react-native` v14, whose `render` and `fireEvent` are **async**. Always `await` them, and always render via `renderWithProviders` from `test-utils/render.tsx`.
- Recipes are mutated in place and a `key` counter is bumped to re-render. Do not "fix" this by making `Recipe` immutable.
- Commit with a heredoc-free message file: `printf '%s\n' 'line' 'line' > /tmp/msg && git commit -F /tmp/msg`. Always include the trailer:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## File structure

| File | Responsibility |
| --- | --- |
| `library/shareLink.ts` (new) | Pure `Recipe` → xBloom wire payload mapping, plus `canonicalisePayload` for change detection. No network, no React. |
| `library/Recipe.ts` (modify) | Two new persisted fields: `sharedTableId?: number`, `shareSnapshot?: string`. |
| `library/backup.ts` (modify) | Validators for the two new fields. |
| `constants/share.ts` (new) | The mint endpoint URL, overridable by `EXPO_PUBLIC_SHARE_API_URL`. |
| `hooks/useShareRecipe.ts` (new) | App-side state machine: idle → minting → done/error, with snapshot memoisation. |
| `constants/dotIcons.ts` (modify) | A `share` 9×9 glyph. |
| `components/RecipeOverflowSheet.tsx` (modify) | The Share row. |
| `app/editRecipe.tsx` (modify) | Wires the hook to the sheet and to the RN share sheet. |
| `api/share.ts` (new) | The Vercel function. Validates, rate-limits, mints, returns the URL. |
| `api/_lib/payload.ts` (new) | Request-shape validation. **Must not import from `library/`.** |
| `api/_lib/rateLimit.ts` (new) | Pure window/limit arithmetic over a `Counter`. |
| `api/_lib/store.ts` (new) | `Counter` interface + in-memory impl + Upstash REST impl. |
| `api/_lib/xbloom.ts` (new) | RSA chunk encryption, login, recipe POST. |
| `vercel.json`, `public/index.html`, `.vercelignore` (new) | Deploy config that skips installing the Expo tree. |
| `PRIVACY.md`, `app/about.tsx`, `.gitignore` (modify) | Disclosure and hygiene. |
| `docs/machine-integration/share-deploy.md` (new) | Deployment runbook for the user. |

**Critical: `api/` must never import from `library/`.** `library/shareLink.ts` imports `Recipe`, which imports `NFC`, which imports `react-native-nfc-manager`. Pulling that into the serverless bundle will break the deploy. The app maps the payload; the function validates the shape independently.

**Critical: `Recipe.shareId` already exists** (line 75) and holds the *imported* base64 share id. Do not reuse it. The new fields are `sharedTableId`, `shareUrl` and `shareSnapshot`.

---

### Task 1: Spike — verify the mint against the live API ✅ DONE

**Completed 2026-08-31, commit `9c93511`.** Findings are written up in
`docs/machine-integration/cloud-api.md` § "C-bis. Verified by live spike". Read that section
before starting Task 2 — it contradicts section C above in one load-bearing way.

What it changed, in short:

1. **The share URL cannot be built client-side.** `btoa(String(tableId))` does not resolve. The
   `?id=` value is an opaque server-issued token. After `tuRecipeAdd.tuhtml` returns a
   `tableId`, the function must list the account's recipes with `tuMyTeaRecipeCreated.tuhtml`,
   match on that `tableId`, and read `shareRecipeLink` verbatim. **Three upstream calls, not
   two.**
2. `adaptedModel: 1` — not cosmetic. It partitions the library, and a mismatch between the mint
   and the lookup makes the new row invisible to step 3.
3. `bypassVolume: 0.0` — cosmetic, both values accepted.
4. `pourCount` — optional (the server derives it) but sent anyway, because our own importer
   reads `recipeVo.pourCount`.
5. A recipient sees `shareMemberName: "XBRW++"` — the service account, not the sharer.
6. `tuRecipeDelete.tuhtml` removes a recipe from the library but **the share link keeps
   resolving**. There is no after-the-fact takedown, which is why abuse controls sit in front of
   the mint.

No application code was written in this task.

---

### Task 2: `library/shareLink.ts` — the payload mapping

The whole `Recipe` → wire translation, pure and testable. **No network, no React, no
`node:crypto`.** This is the inverse of `library/XBloomRecipe.ts`; read that file first and keep
it open while writing this one.

**Files:**
- Create: `library/shareLink.ts`
- Test: `library/__tests__/shareLink.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `library/__tests__/shareLink.test.ts`:

```ts
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE, DEFAULT_GRIND_SIZE} from "@/library/Recipe";
import {buildSharePayload, canonicalSnapshot, shareBlockReason} from "@/library/shareLink";

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
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest library/__tests__/shareLink.test.ts`
Expected: every test fails with `Cannot find module '@/library/shareLink'`.

- [ ] **Step 3: Write `library/shareLink.ts`**

```ts
import {resolveAccent} from "./accent";
import type Pour from "./Pour";
import {POUR_PATTERN} from "./Pour";
import Recipe, {CUP_TYPE, DEFAULT_GRIND_SIZE} from "./Recipe";

/**
 * The recipe as xBloom's cloud wants it.
 *
 * This is the exact inverse of what `XBloomRecipe.getRecipe()` reads, and the
 * two files have to be changed together. The names are xBloom's, not ours;
 * `grandWater` in particular is the *ratio*, not a water volume.
 *
 * The auth boilerplate (`memberId`, `token`, `skey`, ...) is deliberately not
 * here. It belongs to the mint function, which holds the credentials; the app
 * never sees it.
 */
export type SharePayload = {
    theName: string;
    theColor: string;
    theSubsetId: number;
    dose: number;
    grandWater: number;
    grinderSize: number;
    isSetGrinderSize: number;
    rpm: number;
    cupType: number;
    bypassTemp: number;
    bypassVolume: number;
    subSetType: number;
    appPlace: number[];
    isShortcuts: number;
    isEnableBypassWater: number;
    adaptedModel: number;
    pourCount: number;
    pourDataJSONStr: string;
};

/** Why a recipe cannot be shared. Empty when it can. */
export type ShareBlockReason = "noPours" | "volumeMismatch" | "incomplete";

/**
 * Cloud cup types are 1-based and reordered, not shifted.
 *
 * Local `OMNI` is 2 and cloud Omni is 2 by coincidence; local `OTHER` is 1 and
 * cloud Other is 3. A `+1` would silently turn every Other recipe into an Omni
 * one, which changes overflow protection.
 */
function cloudCupType(cupType: number): number {
    switch (cupType) {
        case CUP_TYPE.XPOD:  return 1;
        case CUP_TYPE.OMNI:  return 2;
        case CUP_TYPE.OTHER: return 3;
        case CUP_TYPE.TEA:   return 4;
        default:             return 1;
    }
}

/** Reordered the same way, and for the same reason. See `XBloomRecipe`. */
function cloudPattern(pattern: number): number {
    switch (pattern) {
        case POUR_PATTERN.CENTERED: return 1;
        case POUR_PATTERN.SPIRAL:   return 2;
        case POUR_PATTERN.CIRCULAR: return 3;
        default:                    return 3;
    }
}

/** 1 is on, 2 is off. There is no 0 on this API. */
function enabled(on: boolean): number {
    return on ? 1 : 2;
}

function cloudPour(pour: Pour, index: number) {
    return {
        theName:                 index === 0 ? "Bloom" : `Pour ${index + 1}`,
        volume:                  pour.volume,
        temperature:             pour.temperature,
        // The importer reads this as `flowRate * 10`, so the wire unit is ml/s
        // and ours is tenths. Skipping the divide asks the machine for 35 ml/s.
        flowRate:                pour.flowRate / 10,
        pattern:                 cloudPattern(pour.pourPattern),
        pausing:                 pour.pauseTime,
        isEnableVibrationBefore: enabled(pour.getAgitationBefore()),
        isEnableVibrationAfter:  enabled(pour.getAgitationAfter())
    };
}

/**
 * Build the payload for a recipe.
 *
 * Tea is a first-class case rather than a patch at the end: the machine ignores
 * the grinder for tea, and sending a live grind size with `cupType: 4` produces
 * a recipe the official app renders with a grinder setting the machine will not
 * honour.
 */
export function buildSharePayload(recipe: Recipe): SharePayload {
    const tea = recipe.cupType === CUP_TYPE.TEA;
    return {
        theName:             recipe.displayName(),
        theColor:            resolveAccent(recipe),
        theSubsetId:         0,
        dose:                recipe.dosage,
        // Not a volume. xBloom stores the ratio under this name.
        grandWater:          recipe.ratio,
        grinderSize:         tea ? DEFAULT_GRIND_SIZE : recipe.grindSize,
        isSetGrinderSize:    tea ? 2 : enabled(recipe.grinder),
        rpm:                 tea ? 60 : recipe.grindRPM,
        cupType:             cloudCupType(recipe.cupType),
        bypassTemp:          85,
        // Cosmetic while `isEnableBypassWater` is 2, but 0 is the honest value.
        bypassVolume:        0,
        subSetType:          2,
        appPlace:            [4],
        isShortcuts:         2,
        isEnableBypassWater: 2,
        // Load-bearing: this value partitions the account's library, and the
        // mint function looks the new row up in the `adaptedModel: 1` list.
        adaptedModel:        1,
        pourCount:           recipe.pours.length,
        pourDataJSONStr:     JSON.stringify(recipe.pours.map(cloudPour))
    };
}

/**
 * A stable string for a payload, used to decide whether a recipe still matches
 * the link that was minted for it.
 *
 * Key-sorted, because `JSON.stringify` follows insertion order and a payload
 * rebuilt through a spread would otherwise compare unequal to itself.
 *
 * Note what is *not* in here: `createTimeStamp`. The mint function adds it. If
 * it were part of the payload the snapshot would differ on every press and
 * every share would mint a duplicate recipe in the service account.
 */
export function canonicalSnapshot(payload: SharePayload): string {
    const keys = Object.keys(payload).sort();
    return JSON.stringify(payload, keys);
}

/**
 * Whether this recipe can be shared at all.
 *
 * These are the same invariants the machine enforces. Minting a recipe that
 * fails one of them produces a link that opens to something unbrewable, and the
 * link cannot be withdrawn afterwards.
 */
export function shareBlockReason(recipe: Recipe): ShareBlockReason | null {
    if (recipe.pours.length === 0) {
        return "noPours";
    }
    if (recipe.dosage <= 0 || recipe.ratio <= 0) {
        return "incomplete";
    }
    if (!recipe.isPourVolumeValid()) {
        return "volumeMismatch";
    }
    return null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest library/__tests__/shareLink.test.ts`
Expected: PASS, all tests green.

If `isPourVolumeValid()` is not a zero-argument public method on `Recipe`, read
`library/Recipe.ts` and use whatever it actually is — do not add a second implementation of the
volume rule.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npx eslint library/shareLink.ts library/__tests__/shareLink.test.ts`
Expected: no output from either.

- [ ] **Step 6: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: map a recipe onto xBloom'"'"'s share payload' '' 'The inverse of XBloomRecipe.getRecipe, kept pure so it can be tested' 'without a network. Cup types and pour patterns are renumbered rather than' 'shifted, and flow rate is divided by ten, because that is what the reading' 'half does in reverse.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add library/shareLink.ts library/__tests__/shareLink.test.ts
git commit -F /tmp/msg
```

---


### Task 2b: The round trip against the real importer

The spec asks for a round-trip through the existing `XBloomRecipe` importer where the shapes
allow. This is the test that would have caught the cupType reorder, the pattern reorder and the
`flowRate` scaling, each of which is a silent wrong-brew rather than a crash.

**Files:**
- Test: `library/__tests__/shareLink.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
import XBloomRecipe from "@/library/XBloomRecipe";

describe("the round trip through the importer", () => {
    // buildSharePayload is the inverse of XBloomRecipe.getRecipe. Feeding one
    // into the other is the only check that the two enum orderings agree; a
    // mismatch there is not a crash, it is a different brew.
    function reimport(recipe: Recipe): Recipe {
        const payload = buildSharePayload(recipe);
        const recipeVo = {
            ...payload,
            pourData: JSON.parse(payload.pourDataJSONStr)
        };
        return new XBloomRecipe().getRecipe(recipeVo);
    }

    it("preserves the fields that both formats carry", () => {
        const recipe = new Recipe();
        recipe.name = "Ethiopia";
        recipe.dose = 18;
        recipe.ratio = 16;
        recipe.grindSize = 55;
        recipe.rpm = 90;
        recipe.cupType = CUP_TYPE.OTHER;
        recipe.autoFixPourVolumes();

        const back = reimport(recipe);
        expect(back.name).toBe("Ethiopia");
        expect(back.dose).toBe(18);
        expect(back.ratio).toBe(16);
        expect(back.grindSize).toBe(55);
        expect(back.rpm).toBe(90);
        expect(back.cupType).toBe(CUP_TYPE.OTHER);
    });

    it("does not turn Other into Omni", () => {
        // The two cup-type orderings differ by a swap, not a shift. A +1 here
        // silently turns overflow protection back on.
        for (const cupType of [CUP_TYPE.XPOD, CUP_TYPE.OTHER, CUP_TYPE.OMNI]) {
            const recipe = new Recipe();
            recipe.cupType = cupType;
            recipe.autoFixPourVolumes();
            expect(reimport(recipe).cupType).toBe(cupType);
        }
    });

    it("preserves each pour", () => {
        const recipe = new Recipe();
        recipe.dose = 20;
        recipe.ratio = 15;
        recipe.addPour();
        recipe.pours[0].pourPattern = POUR_PATTERN.SPIRAL;
        recipe.pours[0].flowRate = 3.5;
        recipe.pours[0].temperature = 94;
        recipe.pours[1].pourPattern = POUR_PATTERN.CIRCULAR;
        recipe.pours[1].pauseTime = 30;
        recipe.autoFixPourVolumes();

        const back = reimport(recipe);
        expect(back.pours).toHaveLength(2);
        expect(back.pours[0].pourPattern).toBe(POUR_PATTERN.SPIRAL);
        expect(back.pours[0].flowRate).toBeCloseTo(3.5);
        expect(back.pours[0].temperature).toBe(94);
        expect(back.pours[1].pourPattern).toBe(POUR_PATTERN.CIRCULAR);
        expect(back.pours[1].pauseTime).toBe(30);
        expect(back.pours.reduce((n, p) => n + p.volume, 0)).toBe(300);
    });
});
```

`addPour`, `autoFixPourVolumes`, `CUP_TYPE` and `POUR_PATTERN` are all existing exports —
`CUP_TYPE` from `@/library/Recipe`, `POUR_PATTERN` from `@/library/Pour`. Add the imports the
file does not already have.

- [ ] **Step 2: Run and watch it fail or pass**

Run: `npx jest library/__tests__/shareLink.test.ts -t "round trip"`

This one may pass first time if Task 2 was written correctly — that is the point of it. If it
fails, the failure names exactly which mapping is wrong. **Do not adjust the expectation to
match the code.** `XBloomRecipe.getRecipe` is verified against the live API and is the fixed
side; `buildSharePayload` is the side that moves.

If `getRecipe`'s signature does not accept a bare object, read `library/XBloomRecipe.ts` and
call whatever internal mapping function it uses, exporting it if necessary. Do not reimplement
the mapping in the test — a test that restates the code proves nothing.

- [ ] **Step 3: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s
' 'test: round-trip the share payload through the importer' '' 'The importer is verified against the live API, so it is the fixed side. A' 'cupType or pattern mismatch is not a crash, it is a different brew, and' 'this is the only test that would notice.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add library/ && git commit -F /tmp/msg
```

---

### Task 3: Persist the mint result on the recipe

Three fields, so that sharing an unchanged recipe twice returns the same link instead of
littering the service account with duplicates. Persistence only — **`getData` and `parseData`
must not change.** No card byte moves in this milestone.

**Files:**
- Modify: `library/Recipe.ts` (field declarations near line 75; the `json` constructor branch)
- Modify: `library/backup.ts` (`RECIPE_FIELDS`, around line 191)
- Test: `library/__tests__/shareLink.test.ts` (append a `describe`)

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/shareLink.test.ts`:

```ts
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
```

Append to `library/__tests__/backup.test.ts`, inside the existing
`describe("parseBackup refuses, with a reason", ...)` block's file (top level is fine). That file
already imports `buildBackup`, `parseBackup` and `Recipe`, and defines `recipeNamed(name, uuid)`
at the top. Use them:

```ts
describe("the share fields survive a backup", () => {
    it("carries them through the round trip", () => {
        const recipe = recipeNamed("Shared", "u1");
        recipe.sharedTableId = 1353046;
        recipe.shareUrl = "https://share-h5.xbloom.com/?id=abc";
        recipe.shareSnapshot = "{}";
        const result = parseBackup(buildBackup([recipe], {}));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].sharedTableId).toBe(1353046);
        expect(result.payload.recipes[0].shareUrl).toBe("https://share-h5.xbloom.com/?id=abc");
    });

    it("refuses a recipe whose sharedTableId is not a number", () => {
        const doc = JSON.parse(buildBackup([recipeNamed("A", "u1")], {}));
        doc.recipes[0].sharedTableId = "1353046";
        const result = parseBackup(JSON.stringify(doc));
        expect(result.ok).toBe(false);
    });
});
```

`parseBackup` returns a `ParseResult` discriminated on `ok`, so the `if (!result.ok) return;`
narrowing line is required — the rest of that file uses the same shape.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest library/__tests__/shareLink.test.ts library/__tests__/backup.test.ts`
Expected: the new tests fail; `sharedTableId` is not a property of `Recipe`.

- [ ] **Step 3: Add the fields to `Recipe`**

In `library/Recipe.ts`, immediately after the `accentIndex` declaration:

```ts
    /**
     * The xBloom row id a share link was minted from, and the link itself.
     *
     * Deliberately not `shareId`, which is already taken and means the opposite
     * direction of travel: `shareId` is the id a recipe was *imported* from.
     * Reusing it would make a minted link look like an import origin, and the
     * editor's "refresh name from xBloom" would start fetching our own copy.
     *
     * The URL is stored rather than derived because the `?id=` token is issued
     * by the server and is not reconstructible from `sharedTableId`.
     */
    public sharedTableId?: number;
    public shareUrl?: string;
    /**
     * The canonical payload that produced `shareUrl`.
     *
     * Compared against a freshly built payload to decide whether the existing
     * link still describes this recipe. Stored verbatim rather than hashed:
     * there is no collision question, it is readable when someone asks why a
     * link changed, and M6 can diff it. A few hundred bytes per shared recipe.
     */
    public shareSnapshot?: string;
```

And in the `json` branch of the constructor, beside `this.shareId = jsonRecipe.shareId ?? "";`:

```ts
            // No `?? 0` / `?? ""` defaults: absent must stay absent, because
            // "never shared" and "shared, link unknown" are different states
            // and only the first one is safe to re-mint from silently.
            this.sharedTableId = jsonRecipe.sharedTableId;
            this.shareUrl = jsonRecipe.shareUrl;
            this.shareSnapshot = jsonRecipe.shareSnapshot;
```

- [ ] **Step 4: Add the validators**

In `library/backup.ts`, inside `RECIPE_FIELDS`:

```ts
    shareUrl:       (v) => typeof v === "string",
    shareSnapshot:  (v) => typeof v === "string",
    sharedTableId:  isNumber,
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest library/__tests__/shareLink.test.ts library/__tests__/backup.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole library suite, to prove nothing else moved**

Run: `npx jest library/`
Expected: PASS. The card-format characterisation tests must be untouched — if any of them
changed, stop: something reached into `getData`/`parseData` that should not have.

- [ ] **Step 7: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: persist the minted share link on the recipe' '' 'Named sharedTableId rather than shareId, which already exists and means' 'the opposite direction: the id a recipe was imported from. The URL is' 'stored rather than derived because the ?id= token is server-issued.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add library/Recipe.ts library/backup.ts library/__tests__/
git commit -F /tmp/msg
```

---

### Task 4: `constants/share.ts` — where the mint lives

**Files:**
- Create: `constants/share.ts`

- [ ] **Step 1: Write it**

```ts
/**
 * The XBRW++ mint endpoint.
 *
 * Overridable so a development build can point at a preview deployment or a
 * local `vercel dev`. `EXPO_PUBLIC_` is required for the value to survive into
 * the bundle; nothing secret goes through here, only a URL.
 */
export const SHARE_API_URL =
    process.env.EXPO_PUBLIC_SHARE_API_URL ?? "https://xbrw-share.vercel.app/api/share";

/** How long to wait before giving up on a mint, in ms. */
export const SHARE_TIMEOUT_MS = 20_000;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: add the share endpoint constant' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add constants/share.ts && git commit -F /tmp/msg
```

---

### Task 5: `api/_lib/payload.ts` — validate the request server-side

**The function must never import from `library/`.** `library/shareLink.ts` imports `Recipe`,
which imports `NFC`, which imports `react-native-nfc-manager`. Pulling that chain into a
serverless bundle breaks the deploy. So the shape is re-stated here, independently, and
validated without trusting the client.

**Files:**
- Create: `api/_lib/payload.ts`
- Test: `api/__tests__/payload.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import {validateSharePayload} from "../_lib/payload";

function valid() {
    return {
        theName:             "Ethiopia Guji",
        theColor:            "#C9D5B8",
        dose:                18,
        grandWater:          16,
        grinderSize:         55,
        isSetGrinderSize:    1,
        rpm:                 90,
        cupType:             2,
        bypassTemp:          85,
        bypassVolume:        0,
        subSetType:          2,
        theSubsetId:         0,
        appPlace:            [4],
        isShortcuts:         2,
        isEnableBypassWater: 2,
        adaptedModel:        1,
        pourCount:           2,
        pourDataJSONStr:     JSON.stringify([
            {theName: "Bloom", volume: 50, temperature: 93, flowRate: 3.5,
             pattern: 1, pausing: 30, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2},
            {theName: "Pour 2", volume: 238, temperature: 92, flowRate: 3,
             pattern: 2, pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 1}
        ])
    };
}

describe("validateSharePayload", () => {
    it("accepts a well-formed payload", () => {
        expect(validateSharePayload(valid())).toBeNull();
    });

    it("rejects a non-object", () => {
        expect(validateSharePayload(null)).toBe("payload must be an object");
        expect(validateSharePayload("nope")).toBe("payload must be an object");
    });

    it("rejects a missing field", () => {
        const p: Record<string, unknown> = valid();
        delete p.dose;
        expect(validateSharePayload(p)).toBe("dose must be a finite number");
    });

    it("rejects a name that is empty or absurdly long", () => {
        expect(validateSharePayload({...valid(), theName: "   "}))
            .toBe("theName must be a non-empty string of at most 120 characters");
        expect(validateSharePayload({...valid(), theName: "x".repeat(121)}))
            .toBe("theName must be a non-empty string of at most 120 characters");
    });

    it("rejects a colour that is not a hex triplet", () => {
        expect(validateSharePayload({...valid(), theColor: "red"}))
            .toBe("theColor must be a #RRGGBB colour");
    });

    it("rejects a dose outside the machine's range", () => {
        expect(validateSharePayload({...valid(), dose: 0})).toBe("dose is out of range");
        expect(validateSharePayload({...valid(), dose: 999})).toBe("dose is out of range");
    });

    it("rejects a cup type the machine does not have", () => {
        expect(validateSharePayload({...valid(), cupType: 7})).toBe("cupType is out of range");
    });

    it("rejects pour data that is not a JSON array", () => {
        expect(validateSharePayload({...valid(), pourDataJSONStr: "{}"}))
            .toBe("pourDataJSONStr must encode an array of 1 to 9 pours");
        expect(validateSharePayload({...valid(), pourDataJSONStr: "not json"}))
            .toBe("pourDataJSONStr must encode an array of 1 to 9 pours");
    });

    it("rejects a pour whose volume is out of range", () => {
        const pours = JSON.parse(valid().pourDataJSONStr);
        pours[0].volume = 5000;
        expect(validateSharePayload({...valid(), pourDataJSONStr: JSON.stringify(pours)}))
            .toBe("pour 1: volume is out of range");
    });

    it("rejects a pourCount that disagrees with the pour data", () => {
        expect(validateSharePayload({...valid(), pourCount: 3}))
            .toBe("pourCount must match the number of pours");
    });

    it("rejects a payload larger than the size ceiling", () => {
        const pours = JSON.parse(valid().pourDataJSONStr);
        pours[0].theName = "x".repeat(9000);
        expect(validateSharePayload({...valid(), pourDataJSONStr: JSON.stringify(pours)}))
            .toBe("payload is too large");
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest api/__tests__/payload.test.ts`
Expected: FAIL, `Cannot find module '../_lib/payload'`.

- [ ] **Step 3: Write `api/_lib/payload.ts`**

```ts
/**
 * Request validation for the mint function.
 *
 * This deliberately re-states the payload shape rather than importing
 * `library/shareLink.ts`. That module imports `Recipe`, which imports `NFC`,
 * which imports `react-native-nfc-manager` — a native module that cannot exist
 * in a serverless bundle. The duplication is the price of that boundary, and it
 * has a second benefit: the function does not trust the client's idea of what a
 * valid recipe is.
 *
 * Every limit here is a real machine limit, not a guess. A payload that passes
 * this and still fails upstream is a bug worth knowing about; a payload that
 * fails here never reaches xBloom's servers under our account's name.
 */

/** Above this, refuse. A legitimate nine-pour recipe is well under 4 kB. */
const MAX_BYTES = 8_192;

const NUMBER_RANGES: Record<string, [number, number]> = {
    dose:                [1, 100],
    grandWater:          [1, 30],
    grinderSize:         [0, 80],
    isSetGrinderSize:    [1, 2],
    rpm:                 [60, 120],
    cupType:             [1, 4],
    bypassTemp:          [0, 100],
    bypassVolume:        [0, 500],
    subSetType:          [0, 10],
    theSubsetId:         [0, 10_000_000],
    isShortcuts:         [1, 2],
    isEnableBypassWater: [1, 2],
    adaptedModel:        [1, 2],
    pourCount:           [1, 9]
};

const POUR_RANGES: Record<string, [number, number]> = {
    volume:                  [0, 1000],
    temperature:             [0, 100],
    flowRate:                [0, 10],
    pattern:                 [1, 3],
    pausing:                 [0, 3600],
    isEnableVibrationBefore: [1, 2],
    isEnableVibrationAfter:  [1, 2]
};

function isFinite_(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

/**
 * Returns a human-readable reason, or `null` when the payload is acceptable.
 *
 * A string rather than a thrown error so the handler decides the status code
 * and so the reason is trivially loggable without a stack.
 */
export function validateSharePayload(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return "payload must be an object";
    }
    const p = payload as Record<string, unknown>;

    if (JSON.stringify(p).length > MAX_BYTES) {
        return "payload is too large";
    }

    const name = p.theName;
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 120) {
        return "theName must be a non-empty string of at most 120 characters";
    }
    if (typeof p.theColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(p.theColor)) {
        return "theColor must be a #RRGGBB colour";
    }
    if (!Array.isArray(p.appPlace) || p.appPlace.some((v) => !isFinite_(v))) {
        return "appPlace must be an array of numbers";
    }

    for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
        const value = p[key];
        if (!isFinite_(value)) {
            return `${key} must be a finite number`;
        }
        if (value < min || value > max) {
            return `${key} is out of range`;
        }
    }

    if (typeof p.pourDataJSONStr !== "string") {
        return "pourDataJSONStr must encode an array of 1 to 9 pours";
    }
    let pours: unknown;
    try {
        pours = JSON.parse(p.pourDataJSONStr);
    } catch {
        return "pourDataJSONStr must encode an array of 1 to 9 pours";
    }
    if (!Array.isArray(pours) || pours.length < 1 || pours.length > 9) {
        return "pourDataJSONStr must encode an array of 1 to 9 pours";
    }
    if (pours.length !== p.pourCount) {
        return "pourCount must match the number of pours";
    }

    for (let i = 0; i < pours.length; i++) {
        const pour = pours[i];
        if (typeof pour !== "object" || pour === null || Array.isArray(pour)) {
            return `pour ${i + 1}: must be an object`;
        }
        const q = pour as Record<string, unknown>;
        if (typeof q.theName !== "string" || q.theName.length > 60) {
            return `pour ${i + 1}: theName must be a string of at most 60 characters`;
        }
        for (const [key, [min, max]] of Object.entries(POUR_RANGES)) {
            const value = q[key];
            if (!isFinite_(value)) {
                return `pour ${i + 1}: ${key} must be a finite number`;
            }
            if (value < min || value > max) {
                return `pour ${i + 1}: ${key} is out of range`;
            }
        }
    }

    return null;
}
```

Note the ordering: the size check runs before the field checks, so a hostile 5 MB body is
rejected on one `JSON.stringify` rather than walked.

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest api/__tests__/payload.test.ts`
Expected: PASS.

The "too large" test relies on the size check running first. If it instead fails with a pour
name message, the checks are in the wrong order — move the size check up.

- [ ] **Step 5: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: validate the share payload server-side' '' 'The shape is re-stated rather than imported: library/shareLink.ts reaches' 'Recipe -> NFC -> react-native-nfc-manager, which cannot exist in a' 'serverless bundle. The duplication also means the function does not trust' 'the client about what a valid recipe is.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add api/ && git commit -F /tmp/msg
```

---

### Task 6: `api/_lib/store.ts` and `api/_lib/rateLimit.ts` — abuse control

Two files, because they answer different questions. `store.ts` is *where* a counter lives;
`rateLimit.ts` is *what the counter means*. Splitting them keeps the arithmetic testable without
a network and lets the whole thing degrade to in-memory when no KV is configured — which matters,
because the account holder may deploy on a bare free Vercel project with no add-ons.

**Files:**
- Create: `api/_lib/store.ts`
- Create: `api/_lib/rateLimit.ts`
- Test: `api/__tests__/rateLimit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import {memoryCounter} from "../_lib/store";
import {checkLimits, GLOBAL_PER_DAY, PER_IP_PER_HOUR} from "../_lib/rateLimit";

const HOUR = 3_600_000;

describe("checkLimits", () => {
    it("allows the first request", async () => {
        const c = memoryCounter();
        expect(await checkLimits(c, "hashedip", Date.parse("2026-08-31T10:00:00Z"))).toBeNull();
    });

    it("allows exactly the per-IP allowance and refuses the next", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        for (let i = 0; i < PER_IP_PER_HOUR; i++) {
            expect(await checkLimits(c, "hashedip", at)).toBeNull();
        }
        expect(await checkLimits(c, "hashedip", at)).toBe("ip");
    });

    it("forgets the per-IP count in the next hour window", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        for (let i = 0; i < PER_IP_PER_HOUR; i++) {
            await checkLimits(c, "hashedip", at);
        }
        expect(await checkLimits(c, "hashedip", at + HOUR)).toBeNull();
    });

    it("does not let one IP consume another's allowance", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        for (let i = 0; i < PER_IP_PER_HOUR; i++) {
            await checkLimits(c, "a", at);
        }
        expect(await checkLimits(c, "b", at)).toBeNull();
    });

    it("refuses once the global daily ceiling is reached, whoever is asking", async () => {
        const c = memoryCounter();
        const at = Date.parse("2026-08-31T10:00:00Z");
        // Spread across enough distinct IPs that the per-IP limit never bites.
        for (let i = 0; i < GLOBAL_PER_DAY; i++) {
            expect(await checkLimits(c, `ip-${i}`, at)).toBeNull();
        }
        expect(await checkLimits(c, "someone-new", at)).toBe("global");
    });

    it("keys the global window to the day, not to a rolling 24 hours", async () => {
        const c = memoryCounter();
        const morning = Date.parse("2026-08-31T01:00:00Z");
        const evening = Date.parse("2026-08-31T23:00:00Z");
        const nextDay = Date.parse("2026-09-01T01:00:00Z");
        for (let i = 0; i < GLOBAL_PER_DAY; i++) {
            await checkLimits(c, `ip-${i}`, morning);
        }
        expect(await checkLimits(c, "late", evening)).toBe("global");
        expect(await checkLimits(c, "late", nextDay)).toBeNull();
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest api/__tests__/rateLimit.test.ts`
Expected: FAIL, `Cannot find module '../_lib/store'`.

- [ ] **Step 3: Write `api/_lib/store.ts`**

```ts
/**
 * Where a rate-limit counter lives.
 *
 * Two implementations. In-memory is the fallback and is honest about being one:
 * serverless instances are neither shared nor long-lived, so it limits a burst
 * from a single warm instance and nothing more. Upstash is the real thing, and
 * is used when — and only when — its two environment variables are present.
 *
 * The interface is one method because that is all a windowed counter needs:
 * increment a key that expires, and say what the count is now. Anything richer
 * would be a database, and this is not one.
 */
export type Counter = {
    /** Increment `key`, set its TTL if unset, and return the new value. */
    bump(key: string, ttlSeconds: number): Promise<number>;
};

/** Process-local. Survives a warm invocation, nothing more. */
export function memoryCounter(): Counter {
    const counts = new Map<string, {value: number; expiresAt: number}>();
    return {
        async bump(key, ttlSeconds) {
            const now = Date.now();
            const existing = counts.get(key);
            if (!existing || existing.expiresAt <= now) {
                counts.set(key, {value: 1, expiresAt: now + ttlSeconds * 1000});
                return 1;
            }
            existing.value += 1;
            return existing.value;
        }
    };
}

/**
 * Upstash Redis over its REST API.
 *
 * REST rather than a client library so the function keeps zero runtime
 * dependencies — the deploy then needs no install step at all, which is what
 * lets `vercel.json` skip building the Expo tree.
 *
 * `EXPIRE ... NX` sets the TTL only if there is not one already, so the window
 * is fixed from the first request in it rather than sliding forward on every
 * subsequent one.
 */
export function upstashCounter(url: string, token: string): Counter {
    return {
        async bump(key, ttlSeconds) {
            const res = await fetch(`${url}/pipeline`, {
                method:  "POST",
                headers: {
                    Authorization:  `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify([
                    ["INCR", key],
                    ["EXPIRE", key, String(ttlSeconds), "NX"]
                ])
            });
            if (!res.ok) {
                throw new Error(`upstash ${res.status}`);
            }
            const body = (await res.json()) as {result?: number}[];
            const value = body?.[0]?.result;
            if (typeof value !== "number") {
                throw new Error("upstash returned no count");
            }
            return value;
        }
    };
}

/**
 * The counter this deployment should use.
 *
 * Falling back rather than failing is deliberate: a missing KV must not take
 * sharing down, and the account holder should be able to deploy without an
 * add-on. The trade is stated in the runbook.
 */
export function counterFromEnv(env: Record<string, string | undefined>): Counter {
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
        return upstashCounter(url, token);
    }
    return memoryCounter();
}
```

- [ ] **Step 4: Write `api/_lib/rateLimit.ts`**

```ts
import type {Counter} from "./store";

/**
 * What one IP may mint in an hour.
 *
 * Ten is generous for a human sharing recipes and cheap to serve. The real
 * ceiling is the global one below; this exists so a single client cannot spend
 * the whole day's budget in a minute.
 */
export const PER_IP_PER_HOUR = 10;

/**
 * What the whole service may mint in a day.
 *
 * The account holder's own estimate of demand is single digits per month. Five
 * hundred is three orders of magnitude of headroom and still a bound, which
 * matters because the mints land in a real xBloom account under a real name and
 * — per the spike — **cannot be withdrawn afterwards.**
 */
export const GLOBAL_PER_DAY = 500;

const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

export type LimitBreach = "ip" | "global";

/** `2026-08-31T14` — the hour this instant falls in, in UTC. */
function hourWindow(at: number): string {
    return new Date(at).toISOString().slice(0, 13);
}

/** `2026-08-31` — the day this instant falls in, in UTC. */
function dayWindow(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

/**
 * Count this request and say whether it should be refused.
 *
 * The IP is already hashed by the caller. This module never sees an address,
 * which is what lets `PRIVACY.md` say so without qualification — and it keeps
 * `node:crypto` out of a file that is otherwise pure arithmetic and therefore
 * testable under jest-expo without a Node environment.
 *
 * Both counters are incremented even when the request is refused. A client that
 * keeps hammering keeps its own window pinned open; that is the intent.
 */
export async function checkLimits(
    counter: Counter, hashedIp: string, at: number = Date.now()
): Promise<LimitBreach | null> {
    const global = await counter.bump(`share:global:${dayWindow(at)}`, DAY_SECONDS);
    if (global > GLOBAL_PER_DAY) {
        return "global";
    }
    const perIp = await counter.bump(`share:ip:${hashedIp}:${hourWindow(at)}`, HOUR_SECONDS);
    if (perIp > PER_IP_PER_HOUR) {
        return "ip";
    }
    return null;
}
```

The global counter is checked first on purpose: once the day's budget is gone, no per-IP work
is done at all.

- [ ] **Step 5: Run and watch it pass**

Run: `npx jest api/__tests__/rateLimit.test.ts`
Expected: PASS.

The `memoryCounter` uses real `Date.now()` for expiry while `checkLimits` takes an injected
`at`. That is fine for these tests — the window is encoded in the *key*, so a different `at`
produces a different key regardless of TTL. Do not add fake timers.

- [ ] **Step 6: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: add windowed rate limiting for the mint function' '' 'Split in two so the arithmetic is testable without a network, and so the' 'store can degrade to in-memory when no KV is configured — the account' 'holder should be able to deploy on a bare free project.' '' 'The IP arrives already hashed, so this module never sees an address.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add api/ && git commit -F /tmp/msg
```

---

### Task 7: `api/_lib/xbloom.ts` — the upstream client

Login, RSA, mint, and the share-link lookup the spike proved is necessary. `node:crypto` and
global `fetch` only; **no dependencies.**

**Deviation from the spec, deliberate.** The spec has the session token cached in KV and
re-fetched on rejection, "so a normal share costs one upstream call rather than two". The spike
changed that arithmetic: a mint is three upstream calls, not two, so caching saves a quarter of
the work rather than half. Against that it puts a live credential-equivalent at rest in a store
that is optional in this design and absent on a bare free account, and it adds an
expiry-and-retry path that only ever executes in production. Log in per request instead. If the
volume ever justifies it, cache in module scope — warm instances give most of the benefit for
none of the exposure.

**Files:**
- Create: `api/_lib/xbloom.ts`
- Test: `api/__tests__/xbloom.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import {constants, createPrivateKey, generateKeyPairSync, privateDecrypt} from "node:crypto";

import {encryptForXbloom, mintRecipe, XBLOOM_PUBLIC_KEY} from "../_lib/xbloom";

describe("encryptForXbloom", () => {
    it("splits the plaintext into 117-byte blocks and produces 128 bytes each", () => {
        // 250 bytes of plaintext is three blocks: 117 + 117 + 16.
        const out = Buffer.from(encryptForXbloom("x".repeat(250)), "base64");
        expect(out.length).toBe(384);
    });

    it("round-trips through the matching private key", () => {
        const {publicKey, privateKey} = generateKeyPairSync("rsa", {modulusLength: 1024});
        const plaintext = JSON.stringify({hello: "world", n: 1});
        const encrypted = Buffer.from(
            encryptForXbloom(plaintext, publicKey.export({type: "spki", format: "pem"}) as string),
            "base64"
        );
        const decrypted = privateDecrypt(
            {key: createPrivateKey(privateKey.export({type: "pkcs8", format: "pem"}) as string),
             padding: constants.RSA_PKCS1_PADDING},
            encrypted
        );
        expect(decrypted.toString("utf8")).toBe(plaintext);
    });

    it("uses a 1024-bit key, which is what the 117-byte chunk size assumes", () => {
        expect(XBLOOM_PUBLIC_KEY).toContain("BEGIN PUBLIC KEY");
    });
});

describe("mintRecipe", () => {
    const payload = {theName: "T", dose: 18} as never;

    function mockFetch(responses: unknown[]) {
        const calls: {url: string; body: string}[] = [];
        const fn = jest.fn(async (url: string, init: {body: string}) => {
            calls.push({url, body: init.body});
            const next = responses[calls.length - 1];
            return {ok: true, status: 200, json: async () => next, text: async () => JSON.stringify(next)};
        });
        return {fn, calls};
    }

    it("logs in, mints, then reads the share link back from the library list", async () => {
        const {fn, calls} = mockFetch([
            {result: "success", member: {tableId: 159810}, token: "tok"},
            {result: "success", tableId: 1353046},
            {result: "success", list: [
                {tableId: 999, shareRecipeLink: "https://share-h5.xbloom.com/?id=wrong"},
                {tableId: 1353046, shareRecipeLink: "https://share-h5.xbloom.com/?id=right"}
            ]}
        ]);
        global.fetch = fn as never;

        const result = await mintRecipe(payload, {email: "e", password: "p"});

        expect(result).toEqual({tableId: 1353046, url: "https://share-h5.xbloom.com/?id=right"});
        expect(calls.map((c) => c.url)).toEqual([
            "https://client-api.xbloom.com/tMemberLogin.thtml",
            "https://client-api.xbloom.com/tuRecipeAdd.tuhtml",
            "https://client-api.xbloom.com/tuMyTeaRecipeCreated.tuhtml"
        ]);
    });

    it("sends the login body as plain JSON and the others encrypted", async () => {
        const {fn, calls} = mockFetch([
            {result: "success", member: {tableId: 1}, token: "tok"},
            {result: "success", tableId: 5},
            {result: "success", list: [{tableId: 5, shareRecipeLink: "https://x/?id=a"}]}
        ]);
        global.fetch = fn as never;
        await mintRecipe(payload, {email: "e", password: "p"});

        expect(JSON.parse(calls[0].body)).toMatchObject({email: "e", password: "p"});
        // The others are a JSON-encoded base64 string, not an object.
        expect(typeof JSON.parse(calls[1].body)).toBe("string");
        expect(typeof JSON.parse(calls[2].body)).toBe("string");
    });

    it("throws when the login is rejected", async () => {
        const {fn} = mockFetch([{result: "fail", info: "bad password"}]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "p"}))
            .rejects.toThrow("login rejected");
    });

    it("throws when the mint is rejected", async () => {
        const {fn} = mockFetch([
            {result: "success", member: {tableId: 1}, token: "tok"},
            {result: "fail", info: "nope"}
        ]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "p"}))
            .rejects.toThrow("mint rejected");
    });

    it("throws when the new row is not in the library list", async () => {
        const {fn} = mockFetch([
            {result: "success", member: {tableId: 1}, token: "tok"},
            {result: "success", tableId: 5},
            {result: "success", list: [{tableId: 4, shareRecipeLink: "https://x/?id=a"}]}
        ]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "p"}))
            .rejects.toThrow("share link not found");
    });

    it("never puts the password in an error message", async () => {
        const {fn} = mockFetch([{result: "fail"}]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "hunter2"}))
            .rejects.toThrow(/^(?!.*hunter2).*$/);
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest api/__tests__/xbloom.test.ts`
Expected: FAIL, `Cannot find module '../_lib/xbloom'`.

- [ ] **Step 3: Write `api/_lib/xbloom.ts`**

```ts
import {constants, createPublicKey, publicEncrypt} from "node:crypto";

/**
 * xBloom's API key. A literal constant of their service, not a secret of ours.
 *
 * The irregular line wrapping is upstream — it is identical in pourpilot,
 * denull0 and KhalidOnzi, and `openssl rsa -pubin -text` parses it as a valid
 * 1024-bit key. Do not "fix" the wrapping.
 */
export const XBLOOM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4LF40GZ72SdhMyl765K/i4nY5
CPcHz2Q1IKWKZ9S79xmK7G8pUhbVf4EZLvnNF1+9IvOFQUKV5Z7ZNNviqSpnql9
tAT+8+J/He0R7pcirvVSxgdr2i9V/C/gmqAEZ5qVTzRnd3uWdFoKzPdEBxP0Ipor
J1VBbCv90yBSOhVxO+QIDAQAB
-----END PUBLIC KEY-----`;

const BASE = "https://client-api.xbloom.com";

/**
 * 128-byte modulus minus 11 bytes of PKCS#1 v1.5 padding. Not arbitrary: a
 * larger chunk throws, a smaller one produces more blocks than the server's
 * decryptor expects to reassemble.
 */
const CHUNK = 117;

/**
 * Sent on every call, including the unauthenticated ones.
 *
 * The Referer is load-bearing — every community client sets it, and the public
 * read endpoint requires it. The iPhone user agent is what the official share
 * page sends.
 */
const HEADERS = {
    "content-type":    "application/json",
    accept:            "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    Referer:           "https://share-h5.xbloom.com/",
    "User-Agent":      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
                       "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
                       "Mobile/15E148 Safari/604.1"
};

export type XbloomCredentials = {email: string; password: string};
export type MintResult = {tableId: number; url: string};

/** RSA-PKCS1v1.5 over 117-byte blocks, concatenated, base64'd. */
export function encryptForXbloom(plaintext: string, pem: string = XBLOOM_PUBLIC_KEY): string {
    const key = createPublicKey(pem);
    const bytes = Buffer.from(plaintext, "utf8");
    const blocks: Buffer[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
        blocks.push(publicEncrypt(
            {key, padding: constants.RSA_PKCS1_PADDING},
            bytes.subarray(i, i + CHUNK)
        ));
    }
    return Buffer.concat(blocks).toString("base64");
}

async function post(path: string, body: unknown, encrypted: boolean): Promise<any> {
    const res = await fetch(`${BASE}/${path}`, {
        method:  "POST",
        headers: HEADERS,
        body:    encrypted
            ? JSON.stringify(encryptForXbloom(JSON.stringify(body)))
            : JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error(`${path} returned ${res.status}`);
    }
    return res.json();
}

/**
 * The boilerplate every authenticated call carries.
 *
 * `adaptedModel` is not here: it belongs to the payload and to the lookup, and
 * the two must agree or the new row is invisible to the lookup. See the spike
 * notes in docs/machine-integration/cloud-api.md.
 */
function authFields(memberId: number, token: string) {
    return {
        interfaceVersion: 20240918,
        skey:             "testskey",
        phoneType:        "Android",
        clientType:       2,
        languageType:     1,
        memberId,
        token
    };
}

/**
 * Mint a share link for a payload.
 *
 * Three upstream calls, in this order, because the create response does not
 * contain the link and the `?id=` token is not derivable from the row id.
 *
 * Errors carry a class, never a credential and never the recipe. The message is
 * logged; the caller maps it to something the user can act on.
 */
export async function mintRecipe(
    payload: Record<string, unknown>, credentials: XbloomCredentials
): Promise<MintResult> {
    const login = await post("tMemberLogin.thtml", {
        email:            credentials.email,
        password:         credentials.password,
        interfaceVersion: 20240918,
        skey:             "testskey",
        phoneType:        "Android",
        clientType:       2,
        languageType:     1,
        jpushId:          ""
    }, false);

    const memberId = login?.member?.tableId;
    const token = login?.token;
    if (login?.result !== "success" || typeof memberId !== "number" || typeof token !== "string") {
        throw new Error("login rejected");
    }

    const created = await post("tuRecipeAdd.tuhtml", {
        ...authFields(memberId, token),
        ...payload,
        // Added here rather than in the app's payload so it never lands in the
        // snapshot. If it did, the snapshot would differ on every press and
        // every share would mint a duplicate.
        createTimeStamp: Date.now()
    }, true);

    const tableId = created?.tableId;
    if (created?.result !== "success" || typeof tableId !== "number") {
        throw new Error("mint rejected");
    }

    // The create response has no share link. Find the row we just made and read
    // the server's own link off it — the ?id= is an opaque server-issued token.
    const list = await post("tuMyTeaRecipeCreated.tuhtml", {
        ...authFields(memberId, token),
        pageNumber:   1,
        countPerPage: 20,
        adaptedModel: 1
    }, true);

    const row = (list?.list ?? []).find((r: {tableId?: number}) => r?.tableId === tableId);
    const url = row?.shareRecipeLink;
    if (typeof url !== "string" || url.length === 0) {
        throw new Error("share link not found");
    }

    return {tableId, url};
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest api/__tests__/xbloom.test.ts`
Expected: PASS.

If the round-trip test fails on padding, check that `publicEncrypt` is being given
`constants.RSA_PKCS1_PADDING` and not the default OAEP — the default will encrypt fine and
decrypt to garbage on xBloom's side, which is the worst possible failure mode because it looks
like it works locally.

- [ ] **Step 5: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: add the xBloom mint client' '' 'Three calls, not two: the create response carries no share link and the' '?id= token is server-issued, so the new row has to be found in the' 'library listing and its shareRecipeLink read verbatim.' '' 'node:crypto and global fetch only, so the function keeps zero runtime' 'dependencies and the deploy needs no install step.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add api/ && git commit -F /tmp/msg
```

---

### Task 8: `api/share.ts` — the handler, and the deploy config

> **SUPERSEDED — do not execute as written.** This task specifies a
> web-standard `export default async function (request: Request): Promise<Response>`.
> On Vercel's Node runtime that deploys without complaint and then **hangs every
> request until a 504** — the handler is invoked as `(req, res)`, so a returned
> `Response` never ends the socket, and nothing logs a failure.
>
> The shipped implementation instead exports `respond(request: Request)` holding
> all the logic (which is what the tests call), a `toRequest()` adapter, and a
> `(req, res)` default export that writes the status, headers and body onto the
> `ServerResponse`. Read `api/share.ts` and the "handler shape" section of
> `docs/machine-integration/share-deploy.md` before touching this path. The
> validation, error contract and rate-limit ordering below all still stand; only
> the handler signature and its tests changed.


**Files:**
- Create: `api/share.ts`
- Create: `vercel.json`
- Create: `public/index.html`
- Create: `.vercelignore`
- Test: `api/__tests__/share.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import handler from "../share";

function request(body: unknown, headers: Record<string, string> = {}) {
    return new Request("https://x/api/share", {
        method:  "POST",
        headers: {"content-type": "application/json", ...headers},
        body:    JSON.stringify(body)
    });
}

function validPayload() {
    return {
        theName: "T", theColor: "#C9D5B8", dose: 18, grandWater: 16, grinderSize: 55,
        isSetGrinderSize: 1, rpm: 90, cupType: 2, bypassTemp: 85, bypassVolume: 0,
        subSetType: 2, theSubsetId: 0, appPlace: [4], isShortcuts: 2,
        isEnableBypassWater: 2, adaptedModel: 1, pourCount: 1,
        pourDataJSONStr: JSON.stringify([{
            theName: "Bloom", volume: 288, temperature: 93, flowRate: 3.5,
            pattern: 1, pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
        }])
    };
}

function okFetch() {
    return jest.fn(async (url: string) => ({
        ok: true, status: 200,
        json: async () => {
            if (url.endsWith("tMemberLogin.thtml")) {
                return {result: "success", member: {tableId: 1}, token: "tok"};
            }
            if (url.endsWith("tuRecipeAdd.tuhtml")) {
                return {result: "success", tableId: 42};
            }
            return {result: "success",
                    list: [{tableId: 42, shareRecipeLink: "https://share-h5.xbloom.com/?id=ok"}]};
        }
    }));
}

describe("share handler", () => {
    beforeEach(() => {
        process.env.XBLOOM_EMAIL = "e";
        process.env.XBLOOM_PASSWORD = "p";
        process.env.SHARE_IP_SALT = "salt";
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it("refuses anything that is not a POST", async () => {
        const res = await handler(new Request("https://x/api/share", {method: "GET"}));
        expect(res.status).toBe(405);
    });

    it("mints and returns the url", async () => {
        global.fetch = okFetch() as never;
        const res = await handler(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.4"}));
        expect(res.status).toBe(200);
        await expect(res.json()).resolves
            .toEqual({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
    });

    it("rejects a malformed payload with 400 and a reason", async () => {
        global.fetch = okFetch() as never;
        const res = await handler(request(
            {payload: {...validPayload(), dose: 9999}}, {"x-forwarded-for": "1.2.3.5"}
        ));
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toEqual({error: "invalid", reason: "dose is out of range"});
    });

    it("rejects a body that is not JSON", async () => {
        const res = await handler(new Request("https://x/api/share", {
            method: "POST", headers: {"content-type": "application/json"}, body: "{{{"
        }));
        expect(res.status).toBe(400);
    });

    it("returns 503 when the credentials are not configured", async () => {
        delete process.env.XBLOOM_EMAIL;
        const res = await handler(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.6"}));
        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toEqual({error: "unavailable"});
    });

    it("returns 429 once an IP is over its allowance", async () => {
        global.fetch = okFetch() as never;
        const ip = {"x-forwarded-for": "9.9.9.9"};
        for (let i = 0; i < 10; i++) {
            expect((await handler(request({payload: validPayload()}, ip))).status).toBe(200);
        }
        const res = await handler(request({payload: validPayload()}, ip));
        expect(res.status).toBe(429);
        await expect(res.json()).resolves.toEqual({error: "limited", scope: "ip"});
    });

    it("returns 502 when the upstream mint fails", async () => {
        global.fetch = jest.fn(async () => ({
            ok: true, status: 200, json: async () => ({result: "fail"})
        })) as never;
        const res = await handler(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.7"}));
        expect(res.status).toBe(502);
        await expect(res.json()).resolves.toEqual({error: "upstream"});
    });

    it("never echoes the recipe or a credential back to the client", async () => {
        global.fetch = jest.fn(async () => ({
            ok: true, status: 200, json: async () => ({result: "fail", info: "p"})
        })) as never;
        const res = await handler(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.8"}));
        const text = await res.text();
        expect(text).not.toContain("theName");
        expect(text).not.toContain("XBLOOM");
    });
});
```

Note: because the in-memory counter is process-local and module-scope, these tests share it.
That is why each test uses a distinct `x-forwarded-for` — reusing one would leak the 429 test's
count into its neighbours. Keep the distinct IPs.

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest api/__tests__/share.test.ts`
Expected: FAIL, `Cannot find module '../share'`.

- [ ] **Step 3: Write `api/share.ts`**

```ts
import {createHash} from "node:crypto";

import {validateSharePayload} from "./_lib/payload";
import {checkLimits} from "./_lib/rateLimit";
import {counterFromEnv} from "./_lib/store";
import {mintRecipe} from "./_lib/xbloom";

/**
 * The XBRW++ share mint.
 *
 * The Web-standard handler signature rather than `@vercel/node`'s, so the
 * function needs no devDependency and `expo-doctor` has nothing new to flag.
 *
 * What this refuses to do is as important as what it does: it never logs a
 * recipe, never returns an upstream message to the client, and never stores an
 * IP address. `PRIVACY.md` states all three, so they have to be true here.
 */

// Module scope, so a warm instance keeps its counts. Cold starts reset them,
// which is exactly the in-memory fallback's stated weakness.
const counter = counterFromEnv(process.env);

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {"content-type": "application/json"}
    });
}

/**
 * The client's address, hashed with a server-side salt.
 *
 * Salted so the store cannot be reversed into a list of addresses even by
 * whoever holds it. An unset salt is a misconfiguration, not a reason to skip
 * limiting, so it falls back to a constant and still works.
 */
function clientKey(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    const salt = process.env.SHARE_IP_SALT ?? "xbrw-share";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== "POST") {
        return json({error: "method"}, 405);
    }

    const email = process.env.XBLOOM_EMAIL;
    const password = process.env.XBLOOM_PASSWORD;
    if (!email || !password) {
        console.error("share: credentials are not configured");
        return json({error: "unavailable"}, 503);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({error: "invalid", reason: "body must be JSON"}, 400);
    }

    const payload = (body as {payload?: unknown})?.payload;
    const reason = validateSharePayload(payload);
    if (reason) {
        // The reason describes the *shape*, never the content, so it is safe to
        // return and safe to log.
        console.warn(`share: rejected payload (${reason})`);
        return json({error: "invalid", reason}, 400);
    }

    let breach: "ip" | "global" | null;
    try {
        breach = await checkLimits(counter, clientKey(request));
    } catch (e) {
        // A KV outage must not take sharing down. Log and continue unlimited
        // rather than fail closed: the upstream mint is the scarce resource and
        // it has its own ceiling in the form of a real account.
        console.error("share: rate limit store unavailable", (e as Error).message);
        breach = null;
    }
    if (breach) {
        return json({error: "limited", scope: breach}, 429);
    }

    try {
        const result = await mintRecipe(payload as Record<string, unknown>, {email, password});
        console.log(`share: minted ${result.tableId}`);
        return json(result, 200);
    } catch (e) {
        // The upstream message can contain anything, including an echo of what
        // we sent. Log our own error class; tell the client nothing else.
        console.error("share: upstream failed", (e as Error).message);
        return json({error: "upstream"}, 502);
    }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest api/__tests__/share.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the deploy config**

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "echo skipping install: the mint function has no dependencies",
  "buildCommand": "echo skipping build: only api/ is deployed",
  "outputDirectory": "public"
}
```

`public/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XBRW++ share service</title>
</head>
<body>
  <h1>XBRW++ share service</h1>
  <p>
    This host runs one function, <code>/api/share</code>, which turns a recipe from the
    XBRW++ app into a link that opens in the official xBloom app. It is not a website.
  </p>
  <p>
    Source: <a href="https://github.com/hessius/XBRecipeWriterPlus">github.com/hessius/XBRecipeWriterPlus</a>
  </p>
</body>
</html>
```

The `install` and `build` commands are no-ops on purpose. Vercel would otherwise install the
whole Expo dependency tree and try to build the app, neither of which the function needs — it
has no dependencies at all. `outputDirectory: "public"` gives the deploy something to serve so
the build does not fail for want of output.

`.vercelignore`:

```
*
!api
!api/**
!public
!public/**
!vercel.json
!package.json
```

`package.json` is included because Vercel reads it to pick the Node runtime; nothing is
installed from it.

- [ ] **Step 6: Lint and typecheck**

Run: `npm run typecheck && npx eslint api/`
Expected: no output.

If ESLint complains about `process`, `Buffer` or `console` being undefined in `api/`, add an
override block to `eslint.config.js` beside the existing "Node-run files" one:

```js
    {
        // The mint function runs on Vercel's Node runtime, not in the app.
        files: ["api/**/*.ts"],
        languageOptions: {
            globals: {Buffer: "readonly", process: "readonly", console: "readonly"}
        }
    },
```

- [ ] **Step 7: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: add the share mint function and its deploy config' '' 'The install and build commands are no-ops: the function has no' 'dependencies, and without them Vercel installs the whole Expo tree and' 'tries to build the app.' '' 'Nothing about a recipe is logged or returned. The client is told an error' 'class and no more, because the upstream message can echo what we sent.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add api/ vercel.json public/ .vercelignore eslint.config.js
git commit -F /tmp/msg
```

---

### Task 9: `hooks/useShareRecipe.ts` — the app-side state machine

**Files:**
- Create: `hooks/useShareRecipe.ts`
- Test: `hooks/__tests__/useShareRecipe.test.ts`

Read `hooks/useRecipeImport.ts` first. This hook mirrors its error vocabulary and its shape
rather than inventing a parallel one.

- [ ] **Step 1: Write the failing tests**

```ts
import {act, renderHook, waitFor} from "@testing-library/react-native";

import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {useShareRecipe} from "@/hooks/useShareRecipe";

function drip(): Recipe {
    const r = new Recipe(undefined, undefined);
    r.name = "Ethiopia Guji";
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 55;
    r.cupType = CUP_TYPE.OMNI;
    r.pours = [new Pour(1, 288, 93, 35, 0, POUR_PATTERN.CENTERED, 0)];
    return r;
}

function respond(body: unknown, status = 200) {
    return jest.fn(async () => ({
        ok: status < 400, status, json: async () => body
    })) as never;
}

describe("useShareRecipe", () => {
    it("starts idle", async () => {
        const {result} = renderHook(() => useShareRecipe());
        expect(result.current.state).toEqual({status: "idle"});
    });

    it("mints and returns the url", async () => {
        global.fetch = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        const recipe = drip();
        const {result} = renderHook(() => useShareRecipe());

        let url: string | null = null;
        await act(async () => {
            url = await result.current.share(recipe);
        });

        expect(url).toBe("https://share-h5.xbloom.com/?id=ok");
        expect(recipe.sharedTableId).toBe(42);
        expect(recipe.shareUrl).toBe("https://share-h5.xbloom.com/?id=ok");
        expect(recipe.shareSnapshot).toBeTruthy();
        await waitFor(() => expect(result.current.state).toEqual({status: "idle"}));
    });

    it("reuses the stored link when nothing that is sent has changed", async () => {
        const fetchMock = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        global.fetch = fetchMock;
        const recipe = drip();
        const {result} = renderHook(() => useShareRecipe());

        await act(async () => { await result.current.share(recipe); });
        await act(async () => { await result.current.share(recipe); });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-mints when a field that is sent changes", async () => {
        const fetchMock = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        global.fetch = fetchMock;
        const recipe = drip();
        const {result} = renderHook(() => useShareRecipe());

        await act(async () => { await result.current.share(recipe); });
        recipe.pours[0].temperature = 95;
        await act(async () => { await result.current.share(recipe); });

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not re-mint for a change that is never sent", async () => {
        const fetchMock = respond({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
        global.fetch = fetchMock;
        const recipe = drip();
        const {result} = renderHook(() => useShareRecipe());

        await act(async () => { await result.current.share(recipe); });
        recipe.backup = [1, 2, 3];
        await act(async () => { await result.current.share(recipe); });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("maps 429 to limited", async () => {
        global.fetch = respond({error: "limited", scope: "ip"}, 429);
        const {result} = renderHook(() => useShareRecipe());
        await act(async () => { await result.current.share(drip()); });
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "limited"}));
    });

    it("maps 503 and 502 to unavailable", async () => {
        for (const status of [502, 503]) {
            global.fetch = respond({error: "upstream"}, status);
            const {result} = renderHook(() => useShareRecipe());
            await act(async () => { await result.current.share(drip()); });
            await waitFor(() =>
                expect(result.current.state).toEqual({status: "failed", reason: "unavailable"}));
        }
    });

    it("maps 400 to unusable", async () => {
        global.fetch = respond({error: "invalid", reason: "dose is out of range"}, 400);
        const {result} = renderHook(() => useShareRecipe());
        await act(async () => { await result.current.share(drip()); });
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "unusable"}));
    });

    it("maps a thrown fetch to network", async () => {
        global.fetch = jest.fn(async () => { throw new Error("offline"); }) as never;
        const {result} = renderHook(() => useShareRecipe());
        await act(async () => { await result.current.share(drip()); });
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "network"}));
    });

    it("refuses a recipe the machine would reject, without calling out", async () => {
        const fetchMock = respond({tableId: 1, url: "https://x"});
        global.fetch = fetchMock;
        const recipe = drip();
        recipe.pours[0].volume = 5;
        const {result} = renderHook(() => useShareRecipe());

        let url: string | null = "unset";
        await act(async () => { url = await result.current.share(recipe); });

        expect(url).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(result.current.state).toEqual({status: "failed", reason: "unusable"}));
    });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest hooks/__tests__/useShareRecipe.test.ts`
Expected: FAIL, `Cannot find module '@/hooks/useShareRecipe'`.

- [ ] **Step 3: Write `hooks/useShareRecipe.ts`**

```ts
import {useRef, useState} from "react";

import {SHARE_API_URL, SHARE_TIMEOUT_MS} from "@/constants/share";
import type Recipe from "@/library/Recipe";
import {buildSharePayload, canonicalSnapshot, shareBlockReason} from "@/library/shareLink";

/**
 * Why a share did not happen.
 *
 * The same four words `useRecipeImport` uses, deliberately: the two features
 * fail in the same ways and a user should not have to learn two vocabularies
 * for one idea.
 */
export type ShareErrorReason = "network" | "limited" | "unavailable" | "unusable";

export type ShareState =
    | {status: "idle"}
    | {status: "sharing"}
    | {status: "failed"; reason: ShareErrorReason};

/**
 * Turn a recipe into a link.
 *
 * The memoisation is the point of the hook rather than a nicety. Every mint
 * creates a permanent, undeletable row in a shared xBloom account, so pressing
 * Share twice on an unchanged recipe must not create two of them. What is
 * compared is *what was sent*, not the whole recipe — recolouring or renaming
 * locally does not needlessly mint, while changing a pour volume does.
 */
export function useShareRecipe() {
    const [state, setState] = useState<ShareState>({status: "idle"});
    // A ref, not state: it guards against a double tap within one render pass,
    // which a state flag would not see in time.
    const inFlight = useRef(false);

    async function share(recipe: Recipe): Promise<string | null> {
        if (inFlight.current) {
            return null;
        }

        if (shareBlockReason(recipe) !== null) {
            setState({status: "failed", reason: "unusable"});
            return null;
        }

        const payload = buildSharePayload(recipe);
        const snapshot = canonicalSnapshot(payload);
        if (recipe.shareUrl && recipe.shareSnapshot === snapshot) {
            setState({status: "idle"});
            return recipe.shareUrl;
        }

        inFlight.current = true;
        setState({status: "sharing"});

        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), SHARE_TIMEOUT_MS);
        try {
            const res = await fetch(SHARE_API_URL, {
                method:  "POST",
                headers: {"content-type": "application/json"},
                body:    JSON.stringify({payload}),
                signal:  abort.signal
            });

            if (res.status === 429) {
                setState({status: "failed", reason: "limited"});
                return null;
            }
            if (res.status === 400) {
                setState({status: "failed", reason: "unusable"});
                return null;
            }
            if (!res.ok) {
                setState({status: "failed", reason: "unavailable"});
                return null;
            }

            const body = (await res.json()) as {tableId?: number; url?: string};
            if (typeof body.url !== "string" || typeof body.tableId !== "number") {
                setState({status: "failed", reason: "unavailable"});
                return null;
            }

            // Mutated in place and left for the caller to persist, which is how
            // every other recipe change in this app works.
            recipe.sharedTableId = body.tableId;
            recipe.shareUrl = body.url;
            recipe.shareSnapshot = snapshot;

            setState({status: "idle"});
            return body.url;
        } catch {
            setState({status: "failed", reason: "network"});
            return null;
        } finally {
            clearTimeout(timer);
            inFlight.current = false;
        }
    }

    function dismissError() {
        setState({status: "idle"});
    }

    return {state, share, dismissError};
}
```

`try`/`finally` makes the React Compiler bail out of optimising this hook. That is accepted here
for the same reason it is accepted in `useRecipeEditor` — the timer and the in-flight flag have
to be cleared on every path.

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest hooks/__tests__/useShareRecipe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: add the share hook' '' 'Memoises against the payload that was actually sent, because every mint' 'creates a permanent, undeletable row in a shared xBloom account and' 'pressing Share twice must not create two of them.' '' 'Errors use the same four words as the import path rather than a second' 'vocabulary for the same idea.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add hooks/ && git commit -F /tmp/msg
```

---

### Task 10: The Share row

**Files:**
- Modify: `constants/dotIcons.ts` (add a `share` glyph)
- Modify: `components/RecipeOverflowSheet.tsx` (`OVERFLOW_HEIGHT`, a `onShare` prop, the row)
- Test: `components/__tests__/RecipeOverflowSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `components/__tests__/RecipeOverflowSheet.test.tsx`, copy whatever props helper it already
uses, and add:

```tsx
it("calls onShare and closes the sheet", async () => {
    const onShare = jest.fn();
    const onOpenChange = jest.fn();
    await renderWithProviders(
        <RecipeOverflowSheet {...defaultProps()} onShare={onShare} onOpenChange={onOpenChange}/>
    );
    await fireEvent.press(screen.getByLabelText("Share"));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("draws the share row as a normal action, not a destructive one", async () => {
    await renderWithProviders(<RecipeOverflowSheet {...defaultProps()}/>);
    expect(screen.getByLabelText("Share")).toBeTruthy();
});
```

`renderWithProviders`, `fireEvent` and `screen` all come from the existing test file's imports —
match them exactly. **Both `renderWithProviders` and `fireEvent` are async in RNTL v14; a
missing `await` leaves `screen` empty and the test passes for the wrong reason.**

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest components/__tests__/RecipeOverflowSheet.test.tsx`
Expected: FAIL — no element with label "Share".

- [ ] **Step 3: Draw the icon**

In `constants/dotIcons.ts`, after the `import` entry:

```ts
    /** An arrow out of a tray: the inverse of `import`, which is an arrow into one. */
    share: [
        ".........",
        "....#....",
        "...###...",
        "..#.#.#..",
        "....#....",
        "....#....",
        "....#....",
        ".#######.",
        "........."
    ],
```

The two glyphs are deliberately mirror images. `import` points down into the tray; `share`
points up out of it. Anything else at 9×9 reads as noise — see the note at the top of the file.

- [ ] **Step 4: Add the row**

In `components/RecipeOverflowSheet.tsx`:

Raise the height, and say why:

```ts
/**
 * How much of the screen the more menu takes.
 *
 * It holds one switch and five rows and nothing that scrolls, so it is sized to
 * them. At the house default it stood most of the way up the screen with two
 * thirds of it empty, which read as a sheet that had failed to load.
 */
export const OVERFLOW_HEIGHT = 48;
```

Add to `Props`, beside `onDuplicate`:

```ts
    onShare: () => void;
```

Add to the destructured parameter list, and render it directly above `Duplicate` — sharing is
the outward-facing action and the two form a pair:

```tsx
                {row("Share", "share", onShare, {
                    hint: "Creates a link that opens this recipe in the xBloom app."
                })}
                {row("Duplicate", "duplicate", onDuplicate)}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx jest components/__tests__/RecipeOverflowSheet.test.tsx`
Expected: PASS.

Also run: `npx jest components/__tests__/DotIcon.test.tsx`
Expected: PASS. If that file asserts on the full set of icon names, add `share` to it.

- [ ] **Step 6: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: add a Share row to the recipe overflow sheet' '' 'The glyph is the import arrow mirrored: one points into the tray, the' 'other out of it. At 9x9 there is no third readable option.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add constants/dotIcons.ts components/
git commit -F /tmp/msg
```

---

### Task 11: Wire it into the editor

**Files:**
- Modify: `app/editRecipe.tsx`

- [ ] **Step 1: Add the imports**

```tsx
import {Share} from "react-native";

import {useShareRecipe} from "@/hooks/useShareRecipe";
```

`Share` comes from `react-native` and is already the platform's own sheet on both OSes. Do not
add a library for this.

- [ ] **Step 2: Use the hook**

Beside the other hook calls in the component body:

```tsx
    const {state: shareState, share: shareRecipe} = useShareRecipe();
```

- [ ] **Step 3: Write the handler**

Module scope is not possible here — it closes over the hook — so put it in the component body
beside `duplicateRecipe`:

```tsx
    async function onSharePress() {
        // The same reason Refresh flushes first: a just-typed value has to be
        // committed or the link is minted from the previous one.
        await flushDrafts();
        const url = await shareRecipe(recipe);
        if (!url) {
            return;
        }
        // Persist the ids the mint returned, so pressing Share again reuses the
        // link instead of minting a second copy in the shared account.
        persistRecipe();
        try {
            await Share.share({message: url});
        } catch {
            // The user dismissing the system sheet throws on some platforms.
            // Nothing failed; there is nothing to say.
        }
    }
```

`persistRecipe` does not exist yet. `useRecipeEditor` currently exposes only `saveRecipe`, which
calls `onSaved()` and so navigates away — wrong here, because the user is about to be handed a
system share sheet and should land back on the editor. Split it in `hooks/useRecipeEditor.ts`:

```ts
    /** Write the recipe to the database without leaving the screen. */
    function persistRecipe() {
        if (!recipe) return;
        // Saves whether or not the volumes add up. Refusing to save a
        // half-finished recipe loses work to enforce a rule that only matters
        // at the moment of writing a card.
        new RecipeDatabase().updateRecipe(recipe.uuid, recipe);
    }

    function saveRecipe() {
        if (!recipe) return;
        persistRecipe();
        onSaved();
    }
```

and add `persistRecipe` to the object the hook returns, beside `saveRecipe`. The comment moves
with the database call, not with the navigation.

- [ ] **Step 4: Report failures**

Directly under the handler, add an effect that turns a failure into a toast. The four reasons
map to four sentences:

```tsx
    useEffect(() => {
        if (shareState.status !== "failed") {
            return;
        }
        const message = {
            network:     "Could not reach the sharing service. Check your connection.",
            limited:     "Sharing is busy right now. Try again in a few minutes.",
            unavailable: "Sharing is temporarily unavailable. Everything else still works.",
            unusable:    "This recipe cannot be shared yet — check the pour volumes and dose."
        }[shareState.reason];
        notify({tone: "error", message});
    }, [shareState]);
```

Per #69 this is a toast and never a blocking dialog, and it must not interrupt anything.

One correction to how this reads: a failed share does not leave the recipe *untouched*. Sharing
saves the recipe first, because saving is what assigns the accent index that goes into the minted
payload — snapshot before saving and the snapshot never matches again, which mints a duplicate on
the next press. So a share that fails on the network leaves a saved recipe behind. That is
deliberate and harmless: the user pressed Share on a recipe they wanted. What must *not* happen is
saving on the way to an immediate refusal, so the block reason is evaluated before the save.

- [ ] **Step 5: Pass it to the sheet**

```tsx
                                 onShare={onSharePress}
```

added to the existing `<RecipeOverflowSheet .../>` call, beside `onDuplicate`.

- [ ] **Step 6: Run the editor's tests**

Run: `npx jest app/__tests__/`
Expected: PASS. If a test snapshots the overflow sheet's props, update it.

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. Existing `react-hooks/exhaustive-deps` warnings are fine; a new one is not.

- [ ] **Step 8: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'feat: share a recipe from the editor' '' 'Drafts are flushed first, for the same reason Refresh flushes first: a' 'just-typed value would otherwise mint from the previous one. The recipe is' 'saved after a successful mint so the link is not minted twice.' '' 'Failure is a toast. Sharing changes nothing about the recipe and must not' 'interrupt anything (#69).' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add app/ && git commit -F /tmp/msg
```

---

### Task 12: Disclosure, hygiene, and the runbook

**Files:**
- Modify: `PRIVACY.md`
- Modify: `app/about.tsx` (or wherever the About screen's privacy copy lives — find it)
- Modify: `.gitignore`
- Create: `docs/machine-integration/share-deploy.md`

- [ ] **Step 1: Widen the env ignore**

In `.gitignore`, replace the `.env.local` line with:

```
# Every local env file, not just .env.local: .env.production.local is one typo
# away from being committed, and it would carry the service account's password.
.env*
```

- [ ] **Step 2: Rewrite the network claim in `PRIVACY.md`**

The document currently says XBRW++ makes network requests in "exactly one case". That stops
being true here. Find that sentence and replace the surrounding section with:

```markdown
## When XBRW++ uses the network

Two cases, both of which only happen because you asked for them.

**Importing a recipe.** When you paste an xBloom link or ID, the app fetches that
recipe from xBloom's public servers. Nothing about you is sent.

**Sharing a recipe.** When you tap Share, the recipe is sent to a small service
run by XBRW++, which adds it to an xBloom account belonging to XBRW++ and
returns a link. Concretely, what leaves your device is: the recipe's name, dose,
ratio, grind size, grinder RPM, cup type, accent colour, and every pour's volume,
temperature, flow rate, pattern, pause and agitation. Nothing else — no device
identifier, no account, no location, no usage data.

That service keeps a count of how many links have been created recently, against
a salted hash of your IP address, so that it cannot be abused. It stores no
address, no recipe, and no log of what you shared.

Two things about a shared link are worth knowing before you tap it:

- The recipe is stored in **xBloom's** cloud, not ours, and it stays there. We
  cannot delete it, and neither can you. A link you have shared cannot be taken
  back.
- Anyone who opens the link sees the recipe attributed to the XBRW++ account,
  not to you.

**If you never share, XBRW++ still sends nothing anywhere.** Every other feature
— reading cards, writing cards, editing, backup and restore — works with the
network off.

These xBloom endpoints are unofficial and undocumented. They can change or stop
working without notice.
```

- [ ] **Step 3: Match the About screen**

Find where the About screen states the privacy position — search for a phrase from `PRIVACY.md`:

Run: `grep -rn "collects nothing\|never leaves\|no analytics" app/ components/`

Update whatever it finds so it does not contradict the above. The line that must survive is the
one about a user who never shares.

- [ ] **Step 4: Write the runbook**

Create `docs/machine-integration/share-deploy.md`:

```markdown
# Deploying the share mint

The XBRW++ app can turn a recipe into a link that opens in the official xBloom
app. Doing that means creating the recipe in an xBloom account, which means
holding a password — so it happens in a small serverless function rather than in
the app. This is how to deploy it.

## What you need

- A Vercel account. The free tier is enough.
- The XBRW++ xBloom service account's email and password.

## One-time setup

1. Import `hessius/XBRecipeWriterPlus` as a new Vercel project.
2. Leave the framework preset as **Other**. `vercel.json` already sets the
   install and build commands to no-ops — the function has no dependencies, and
   without that Vercel installs the whole Expo tree and tries to build the app.
3. Add these environment variables, all marked **Sensitive**, for Production
   and Preview:

   | Name | Value |
   |---|---|
   | `XBLOOM_EMAIL` | the service account's email |
   | `XBLOOM_PASSWORD` | the service account's password |
   | `SHARE_IP_SALT` | any long random string, e.g. `openssl rand -hex 32` |

4. Deploy, then check the URL. `https://<project>.vercel.app/api/share` should
   answer a `GET` with `405` and `{"error":"method"}`. If it 404s, the function
   was not deployed — see Troubleshooting.
5. Put that URL in `constants/share.ts` as the default, or set
   `EXPO_PUBLIC_SHARE_API_URL` in the build environment.

## Optional: real rate limiting

Without a KV store the rate limiter is per-instance, which means it limits a
burst from one warm function and not much else. To make it real, add an Upstash
Redis integration and set:

| Name | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | from the Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | from the Upstash dashboard |

The code picks these up automatically and falls back to in-memory when they are
absent. Nothing else changes.

## Checking it works

```bash
curl -s -X POST https://<project>.vercel.app/api/share \
  -H 'content-type: application/json' \
  -d '{"payload":{"theName":"Deploy check","theColor":"#C9D5B8","dose":18,
       "grandWater":16,"grinderSize":55,"isSetGrinderSize":1,"rpm":90,
       "cupType":2,"bypassTemp":85,"bypassVolume":0,"subSetType":2,
       "theSubsetId":0,"appPlace":[4],"isShortcuts":2,"isEnableBypassWater":2,
       "adaptedModel":1,"pourCount":1,
       "pourDataJSONStr":"[{\"theName\":\"Bloom\",\"volume\":288,
        \"temperature\":93,\"flowRate\":3.5,\"pattern\":1,\"pausing\":0,
        \"isEnableVibrationBefore\":2,\"isEnableVibrationAfter\":2}]"}}'
```

Expect `{"tableId":…,"url":"https://share-h5.xbloom.com/?id=…"}`. Open the URL.

**This creates a real recipe in the service account and it cannot be deleted.**
Deleting it through the API removes it from the account's library but the link
keeps resolving. Use one check, not ten.

## Troubleshooting

- **`/api/share` 404s.** Vercel did not pick the function up. Move `api/` and
  `vercel.json` into a `server/` subdirectory and set the project's Root
  Directory to `server`, so nothing else in the repo is in scope.
- **The build fails installing dependencies.** The no-op `installCommand` was
  overridden in the project settings. Clear the override so `vercel.json` wins.
- **`503 {"error":"unavailable"}`.** The credentials are not set in this
  environment. Check Preview as well as Production.
- **`502 {"error":"upstream"}`.** Look at the function logs for the error class.
  `login rejected` means the password changed. `share link not found` means the
  mint succeeded but the new row was not in the first 20 of the library listing
  — see the `adaptedModel` note in `cloud-api.md` § C-bis.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
printf '%s\n' 'docs: disclose sharing, and add the deploy runbook' '' 'PRIVACY.md said the app makes a network request in exactly one case. That' 'stops being true, so the section is rewritten rather than appended to —' 'including the two things a user should know before tapping Share: the' 'recipe cannot be withdrawn, and it is attributed to the XBRW++ account.' '' 'The claim that survives is the one that matters: a user who never shares' 'still has an app that sends nothing anywhere.' '' 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' > /tmp/msg
git add PRIVACY.md app/ docs/ .gitignore
git commit -F /tmp/msg
```

---

### Task 13: Full verification and the pull request

- [ ] **Step 1: The four CI gates, locally**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Expected: typecheck silent; lint clean apart from the pre-existing
`react-hooks/exhaustive-deps` warnings; jest green with roughly 60 more tests than the 1240 that
were passing before this branch; expo-doctor 21/21.

`expo-doctor` is a hard failure in CI. If it reports a new problem, it is almost certainly the
new `api/` directory or `vercel.json` confusing its project-structure check — read the actual
message before changing anything.

- [ ] **Step 2: Confirm the function did not swallow the app**

Run: `grep -rn "from \"@/library\|from \"../library\|react-native" api/`
Expected: **no output.** Any hit means the serverless bundle now reaches into the app and the
deploy will fail.

- [ ] **Step 3: Confirm no secret was committed**

```bash
git log --oneline main..HEAD
git diff main..HEAD -- . | grep -in "hessiusdev\|password.*=.*['\"]" | grep -v "XBLOOM_PASSWORD" | head
git status --short
```

Expected: no credential in the diff, and `.env.local` untracked.

- [ ] **Step 4: Open the pull request**

```bash
git push -u origin feature/share-link
gh pr create --title "Share a recipe as an xBloom link" --body-file /tmp/pr.md
```

The body should cover: what the feature does, the spike finding that reshaped it (the share id
is server-issued, so the mint takes three calls), what the account holder must do before it
works (create the Vercel project, set the three env vars, confirm the URL), the App Store
privacy label change, and the fact that nothing here has been exercised on a device.

- [ ] **Step 5: Wait for CI and report**

```bash
sleep 160 && gh pr checks
```

CI takes about 1m50s. All four checks must be green.

---

## What the account holder has to do, and I cannot

1. Create the Vercel project and set `XBLOOM_EMAIL`, `XBLOOM_PASSWORD` and `SHARE_IP_SALT` as
   Sensitive environment variables. Follow `docs/machine-integration/share-deploy.md`.
2. Confirm the deployed URL matches the default in `constants/share.ts`, or set
   `EXPO_PUBLIC_SHARE_API_URL`.
3. Optionally add Upstash. Without it the rate limit is per-instance only.
4. Add *User Content → Other User Content*, not linked to identity, to the App Store privacy
   label before the next submission.
5. Device-test: share a drip recipe, a tea recipe and a grinder-off recipe, open each link in
   the official xBloom app, and check the values match. Every one of those mints is permanent.
