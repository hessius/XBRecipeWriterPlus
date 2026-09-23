# Beanconqueror Brew Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a finished XBRW++ brew into Beanconqueror over a custom URL scheme, carrying the figures, the flow trace, the per-stage temperature profile and a readable note.

**Architecture:** Three pure TypeScript layers on our side (note, envelope, codec) with one hook and one button, and a matching decoder plus import service in a Beanconqueror fork. The wire format is `JSON -> gzip -> base64url -> shareBrewN` params, mirroring BC's existing bean share. Measured working end to end at 4 KB with roughly 24x headroom (spec §7.1).

**Tech Stack:** TypeScript, Expo SDK 57, jest / jest-expo, Tamagui, `fflate` (new, sender side only); Angular / Ionic / Capacitor 8 and `@zip.js/zip.js` on the Beanconqueror side.

**Spec:** `docs/superpowers/specs/2026-09-20-beanconqueror-brew-export-design.md`. Section references below point at it.

---

## Ground rules for this plan

- **Phases A to D are XBRW++ and ship on their own.** They are gated behind a module constant (§5.3), and Phase A alone unblocks #103 and #98. Do not wait on Beanconqueror to merge them.
- **Phase E is a separate repository.** The working spike lives at `/tmp/bcq` (a shallow clone of `graphefruit/Beanconqueror` with the PoC receiver applied). Phase E hardens it on a proper fork.
- **Never copy Beanconqueror source into this repository.** It is GPL-3.0 and this repository is not. Read it in place, write our own files.
- After every task: `npm run typecheck && npm run lint && npx jest <the test file>`.

## One naming decision, made once

The spec's §4.2 example shows `"device": "xBloom Studio"`, but §3.1 argues the mill name must be under-claimed as `"xBloom"` because we cannot yet distinguish a Studio from an original (see #138). Those two cannot both be right in the same payload.

**Resolution: `"xBloom"` everywhere**, from a single exported constant, so it is one edit when the BLE Device Information Service (`0x180A`) question in §3.1 is finally answered. §3.1's argument is the stronger one and it applies to display text as well: a confident error is worse than a vague truth.

---

## File structure

### Phase A: record what we brewed with (#109, widened, spec §3)

| File | Responsibility |
| --- | --- |
| `library/podCoffee.ts` *(new)* | The `PodCoffee` type and `podCoffeeFrom(podsVo)`. Pure. |
| `library/Recipe.ts` | Carries `coffee?: PodCoffee`, round-trips it through JSON. |
| `library/XBloomRecipe.ts` | Captures the coffee when importing an xPod recipe. |
| `library/brew/BrewRecord.ts` | Six new optional fields on `BrewRecord`. |
| `library/BrewDatabase.ts` | Six new columns, one migration, read and write. |
| `library/brew/BrewRecorder.ts` | Snapshots the six off the recipe at brew time. |

### Phase B: the note (spec §5.1)

| File | Responsibility |
| --- | --- |
| `library/brew/brewNote.ts` *(new)* | `StoredBrew` -> human-readable stage summary. Pure, no dependencies. |

### Phase C: the wire format (spec §4.1, §4.2, §6.1)

| File | Responsibility |
| --- | --- |
| `library/brew/handoff/envelope.ts` *(new)* | Record + samples -> the neutral object. Knows the schema, unit tags, `firstDripTime`, the `bean`, `metrics` and `imported` blocks. No compression, no URLs. |
| `library/brew/handoff/encode.ts` *(new)* | Object -> chunked URL. Columnar-delta, gzip, base64url, size budget, degradation. Knows nothing about brews. |

### Phase D: the action (spec §5.2, §5.3)

| File | Responsibility |
| --- | --- |
| `hooks/useBrewHandoff.ts` *(new)* | Gather, encode, `openURL`, handle refusal. |
| `app/brewRecord.tsx` | The button, the gate, the reciprocal credit. |

### Phase E: the Beanconqueror fork

| File | Responsibility |
| --- | --- |
| `src/services/intentHandler/brew-handoff.decoder.ts` *(new)* | Collect, decode, inflate, validate. Trust boundary (§6.3). |
| `src/services/intentHandler/intent-handler.service.ts` | One `else if` for `ADD_BREW`. |
| `src/services/brewImport/brew-import.service.ts` *(new)* | Envelope -> `Brew` + `BrewFlow`, match-or-drop for bean, mill and preparation. |
| `src/interfaces/brew/ICustomInformationBrew.ts` + class | The optional `imported` block. |
| `src/components/brew-information/…` | The provenance chip. |
| `src/enums/preparations/preparationTypes.ts` + `preparation.ts` | `XBLOOM`. |
| `src/assets/custom-ion-icons/*.svg`, `src/assets/i18n/*.json` | Our mark, the illustration, the strings. |
| `docs/import-api.md` *(new)* | The schema, so any app can emit it. |

---

# Phase A: record what we brewed with

Spec §3. Six fields, all optional, so every existing row reads exactly as it does now.

## Task 1: The `PodCoffee` type

**Files:**
- Create: `library/podCoffee.ts`
- Test: `library/__tests__/podCoffee.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// library/__tests__/podCoffee.test.ts
import {podCoffeeFrom} from "@/library/podCoffee";

describe("podCoffeeFrom", () => {
    it("reads the fields a real pod carries", () => {
        expect(podCoffeeFrom({
            theName: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            varietal: "Batian",
            flavor: "Cherry\u30fbstrawberry\u30fbblueberry",
            introduce: "A producer narrative.",
            type: "Single Origin",
            imagePath: "https://example.com/pod.png",
            roast: 1
        })).toEqual({
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry\u30fbstrawberry\u30fbblueberry",
            note: "A producer narrative.",
            beanMix: "Single Origin",
            imageUrl: "https://example.com/pod.png"
        });
    });

    it("does not map roast, whose meaning is unverified", () => {
        const coffee = podCoffeeFrom({theName: "X", roast: 3});
        expect(coffee).not.toBeNull();
        expect(Object.keys(coffee!)).not.toContain("degreeOfRoast");
    });

    it("drops empty strings rather than carrying them", () => {
        // subtitle is empty on real pods; so is origin on some.
        expect(podCoffeeFrom({theName: "X", origin: "", process: "  "}))
            .toEqual({name: "X"});
    });

    it("is null without a name, which is the only field worth matching on", () => {
        expect(podCoffeeFrom({origin: "Kenya"})).toBeNull();
        expect(podCoffeeFrom(null)).toBeNull();
        expect(podCoffeeFrom(undefined)).toBeNull();
    });

    it("refuses an image that is not https", () => {
        expect(podCoffeeFrom({theName: "X", imagePath: "javascript:alert(1)"}))
            .toEqual({name: "X"});
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/podCoffee.test.ts`
Expected: FAIL, `Cannot find module '@/library/podCoffee'`.

- [ ] **Step 3: Write the implementation**

