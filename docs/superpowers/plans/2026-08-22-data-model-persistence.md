# Data Model and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a recipe a name it owns, an identity that does not depend on that name, a provenance, and a persisted accent — and give the app a settings store.

**Architecture:** Everything new is plain TypeScript in `library/`, with no React. Two pieces that would otherwise be locked inside `RecipeDatabase` are extracted as pure units so they can be tested without a SQLite mock: duplicate detection becomes a pure function over a recipe list, and the settings store takes a small storage interface whose default implementation is SQLite. Recipe field migration is lazy, in the `Recipe(json)` constructor, beside the existing cup-type fixes.

**Tech Stack:** TypeScript, expo-sqlite (synchronous API), Jest. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-22-data-model-persistence-design.md`](../specs/2026-08-22-data-model-persistence-design.md)

---

## Scope note

The card byte format is **read, never changed**. `getData` and `parseData` are
called but not edited, and the characterisation tests in
`library/__tests__/Recipe.card.test.ts` must stay green **without being
edited**. If a task requires changing an expectation in that file, stop: it is a
regression, not a feature. A malformed write to a genuine card is not trivially
recoverable.

## File structure

| File | Responsibility |
|---|---|
| `library/Recipe.ts` | Modify. New fields, lazy migration, `displayName`, `hasName`, `fingerprint`. `title` deleted. |
| `library/duplicates.ts` | Create. Pure duplicate detection (`findDuplicate`, `resolveOnOpen`) and copy naming (`copyName`), over a recipe list rather than a database. |
| `library/Settings.ts` | Create. Typed settings with a pluggable storage backend. |
| `library/RecipeDatabase.ts` | Modify. Accent assignment on write, clone provenance. `doesTitleExist` deleted. |
| `library/accent.ts` | Modify. `RecipeWithAccent` deleted. |
| `hooks/useRecipeEditor.ts` | Modify. Uniqueness alert removed, sync made non-destructive. |
| `app/index.tsx`, `app/editRecipe.tsx`, `components/RecipeCard.tsx`, `components/RecipeItem.tsx`, `components/SwipeableRecipeRow.tsx`, `components/ImportRecipeComponent.tsx` | Modify. `title` → `displayName()`, and the two de-duplicating navigation points. |

## A note on test design

Two habits this repository has learned the hard way, both of which apply here:

1. **Assert against literal expected values, not against a second computation of
   the same thing.** `library/__tests__/cardFixtures.ts` is a deliberately
   independent reimplementation of the byte layout for exactly this reason. The
   fingerprint test follows it: write the expected hex string out, do not derive
   it by calling `getData` in the test.
2. **A test that passes the moment you write it has told you nothing.** Every
   task below runs the test and confirms it fails *for the stated reason* before
   any implementation is written.

---

### Task 1: New Recipe fields and lazy migration

**Files:**
- Modify: `library/Recipe.ts:69-86` (field declarations), `library/Recipe.ts:87-149` (constructor)
- Test: `library/__tests__/Recipe.persistence.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/Recipe.persistence.test.ts`:

```ts
describe("the new persistence fields", () => {
    function legacyJson(extra: Record<string, unknown> = {}): string {
        return JSON.stringify({
            uuid:     "legacy-uuid",
            title:    "Ethiopia Guji",
            xid:      "ABC123",
            ratio:    16,
            dosage:   18,
            cupType:  0x00,
            grindSize: 25,
            checksum: 0,
            pours:    [{pourNumber: 1, volume: 288, temperature: 92, flowRate: 3, agitation: 0, pourPattern: 0, pauseTime: 0}],
            ...extra
        });
    }

    it("takes a legacy title as the local name", () => {
        const recipe = new Recipe(undefined, legacyJson());
        expect(recipe.name).toBe("Ethiopia Guji");
    });

    it("prefers an explicit name over a legacy title", () => {
        const recipe = new Recipe(undefined, legacyJson({name: "My Blend"}));
        expect(recipe.name).toBe("My Blend");
    });

    it("defaults a recipe with neither to an empty name", () => {
        const recipe = new Recipe(undefined, legacyJson({title: undefined}));
        expect(recipe.name).toBe("");
    });

    it("leaves the xBloom name unknown on a legacy record", () => {
        // A legacy title may have come from a sync or from the user; there is no
        // way to tell, so it is treated as the user's and the cached xBloom name
        // starts empty rather than guessing.
        expect(new Recipe(undefined, legacyJson()).xbloomName).toBe("");
    });

    it("marks a legacy record's creation time unknown rather than inventing one", () => {
        expect(new Recipe(undefined, legacyJson()).createdAt).toBe(0);
    });

    it("keeps a stored creation time", () => {
        expect(new Recipe(undefined, legacyJson({createdAt: 1700000000000})).createdAt)
            .toBe(1700000000000);
    });

    it("defaults a legacy record's provenance to manual", () => {
        expect(new Recipe(undefined, legacyJson()).source).toBe("manual");
    });

    it("keeps a stored provenance", () => {
        expect(new Recipe(undefined, legacyJson({source: "import"})).source).toBe("import");
    });

    it("leaves the accent index absent on a legacy record, for the hash fallback", () => {
        expect(new Recipe(undefined, legacyJson()).accentIndex).toBeUndefined();
    });

    it("keeps a stored accent index", () => {
        expect(new Recipe(undefined, legacyJson({accentIndex: 3})).accentIndex).toBe(3);
    });

    it("stamps a freshly built recipe with the current time", () => {
        const before = Date.now();
        expect(new Recipe().createdAt).toBeGreaterThanOrEqual(before);
    });

    it("survives a save and reload without losing the migrated name", () => {
        // The migration runs on read. If it did not also round-trip through
        // JSON.stringify, the first save after an upgrade would drop the name.
        const migrated = new Recipe(undefined, legacyJson());
        const reloaded = new Recipe(undefined, JSON.stringify(migrated));
        expect(reloaded.name).toBe("Ethiopia Guji");
        expect(reloaded.source).toBe("manual");
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/Recipe.persistence.test.ts -t "the new persistence fields"`

Expected: FAIL. The first failures read `Property 'name' does not exist on type 'Recipe'`.

- [ ] **Step 3: Add the field declarations**

In `library/Recipe.ts`, above `class Recipe`:

```ts
/** Where a recipe came from. Drives the placeholder name. */
export type RecipeSource = "read" | "import" | "duplicate" | "manual";
```

Inside the class, replace `public title: string = "";` with:

```ts
    /** The name the user chose. Empty until they rename something. */
    public name: string = "";
    /**
     * The name xBloom publishes for this recipe's XID, cached.
     *
     * Never hand-edited: a sync refreshes it, and the local `name` wins the
     * display, so refreshing can no longer discard what the user typed.
     */
    public xbloomName: string = "";
    /** Epoch ms. `0` means unknown — a record saved before the field existed. */
    public createdAt: number = 0;
    public source: RecipeSource = "manual";
    /**
     * Index into the accent half for this recipe's beverage. Absent on records
     * saved before the field existed, which fall back to the uuid hash in
     * `library/accent.ts`.
     */
    public accentIndex?: number;
```

- [ ] **Step 4: Stamp fresh recipes and migrate stored ones**

In the constructor, immediately after `this.key = this.uuid;` (the first one, before the `if (data)` branch):

```ts
        this.createdAt = Date.now();
```

In the `if (json)` branch, replace `this.title = jsonRecipe.title;` with:

```ts
            // Lazy migration, beside the cup-type fixes above. A record written
            // before these fields existed takes its old `title` as the local
            // name: it was editable, so it is the user's, and there is no way to
            // tell a synced title from a typed one after the fact.
            this.name = jsonRecipe.name ?? jsonRecipe.title ?? "";
            this.xbloomName = jsonRecipe.xbloomName ?? "";
            // Not `?? Date.now()`. Backfilling with the read time would give
            // every legacy record a date that changes on every launch until it
            // is next saved.
            this.createdAt = jsonRecipe.createdAt ?? 0;
            this.source = jsonRecipe.source ?? "manual";
            this.accentIndex = jsonRecipe.accentIndex;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/__tests__/Recipe.persistence.test.ts`

Expected: PASS, including the pre-existing tests in the file.

- [ ] **Step 6: Confirm the card format is untouched**

Run: `npx jest library/__tests__/Recipe.card.test.ts`

Expected: PASS, with no edits to that file.

- [ ] **Step 7: Commit**

```bash
git add library/Recipe.ts library/__tests__/Recipe.persistence.test.ts
git commit -m "Add the local name, xBloom name, provenance and accent fields"
```

---

### Task 2: displayName and hasName

**Files:**
- Modify: `library/Recipe.ts`
- Test: `library/__tests__/Recipe.persistence.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("displayName", () => {
    function named(fields: Partial<Recipe>): Recipe {
        const recipe = new Recipe();
        Object.assign(recipe, fields);
        return recipe;
    }

    it("prefers the local name", () => {
        expect(named({name: "My Blend", xbloomName: "Guji", xid: "ABC"}).displayName())
            .toBe("My Blend");
    });

    it("falls back to the xBloom name", () => {
        expect(named({xbloomName: "Guji", xid: "ABC"}).displayName()).toBe("Guji");
    });

    it("falls back to the XID", () => {
        expect(named({xid: "ABC123"}).displayName()).toBe("ABC123");
    });

    it("treats whitespace as absent, so a space does not become a name", () => {
        expect(named({name: "   ", xbloomName: "Guji"}).displayName()).toBe("Guji");
    });

    it("names a card read with no XID by how it arrived", () => {
        const recipe = named({source: "read", createdAt: Date.UTC(2026, 2, 4)});
        expect(recipe.displayName()).toMatch(/^Read /);
    });

    it("names an import by how it arrived", () => {
        const recipe = named({source: "import", createdAt: Date.UTC(2026, 2, 4)});
        expect(recipe.displayName()).toMatch(/^Imported /);
    });

    it("omits the date when the creation time is unknown", () => {
        expect(named({source: "read", createdAt: 0}).displayName()).toBe("Read");
    });

    it("falls back to Untitled for a recipe with no provenance at all", () => {
        expect(named({source: "manual", createdAt: 0}).displayName()).toBe("Untitled");
    });
});

describe("hasName", () => {
    it("is true when any real name is available", () => {
        const recipe = new Recipe();
        recipe.xid = "ABC";
        expect(recipe.hasName()).toBe(true);
    });

    it("is false when the placeholder is in use, so the UI can mute it", () => {
        const recipe = new Recipe();
        recipe.source = "read";
        expect(recipe.hasName()).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/Recipe.persistence.test.ts -t "displayName"`

Expected: FAIL with `recipe.displayName is not a function`.

- [ ] **Step 3: Implement**

Add to `library/Recipe.ts`, near `generateNewUUID`:

```ts
    /**
     * The name to show for this recipe.
     *
     * A chain rather than a single field, because both names and the XID are
     * optional: a card carries no name at all, only the XID, and a card with no
     * XID carries nothing. This lives here so no screen reimplements it.
     */
    public displayName(): string {
        if (this.name.trim().length > 0) {
            return this.name;
        }
        if (this.xbloomName.trim().length > 0) {
            return this.xbloomName;
        }
        if (this.xid.trim().length > 0) {
            return this.xid;
        }
        return this.placeholderName();
    }

    /**
     * Whether any real name was found, as opposed to the placeholder.
     *
     * The UI renders the placeholder muted, so that a generated label is never
     * mistaken for a name the user chose.
     */
    public hasName(): boolean {
        return this.name.trim().length > 0 ||
               this.xbloomName.trim().length > 0 ||
               this.xid.trim().length > 0;
    }

    /**
     * Provenance and date, for a recipe with no name from any source.
     *
     * Not derived from the brew parameters: the recipe card already shows dose,
     * ratio and grind beside the name, so "18 g · 1:16" would only repeat
     * itself. Provenance and date are the one thing that distinguishes four
     * nameless cards read in a row.
     */
    private placeholderName(): string {
        const verb: Record<RecipeSource, string> = {
            read:      "Read",
            import:    "Imported",
            duplicate: "Copy",
            manual:    "Untitled"
        };

        if (this.source === "manual" || this.source === "duplicate" || this.createdAt === 0) {
            return verb[this.source];
        }

        const date = new Date(this.createdAt).toLocaleDateString(undefined, {
            day:   "numeric",
            month: "short"
        });
        return `${verb[this.source]} ${date}`;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest library/__tests__/Recipe.persistence.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add library/Recipe.ts library/__tests__/Recipe.persistence.test.ts
git commit -m "Resolve a recipe's display name through a fallback chain"
```

---

### Task 3: The card-payload fingerprint

**Files:**
- Modify: `library/Recipe.ts` (add `fingerprint`, remove a debug log from `getData`)
- Test: `library/__tests__/Recipe.persistence.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("fingerprint", () => {
    function sample(): Recipe {
        const recipe = new Recipe();
        recipe.xid = "ABC123";
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.ratio = 16;
        recipe.dosage = 18;
        recipe.grindSize = 25;
        recipe.grindRPM = 120;
        recipe.pours = [new Pour(1, 288, 92, 3, 0, 0, 0)];
        return recipe;
    }

    it("is stable across two identical recipes", () => {
        expect(sample().fingerprint()).toBe(sample().fingerprint());
    });

    it("ignores the local name", () => {
        const a = sample();
        const b = sample();
        b.name = "Something Else";
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("ignores the uuid", () => {
        const a = sample();
        const b = sample();
        b.generateNewUUID();
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("ignores the accent index", () => {
        const a = sample();
        const b = sample();
        b.accentIndex = 5;
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("ignores the card signature, so a read and an import compare equal", () => {
        // This is the whole point of slicing 32 bytes off. A recipe read from a
        // card carries that card's signature in `backup`; the same recipe
        // imported from a share link carries none. Without the slice they would
        // never de-duplicate against each other.
        const a = sample();
        const b = sample();
        b.backup = new Array(32).fill(0xAB);
        expect(b.fingerprint()).toBe(a.fingerprint());
    });

    it("changes when the grind changes, because that is a different card", () => {
        const a = sample();
        const b = sample();
        b.grindSize = 26;
        expect(b.fingerprint()).not.toBe(a.fingerprint());
    });

    it("changes when a pour volume changes", () => {
        const a = sample();
        const b = sample();
        b.pours[0].volume = 300;
        expect(b.fingerprint()).not.toBe(a.fingerprint());
    });

    it("changes when the XID changes", () => {
        const a = sample();
        const b = sample();
        b.xid = "ZZZ999";
        expect(b.fingerprint()).not.toBe(a.fingerprint());
    });

    it("is exactly the payload bytes, per an independent implementation", () => {
        // Every test above is relational: they would all still pass if
        // `fingerprint` returned, say, the length of the payload. This one
        // pins the actual value, and takes the expectation from
        // `cardFixtures.buildCard` — a deliberately separate reimplementation
        // of the byte layout — rather than from `getData`, so it is not
        // checking the code against itself.
        const bytes = buildCard(XPOD_CARD);
        const expected = bytes.slice(HASH_LENGTH)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        expect(new Recipe(bytes).fingerprint()).toBe(expected);
    });

    it("is lower-case hex with no separators, two characters per byte", () => {
        const printed = sample().fingerprint();
        expect(printed).toMatch(/^[0-9a-f]+$/);
        expect(printed.length % 2).toBe(0);
    });
});
```

Add `import {buildCard, HASH_LENGTH, XPOD_CARD} from "./cardFixtures";` to the
file's imports.

Add `import Pour from "../Pour";` and `CUP_TYPE` to the file's imports if they
are not already there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/__tests__/Recipe.persistence.test.ts -t "fingerprint"`

Expected: FAIL with `recipe.fingerprint is not a function`.

- [ ] **Step 3: Implement**

Add to `library/Recipe.ts`:

```ts
    /**
     * A stable identity for this recipe, as the bytes it would write.
     *
     * Two recipes are the same when writing either produces the same card.
     *
     * The explicit all-zero prefix is load-bearing. `getData(null)` does NOT
     * zero-pad — it falls back to `this.backup`, which holds the signature of
     * the card a recipe was read from. Leaving it to that default would fold
     * the signature into the CRC and give a read and an import of the same
     * recipe two different identities, which is exactly what this must not do.
     * `getData` then strips the prefix itself, since `withSignature` defaults
     * to false, so no further slicing is needed here.
     *
     * Computed on demand and never persisted: a stored fingerprint would be
     * silently invalidated by any future change to the byte format, whereas a
     * computed one simply re-derives. Libraries here are tens of recipes, so
     * scanning them all costs nothing.
     */
    public fingerprint(): string {
        return Recipe.convertNumberArrayToHex(this.getData(new Array(32).fill(0)));
    }
```

**Correction, recorded after implementation.** This plan originally specified
`getData(null).slice(32)`, on two beliefs about `getData` that turned out to be
false, both confirmed by reading it:

- It does not zero-pad an absent prefix. `library/Recipe.ts:420` reads
  `this.backup.length >= 32 ? this.backup.slice(0, 32) : new Array(32).fill(0)`,
  so a recipe read from a card silently contributes that card's signature.
- It already strips the prefix. The tail of the method does
  `data.splice(0, 32)` whenever `withSignature` is false, which is the default.
  An extra `.slice(32)` therefore truncated 32 bytes of real payload.

The sample values in the tests below were also corrected: `grindSize` is stored
with `GRIND_SIZE_OFFSET` of 40, so a value of 25 encodes as −15, and a pour
volume must fit one byte, so 288 overflows. Valid values are used instead.

- [ ] **Step 4: Remove the debug logs that this makes hot**

In `getData`, delete all three of these lines:

```ts
        console.log("Prefix:" + Recipe.convertNumberArrayToHex(data));
        console.log("CheckSum:" + Recipe.convertNumberArrayToHex(data));
        console.log("CheckSum:" + checkSum + ":" + this.checksum);
```

They were harmless when `getData` ran once per card write. De-duplication calls
it once per stored recipe per import, which would flood the log on every save —
and two of the three hex-encode the whole payload to do it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/__tests__/Recipe.persistence.test.ts library/__tests__/Recipe.card.test.ts`

Expected: PASS, with no edits to `Recipe.card.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add library/Recipe.ts library/__tests__/Recipe.persistence.test.ts
git commit -m "Identify a recipe by the card it would write"
```

---

### Task 4: Pure duplicate detection

**Files:**
- Create: `library/duplicates.ts`
- Test: `library/__tests__/duplicates.test.ts`

`RecipeDatabase` has no tests and no SQLite mock exists. Rather than introduce
one, the decision this feature actually needs is extracted as a pure function
over a list, and the database method becomes a thin wrapper.

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/duplicates.test.ts`:

```ts
import Recipe from "../Recipe";
import Pour from "../Pour";
import {findDuplicate} from "../duplicates";

function sample(): Recipe {
    const recipe = new Recipe();
    recipe.xid = "ABC123";
    recipe.ratio = 16;
    recipe.dosage = 18;
    recipe.grindSize = 25;
    recipe.pours = [new Pour(1, 288, 92, 3, 0, 0, 0)];
    return recipe;
}

describe("findDuplicate", () => {
    it("finds nothing in an empty library", () => {
        expect(findDuplicate([], sample())).toBeNull();
    });

    it("finds nothing when no stored recipe matches", () => {
        const other = sample();
        other.grindSize = 30;
        expect(findDuplicate([other], sample())).toBeNull();
    });

    it("finds a stored recipe that would write the same card", () => {
        const stored = sample();
        expect(findDuplicate([stored], sample())).toBe(stored);
    });

    it("returns the existing recipe, not the candidate", () => {
        // The caller reveals what it gets back. Returning the candidate would
        // scroll the list to a recipe that was never inserted.
        const stored = sample();
        stored.name = "Already Saved";
        expect(findDuplicate([stored], sample())?.name).toBe("Already Saved");
    });

    it("ignores a stored recipe with the same uuid as the candidate", () => {
        // Re-saving a recipe over itself is an update, not a duplicate.
        const stored = sample();
        const candidate = sample();
        candidate.uuid = stored.uuid;
        expect(findDuplicate([stored], candidate)).toBeNull();
    });

    it("treats a recipe whose bytes cannot be built as unique", () => {
        // A broken import should land in the library to be inspected, not
        // vanish into a de-duplication branch.
        const broken = sample();
        broken.getData = () => {
            throw new Error("malformed");
        };
        expect(findDuplicate([sample()], broken)).toBeNull();
    });

    it("skips a stored recipe whose bytes cannot be built", () => {
        const broken = sample();
        broken.getData = () => {
            throw new Error("malformed");
        };
        expect(findDuplicate([broken], sample())).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/duplicates.test.ts`

Expected: FAIL with `Cannot find module '../duplicates'`.

- [ ] **Step 3: Implement**

Create `library/duplicates.ts`:

```ts
import Recipe from "./Recipe";

/**
 * The fingerprint of a recipe, or `null` if its bytes cannot be built.
 *
 * A recipe that throws here is malformed. It is treated as having no identity
 * rather than as matching everything or nothing in particular, so a broken
 * import lands in the library to be inspected instead of disappearing into a
 * de-duplication branch.
 */
function safeFingerprint(recipe: Recipe): string | null {
    try {
        return recipe.fingerprint();
    } catch {
        return null;
    }
}

/**
 * The stored recipe that would write the same card as `candidate`, if any.
 *
 * A recipe with the candidate's own uuid is skipped: re-saving a recipe over
 * itself is an update, not a duplicate.
 */
export function findDuplicate(stored: Recipe[], candidate: Recipe): Recipe | null {
    const target = safeFingerprint(candidate);
    if (target === null) {
        return null;
    }

    for (const existing of stored) {
        if (existing.uuid === candidate.uuid) {
            continue;
        }
        if (safeFingerprint(existing) === target) {
            return existing;
        }
    }
    return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/duplicates.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add library/duplicates.ts library/__tests__/duplicates.test.ts
git commit -m "Detect a duplicate recipe by the card it would write"
```

---

### Task 5: The settings store

**Files:**
- Create: `library/Settings.ts`
- Test: `library/__tests__/Settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/Settings.test.ts`:

```ts
import {DEFAULTS, Settings, type SettingsStorage} from "../Settings";

/** A storage backend that keeps everything in memory. */
function fakeStorage(seed: Record<string, string> = {}): SettingsStorage {
    const map = new Map(Object.entries(seed));
    return {
        read:  (key) => map.get(key) ?? null,
        write: (key, value) => {
            map.set(key, value);
        }
    };
}

describe("Settings", () => {
    it("returns the default for a setting that was never written", () => {
        expect(new Settings(fakeStorage()).get("showCoffeeMarker"))
            .toBe(DEFAULTS.showCoffeeMarker);
    });

    it("returns a stored value", () => {
        const settings = new Settings(fakeStorage());
        settings.set("showCoffeeMarker", false);
        expect(settings.get("showCoffeeMarker")).toBe(false);
    });

    it("round-trips false rather than treating it as unset", () => {
        // The bug this guards: `stored ?? default` is correct, `stored ||
        // default` is not, and for a boolean setting whose default is true the
        // difference is that turning it off does nothing.
        const settings = new Settings(fakeStorage());
        settings.set("showCoffeeMarker", false);
        expect(new Settings(fakeStorage({showCoffeeMarker: "false"}))
            .get("showCoffeeMarker")).toBe(false);
    });

    it("falls back to the default when a stored value is corrupt", () => {
        const settings = new Settings(fakeStorage({showCoffeeMarker: "not json"}));
        expect(settings.get("showCoffeeMarker")).toBe(DEFAULTS.showCoffeeMarker);
    });

    it("falls back to the default when a stored value is the wrong type", () => {
        // Parseable but nonsense: a settings row edited by hand, or written by
        // a future version that changed the type.
        const settings = new Settings(fakeStorage({showCoffeeMarker: '"yes"'}));
        expect(settings.get("showCoffeeMarker")).toBe(DEFAULTS.showCoffeeMarker);
    });

    it("persists through the storage backend, not just in memory", () => {
        const map: Record<string, string> = {};
        const storage: SettingsStorage = {
            read:  (key) => map[key] ?? null,
            write: (key, value) => {
                map[key] = value;
            }
        };
        new Settings(storage).set("showCoffeeMarker", false);
        expect(map.showCoffeeMarker).toBe("false");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/Settings.test.ts`

Expected: FAIL with `Cannot find module '../Settings'`.

- [ ] **Step 3: Implement**

Create `library/Settings.ts`:

```ts
import * as SQLite from 'expo-sqlite';

/**
 * Every setting, with its default.
 *
 * This map is the single source of both the key list and the value types — a
 * key that is not here is a compile error at the call site, so there is no
 * stringly-typed lookup to typo.
 */
export const DEFAULTS = {
    /**
     * The `TEA` marker is always shown; `COFFEE` is redundant in a mostly-coffee
     * library, so it can be turned off.
     */
    showCoffeeMarker: true
} as const;

export type SettingKey = keyof typeof DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof DEFAULTS)[K];

/**
 * Where settings are kept.
 *
 * An interface rather than a hard dependency on SQLite so the store can be
 * tested without a database: `RecipeDatabase` has no tests and no mock, and
 * introducing one to check a defaults map would be a poor trade.
 */
export interface SettingsStorage {
    read(key: string): string | null;
    write(key: string, value: string): void;
}

/** The real backend: a table alongside `recipes` in the app's database. */
export class SqliteSettingsStorage implements SettingsStorage {
    private db: SQLite.SQLiteDatabase;

    constructor() {
        this.db = SQLite.openDatabaseSync('xbrecipewriter.db');
        this.db.execSync(`
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);`
        );
    }

    public read(key: string): string | null {
        const row = this.db.getFirstSync<{value: string}>(
            `SELECT value FROM settings WHERE key = ?;`, [key]
        );
        return row ? row.value : null;
    }

    public write(key: string, value: string): void {
        this.db.runSync(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
            [key, value]
        );
    }
}

export class Settings {
    private storage: SettingsStorage;

    constructor(storage: SettingsStorage = new SqliteSettingsStorage()) {
        this.storage = storage;
    }

    public get<K extends SettingKey>(key: K): SettingValue<K> {
        const raw = this.storage.read(key);
        if (raw === null) {
            return DEFAULTS[key];
        }

        try {
            const parsed: unknown = JSON.parse(raw);
            // Type-check against the default rather than trusting what is
            // stored. A row edited by hand, or written by a version that
            // changed this setting's type, must not propagate as the wrong
            // type into the rest of the app.
            if (typeof parsed !== typeof DEFAULTS[key]) {
                return DEFAULTS[key];
            }
            return parsed as SettingValue<K>;
        } catch {
            return DEFAULTS[key];
        }
    }

    public set<K extends SettingKey>(key: K, value: SettingValue<K>): void {
        this.storage.write(key, JSON.stringify(value));
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/Settings.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add library/Settings.ts library/__tests__/Settings.test.ts
git commit -m "Add a typed settings store"
```

---

### Task 6: Accent assignment on insert

**Files:**
- Modify: `library/RecipeDatabase.ts`, `library/accent.ts`
- Test: `library/__tests__/accent.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/accent.test.ts`:

```ts
describe("assigning an accent when the beverage changes", () => {
    it("keeps an index that is valid for the recipe's half", () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        recipe.accentIndex = 6;
        expect(reassignIfCrossed(recipe, [])).toBe(6);
    });

    it("reassigns when a coffee index is out of range for tea", () => {
        // The tea half is shorter than the coffee half, so an index valid for
        // coffee can point past the end of tea. The halves do not overlap, so
        // clamping would land on an arbitrary colour rather than the least-used
        // one.
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.accentIndex = 6;
        const reassigned = reassignIfCrossed(recipe, []);
        expect(reassigned).toBeLessThan(accents.tea.length);
    });

    it("assigns the least-used colour in the new half", () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.TEA;
        recipe.accentIndex = 9;
        expect(reassignIfCrossed(recipe, [0, 0, 1, 2])).toBe(3);
    });

    it("assigns an index to a recipe that has never had one", () => {
        const recipe = new Recipe();
        recipe.cupType = CUP_TYPE.XPOD;
        expect(reassignIfCrossed(recipe, [0, 1])).toBe(2);
    });
});
```

Add `reassignIfCrossed` to the file's import from `../accent`, and `accents`
from `@/constants/colors` if not already imported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/accent.test.ts`

Expected: FAIL with `reassignIfCrossed is not a function`.

- [ ] **Step 3: Implement**

Add to `library/accent.ts`:

```ts
/**
 * The accent index a recipe should hold, given the accents already in use in
 * its half of the palette.
 *
 * Returns the existing index unchanged when it is still valid. A recipe whose
 * cup type has crossed between coffee and tea gets a fresh one, because the two
 * halves are disjoint: a coffee index can point past the end of the shorter tea
 * half, and even when it does not it names a colour from the wrong group.
 *
 * @param inUse Accent indices held by other recipes in the same half.
 */
export function reassignIfCrossed(recipe: Recipe, inUse: number[]): number {
    const group = accentGroupFor(recipe);
    const size = accents[group].length;
    const current = recipe.accentIndex;

    if (typeof current === "number" && Number.isInteger(current) &&
        current >= 0 && current < size) {
        return current;
    }

    return nextAccentIndex(group, inUse);
}
```

Delete the `RecipeWithAccent` type and its doc comment, and change
`resolveAccent` to read the field directly:

```ts
    const persisted = recipe.accentIndex;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/accent.test.ts`

Expected: PASS.

- [ ] **Step 5: Remove the last references to the deleted type**

Run: `grep -rn "RecipeWithAccent" --include=*.ts --include=*.tsx . | grep -v node_modules`

Delete the import and the casts it is used in — in
`components/__tests__/RecipeCard.test.tsx`, a recipe can now take
`recipe.accentIndex = n` directly.

- [ ] **Step 6: Wire assignment into the database**

In `library/RecipeDatabase.ts`, add the import:

```ts
import {accentGroupFor, reassignIfCrossed} from './accent';
```

and a private helper:

```ts
    /**
     * The accent indices already taken in a recipe's half of the palette.
     *
     * Only the same half counts: the coffee library is larger, and letting its
     * indices into the tea tally would skew tea towards colours nothing uses.
     */
    private accentsInUse(recipe: Recipe): number[] {
        const group = accentGroupFor(recipe);
        return (this.retrieveAllRecipes() ?? [])
            .filter((other) => other.uuid !== recipe.uuid &&
                               accentGroupFor(other) === group)
            .map((other) => other.accentIndex)
            .filter((index): index is number => typeof index === "number");
    }
```

At the top of `insertRecipe`, inside the `if` branch and before the
`JSON.stringify`:

```ts
            recipe.accentIndex = reassignIfCrossed(recipe, this.accentsInUse(recipe));
```

At the top of `updateRecipe`, in the `else` branch before the `JSON.stringify`:

```ts
            updatedRecipe.accentIndex =
                reassignIfCrossed(updatedRecipe, this.accentsInUse(updatedRecipe));
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add library/accent.ts library/RecipeDatabase.ts library/__tests__/accent.test.ts components/__tests__/RecipeCard.test.tsx
git commit -m "Persist a recipe's accent, and reassign it across the tea boundary"
```

---

### Task 7: Delete `title`

**Files:**
- Modify: `library/Recipe.ts`, `library/XBloomRecipe.ts:52`, `library/RecipeDatabase.ts`, `hooks/useRecipeEditor.ts`, `app/editRecipe.tsx:91`, `components/RecipeCard.tsx`, `components/RecipeItem.tsx`, `components/SwipeableRecipeRow.tsx`
- Test: existing suites

This is the breaking task. It is one commit rather than several so the
repository is never left half-renamed.

- [ ] **Step 1: Update the RecipeCard test to the new contract**

In `components/__tests__/RecipeCard.test.tsx`, the `makeRecipe` helper takes
`{title: ...}`. Change it to set `name`, and add:

```ts
    it("shows the placeholder for a recipe with no name from any source", async () => {
        const recipe = makeRecipe();
        recipe.name = "";
        recipe.xbloomName = "";
        recipe.xid = "";
        recipe.source = "read";
        await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()}/>);

        expect(screen.getByText(recipe.displayName())).toBeTruthy();
    });

    it("mutes a placeholder so it does not read as a chosen name", async () => {
        const recipe = makeRecipe();
        recipe.name = "";
        recipe.xbloomName = "";
        recipe.xid = "";
        recipe.source = "read";
        await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()}/>);

        const placeholder = screen.getByText(recipe.displayName());
        const named = onAccent.text;
        expect(styleValueOf(placeholder, "color")).not.toBe(named);
    });
```

Add a `styleValueOf` helper mirroring the one in `ScreenTitle.test.tsx` if the
file does not already have one.

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`

Expected: FAIL — the card renders `recipe.title`, which is now `undefined`.

- [ ] **Step 3: Delete the field**

In `library/Recipe.ts`, delete `public title: string = "";` if it is still
present after Task 1, and delete any remaining assignment to `this.title`.

- [ ] **Step 4: Repoint every call site**

`library/XBloomRecipe.ts:52` — the fetched name is xBloom's, not the user's:

```ts
            recipe.xbloomName = title;
            recipe.source = "import";
```

`components/RecipeCard.tsx` — render the resolved name, muted when it is a
placeholder:

```ts
                <Text flex={1} fontSize={17} fontWeight="700" numberOfLines={2}
                      maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                      color={recipe.hasName() ? onAccent.text : onAccent.label}>
                    {recipe.displayName()}
                </Text>
```

and in the accessibility summary, replace
`recipe.title === "" ? "Untitled recipe" : recipe.title` with
`recipe.displayName()`.

`components/RecipeItem.tsx:40` — `{props.recipe.displayName()}`.

`components/SwipeableRecipeRow.tsx:54,63` — `` `Delete ${recipe.displayName()}` ``
and `` `Duplicate ${recipe.displayName()}` ``.

`app/editRecipe.tsx:91` — `initialValue={getRecipe()!.name}`. The editor field
edits the local name only; it must not be seeded with the xBloom name, or
opening a recipe and saving it would silently adopt that name as the user's.

`hooks/useRecipeEditor.ts:333` — `r.name = val;`.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run typecheck && npm test`

Expected: PASS. Any remaining `title` reference is a type error, which is the
point of deleting the field rather than aliasing it.

- [ ] **Step 6: Confirm nothing was missed**

Run: `grep -rn "\.title" app/ components/ hooks/ library/ --include=*.ts --include=*.tsx | grep -v __tests__`

Expected: no matches other than `IconButton`'s own unrelated `title` prop in
`app/editRecipe.tsx`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Split the recipe title into a local name and a cached xBloom name"
```

---

### Task 8: Remove the global title-uniqueness rule

**Files:**
- Modify: `library/RecipeDatabase.ts` (delete `doesTitleExist`, rework `createTitle`), `hooks/useRecipeEditor.ts:262-278`, `app/index.tsx:195`
- Test: `library/__tests__/duplicates.test.ts`

- [ ] **Step 1: Write the failing test for the copy-naming rule**

Append to `library/__tests__/duplicates.test.ts`:

Merge the new symbol into the existing import at the top of the file rather
than adding a second `import ... from "../duplicates"` — a duplicate import of
the same module is a lint error.

```ts
// at the top of the file: import {findDuplicate, copyName} from "../duplicates";

describe("copyName", () => {
    it("marks the first copy", () => {
        expect(copyName("Ethiopia", [])).toBe("Ethiopia (Copy)");
    });

    it("numbers a second copy of the same name", () => {
        expect(copyName("Ethiopia", ["Ethiopia (Copy)"])).toBe("Ethiopia (Copy)(2)");
    });

    it("keeps counting past the second", () => {
        expect(copyName("Ethiopia", ["Ethiopia (Copy)", "Ethiopia (Copy)(2)"]))
            .toBe("Ethiopia (Copy)(3)");
    });

    it("ignores unrelated names, since titles are no longer unique", () => {
        // The old implementation scanned the entire library and refused any
        // colliding title. This one only looks at copies of the name being
        // copied, so two different recipes may still share a name.
        expect(copyName("Ethiopia", ["Kenya", "Kenya (Copy)"])).toBe("Ethiopia (Copy)");
    });

    it("copies an already-copied name without nesting the suffix", () => {
        expect(copyName("Ethiopia (Copy)", ["Ethiopia (Copy)"]))
            .toBe("Ethiopia (Copy)(2)");
    });

    it("leaves an empty name empty, so the placeholder still applies", () => {
        // A nameless recipe's copy should keep falling through to the
        // provenance placeholder rather than becoming literally " (Copy)".
        expect(copyName("", [])).toBe("");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest library/__tests__/duplicates.test.ts -t copyName`

Expected: FAIL with `copyName is not a function`.

- [ ] **Step 3: Implement**

Add to `library/duplicates.ts`:

```ts
/**
 * The name for a copy of `name`, given the names already in the library.
 *
 * Scoped to copies of this one name rather than the whole library: recipe names
 * are no longer unique, so this is a nicety that keeps two copies of the same
 * recipe apart, not a constraint.
 */
export function copyName(name: string, existing: string[]): string {
    if (name.trim().length === 0) {
        return name;
    }

    const base = name.replace(/ \(Copy\)(?:\(\d+\))?$/, "");
    const first = `${base} (Copy)`;
    if (!existing.includes(first)) {
        return first;
    }

    let count = 2;
    while (existing.includes(`${base} (Copy)(${count})`)) {
        count++;
    }
    return `${base} (Copy)(${count})`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest library/__tests__/duplicates.test.ts`

Expected: PASS.

- [ ] **Step 5: Delete the constraint from the database**

In `library/RecipeDatabase.ts`, delete `doesTitleExist` and the old
`createTitle` entirely, and rewrite `cloneRecipe`:

```ts
    public cloneRecipe(uuid: string): void {
        let recipe = this.getRecipe(uuid);
        if (recipe) {
            const names = (this.retrieveAllRecipes() ?? []).map((r) => r.name);
            recipe.generateNewUUID();
            recipe.name = copyName(recipe.name, names);
            recipe.source = "duplicate";
            recipe.createdAt = Date.now();
            // Cleared so the copy is assigned its own colour on insert rather
            // than sitting on the original's.
            recipe.accentIndex = undefined;
            this.insertRecipe(recipe);
        }
    }
```

Add `import {copyName} from './duplicates';`.

- [ ] **Step 6: Delete the save-time alert**

In `hooks/useRecipeEditor.ts:259`, `saveRecipe` currently nests a
title-collision branch inside the volume check. Replace the whole function body
after the guard with:

```ts
    function saveRecipe() {
        if (!recipe) return;
        let db = new RecipeDatabase();
        if (recipe.isPourVolumeValid()) {
            db.updateRecipe(recipe.uuid, recipe);
            onSaved();
        } else {
            Alert.alert('Pour Volume Error', 'Your individual pour volumes must add up to the total volume', [
                {
                    text:    'Ok',
                    onPress: () => console.log('Cancel Pressed')
                }
            ]);
        }
    }
```

The pour-volume alert stays: that one is a real machine constraint, not a
bookkeeping rule. Only the name-collision branch goes.

Then delete the `titleChanged` state and every `setTitleChanged` call — the
collision check was its only reader, and `enableSave` already tracks whether
there is anything to save. Confirm with:

`grep -n "titleChanged" hooks/useRecipeEditor.ts` — expect no matches when done.

- [ ] **Step 7: Remove the dev-seed guard**

In `app/index.tsx:195`, `db.doesTitleExist` no longer exists:

```ts
                        if (rec) {
                            db.insertRecipe(rec);
                        }
```

- [ ] **Step 8: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Stop enforcing globally unique recipe names"
```

---

### Task 9: De-duplicate on the automatic paths

**Files:**
- Modify: `library/duplicates.ts`, `app/index.tsx:103`, `components/ImportRecipeComponent.tsx:42`
- Test: `library/__tests__/duplicates.test.ts`

**Correction to the spec.** The spec specifies
`RecipeDatabase.insertIfNew(recipe): {inserted, existing}`, on the assumption
that reading a card and importing a link each insert a row. They do not. Both
paths **navigate to the editor** with the recipe serialised into a route param
(`app/index.tsx:103` and `components/ImportRecipeComponent.tsx:42`), and nothing
is written until the user taps Save, which calls `updateRecipe` — and that falls
through to `insertRecipe` when the uuid is unknown. The only caller of
`insertRecipe` today is the dev-only sample seeder.

So `insertIfNew` would be dead code. The check belongs at the navigation point
instead, which is a better fit for the spec's actual requirement anyway: rather
than declining to insert and then having to explain itself, the app opens the
recipe the user already has. Nothing is created, and the reveal is the
navigation.

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/duplicates.test.ts`:

Again, merge into the existing import:
`import {findDuplicate, copyName, resolveOnOpen} from "../duplicates";`

```ts
describe("resolveOnOpen", () => {
    it("opens the new recipe when the library has nothing like it", () => {
        const candidate = sample();
        expect(resolveOnOpen([], candidate)).toEqual({recipe: candidate, isExisting: false});
    });

    it("opens the stored recipe when it would write the same card", () => {
        const stored = sample();
        stored.name = "Already Saved";
        const result = resolveOnOpen([stored], sample());
        expect(result.recipe).toBe(stored);
        expect(result.isExisting).toBe(true);
    });

    it("does not modify the stored recipe", () => {
        // The reveal is read-only. Re-reading a card must not quietly restamp
        // the recipe the user already has.
        const stored = sample();
        stored.name = "Already Saved";
        stored.source = "import";
        resolveOnOpen([stored], sample());
        expect(stored.name).toBe("Already Saved");
        expect(stored.source).toBe("import");
    });

    it("opens the new recipe when the library holds a different one", () => {
        const other = sample();
        other.ratio = 18;
        const candidate = sample();
        expect(resolveOnOpen([other], candidate).recipe).toBe(candidate);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest library/__tests__/duplicates.test.ts -t resolveOnOpen`

Expected: FAIL with `resolveOnOpen is not a function`.

- [ ] **Step 3: Implement**

Add to `library/duplicates.ts`:

```ts
/**
 * Which recipe to open after a card read or an import.
 *
 * When the library already holds one that would write the same card, that one
 * is opened instead of the new one. This is the de-duplication: no second copy
 * is ever created, and opening the existing recipe *is* the reveal.
 *
 * Only for the automatic paths. Duplicating a recipe is an explicit request and
 * must always produce a copy.
 */
export function resolveOnOpen(
    stored: Recipe[],
    candidate: Recipe
): {recipe: Recipe; isExisting: boolean} {
    const existing = findDuplicate(stored, candidate);
    return existing
        ? {recipe: existing, isExisting: true}
        : {recipe: candidate, isExisting: false};
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest library/__tests__/duplicates.test.ts`

Expected: PASS.

- [ ] **Step 5: Use it on the card-read path**

In `app/index.tsx`, replace line 103 with:

```ts
                // Stamped before serialising: the editor rebuilds the recipe
                // from this JSON, so anything set afterwards would be lost.
                recipe.source = "read";
                const {recipe: toOpen, isExisting} =
                    resolveOnOpen(db.retrieveAllRecipes() ?? [], recipe);
                router.push({
                    pathname: '/editRecipe',
                    params:   {
                        recipeJSON: JSON.stringify(toOpen),
                        // An already-saved recipe opens with Save disabled, as
                        // it would from the list; only a genuinely new read
                        // arrives needing to be saved.
                        saveEnabled: isExisting ? "false" : "true"
                    }
                });
```

Add `import {resolveOnOpen} from '@/library/duplicates';`.

Note that the card-read push currently passes no `saveEnabled` at all. Setting
it to `"true"` for a new read is the correct behaviour and matches the comment
on `initiallySaveEnabled` in `hooks/useRecipeEditor.ts` ("e.g. when arriving
from a card read"); confirm on device that Save is enabled after a read.

- [ ] **Step 6: Use it on the import path**

In `components/ImportRecipeComponent.tsx`, replace the push at line 42 with:

```ts
            recipe.source = "import";
            const db = new RecipeDatabase();
            const {recipe: toOpen, isExisting} =
                resolveOnOpen(db.retrieveAllRecipes() ?? [], recipe);
            router.push({
                pathname: '/editRecipe',
                params:   {
                    recipeJSON:  JSON.stringify(toOpen),
                    saveEnabled: isExisting ? "false" : "true"
                }
            });
```

Add `import {resolveOnOpen} from '@/library/duplicates';` and
`import RecipeDatabase from '@/library/RecipeDatabase';` if absent. Keep the
`setTimeout(..., 0)` wrapper and the comment explaining it — the deferral is
about iOS modal teardown and is unrelated to this change.

- [ ] **Step 7: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Open the recipe already saved instead of importing it twice"
```

---

### Task 10: Make sync non-destructive

**Files:**
- Modify: `hooks/useRecipeEditor.ts:66-106`, `app/editRecipe.tsx` (the sync button)

- [x] **Step 1: Point the fetch at the cached field** (landed in `ca55f5f`)

In `hooks/useRecipeEditor.ts`, in `fetchRecipeTitle`, replace `r.title = recipeTitle;`
with:

```ts
                // The cached xBloom name, not the user's. `displayName()`
                // prefers a local name, so refreshing can no longer discard
                // one — which is what made the old sync button destructive.
                r.xbloomName = recipeTitle;
```

- [x] **Step 2: Fix the auto-fetch condition** (landed in `ca55f5f`)

The effect below it fetches only when the title is empty. It should now fetch
when the *cached* name is empty:

```ts
        if (recipe &&
            recipe.xid &&
            recipe.xid.trim().length > 0 &&
            recipe.xbloomName.trim().length === 0) {
```

- [x] **Step 3: Disable the button when it cannot work, and label it**

In `app/editRecipe.tsx`, the sync button next to the name field: add
`accessibilityLabel="Refresh the name from xBloom"` and extend `disabled` to
cover the no-XID case. Today it silently does nothing when there is no XID, and
has no label at all.

**Correction:** the plan originally wrote the condition as
`!xid?.trim() && !shareId?.trim()`, but `fetchRecipeTitle` constructs
`new XBloomRecipe(r.xid)` and `handleReloadTitlePress` already early-returns
without an XID — a `shareId` alone does nothing. Including `shareId` in the
condition would have left the button enabled in exactly the inert case this
step exists to fix. The implemented condition is
`isLoadingTitle || !getRecipe()?.xid?.trim()`.

**Note:** Steps 1 and 2 already landed in commit `ca55f5f`, where deleting
`Recipe.title` forced `fetchRecipeTitle` and the auto-fetch guard onto
`xbloomName`. Only Step 3 remained.

- [ ] **Step 4: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Stop the sync button overwriting a name the user chose"
```

---

### Task 11: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Confirm the card format is untouched**

Run: `git diff main --stat -- library/Recipe.ts library/Pour.ts library/NFC.ts`

Then: `git diff main -- library/__tests__/Recipe.card.test.ts library/__tests__/cardFixtures.ts`

Expected: the card test and fixtures have an **empty diff**. `Recipe.ts` has
changed, but only by addition — confirm `parseData` and `getData` differ by
nothing beyond the deleted `console.log`.

- [ ] **Step 2: Run every check**

```bash
npm run typecheck && npm run lint && npm test && npx expo-doctor
```

Expected: 0 type errors; 0 lint errors (the 6 known `exhaustive-deps` warnings
remain); all suites pass; 21/21 checks.

- [ ] **Step 3: Confirm the removed API is really gone**

Run: `grep -rn "doesTitleExist\|RecipeWithAccent\|\.title" library/ hooks/ app/ components/ --include=*.ts --include=*.tsx | grep -v __tests__`

Expected: no matches except `IconButton`'s unrelated `title` prop.

- [ ] **Step 4: Commit any remainder and open the pull request**

```bash
git status
git push -u origin feature/data-model-persistence
```

Then write the PR description to a file and open it. The body is written to a
file rather than passed with `-m`, because this shell mangles escaped quotes
inside `-m` arguments.

```bash
cat > /tmp/pr-body.md <<'EOF'
Implements sub-project 2 of the UI overhaul: the data model and persistence.

- `Recipe.title` is replaced by `name` (the user's) and `xbloomName` (cached
  from the API), so refreshing from xBloom can no longer discard a name the
  user chose.
- Recipes gain `createdAt`, `source` and a persisted `accentIndex`. Migration
  is lazy, in the `Recipe(json)` constructor.
- Identity is the card payload, not the name: names need no longer be unique,
  and re-reading or re-importing a recipe opens the one already saved.
- Adds `library/Settings.ts`, backed by a new `settings` table.

The card byte format is unchanged; `Recipe.card.test.ts` and `cardFixtures.ts`
have an empty diff.
EOF
gh pr create --title "Data model and persistence" --body-file /tmp/pr-body.md
```

---

## Done

Sub-project 2 is complete when:

- A recipe has a local name, a cached xBloom name, a provenance and a persisted
  accent, and `title` no longer exists.
- Two recipes may share a name; identity is the card payload.
- Import and card read de-duplicate silently; explicit actions always write.
- `library/Settings.ts` stores one real setting.
- The card byte format and its characterisation tests are unchanged.
- Typecheck, lint, tests and expo-doctor are green.

## Deliberately not here

- List sorting and the name-field copy from #8 — sub-project 4.
- A React hook over the settings store, and the settings screen — sub-project 6.
- How the duplicate-detected reveal looks — sub-project 3.