```ts
// library/podCoffee.ts

/**
 * What an xPod tells us about its coffee.
 *
 * Named for BC's `Bean` fields rather than xBloom's, because this exists to
 * be handed to something else. `roast` is deliberately absent: it was `1` on
 * all five pods probed, so whether it is a roast level or a constant is
 * unknown, and an invented roast level is worse than none (spec §2.1.1).
 */
export type PodCoffee = {
    name: string;
    origin?: string;
    process?: string;
    variety?: string;
    aromatics?: string;
    note?: string;
    beanMix?: string;
    imageUrl?: string;
};

/** A trimmed string, or undefined when there was nothing worth carrying. */
function text(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

/**
 * An image URL we are willing to hand onwards.
 *
 * Checked here rather than at the far end because this is where the
 * third-party response is first touched: the endpoint is undocumented and
 * nothing guarantees the shape it returns.
 */
function httpsUrl(value: unknown): string | undefined {
    const raw = text(value);
    if (raw === undefined) return undefined;
    try {
        return new URL(raw).protocol === "https:" ? raw : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Read a `podsVo` object into the subset we keep.
 *
 * Null without a name. The name is the only field BC can match a bean on
 * (spec §4.5.1 decision 5), so a block without one cannot do anything except
 * take up room in the URL.
 */
export function podCoffeeFrom(podsVo: unknown): PodCoffee | null {
    if (podsVo === null || typeof podsVo !== "object") return null;
    const vo = podsVo as Record<string, unknown>;
    const name = text(vo.theName);
    if (name === undefined) return null;

    const coffee: PodCoffee = {name};
    const origin    = text(vo.origin);
    const process   = text(vo.process);
    const variety   = text(vo.varietal);
    const aromatics = text(vo.flavor);
    const note      = text(vo.introduce);
    const beanMix   = text(vo.type);
    const imageUrl  = httpsUrl(vo.imagePath);

    if (origin    !== undefined) coffee.origin    = origin;
    if (process   !== undefined) coffee.process   = process;
    if (variety   !== undefined) coffee.variety   = variety;
    if (aromatics !== undefined) coffee.aromatics = aromatics;
    if (note      !== undefined) coffee.note      = note;
    if (beanMix   !== undefined) coffee.beanMix   = beanMix;
    if (imageUrl  !== undefined) coffee.imageUrl  = imageUrl;
    return coffee;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/podCoffee.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add library/podCoffee.ts library/__tests__/podCoffee.test.ts
git commit -m "Add PodCoffee, the part of a pod worth keeping"
```

## Task 2: `Recipe` carries the coffee

**Files:**
- Modify: `library/Recipe.ts`
- Test: `library/__tests__/recipeCoffee.test.ts`

Read `library/Recipe.ts` around lines 88-92 (the public field block) and around lines 200-260 (the JSON constructor) before editing. The constructor is deliberately forgiving so it can migrate its own old shapes.

- [ ] **Step 1: Write the failing test**

```ts
// library/__tests__/recipeCoffee.test.ts
import Recipe from "@/library/Recipe";

describe("Recipe.coffee", () => {
    it("is undefined on a recipe that never had a pod", () => {
        expect(new Recipe().coffee).toBeUndefined();
    });

    it("round-trips through JSON", () => {
        const recipe = new Recipe();
        recipe.coffee = {name: "Kenya Sakami", origin: "Nabiswa, Kenya"};
        const back = new Recipe(JSON.parse(JSON.stringify(recipe)));
        expect(back.coffee).toEqual({name: "Kenya Sakami", origin: "Nabiswa, Kenya"});
    });

    it("ignores a coffee block that is not an object with a name", () => {
        expect(new Recipe({coffee: "Kenya"} as never).coffee).toBeUndefined();
        expect(new Recipe({coffee: {origin: "Kenya"}} as never).coffee).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/recipeCoffee.test.ts`
Expected: FAIL, `Property 'coffee' does not exist on type 'Recipe'`.

- [ ] **Step 3: Add the field and its migration**

Add the import at the top of `library/Recipe.ts`:

```ts
import {podCoffeeFrom, type PodCoffee} from "@/library/podCoffee";
```

Add the field beside `grinder` in the public field block (near line 92):

```ts
    /**
     * The coffee this recipe's pod carries, when it came from an xPod import.
     *
     * Captured at import rather than at export, because an export must not
     * depend on an undocumented third-party endpoint being reachable: putting
     * a live fetch inside a user action makes the feature fail on a train
     * (spec §2.1.1).
     */
    public coffee?: PodCoffee;
```

Add to the JSON constructor, beside the `grinder` line (near line 217):

```ts
            // Goes through the same reader as the live endpoint so a stored
            // block and a fresh one cannot drift apart, and so a hand-edited
            // backup cannot smuggle in a field we never validate.
            const coffee = podCoffeeFrom(
                jsonRecipe.coffee === undefined ? undefined
                    : {...jsonRecipe.coffee, theName: jsonRecipe.coffee?.name}
            );
            if (coffee !== null) this.coffee = coffee;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/recipeCoffee.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the existing recipe tests, which are characterisation tests**

Run: `npx jest library/__tests__`
Expected: PASS. A failure here is a regression, not an expectation to update. See `.github/copilot-instructions.md`.

- [ ] **Step 6: Commit**

```bash
git add library/Recipe.ts library/__tests__/recipeCoffee.test.ts
git commit -m "Recipe remembers the coffee its pod named"
```

## Task 3: Capture the coffee when importing an xPod

**Files:**
- Modify: `library/XBloomRecipe.ts` (the pod branch, around lines 248-300)
- Test: `library/__tests__/xbloomPodCoffee.test.ts`

Read `library/XBloomRecipe.ts:248-300` first. It builds the pod request with `adaptedModel: 1` and currently reads only `subtitle` and `imagePath` off `podsVo`.

- [ ] **Step 1: Write the failing test**

```ts
// library/__tests__/xbloomPodCoffee.test.ts
import {applyPodCoffee} from "@/library/XBloomRecipe";
import Recipe from "@/library/Recipe";

describe("applyPodCoffee", () => {
    it("attaches the coffee a pod response named", () => {
        const recipe = new Recipe();
        applyPodCoffee(recipe, {
            theName: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural"
        });
        expect(recipe.coffee).toEqual({
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural"
        });
    });

    it("leaves the recipe alone when the response carries no usable coffee", () => {
        const recipe = new Recipe();
        applyPodCoffee(recipe, {subtitle: ""});
        expect(recipe.coffee).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/xbloomPodCoffee.test.ts`
Expected: FAIL, `applyPodCoffee is not exported`.

- [ ] **Step 3: Add the exported helper and call it from the pod branch**

Add near the other exports in `library/XBloomRecipe.ts`:

```ts
import {podCoffeeFrom} from "@/library/podCoffee";

/**
 * Attach the pod's coffee to the recipe it brewed, if it named one.
 *
 * Exported so it can be tested without a network call, and so the one place
 * that reads `podsVo` for coffee is not buried inside a fetch.
 */
export function applyPodCoffee(recipe: Recipe, podsVo: unknown): void {
    const coffee = podCoffeeFrom(podsVo);
    if (coffee !== null) recipe.coffee = coffee;
}
```

In the pod branch, immediately after the existing `podsVo` reads for `subtitle` and `imagePath`, add:

```ts
        applyPodCoffee(recipe, podsVo);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/xbloomPodCoffee.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add library/XBloomRecipe.ts library/__tests__/xbloomPodCoffee.test.ts
git commit -m "Keep the coffee a pod import already told us about"
```

## Task 4: Widen `BrewRecord`

**Files:**
- Modify: `library/brew/BrewRecord.ts`
- Test: `library/brew/__tests__/BrewRecord.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/BrewRecord.test.ts`:

```ts
import {grinderRan, type BrewRecord} from "@/library/brew/BrewRecord";

describe("grinderRan", () => {
    const base = {grinderUsed: undefined, grindSize: undefined} as Partial<BrewRecord>;

    it("is false when the recipe said the grinder was off", () => {
        expect(grinderRan({...base, grinderUsed: false, grindSize: 62} as BrewRecord))
            .toBe(false);
    });

    it("is false at the 81 sentinel even when the boolean disagrees", () => {
        // The two are the same fact read from two places (spec §3.1). When
        // they disagree the cautious reading wins, because claiming a mill
        // that did not run creates a row in somebody's list forever.
        expect(grinderRan({...base, grinderUsed: true, grindSize: 81} as BrewRecord))
            .toBe(false);
    });

    it("is true when both agree the grinder ran", () => {
        expect(grinderRan({...base, grinderUsed: true, grindSize: 62} as BrewRecord))
            .toBe(true);
    });

    it("is false on an old row that records neither", () => {
        expect(grinderRan({} as BrewRecord)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/brew/__tests__/BrewRecord.test.ts`
Expected: FAIL, `grinderRan is not exported`.

- [ ] **Step 3: Add the fields and the helper**

Add the import at the top of `library/brew/BrewRecord.ts`:

```ts
import type {PodCoffee} from "@/library/podCoffee";
```

Add to the `BrewRecord` type, after `bypass`:

```ts
    /**
     * What the recipe asked for, copied at brew time.
     *
     * All optional, so every row written before this reads exactly as it did
     * — the convention `pouringAt`, `plan`, `stageWater`, `stalls` and
     * `bypass` already follow.
     *
     * Copied rather than joined for the reason `recipeName` and `plan` are,
     * which matters more here than elsewhere: a brew exported last month and
     * re-exported today must produce the same numbers (spec §3).
     */
    dose?: number;
    /** The recipe's ratio. Without it a consumer cannot derive extraction yield. */
    ratio?: number;
    /** 40-80, or 81 for a grinder that was off. */
    grindSize?: number;
    grinderRpm?: number;
    /** `recipe.grinder`. Whether the xBloom ground the coffee itself. */
    grinderUsed?: boolean;
    /** The pod's coffee, when the recipe came from an xPod import (spec §2.1.1). */
    coffee?: PodCoffee;
```

Add the helper at the end of the file:

```ts
/** The grind size that means the grinder was switched off. */
export const GRINDER_OFF_SIZE = 81;

/**
 * Whether the xBloom ground this brew's coffee.
 *
 * Two independent records of one fact: the boolean the recipe carried, and
 * the 81 sentinel in the grind size. They should never disagree, and if they
 * do the cautious reading wins — a mill claimed in error becomes a row in
 * somebody's list that they did not ask for and will not know to clean up
 * (spec §3.1).
 */
export function grinderRan(record: BrewRecord): boolean {
    if (record.grinderUsed !== true) return false;
    return record.grindSize !== undefined && record.grindSize !== GRINDER_OFF_SIZE;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/brew/__tests__/BrewRecord.test.ts`
Expected: PASS, including the 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/BrewRecord.ts library/brew/__tests__/BrewRecord.test.ts
git commit -m "A brew record remembers its dose, ratio and grind"
```

## Task 5: Persist the six fields

**Files:**
- Modify: `library/BrewDatabase.ts`
- Test: `library/brew/__tests__/brewDatabaseWidening.test.ts`

Read `library/BrewDatabase.ts` first: the `CREATE TABLE` at line 57, the migrations at lines 89-110, the `INSERT` at line 128, and the row-to-record reader. Follow the existing migration shape exactly — `ALTER TABLE brews ADD COLUMN … NOT NULL DEFAULT …`, guarded the way the others are.

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/__tests__/brewDatabaseWidening.test.ts
import {brewRowToRecord, recordToBrewRow} from "@/library/BrewDatabase";
import type {BrewRecord} from "@/library/brew/BrewRecord";

const base = {
    id: "b1", recipeUuid: "r1", recipeName: "Gummy Worms", accent: "#c8752f",
    startedAt: 1, endedAt: 2, outcome: "done", failure: null, pours: 3,
    waterTotal: 240, cupTotal: 204, heldSeconds: 34
} as BrewRecord;

describe("the widened columns", () => {
    it("round-trips the six fields", () => {
        const record: BrewRecord = {
            ...base, dose: 15, ratio: 16, grindSize: 62, grinderRpm: 6400,
            grinderUsed: true, coffee: {name: "Kenya Sakami"}
        };
        const back = brewRowToRecord(recordToBrewRow(record));
        expect(back.dose).toBe(15);
        expect(back.ratio).toBe(16);
        expect(back.grindSize).toBe(62);
        expect(back.grinderRpm).toBe(6400);
        expect(back.grinderUsed).toBe(true);
        expect(back.coffee).toEqual({name: "Kenya Sakami"});
    });

    it("reads a row written before the columns existed as absent, not zero", () => {
        // A dose of 0 and an unknown dose are different claims. Zero would
        // make BC compute a ratio of 0 and an infinite extraction yield.
        const old = {...recordToBrewRow(base), dose: 0, ratio: 0, grindSize: 0,
            grinderRpm: 0, grinderUsed: 0, coffee: ""};
        const back = brewRowToRecord(old);
        expect(back.dose).toBeUndefined();
        expect(back.ratio).toBeUndefined();
        expect(back.grindSize).toBeUndefined();
        expect(back.grinderRpm).toBeUndefined();
        expect(back.grinderUsed).toBeUndefined();
        expect(back.coffee).toBeUndefined();
    });

    it("survives a coffee column holding something that is not JSON", () => {
        const row = {...recordToBrewRow(base), coffee: "not json {"};
        expect(brewRowToRecord(row).coffee).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/brew/__tests__/brewDatabaseWidening.test.ts`
Expected: FAIL, `brewRowToRecord is not exported`.

- [ ] **Step 3: Extract and widen the row mapping**

If `BrewDatabase.ts` currently maps rows inline, extract the two directions into exported pure functions named `brewRowToRecord` and `recordToBrewRow` first, leaving behaviour identical, so they can be tested without a database. Then widen them.

Add to the `BrewRow` type:

```ts
    /** 0 on rows written before the column, which reads as "not recorded". */
    dose: number;
    ratio: number;
    grindSize: number;
    grinderRpm: number;
    /** 0 or 1; 0 on rows written before the column. */
    grinderUsed: number;
    /** JSON, or `''` on rows written before the column. */
    coffee: string;
```

Add the migration beside the `stageWater` one (near line 110), in the same guarded style the file already uses:

```ts
            // #109, widened. Zero is the "not recorded" value for all five
            // numbers: a dose of 0 is not a real dose, so there is no live
            // value the sentinel could collide with.
            this.db.execSync("ALTER TABLE brews ADD COLUMN dose REAL NOT NULL DEFAULT 0;");
            this.db.execSync("ALTER TABLE brews ADD COLUMN ratio REAL NOT NULL DEFAULT 0;");
            this.db.execSync("ALTER TABLE brews ADD COLUMN grindSize INTEGER NOT NULL DEFAULT 0;");
            this.db.execSync("ALTER TABLE brews ADD COLUMN grinderRpm INTEGER NOT NULL DEFAULT 0;");
            this.db.execSync("ALTER TABLE brews ADD COLUMN grinderUsed INTEGER NOT NULL DEFAULT 0;");
            this.db.execSync("ALTER TABLE brews ADD COLUMN coffee TEXT NOT NULL DEFAULT '';");
```

Add the same six columns to the `CREATE TABLE` at line 57 with identical defaults, and to the `INSERT` at line 128 with their bindings.

In `recordToBrewRow`:

```ts
        dose:        record.dose        ?? 0,
        ratio:       record.ratio       ?? 0,
        grindSize:   record.grindSize   ?? 0,
        grinderRpm:  record.grinderRpm  ?? 0,
        grinderUsed: record.grinderUsed === true ? 1 : 0,
        coffee:      record.coffee === undefined ? "" : JSON.stringify(record.coffee),
```

In `brewRowToRecord`:

```ts
    // Zero means the column predates this brew, not that the dose was zero.
    if (row.dose       > 0) record.dose       = row.dose;
    if (row.ratio      > 0) record.ratio      = row.ratio;
    if (row.grindSize  > 0) record.grindSize  = row.grindSize;
    if (row.grinderRpm > 0) record.grinderRpm = row.grinderRpm;
    // Only meaningful alongside a grind size; on its own it cannot be told
    // from the column's default.
    if (row.grindSize  > 0) record.grinderUsed = row.grinderUsed === 1;
    if (row.coffee !== "") {
        // The column can hold whatever an older version or a restored backup
        // wrote. A half-understood coffee is worse than none.
        try {
            const parsed = podCoffeeFrom({...JSON.parse(row.coffee),
                theName: JSON.parse(row.coffee)?.name});
            if (parsed !== null) record.coffee = parsed;
        } catch {
            // Leave it absent.
        }
    }
```

Add the import: `import {podCoffeeFrom} from "@/library/podCoffee";`

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/brew/__tests__/brewDatabaseWidening.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the whole brew suite for regressions**

Run: `npx jest library/brew hooks/__tests__`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add library/BrewDatabase.ts library/brew/__tests__/brewDatabaseWidening.test.ts
git commit -m "Persist dose, ratio, grind and coffee on a brew"
```

## Task 6: `BrewRecorder` snapshots them

**Files:**
- Modify: `library/brew/BrewRecorder.ts` (the record construction, around lines 360-385)
- Test: `library/brew/__tests__/BrewRecorder.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/BrewRecorder.test.ts`, following the harness the existing tests in that file already use to drive a recorder to its terminal phase:

```ts
describe("the widened fields", () => {
    it("copies dose, ratio, grind and grinder off the recipe", async () => {
        const recipe = makeRecipe();          // the file's existing helper
        recipe.dosage = 15;
        recipe.ratio = 16;
        recipe.grindSize = 62;
        recipe.grindRPM = 6400;
        recipe.grinder = true;
        recipe.coffee = {name: "Kenya Sakami"};

        const record = await runToRecord(recipe);   // the file's existing helper

        expect(record.dose).toBe(15);
        expect(record.ratio).toBe(16);
        expect(record.grindSize).toBe(62);
        expect(record.grinderRpm).toBe(6400);
        expect(record.grinderUsed).toBe(true);
        expect(record.coffee).toEqual({name: "Kenya Sakami"});
    });

    it("records the grinder as off without inventing a grind size", async () => {
        const recipe = makeRecipe();
        recipe.grinder = false;
        recipe.grindSize = 81;

        const record = await runToRecord(recipe);

        expect(record.grinderUsed).toBe(false);
        expect(record.grindSize).toBe(81);
    });

    it("carries no coffee for a recipe that never had a pod", async () => {
        const record = await runToRecord(makeRecipe());
        expect(record.coffee).toBeUndefined();
    });
});
```

If `makeRecipe` and `runToRecord` do not exist in that file under those names, use whatever equivalents it already has and keep the assertions identical.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts`
Expected: FAIL, `record.dose` is `undefined`.

- [ ] **Step 3: Populate them**

In the record construction in `library/brew/BrewRecorder.ts`, beside `stageWater` (near line 380):

```ts
            dose:        recipe.dosage,
            ratio:       recipe.ratio,
            grindSize:   recipe.grindSize,
            grinderRpm:  recipe.grindRPM,
            grinderUsed: recipe.grinder,
            // Copied, not joined: re-pointing the recipe at another pod must
            // not rewrite what last month's brew says it was made with.
            ...(recipe.coffee === undefined ? {} : {coffee: {...recipe.coffee}}),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/brew/__tests__/BrewRecorder.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the whole suite and the types**

Run: `npm run typecheck && npm run lint && npx jest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add library/brew/BrewRecorder.ts library/brew/__tests__/BrewRecorder.test.ts
git commit -m "Snapshot the recipe's dose and grind onto each brew"
```

**Phase A is complete and independently useful.** #103 and #98 are unblocked: two brews of one recipe can now be compared knowing whether the dose or the grind moved.

---

# Phase B: the note

Spec §5.1. A plain-text stage summary that survives in any consumer, including one that never learns what a stage is. This is the floor under the whole feature: if everything else about the integration is refused, the note still lands in a notes field and is still readable.

## Task 7: `brewNote`

**Files:**
- Create: `library/brew/brewNote.ts`
- Test: `library/brew/__tests__/brewNote.test.ts`

The exact format is pinned by the test, because it is the part a human reads and the part that will be quoted in the upstream discussion.

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/__tests__/brewNote.test.ts
import {brewNote} from "@/library/brew/brewNote";
import type {StoredBrew} from "@/library/BrewDatabase";

const brew = {
    id: "b1", recipeUuid: "r1", recipeName: "Gummy Worms", accent: "#c8752f",
    startedAt: 0, endedAt: 214_000, outcome: "done", failure: null,
    pours: 3, waterTotal: 240, cupTotal: 204, heldSeconds: 34, hasStream: true,
    dose: 15, ratio: 16, grindSize: 62, grinderRpm: 6400, grinderUsed: true,
    plan: [
        {volume: 40,  temperature: 94, pattern: 1, agitation: 1, pause: 30, flowRate: 3},
        {volume: 100, temperature: 92, pattern: 2, agitation: 0, pause: 20, flowRate: 4},
        {volume: 100, temperature: 90, pattern: 0, agitation: 2, pause: 0,  flowRate: 4}
    ],
    stageWater: [40, 100, 100]
} as unknown as StoredBrew;

describe("brewNote", () => {
    it("writes a stage per line with the descriptors aligned", () => {
        expect(brewNote(brew)).toBe(
`Stage 1   40 ml   94\u00b0C   spiral, agitate before, then wait 30 s
Stage 2  100 ml   92\u00b0C   circular, then wait 20 s
Stage 3  100 ml   90\u00b0C   centred, agitate after

15 g \u00b7 1:16 \u00b7 grind 62 \u00b7 3 stages \u00b7 xBloom`
        );
    });

    it("omits the mill from the footer when the grinder was off", () => {
        const note = brewNote({...brew, grinderUsed: false, grindSize: 81});
        expect(note).not.toContain("grind");
        expect(note.split("\n").at(-1)).toBe("15 g \u00b7 1:16 \u00b7 3 stages \u00b7 xBloom");
    });

    it("wraps a long descriptor to the descriptor column", () => {
        const long = {...brew, plan: [{volume: 40, temperature: 94, pattern: 2,
            agitation: 3, pause: 45, flowRate: 3}], stageWater: [40], pours: 1};
        const [first, second] = brewNote(long).split("\n");
        expect(first).toBe("Stage 1   40 ml   94\u00b0C   spiral, agitate before and after,");
        expect(second).toBe(" ".repeat(25) + "then wait 45 s");
    });

    it("reads the agitation flags off the raw byte, not the booleans", () => {
        // Pour.agitation is initialised to -1 and every bit of -1 is set, so
        // masking an unset field returns true incorrectly.
        const unset = {...brew, plan: [{volume: 40, temperature: 94, pattern: 0,
            agitation: -1, pause: 0, flowRate: 3}], stageWater: [40], pours: 1};
        expect(brewNote(unset).split("\n")[0]).toBe("Stage 1   40 ml   94\u00b0C   centred");
    });

    it("says nothing about a plan it does not have", () => {
        const bare = {...brew, plan: undefined, stageWater: undefined};
        expect(brewNote(bare as StoredBrew))
            .toBe("15 g \u00b7 1:16 \u00b7 grind 62 \u00b7 3 stages \u00b7 xBloom");
    });

    it("uses no dashes anywhere", () => {
        // docs/copy.md. An em dash reads as machine-written copy, and this
        // string lands in someone else's app under our name.
        expect(brewNote(brew)).not.toMatch(/[-\u2013\u2014]/);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/brew/__tests__/brewNote.test.ts`
Expected: FAIL, `Cannot find module '@/library/brew/brewNote'`.

- [ ] **Step 3: Write the implementation**

```ts
// library/brew/brewNote.ts
import {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {grinderRan, type BrewRecord} from "@/library/brew/BrewRecord";
import {DEVICE_NAME} from "@/library/brew/handoff/device";

/**
 * A brew written out for a human.
 *
 * This is the floor under the whole export (spec §5.1). Every consumer has
 * somewhere to put text, so a stage ladder written in prose survives even a
 * consumer that has no concept of a stage. Everything structured we send is
 * an improvement on this; nothing replaces it.
 *
 * The column arithmetic is fixed so the descriptors line up under each other
 * in a monospaced view and read as a ladder rather than a paragraph.
 */

/** `Stage N` + volume(5) + ` ml` + temp(5) + `\u00b0C` + three spaces. */
const DESCRIPTOR_COLUMN = 25;
const WRAP_WIDTH = 72;

const PATTERN_WORD: Record<number, string> = {
    [POUR_PATTERN.CENTERED]: "centred",
    [POUR_PATTERN.CIRCULAR]: "circular",
    [POUR_PATTERN.SPIRAL]:   "spiral"
};

function agitationWord(raw: number): string | null {
    // -1 is Pour's "never set". Masking it would report both flags on.
    const agitation = raw < 0 ? AGITATION.ALL_OFF : raw;
    switch (agitation) {
        case AGITATION.BEFORE_ON_AFTER_OFF: return "agitate before";
        case AGITATION.BEFORE_OFF_AFTER_ON: return "agitate after";
        case AGITATION.BEFORE_ON_AFTER_ON:  return "agitate before and after";
        default: return null;
    }
}

function descriptor(stage: {pattern: number; agitation: number; pause: number}): string {
    const parts = [PATTERN_WORD[stage.pattern] ?? "pour"];
    const agitation = agitationWord(stage.agitation);
    if (agitation !== null) parts.push(agitation);
    if (stage.pause > 0) parts.push(`then wait ${stage.pause} s`);
    return parts.join(", ");
}

/** Wrap at word boundaries, indenting continuations to the descriptor column. */
function wrapped(head: string, body: string): string[] {
    const lines: string[] = [];
    let line = head;
    for (const word of body.split(" ")) {
        const candidate = line === head ? `${line}${word}` : `${line} ${word}`;
        if (candidate.length > WRAP_WIDTH && line !== head) {
            lines.push(line);
            line = " ".repeat(DESCRIPTOR_COLUMN) + word;
        } else {
            line = candidate;
        }
    }
    lines.push(line);
    return lines;
}

function footer(record: BrewRecord): string {
    const parts: string[] = [];
    if (record.dose !== undefined) parts.push(`${record.dose} g`);
    if (record.ratio !== undefined) parts.push(`1:${record.ratio}`);
    // Omitted rather than guessed: a grind number from a mill that did not
    // run is a claim about equipment the brew never touched (spec §3.1).
    if (grinderRan(record)) parts.push(`grind ${record.grindSize}`);
    parts.push(`${record.pours} stage${record.pours === 1 ? "" : "s"}`);
    parts.push(DEVICE_NAME);
    return parts.join(" \u00b7 ");
}

export function brewNote(record: BrewRecord): string {
    const plan = record.plan ?? [];
    const stages = plan.flatMap((stage, index) => {
        const head =
            `Stage ${index + 1}`
            + String(stage.volume).padStart(5)
            + " ml"
            + String(stage.temperature).padStart(5)
            + "\u00b0C"
            + "   ";
        return wrapped(head, descriptor(stage));
    });
    return stages.length === 0
        ? footer(record)
        : `${stages.join("\n")}\n\n${footer(record)}`;
}
```

Also create the constant the note and the envelope share:

```ts
// library/brew/handoff/device.ts

/**
 * What we call the machine, everywhere.
 *
 * Deliberately under-claimed. We cannot yet tell a Studio from an original
 * (#138 would read the BLE Device Information Service, characteristic
 * 0x180A, Model Number String), and Beanconqueror creates a mill on a name
 * miss rather than refusing: a name we guess wrong becomes a duplicate row
 * in somebody's equipment list that they did not ask for and cannot easily
 * merge away. One constant, so it is one edit when we can tell (spec §3.1).
 */
export const DEVICE_NAME = "xBloom";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/brew/__tests__/brewNote.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/brewNote.ts library/brew/handoff/device.ts library/brew/__tests__/brewNote.test.ts
git commit -m "Write a brew out as a stage ladder a human can read"
```

---

# Phase C: the wire format

Spec §4.1, §4.2, §6.1. Two files with one job each: one knows what a brew is and nothing about compression; the other knows about compression and nothing about brews.

## Task 8: Add `fflate`

**Files:**
- Modify: `package.json`

React Native has no `zlib` and no `CompressionStream`. `fflate` is the smallest well-maintained option and has no native component, so it needs no prebuild.

- [ ] **Step 1: Install**

```bash
npx expo install fflate
```

If npm 12 refuses with `EALLOWSCRIPTS`, run `npx expo-doctor`, read off the expected version, and write it into `package.json` by hand (see `.github/copilot-instructions.md`).

- [ ] **Step 2: Verify it resolves under jest and under Metro**

Run: `npm run typecheck && npx expo-doctor`
Expected: PASS. If jest reports an untranspiled-ESM failure when Task 10 runs, add `fflate` to `extraEsmPackages` in `jest.config.js`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add fflate, the only gzip React Native does not have"
```

## Task 9: The envelope

**Files:**
- Create: `library/brew/handoff/envelope.ts`
- Test: `library/brew/handoff/__tests__/envelope.test.ts`

The shape is spec §4.2 and that shape is authoritative. The earlier proof-of-concept used an ad-hoc object because it was measuring the transport, not the schema; do not copy it.

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/handoff/__tests__/envelope.test.ts
import {buildEnvelope} from "@/library/brew/handoff/envelope";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {BrewSample} from "@/library/brew/BrewRecord";

const brew = {
    id: "b1", recipeUuid: "r1", recipeName: "Gummy Worms", accent: "#c8752f",
    startedAt: 1_726_000_000_000, endedAt: 1_726_000_214_000,
    outcome: "done", failure: null, pours: 2, waterTotal: 240, cupTotal: 204,
    heldSeconds: 34, hasStream: true, dose: 15, ratio: 16, grindSize: 62,
    grinderRpm: 6400, grinderUsed: true,
    plan: [
        {volume: 40,  temperature: 94, pattern: 1, agitation: 1, pause: 30, flowRate: 3},
        {volume: 200, temperature: 92, pattern: 2, agitation: 0, pause: 0,  flowRate: 4}
    ],
    stageWater: [40, 200]
} as unknown as StoredBrew;

const samples: BrewSample[] = [
    {at: 0,     water: 0,  cup: 0,  pour: 0},
    {at: 1_000, water: 4,  cup: 0,  pour: 0},
    {at: 2_000, water: 9,  cup: 0,  pour: 0},
    {at: 3_000, water: 14, cup: 2,  pour: 0},
    {at: 4_000, water: 20, cup: 6,  pour: 0}
];

describe("buildEnvelope", () => {
    it("carries the brew's figures with their units named", () => {
        const envelope = buildEnvelope(brew, samples);
        expect(envelope.v).toBe(1);
        expect(envelope.brew.dose).toEqual({value: 15, unit: "g"});
        expect(envelope.brew.water).toEqual({value: 240, unit: "ml"});
        expect(envelope.brew.beverage).toEqual({value: 204, unit: "ml"});
        expect(envelope.brew.duration).toEqual({value: 214, unit: "s"});
    });

    it("derives first drip from the first sample the cup registered", () => {
        // The cup scale reads 0 until liquid reaches it, so the first
        // non-zero cup reading is the drawdown starting (spec §4.5.1).
        expect(buildEnvelope(brew, samples).brew.firstDripTime)
            .toEqual({value: 3, unit: "s"});
    });

    it("omits first drip rather than reporting 0 when the cup never moved", () => {
        const dry = samples.map(s => ({...s, cup: 0}));
        expect(buildEnvelope(brew, dry).brew.firstDripTime).toBeUndefined();
    });

    it("sends the temperature plan as a metric, not as a reading", () => {
        // The xBloom controls water temperature to a setpoint and hits it;
        // it is the truest number in the payload, and it is the one thing a
        // consumer can draw on its own chart (spec §4.5).
        const {metrics} = buildEnvelope(brew, samples);
        const temperature = metrics.find(m => m.key === "targetTemperature");
        expect(temperature).toMatchObject({unit: "\u00b0C", kind: "setpoint"});
        expect(temperature!.samples.length).toBeGreaterThan(0);
    });

    it("names itself and where it came from", () => {
        const {imported} = buildEnvelope(brew, samples);
        expect(imported.source).toBe("xbrw");
        expect(imported.device).toBe("xBloom");
        expect(imported.sourceUrl.startsWith("https://")).toBe(true);
    });

    it("carries the pod's coffee only when there was one", () => {
        expect(buildEnvelope(brew, samples).bean).toBeUndefined();
        const withPod = {...brew, coffee: {name: "Kenya Sakami", process: "Natural"}};
        expect(buildEnvelope(withPod as StoredBrew, samples).bean)
            .toEqual({name: "Kenya Sakami", process: "Natural"});
    });

    it("names no mill when the grinder did not run", () => {
        const handGround = {...brew, grinderUsed: false, grindSize: 81};
        const {brew: b} = buildEnvelope(handGround as StoredBrew, samples);
        expect(b.mill).toBeUndefined();
        expect(b.grindSize).toBeUndefined();
    });

    it("carries the note", () => {
        expect(buildEnvelope(brew, samples).brew.note).toContain("Stage 1");
    });

    it("carries a record whose stream was swept, without a flow block", () => {
        const swept = {...brew, hasStream: false};
        const envelope = buildEnvelope(swept as StoredBrew, []);
        expect(envelope.flow).toBeUndefined();
        expect(envelope.brew.water).toEqual({value: 240, unit: "ml"});
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/brew/handoff/__tests__/envelope.test.ts`
Expected: FAIL, `Cannot find module '@/library/brew/handoff/envelope'`.

- [ ] **Step 3: Write the implementation**

Follow spec §4.2 for the exact field list. The shape, in brief:

```ts
export type Quantity = {value: number; unit: string};

export type HandoffEnvelope = {
    v: 1;
    app: {name: string; version: string};
    brew: {
        date: string;              // ISO 8601
        dose?: Quantity;
        water?: Quantity;
        beverage?: Quantity;
        duration?: Quantity;
        firstDripTime?: Quantity;
        temperature?: Quantity;
        grindSize?: string;
        mill?: string;
        method?: string;
        note?: string;
    };
    bean?: PodCoffee;
    flow?: {
        fidelity: "full" | "reduced";
        t: number[];               // seconds, delta-encoded
        waterDispensed: number[];
        weight: number[];
    };
    metrics: {key: string; label: string; unit: string; kind: string;
              samples: [number, number][]}[];
    imported: {source: string; sourceName: string; sourceUrl: string;
               device: string; schema: string; params?: Record<string, string>};
};
```

Rules to hold to:

- **Units travel with values.** A bare `240` is a number whose meaning depends on agreeing about it out of band; `{value: 240, unit: "ml"}` does not (spec §4.2).
- **`firstDripTime`** is `samples.find(s => s.cup > 0)?.at`, in seconds from `startedAt`, and absent when nothing ever reached the cup.
- **`temperature`** on the brew is the plan's first stage; the full profile goes in `metrics` as `targetTemperature`, `kind: "setpoint"`, with a sample at the start and end of each stage so a consumer draws a staircase rather than a slope. Use `stageSpans` from `library/brew/brewShape.ts` for the boundaries; it is the file that already owns this arithmetic and the drawn chart must agree with it.
- **`mill` and `grindSize`** are both absent unless `grinderRan(record)`.
- **`method`** is `DEVICE_NAME`.
- **`flow`** is absent when `hasStream` is false or there are no samples: a record whose stream was swept still has its figures and must still export.
- **`note`** is `brewNote(record)`.
- **`imported.sourceUrl`** is the repository URL, a fixed `https:` constant. Nothing user-supplied goes in it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/brew/handoff/__tests__/envelope.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/handoff/envelope.ts library/brew/handoff/__tests__/envelope.test.ts
git commit -m "Describe a brew in a form another app could read"
```

## Task 10: The codec

**Files:**
- Create: `library/brew/handoff/encode.ts`
- Test: `library/brew/handoff/__tests__/encode.test.ts`

Knows nothing about brews. Object in, chunked URL out.

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/handoff/__tests__/encode.test.ts
import {encodeHandoff, MAX_URL_CHARS} from "@/library/brew/handoff/encode";
import {gunzipSync} from "fflate";

/**
 * An independent reader, written against Beanconqueror's parameter list
 * rather than against our encoder.
 *
 * The same discipline as `library/__tests__/cardFixtures.ts`: a round trip
 * through one implementation proves nothing, and the far end of this one is
 * somebody else's app.
 */
function decode(url: string): unknown {
    const params = new URL(url).searchParams;
    const indices = [...params.keys()]
        .filter(k => /^shareBrew\d+$/.test(k))
        .map(k => Number(k.slice("shareBrew".length)))
        .sort((a, b) => a - b);
    const joined = indices.map(i => params.get(`shareBrew${i}`)).join("");
    expect(joined.length).toBe(Number(params.get("len")));
    const b64 = joined.replace(/-/g, "+").replace(/_/g, "/")
        .padEnd(Math.ceil(joined.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
}

const payload = (samples: number) => ({
    v: 1, app: {name: "XBRW++", version: "1.6.0"},
    brew: {date: "2026-09-20T10:00:00.000Z", note: "Stage 1"},
    metrics: [], imported: {source: "xbrw", sourceName: "XBRW++",
        sourceUrl: "https://github.com/hessius/XBRecipeWriterPlus",
        device: "xBloom", schema: "brew-handoff/1"},
    flow: {
        fidelity: "full",
        t: Array.from({length: samples}, () => 1),
        waterDispensed: Array.from({length: samples}, (_, i) => i % 7),
        weight: Array.from({length: samples}, (_, i) => i % 5)
    }
});

describe("encodeHandoff", () => {
    it("round-trips through an independent reader", () => {
        const {url} = encodeHandoff(payload(2400));
        expect(decode(url)).toEqual(payload(2400));
    });

    it("uses only url-safe characters, so nothing needs re-escaping", () => {
        // BC's bean share carries a replace(/ /g, '+') workaround for
        // Android turning + into a space. base64url has neither + nor /,
        // so the class of bug cannot arise (spec §7.3).
        const {url} = encodeHandoff(payload(2400));
        const params = new URL(url).searchParams;
        for (const [key, value] of params) {
            if (key.startsWith("shareBrew")) expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
        }
    });

    it("declares the length, so a short chunk is detectable", () => {
        // A chunk count tells you a chunk is missing; a length tells you a
        // chunk is short. The proof of concept needed exactly this to tell
        // a truncating tool from a broken codec (spec §7.2).
        const {url} = encodeHandoff(payload(2400));
        const params = new URL(url).searchParams;
        const joined = [...params].filter(([k]) => k.startsWith("shareBrew"))
            .map(([, v]) => v).join("");
        expect(Number(params.get("len"))).toBe(joined.length);
    });

    it("chunks at 400 characters, matching the bean share", () => {
        const params = new URL(encodeHandoff(payload(2400)).url).searchParams;
        const chunks = [...params].filter(([k]) => k.startsWith("shareBrew"));
        for (const [, value] of chunks.slice(0, -1)) expect(value.length).toBe(400);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it("reports a realistic brew as full fidelity and comfortably inside budget", () => {
        const {url, fidelity} = encodeHandoff(payload(2400));
        expect(fidelity).toBe("full");
        expect(url.length).toBeLessThan(MAX_URL_CHARS / 4);
    });

    it("thins the trace rather than failing when a brew is enormous", () => {
        const {url, fidelity} = encodeHandoff(payload(400_000));
        expect(url.length).toBeLessThanOrEqual(MAX_URL_CHARS);
        expect(fidelity).toBe("reduced");
        const decoded = decode(url) as {flow: {t: number[]}};
        expect(decoded.flow.t.length).toBeLessThan(400_000);
    });

    it("drops the trace before it drops the brew", () => {
        // The figures and the note are the thing; the trace is the bonus.
        const huge = {...payload(4_000_000), brew: {date: "2026-09-20T10:00:00.000Z",
            note: "Stage 1"}};
        const {url, fidelity} = encodeHandoff(huge);
        expect(url.length).toBeLessThanOrEqual(MAX_URL_CHARS);
        expect(fidelity).toBe("none");
        const decoded = decode(url) as {flow?: unknown; brew: {note: string}};
        expect(decoded.flow).toBeUndefined();
        expect(decoded.brew.note).toBe("Stage 1");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/brew/handoff/__tests__/encode.test.ts`
Expected: FAIL, `Cannot find module '@/library/brew/handoff/encode'`.

- [ ] **Step 3: Write the implementation**

```ts
// library/brew/handoff/encode.ts
import {gzipSync} from "fflate";

/**
 * The budget.
 *
 * Measured, not assumed: a 97,120-character URL across 235 parameters
 * arrived byte-exact on iOS 18.3 when opened as a link, and a realistic
 * brew encodes to about 4,100 characters (spec §7.1). 32,768 leaves roughly
 * 8x headroom over the real payload while staying far below anything
 * observed to fail, and Android is not yet measured (spec §7.4).
 */
export const MAX_URL_CHARS = 32_768;

/** Matches Beanconqueror's existing bean share, so nothing new is asked of it. */
const CHUNK_SIZE = 400;
const PARAM_PREFIX = "shareBrew";
```

The encode path:

1. **Columnar delta.** The `flow` arrays are already columnar; delta-encode each in place before serialising. Adjacent readings differ by small integers and gzip compresses a run of small integers far better than a run of large ones. Keep it in the same file as the gzip, because the two only make sense together.
2. **`JSON.stringify` → `TextEncoder` → `gzipSync`.** gzip, not brotli: `@zip.js/zip.js` is already a Beanconqueror dependency and `DecompressionStream('gzip')` is native to WebKit since iOS 16.4, so gzip costs the far end no new dependency. Brotli was 2,551 bytes against gzip's 2,960, and 545 base64 characters does not justify a wasm decoder in somebody else's tree (spec §7.3, §8).
3. **base64url**, no padding. `+` and `/` are the two characters that make a base64 payload fragile in a query string; not emitting them removes the problem rather than working around it.
4. **Chunk into `shareBrew0..N`**, add `len` with the total character count.
5. **Degrade if over budget**, in this order, reporting the outcome as `fidelity`:
   - `full`: everything.
   - `reduced`: thin the flow arrays by taking every *n*th sample until it fits.
   - `none`: drop `flow` entirely. The figures, the note and the temperature metric are what the export is for; the trace is what makes it good.

Return `{url, fidelity, chars}`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/brew/handoff/__tests__/encode.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/handoff/encode.ts library/brew/handoff/__tests__/encode.test.ts
git commit -m "Pack a handoff into a URL that survives the trip"
```

---

# Phase D: the action

Spec §5.2, §5.3. One hook, one button, one gate.

## Task 11: `useBrewHandoff`

**Files:**
- Create: `hooks/useBrewHandoff.ts`
- Test: `hooks/__tests__/useBrewHandoff.test.ts`

Model it on `hooks/useBrewExport.ts`: a ref guard set synchronously before the first `await`, a `busy` state, and a silent catch.

- [ ] **Step 1: Write the failing test**

```ts
// hooks/__tests__/useBrewHandoff.test.ts
import {act, renderHook, waitFor} from "@testing-library/react-native";
import {Linking} from "react-native";
import {useBrewHandoff} from "@/hooks/useBrewHandoff";

// renderHook is async in RNTL v14, like render and fireEvent. Without the
// await the destructured result is undefined.

describe("useBrewHandoff", () => {
    it("opens a beanconqueror URL carrying the brew", async () => {
        const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
        const {result} = await renderHook(() => useBrewHandoff());
        await act(async () => {await result.current.send(brew, samples);});
        expect(open).toHaveBeenCalledWith(expect.stringContaining("shareBrew0="));
    });

    it("cannot be fired twice by a double tap", async () => {
        // The guard is a ref set before the first await, not state: state
        // would not have re-rendered by the time the second tap lands.
        const open = jest.spyOn(Linking, "openURL")
            .mockImplementation(() => new Promise(r => setTimeout(() => r(true), 50)));
        const {result} = await renderHook(() => useBrewHandoff());
        await act(async () => {
            void result.current.send(brew, samples);
            void result.current.send(brew, samples);
        });
        await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    });

    it("says so when Beanconqueror is not installed", async () => {
        // No canUseURL pre-flight: on iOS it needs an LSApplicationQueriesSchemes
        // entry and answers no without one, which fails for a user who does
        // have the app. Attempting and handling the rejection is honest.
        jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
        const {result} = await renderHook(() => useBrewHandoff());
        await act(async () => {await result.current.send(brew, samples);});
        expect(notify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "warning"})
        );
    });

    it("clears busy after a failure, so the button is not stuck", async () => {
        jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
        const {result} = await renderHook(() => useBrewHandoff());
        await act(async () => {await result.current.send(brew, samples);});
        expect(result.current.busy).toBe(false);
    });
});
```

Mock `notify` from `@/components/XbrwToast` (note: not from `library/notify.ts`), and reuse a brew fixture from the Phase C tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest hooks/__tests__/useBrewHandoff.test.ts`
Expected: FAIL, `Cannot find module '@/hooks/useBrewHandoff'`.

- [ ] **Step 3: Write the implementation**

`send(record, samples)` builds the envelope, encodes it, and calls `Linking.openURL`. On rejection, `notify({tone: "warning", message: …})` naming Beanconqueror. No `canOpenURL` pre-flight. Copy carries no dashes (`docs/copy.md`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest hooks/__tests__/useBrewHandoff.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add hooks/useBrewHandoff.ts hooks/__tests__/useBrewHandoff.test.ts
git commit -m "Hand a brew to Beanconqueror"
```

## Task 12: The button

**Files:**
- Modify: `app/brewRecord.tsx`
- Create: `library/brew/handoff/targets.ts`
- Test: `components/__tests__/brewRecordHandoff.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("offers the handoff on a finished brew", async () => {
    await renderWithProviders(<BrewRecordScreen …/>);
    expect(await screen.findByLabelText("Send to Beanconqueror")).toBeTruthy();
});

it("does not offer it on a brew that failed", async () => {
    // There is nothing to log. Sending a failure would put a row in
    // someone's coffee diary for coffee they never drank.
    await renderWithProviders(<BrewRecordScreen …outcome="failed"/>);
    expect(screen.queryByLabelText("Send to Beanconqueror")).toBeNull();
});
```

RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`. Assert on text, test IDs and accessible labels, never on a child component's props.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/brewRecordHandoff.test.tsx`
Expected: FAIL, label not found.

- [ ] **Step 3: Write the implementation**

- Add `library/brew/handoff/targets.ts` with the target list and the gate constant, so turning the feature on is one edit and adding a second consumer later is a list entry rather than a new branch (spec §5.3).
- Place the action beside the existing export on the brew record screen.
- Shown only for `outcome === "done"`.
- Colour from `constants/colors.ts`; timings from `constants/motion.ts`. No hex literals.
- Reciprocal credit per spec §5.3: Beanconqueror named plainly, as we would want ours to be.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/brewRecordHandoff.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify everything**

Run: `npm run typecheck && npm run lint && npx jest && npx expo-doctor`
Expected: PASS on all four. CI requires all of them, and expo-doctor is a hard failure.

- [ ] **Step 6: Commit**

```bash
git add app/brewRecord.tsx library/brew/handoff/targets.ts components/__tests__/brewRecordHandoff.test.tsx
git commit -m "Offer the handoff from a finished brew"
```

**Pause here.** Phases A to D are complete, tested, and gated off. The gate opens when Phase E lands upstream.

---

# Phase E: the Beanconqueror fork

A different repository, a different licence, a different maintainer. Work on a proper fork of `graphefruit/Beanconqueror`; the spike at `/tmp/bcq` is the reference, not the branch to submit.

**Do not copy any Beanconqueror code into this repository.** It is GPL-3.0.

**Build recipe that works** (found the hard way, spec §7.3):

```bash
pnpm install                    # engines require pnpm >= 10.26, node >= 22
pnpm exec ng build              # configurations are only production and ci,
                                # and defaultConfiguration is unset: pass none
pnpm exec cap sync ios          # pnpm, not npx, which dies on EBADDEVENGINES
```

For a simulator build on Apple Silicon, remove `pod 'CapgoCapacitorLlm'` from `ios/App/Podfile` and re-run `pod install`. A pod writes `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`, forcing x86_64, and that plugin ships no x86_64 slice. The JS import still resolves from `node_modules`. **This is an upstream finding worth reporting on its own** and must not appear in the PR diff.

## Task 13: Harden the decoder

**Files:**
- Modify (on the fork): `src/services/intentHandler/brew-handoff.decoder.ts`
- Create: its spec file, following the repository's existing Jasmine/Karma convention

This is a trust boundary (spec §6.3). The payload is attacker-controlled: anyone can craft a link.

- [ ] **Step 1: Write the failing tests**

One test per rejection, each asserting a distinct reason rather than a generic failure:

- a missing chunk
- a chunk shorter than `len` declares
- a chunk carrying a character outside the base64url alphabet
- bytes that are not gzip
- gzip that inflates to something that is not JSON
- JSON that is not an object
- an unknown `v`
- a `sourceUrl` that is not `https:` (`javascript:`, `file:`, `data:`)
- a decompressed size past a cap, so a small URL cannot inflate to hundreds of megabytes
- a well-formed envelope with no `brew`

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Harden**

Start from the working spike, then:

- Cap the inflated size before parsing. A zip bomb is the one failure mode where rejecting late is materially worse than rejecting early.
- Prefer `DecompressionStream('gzip')`; fall back to `@zip.js/zip.js`, already a dependency, for iOS 16.0 to 16.3. Beanconqueror's deployment target is 16.0 and `DecompressionStream` arrived in WebKit at 16.4.
- Reject rather than coerce. A field that is not the shape we expect is a field we do not understand, and this one ends up in somebody's records.
- No `eval`, no dynamic key access from payload strings.

- [ ] **Step 4: Run them to verify they pass**

- [ ] **Step 5: Commit on the fork**

## Task 14: The intent branch

**Files:**
- Modify: `src/services/intentHandler/intent-handler.service.ts`
- Modify: `src/enums/supportedIntents.ts` (or wherever `SUPPORTED_INTENTS` lives)

- [ ] **Step 1: Add `ADD_BREW` to `SUPPORTED_INTENTS` and one `else if` to `handleDeepLink`**, matching the surrounding style exactly. Place it beside the bean share, which is its nearest sibling.

- [ ] **Step 2: Note for the PR description** that deep links are gated on `isBeanconqurorAppReady()`, which waits on `setAppReady(1)` after `__initApp()` and therefore after onboarding. A fresh install must be walked through once before any deep link is delivered. Worth saying out loud because it makes a handoff look broken on a new device.

- [ ] **Step 3: Commit on the fork**

## Task 15: The import service

**Files:**
- Create: `src/services/brewImport/brew-import.service.ts`
- Modify: `src/interfaces/brew/ICustomInformationBrew.ts` and its class

Envelope to `Brew` + `BrewFlow` + `customMetrics` / `customAxes`. Spec §4.5.

- [ ] **Step 1: Write the failing tests**

- a full envelope produces a `Brew` with dose, water, beverage, duration and first drip
- the flow trace reconstructs sample for sample from the delta encoding
- `targetTemperature` becomes a custom axis and draws
- a bean whose name matches an existing one is linked, not duplicated
- a bean that does not match is left unset with the name in the note, never created silently
- a mill that does not match is left unset for the same reason
- an envelope with no `flow` still produces a complete `Brew`
- the `imported` block survives a save and load

- [ ] **Step 2: Run them to verify they fail**

- [ ] **Step 3: Implement**

Match-or-drop throughout. Creating a bean, a mill or a preparation on a name miss is how an import quietly fills somebody's equipment list with rows they did not ask for and will not know to merge. The spec's rule (§4.5.1 decision 5) is that we match on name and otherwise say so in the note.

Add the optional `imported` block to `ICustomInformationBrew` so provenance is a first-class field rather than a string glued onto the note.

- [ ] **Step 4: Run them to verify they pass**

- [ ] **Step 5: Commit on the fork**

## Task 16: The provenance chip and the branding

**Files:** `src/components/brew-information/…`, `src/enums/preparations/preparationTypes.ts`, `src/enums/preparations/preparation.ts`, `src/assets/custom-ion-icons/*.svg`, `src/assets/i18n/*.json`

Spec §4.4.1 to §4.4.4. Two slots: a **preparation method** (`PREPARATION_TYPES.XBLOOM`, a stylised illustration of the brewer, the way Beanconqueror already does Sanremo, Xenia and Gaggiuino) and a **provenance chip** on the brew, naming the app the brew came from with a tappable `https:`-only `sourceUrl`.

- [ ] **Step 1: Draw the illustration**, stylised, matching the existing set's weight and style. No xBloom logo, no copyrighted artwork. Beanconqueror's own convention and the reason its existing brewer set is unproblematic.

- [ ] **Step 2: Our mark for the chip.** The chip names the sending app, so it is ours, and it is how a Beanconqueror user finds out where the brew came from and what wrote it.

- [ ] **Step 3: The chip falls back to text.** A sender we have no mark for still gets a chip with its name. This is what keeps the feature vendor-neutral while still letting a known vendor look like one: the branded case is a lookup hit, not a special code path.

- [ ] **Step 4: i18n keys in every locale file**, English filled in and the rest left to the project's normal process.

- [ ] **Step 5: Commit on the fork**, as a separate commit from the transport, so the maintainer can take the transport without the branding.

## Task 17: Document the schema

**Files:** `docs/import-api.md` on the fork

- [ ] **Step 1: Write it.** Every field, every unit, the chunking, the codec, the size measurements from spec §7.1, and a worked example another app can copy. This is the thing that makes it vendor-neutral in fact and not just in intent: a documented schema is one another vendor can emit without asking anyone.

- [ ] **Step 2: Commit on the fork**

## Task 18: Verify end to end

- [ ] **Step 1: Build the fork and install it on a simulator**, walk onboarding once so `isAppReady` is set.

- [ ] **Step 2: Fire a real URL from XBRW++**, not from `xcrun simctl openurl`. `simctl` truncates at 2,047 characters and delivered 5 of 10 chunks in the proof of concept; the same URL tapped as a link arrived complete (spec §7.2). Measure the tool before believing what it tells you about the platform.

- [ ] **Step 3: Confirm** the figures, the note, the flow trace and the temperature staircase all arrive, and the provenance chip appears.

- [ ] **Step 4: Android remains unmeasured** and must be stated as such. XBRW++ is iOS-only today (#5). The Binder limit is around 1 MB and the payload is roughly 0.4% of it, but that is reasoning, not measurement, and the distinction is the whole point of this exercise.

---

# Phase F: upstream

## Task 19: Open the PR

- [ ] **Step 1: Split the branch into separable commits** so the maintainer can take a part: transport and decoder; import service; branding and preparation type; documentation. He has said he is overwhelmed, and a PR he can accept in pieces is a smaller ask than one he must take whole.

- [ ] **Step 2: Lead the description with the measurement.** A 97,120-character URL across 235 parameters arrived byte-exact; a realistic brew is 4,100. The year-old concern that a long parameter is truncated by the OS was real, and its cause was `xcrun simctl openurl`, not iOS. That finding is useful to Beanconqueror whether or not this PR is ever merged, and it belongs first.

- [ ] **Step 3: Report the two independent findings separately**, as issues rather than buried in the PR: the Apple Silicon simulator build failure, and that base64url would let the bean share drop its `replace(/ /g, '+')` Android workaround.

- [ ] **Step 4: Open the gate on our side** once it lands: flip the constant in `library/brew/handoff/targets.ts`, bump `expo.version` in `app.json` (`runtimeVersion.policy` is `appVersion`), and close #137 and #123.

---

## Definition of done

- [ ] `npm run typecheck && npm run lint && npx jest && npx expo-doctor` all pass
- [ ] Every new module has a test that fails without it
- [ ] Phase A ships on its own and is visible in the brew history
- [ ] A brew exported today and re-exported next month produces identical numbers
- [ ] A brew whose samples were swept still exports its figures and its note
- [ ] No hex colour literal and no bespoke duration in `app/` or `components/`
- [ ] No dashes in user-facing copy
- [ ] No Beanconqueror source in this repository
- [ ] Android is described as unmeasured wherever the results are quoted
