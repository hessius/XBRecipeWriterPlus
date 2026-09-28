# Machine model (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give XBRW++ a machine model it knows about, so an original xBloom owner gets their own machine's recipes instead of a Studio's, and close [#138](https://github.com/hessius/XBRecipeWriterPlus/issues/138).

**Architecture:** A `machineModel` setting is the single source of truth, defaulting to `studio`. A pure module maps it onto xBloom's `adaptedModel` discriminator, and that value is threaded explicitly as a parameter through the three client call sites and the share-minting API rather than read from a settings singleton inside library code. A best-effort Bluetooth read records what the connected machine says it is, but is only allowed to change the setting on a positive match against a known Studio string.

**Tech Stack:** TypeScript, Expo SDK 57, expo-sqlite (settings), react-native-ble-manager, Jest with jest-expo, Vercel serverless functions under `api/`.

**Spec:** `docs/superpowers/specs/2026-09-28-community-hub-design.md` §4.

---

## Context an engineer needs before starting

**`adaptedModel` is xBloom's machine discriminator.** `1` is the xBloom Studio, `2` is the original xBloom. The same pod returns a *different recipe* depending on it: grind 55 on a Studio is grind 26 on an Original for the same coffee. Only `1` and `2` return rows; `0` and `3` come back empty.

**Do not try to convert between the two grind scales.** 918 paired recipes say there is no arithmetic that does it (spec §2.3). Nothing in this plan converts anything.

**`adaptedModel` is load-bearing in two different ways**, and conflating them corrupts data:

1. It describes *which machine a recipe is for*. Minting a share link uses it this way.
2. It *partitions the service account's stored rows*. A row created under `1` is invisible to a lookup under `2`.

Use (2) is why `cloudLibrary` must read **both** partitions after this change. If it only read the user's current partition, a user who corrects their setting would have every previously minted link disappear from the walk, and `useShareRecipe`'s fingerprint check would then mint a duplicate row every time they shared. See spec §4.4.

**House rules that will bite you:**

- The React Compiler is on. Do not hand-write `useMemo`/`useCallback`. Do not read whole `props` inside a hook.
- `react-hooks/set-state-in-effect` is an **error**. State cannot be seeded or reset from an effect.
- All colour comes from `constants/colors.ts`. All timing from `constants/motion.ts`.
- User-facing copy uses no em dashes and avoids dashes generally.
- `@testing-library/react-native` v14: `render`, `fireEvent` and `renderHook` are **async**. Forget the `await` and the test silently passes for the wrong reason. Always render through `renderWithProviders` from `test-utils/render.tsx`.
- Tests that assert SQL behaviour must use `createTestDatabase` from `test-utils/sqlite.ts`, not a `jest.mock` of `expo-sqlite`.

**Commands:**

```bash
npm test                      # whole suite
npx jest path/to/file.test.ts # one file
npx jest path/to/f.test.ts -t "name"   # one test
npm run typecheck
npm run lint
```

---

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `library/machine/machineModel.ts` | The `MachineModel` type and its mapping onto `adaptedModel`. Pure, no I/O, no React. |
| `library/machine/__tests__/machineModel.test.ts` | Tests for the above. |
| `constants/machineCopy.ts` | The settings row's label, description and option words. Copy lives apart from layout, as `constants/brewCopy.ts` already does. |

**Modified:**

| Path | Change |
| --- | --- |
| `library/Settings.ts` | Three new keys: `machineModel`, `machineModelString`, `machineName`. Latter two added to `NOT_IN_BACKUP`. |
| `app/settings.tsx` | `machineModel` into `settingsSnapshot()`, and a choice row in the machine section. |
| `api/_lib/payload.ts` | `SharePayload.adaptedModel` widens to `1 | 2`; the validator accepts both; the sanitised payload echoes rather than hardcodes. |
| `api/_lib/xbloom.ts` | `recipeFields` echoes `payload.adaptedModel`; the mint's row lookup uses the model it created with. |
| `library/shareLink.ts` | `buildSharePayload` takes a `MachineModel`. |
| `hooks/useShareRecipe.ts` | Reads the setting and passes it down. |
| `library/cloud/cloudLibrary.ts` | Walks both partitions. |
| `library/XBloomRecipe.ts` | The `byXid` pod lookup takes a `MachineModel`. |
| `library/machine/Transport.ts` | Best-effort Device Information Service read on connect; the advertised name is returned rather than discarded. |
| `constants/machine.ts` | The DIS service and characteristic UUIDs, and the known Studio model strings. |
| `hooks/useMachine.ts` | Persists the two readings, and applies the setting only on a positive Studio match. |

---

## Task 1: The `MachineModel` type and its mapping

**Files:**
- Create: `library/machine/machineModel.ts`
- Test: `library/machine/__tests__/machineModel.test.ts`

- [x] **Step 1: Write the failing test**

Create `library/machine/__tests__/machineModel.test.ts`:

```ts
import {
    ADAPTED_MODEL,
    adaptedModelFor,
    isMachineModel,
    MACHINE_MODELS
} from "@/library/machine/machineModel";

describe("the machine model", () => {
    it("maps the Studio onto xBloom's partition 1", () => {
        expect(adaptedModelFor("studio")).toBe(1);
    });

    it("maps the original xBloom onto partition 2", () => {
        expect(adaptedModelFor("original")).toBe(2);
    });

    it("offers exactly the two models xBloom returns rows for", () => {
        // 0 and 3 come back empty from every endpoint. A third model here
        // would be a partition with nothing in it.
        expect([...MACHINE_MODELS]).toEqual(["studio", "original"]);
        expect(Object.values(ADAPTED_MODEL).sort((a, b) => a - b)).toEqual([1, 2]);
    });

    it("reads a stored value back, and refuses one it did not write", () => {
        expect(isMachineModel("studio")).toBe(true);
        expect(isMachineModel("original")).toBe(true);
        expect(isMachineModel("j15")).toBe(false);
        expect(isMachineModel("")).toBe(false);
        expect(isMachineModel(undefined)).toBe(false);
    });

    it("gives every model a distinct wire value", () => {
        // The Record forces an entry per model, but not a *different* one. Two
        // models sharing a partition would read as one machine to every endpoint.
        const values = MACHINE_MODELS.map(adaptedModelFor);
        expect(new Set(values).size).toBe(MACHINE_MODELS.length);
    });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx jest library/machine/__tests__/machineModel.test.ts`
Expected: FAIL, `Cannot find module '@/library/machine/machineModel'`.

- [x] **Step 3: Write the implementation**

Create `library/machine/machineModel.ts`:

```ts
/**
 * Which xBloom this phone is driving.
 *
 * xBloom's endpoints partition on an `adaptedModel` discriminator, and the same
 * pod returns a different recipe under each: grind 55 on a Studio is grind 26
 * on an original xBloom for the same coffee. Only 1 and 2 return rows at all.
 *
 * The two grind scales do not convert. 918 paired recipes from the community
 * hub give a best linear fit of R^2 = 0.444, landing within two grind steps on
 * 20% of pairs, so nothing here or anywhere else may translate one into the
 * other. Where both are needed, both are fetched.
 *
 * Filed under `machine/` because it is about which machine this is, not about
 * talking to one: nothing here touches the radio, and its consumers are the
 * settings store and the xBloom HTTP clients.
 */
export const MACHINE_MODELS = ["studio", "original"] as const;

export type MachineModel = typeof MACHINE_MODELS[number];

/** xBloom's wire value for each model. */
export const ADAPTED_MODEL: Record<MachineModel, 1 | 2> = {
    studio:   1,
    original: 2
};

/**
 * xBloom's wire value, named so the request builders and the payload validator
 * can import it rather than each restating the pair.
 *
 * Derived from `ADAPTED_MODEL` rather than written out, so it cannot drift from
 * the mapping the way a hand-maintained union would.
 */
export type AdaptedModel = typeof ADAPTED_MODEL[MachineModel];

export function adaptedModelFor(model: MachineModel): AdaptedModel {
    return ADAPTED_MODEL[model];
}

export function isMachineModel(value: unknown): value is MachineModel {
    return typeof value === "string" &&
        (MACHINE_MODELS as readonly string[]).includes(value);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx jest library/machine/__tests__/machineModel.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add library/machine/machineModel.ts library/machine/__tests__/machineModel.test.ts docs/superpowers/plans/2026-09-28-machine-model.md
git commit -m "Trim the machine model to what its consumers actually need"
```

---

## Task 2: The setting

**Files:**
- Modify: `library/Settings.ts` (add to `DEFAULTS`, `BackupExcluded`, `NOT_IN_BACKUP`)
- Modify: `app/settings.tsx` (`settingsSnapshot()`)
- Test: `library/__tests__/backup.test.ts` already holds the exhaustiveness test; confirm it still passes.

**Why this shape:** `settingsSnapshot()` returns `Record<Exclude<SettingKey, BackupExcluded>, unknown>`, so a key that is neither in the snapshot nor on `NOT_IN_BACKUP` is a **compile error**. That is the mechanism that stops a new setting being silently absent from backups, and it is why this task touches both files at once.

- [ ] **Step 1: Write the failing test**

Add to `library/__tests__/backup.test.ts`, inside the existing top-level `describe`:

```ts
it("carries the machine model, because it is a fact about what you own", () => {
    // The device id is excluded because it names this phone's pairing. The
    // model is not: a user restoring onto a new phone still owns the same
    // machine, and defaulting them back to Studio would undo the correction
    // they had to make by hand.
    const backup = buildBackup([], settingsSnapshot(), []);
    expect(Object.keys(backup.settings)).toContain("machineModel");
});
```

If `settingsSnapshot` is not already imported in that file, add:

```ts
import {settingsSnapshot} from "@/app/settings";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/backup.test.ts -t "because it is a fact about what you own"`
Expected: FAIL, the key is absent.

- [ ] **Step 3: Add the three keys to `Settings.ts`**

First the import, beside the two `import type` lines already at the top of the file:

```ts
import type {MachineModel} from './machine/machineModel';
```

`machineModel.ts` imports nothing from `Settings.ts`, so this is not a cycle.

In `library/Settings.ts`, inside `DEFAULTS`, immediately after the `machineDeviceId` entry:

```ts
    /**
     * Which xBloom this phone is driving.
     *
     * The setting is the truth and detection may only ever refine it. Reading
     * the model over Bluetooth only works for a machine we successfully
     * connect to, and `MACHINE_SERVICE` is the Studio's service: if an original
     * xBloom does not advertise it, its owner never connects, detection never
     * runs, and they would sit on a wrong default forever. Detection would help
     * everyone except the people it exists for.
     *
     * The default is Studio because that is what every user was served before
     * this key existed.
     */
    machineModel: "studio" as MachineModel,
    /**
     * What the connected machine said it was, verbatim.
     *
     * Recorded and not acted upon, except through a positive match against a
     * string we have read off real hardware. We own no original xBloom, so
     * "not the Studio's string" cannot be verified as meaning Original, and it
     * would misfire on a firmware revision. Stored so that #138's first open
     * question can eventually be answered from devices rather than guessed at.
     */
    machineModelString: "",
    /**
     * The name the machine advertised, which `Transport.scan` has always read
     * and thrown away. Same purpose as `machineModelString`: evidence.
     */
    machineName: "",
```

Then extend the exclusions further down the file:

```ts
export type BackupExcluded =
    "machineDeviceId" | "lastCardRead" | "labsUnlocked" | "beanconquerorHandoff" |
    "machineModelString" | "machineName";
export const NOT_IN_BACKUP: readonly SettingKey[] = [
    "machineDeviceId", "lastCardRead", "labsUnlocked", "beanconquerorHandoff",
    "machineModelString", "machineName"
];
```

Add to the `NOT_IN_BACKUP` doc comment, after the `labsUnlocked` paragraph:

```
 * `machineModelString` and `machineName` are held out because they are
 * readings, and a reading restored onto a phone that never took it is not
 * evidence any more. The whole reason they are stored is to be trustworthy
 * about what a real machine said.
```

- [ ] **Step 4: Add `machineModel` to the snapshot**

In `app/settings.tsx`, inside `settingsSnapshot()`, beside the other machine keys:

```ts
        machineModel: settings.get("machineModel"),
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx jest library/__tests__/backup.test.ts && npm run typecheck`
Expected: PASS, and no type errors. If `settingsSnapshot` complains about a missing key you have put one of the three in the wrong list.

- [ ] **Step 6: Commit**

```bash
git add library/Settings.ts app/settings.tsx library/__tests__/backup.test.ts
git commit -m "Store which machine this phone drives, and what it said it was"
```

---

## Task 3: The share payload accepts either partition

**Files:**
- Modify: `api/_lib/payload.ts:110` (the `SharePayload` type), `:162` (the check), `:235` (the sanitised copy)
- Test: `api/__tests__/payload.test.ts:96`

**Why:** this is the server-side validator for the share-minting API. It currently hard-rejects anything but `1`. It is a genuine trust boundary and stays one: `0` and `3` return nothing upstream and must still be refused.

- [ ] **Step 1: Replace the existing test**

In `api/__tests__/payload.test.ts`, replace the test currently reading `"rejects any adaptedModel except the partition used for lookup"`:

```ts
    it("accepts either machine, because the same recipe is two rows", () => {
        expect(validateSharePayload({...valid(), adaptedModel: 1})).toBeNull();
        expect(validateSharePayload({...valid(), adaptedModel: 2})).toBeNull();
    });

    it("rejects a partition xBloom returns nothing for", () => {
        // Only 1 and 2 have rows. A link minted under 0 or 3 would be a row
        // nothing can ever look up again.
        expect(validateSharePayload({...valid(), adaptedModel: 0}))
            .toBe("adaptedModel must be 1 or 2");
        expect(validateSharePayload({...valid(), adaptedModel: 3}))
            .toBe("adaptedModel must be 1 or 2");
        expect(validateSharePayload({...valid(), adaptedModel: "1"}))
            .toBe("adaptedModel must be 1 or 2");
    });

    it("mints under the partition it was given, not a constant", () => {
        const {payload} = parseSharePayload({...valid(), adaptedModel: 2});
        expect(payload?.adaptedModel).toBe(2);
    });
```

If `parseSharePayload` is not yet imported in that file, add it to the existing import from `../_lib/payload`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest api/__tests__/payload.test.ts`
Expected: FAIL. The first says `"adaptedModel must be 1"` where `null` was expected; the third returns `1`.

- [ ] **Step 3: Widen the type**

In `api/_lib/payload.ts`, in the `SharePayload` type:

```ts
    adaptedModel: 1 | 2;
```

- [ ] **Step 4: Widen the check**

Replace the check at roughly line 162:

```ts
    if (p.adaptedModel !== 1 && p.adaptedModel !== 2) {
        return {payload: null, reason: "adaptedModel must be 1 or 2"};
    }
```

- [ ] **Step 5: Echo rather than hardcode**

In the returned payload at roughly line 235:

```ts
            adaptedModel:        p.adaptedModel as 1 | 2,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest api/__tests__/payload.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/payload.ts api/__tests__/payload.test.ts
git commit -m "Let a share payload name either machine"
```

---

## Task 4: The mint looks its row up where it made it

**Files:**
- Modify: `api/_lib/xbloom.ts:113` (`recipeFields`), `:169` (the lookup)

**Why:** minting creates a row and then finds it again to read the server's share link off it. Those two calls must name the same partition or the lookup sees nothing and the mint fails. It is currently `1` in both places by coincidence of being hardcoded twice; after Task 3 it has to follow the payload.

- [ ] **Step 1: Write the failing test**

Add to `api/__tests__/xbloom.test.ts` (create the file if it does not exist, following the fetch-mocking pattern already used in `api/__tests__/`):

```ts
import {mintShareLink} from "../_lib/xbloom";

describe("minting a share link", () => {
    it("looks the new row up in the partition it created it in", async () => {
        const sent: Record<string, unknown>[] = [];
        global.fetch = jest.fn(async (_url: string, init: {body: string}) => {
            const body = JSON.parse(init.body);
            sent.push(body);
            if (body.pourDataJSONStr !== undefined) {
                return {ok: true, json: async () => ({result: "success", tableId: 42})};
            }
            return {
                ok: true,
                json: async () => ({
                    list: [{tableId: 42, shareRecipeLink: "https://share-h5.xbloom.com/?id=x"}]
                })
            };
        }) as unknown as typeof fetch;

        await mintShareLink({
            memberId: 1,
            token: "t",
            payload: {adaptedModel: 2, pourDataJSONStr: "[]", pourCount: 0}
        });

        const create = sent.find((b) => b.pourDataJSONStr !== undefined);
        const lookup = sent.find((b) => b.pageNumber !== undefined);
        expect(create?.adaptedModel).toBe(2);
        expect(lookup?.adaptedModel).toBe(2);
    });
});
```

Adjust the `mintShareLink` call to the function's real signature, which you can read at the top of `api/_lib/xbloom.ts`. The assertion is the point: both bodies carry the same `adaptedModel`, and it is the one that was passed in.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest api/__tests__/xbloom.test.ts`
Expected: FAIL, both bodies carry `1`.

- [ ] **Step 3: Echo the model in `recipeFields`**

In `api/_lib/xbloom.ts`, in `recipeFields`:

```ts
        adaptedModel:        payload.adaptedModel,
```

- [ ] **Step 4: Use the same model in the lookup**

In the mint's list walk at roughly line 169:

```ts
        const list = await post("tuMyTeaRecipeCreated.tuhtml", {
            ...authFields(memberId, token),
            pageNumber,
            countPerPage: LIST_PAGE_SIZE,
            adaptedModel: payload.adaptedModel
        }, true) as {list?: {tableId?: number; shareRecipeLink?: unknown}[]};
```

Update the comment above `authFields` at roughly line 79, which currently says `adaptedModel` "belongs to the payload and to the lookup, and the two must agree": that is still true and now enforced rather than hoped for. Append:

```
 * Both now read it from the payload, so they cannot drift apart.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest api/__tests__/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/xbloom.ts api/__tests__/xbloom.test.ts
git commit -m "Look a minted row up where it was minted"
```

---

## Task 5: `buildSharePayload` takes a machine

**Files:**
- Modify: `library/shareLink.ts:108`, `:138`
- Modify: `hooks/useShareRecipe.ts:5`
- Test: `library/__tests__/shareLink.test.ts`

**Note on the fingerprint:** `canonicalSnapshot` hashes the payload, which includes `adaptedModel`. So changing the setting changes the fingerprint and causes a fresh mint. That is correct and deliberate, not a bug to design around: a recipe for an Original genuinely is a different row from the same recipe for a Studio.

- [ ] **Step 1: Write the failing test**

Add to `library/__tests__/shareLink.test.ts`:

```ts
it("mints under the machine it was given", () => {
    const recipe = aSharableRecipe();
    expect(buildSharePayload(recipe, "studio").adaptedModel).toBe(1);
    expect(buildSharePayload(recipe, "original").adaptedModel).toBe(2);
});

it("gives the two machines different fingerprints", () => {
    // The same brew on two machines is two rows upstream, so it must not be
    // possible for one link to stand in for the other.
    const recipe = aSharableRecipe();
    expect(canonicalSnapshot(buildSharePayload(recipe, "studio")))
        .not.toBe(canonicalSnapshot(buildSharePayload(recipe, "original")));
});
```

Use whatever helper the existing tests in that file use to build a sharable recipe; `aSharableRecipe()` above is a stand-in for it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/shareLink.test.ts`
Expected: FAIL, `buildSharePayload` takes one argument.

- [ ] **Step 3: Add the parameter**

In `library/shareLink.ts`, add the import:

```ts
import {adaptedModelFor, type MachineModel} from "@/library/machine/machineModel";
```

Change the signature:

```ts
export function buildSharePayload(recipe: Recipe, model: MachineModel): SharePayload {
```

And replace the hardcoded value at roughly line 138, keeping the existing comment and extending it:

```ts
        // Load-bearing twice over: it says which machine the recipe is for, and
        // it partitions the account's rows, so the mint's own lookup has to use
        // the same value. Passed in rather than read from settings here, so this
        // module stays free of I/O and the value is visible in a test.
        adaptedModel:        adaptedModelFor(model),
```

- [ ] **Step 4: Update the one caller**

In `hooks/useShareRecipe.ts`, read the setting and pass it. Add:

```ts
import {useSetting} from "@/hooks/useSetting";
```

Inside the hook, beside the other settings reads:

```ts
    const [machineModel] = useSetting("machineModel");
```

And at the `buildSharePayload` call site:

```ts
    const payload = buildSharePayload(recipe, machineModel);
```

If there is more than one call in that file, update every one. Do not reach for `sharedSettings()` here: this is a hook and `useSetting` is how hooks read settings.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/__tests__/shareLink.test.ts hooks/__tests__/useShareRecipe.test.ts && npm run typecheck`
Expected: PASS, and no type errors. The typecheck is what proves you found every caller.

- [ ] **Step 6: Commit**

```bash
git add library/shareLink.ts hooks/useShareRecipe.ts library/__tests__/shareLink.test.ts
git commit -m "Mint a share link for the machine the user actually owns"
```

---

## Task 6: The cloud library reads both partitions

**Files:**
- Modify: `library/cloud/cloudLibrary.ts:28-50`
- Test: `library/cloud/__tests__/cloudLibrary.test.ts`

**Why this is not a substitution.** This function answers "what has this account minted". That answer does not depend on which machine the user owns today. If it read only the current partition, a user who corrected their setting would find every earlier link missing, and `useShareRecipe`'s fingerprint check would mint a duplicate row on every subsequent share. Spec §4.4.

- [ ] **Step 1: Write the failing test**

Add to `library/cloud/__tests__/cloudLibrary.test.ts`:

```ts
it("reads both partitions, because a link minted before a correction still exists", async () => {
    const asked: number[] = [];
    const post = jest.fn(async (_path: string, body: Record<string, unknown>) => {
        asked.push(body.adaptedModel as number);
        return {list: [{tableId: body.adaptedModel}]};
    });

    const rows = await fetchCloudRecipes({memberId: 1, token: "t"}, post);

    expect(new Set(asked)).toEqual(new Set([1, 2]));
    expect(rows.map((r) => r.tableId).sort()).toEqual([1, 2]);
});
```

Match the existing tests in that file for how `post` is injected or mocked; if the module imports `post` directly rather than receiving it, mock the module with `jest.mock` the way the neighbouring tests already do.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/cloud/__tests__/cloudLibrary.test.ts`
Expected: FAIL, only partition `1` was asked for.

- [ ] **Step 3: Walk both**

In `library/cloud/cloudLibrary.ts`, add the import:

```ts
import {ADAPTED_MODEL} from "@/library/machine/machineModel";
```

Wrap the existing page loop in a loop over both partitions. The existing body is unchanged apart from the `adaptedModel` line:

```ts
    // Both partitions, not the user's current one. This answers "what has this
    // account minted", and that does not change when somebody corrects which
    // machine they own. Reading only the current partition would hide every
    // earlier link from the fingerprint check, which would then mint a
    // duplicate row on every share. See the design spec, section 4.4.
    for (const adaptedModel of Object.values(ADAPTED_MODEL)) {
        for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
            const response = await post(
                "tuMyTeaRecipeCreated.tuhtml",
                {
                    ...authFields(session.memberId, session.token),
                    pageNumber,
                    countPerPage: PAGE_SIZE,
                    adaptedModel,
                },
                true,
                signal
            );
            // ... the existing body of the loop, unchanged ...
        }
    }
```

Take care with the existing early-exit logic inside the loop: a `break` that ended the page walk must still end only the **page** walk, not the partition walk. Read the existing body carefully before wrapping it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest library/cloud/`
Expected: PASS, including the pre-existing tests about partial page walks.

- [ ] **Step 5: Commit**

```bash
git add library/cloud/cloudLibrary.ts library/cloud/__tests__/cloudLibrary.test.ts
git commit -m "Walk both partitions, so correcting your machine does not hide your links"
```

---

## Task 7: The pod lookup asks for the right machine

**Files:**
- Modify: `library/XBloomRecipe.ts:263`
- Test: `library/__tests__/XBloomRecipe.endpoint.test.ts` (exists; the endpoint tests live there, and `XBloomRecipe.bypass.test.ts` and `xbloomPodCoffee.test.ts` are the other two halves)

**Scope note:** `adaptedModel` is sent only on the `byXid` path, which is the pod lookup at `tRecipeDetailOfPods.thtml`. The share-id path at `RecipeDetail.html` does not send one and does not need one. This is also why the community hub work in phase 2 is unaffected: hub rows import by share link.

- [ ] **Step 1: Write the failing test**

Add to `library/__tests__/XBloomRecipe.endpoint.test.ts`, following that file's existing fetch-mocking pattern:

```ts
it("asks the pod endpoint for the machine the user owns", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({recipeVo: null})
    } as Response);

    await new XBloomRecipe("NLC001", {model: "original"}).fetchRecipeDetail();

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.adaptedModel).toBe(2);
});
```

Adjust the constructor call to the class's real signature, which you can read at the top of `library/XBloomRecipe.ts`. If the class currently takes `(id, byXid)`, add the model as an option rather than a positional boolean's neighbour.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/XBloomRecipe.endpoint.test.ts`
Expected: FAIL, the body carries `1`.

- [ ] **Step 3: Thread the model in**

In `library/XBloomRecipe.ts`, add the import:

```ts
import {adaptedModelFor, type MachineModel} from "@/library/machine/machineModel";
```

Store it on the instance, defaulting to `studio` so existing callers keep working, and use it in the `byXid` body:

```ts
        const requestBody = this.byXid ? {
            ...baseBody,
            xid:               this.id,
            languageType:      0,
            // The pod carries one coffee and two recipes. Asking under the
            // wrong machine returns a grind roughly twice what this machine
            // expects, which is what #138 was opened about.
            adaptedModel:      adaptedModelFor(this.model),
            isRefreshScanTime: 1,
            appVersion:        "2.1.2"
        } : {
```

- [ ] **Step 4: Pass the setting from the import hook**

In `hooks/useRecipeImport.ts`, read the setting with `useSetting("machineModel")` and pass it wherever `XBloomRecipe` is constructed. Find every construction with:

```bash
grep -rn "new XBloomRecipe" --include=*.ts --include=*.tsx .
```

Update each one. A call site that is not inside a React hook or component reads it with `sharedSettings().get("machineModel")` instead.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/__tests__/ hooks/__tests__/useRecipeImport.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add library/XBloomRecipe.ts hooks/useRecipeImport.ts library/__tests__/XBloomRecipe.endpoint.test.ts
git commit -m "Ask a pod for this machine's recipe, not the Studio's"
```

---

## Task 8: The settings row

**Files:**
- Create: `constants/machineCopy.ts`
- Modify: `components/MachineSection.tsx`
- Test: `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `app/__tests__/settings.test.tsx`:

```ts
it("lets you say which xBloom you own", async () => {
    await renderWithProviders(<SettingsScreen/>);
    expect(await screen.findByText(MACHINE_MODEL_LABEL)).toBeTruthy();
    expect(screen.getByText("Studio")).toBeTruthy();
    expect(screen.getByText("Original")).toBeTruthy();
});
```

Add the import:

```ts
import {MACHINE_MODEL_LABEL} from "@/constants/machineCopy";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest app/__tests__/settings.test.tsx -t "which xBloom you own"`
Expected: FAIL, `Cannot find module '@/constants/machineCopy'`.

- [ ] **Step 3: Write the copy**

Create `constants/machineCopy.ts`:

```ts
/**
 * What the machine settings say.
 *
 * Copy lives apart from layout here the way `constants/brewCopy.ts` already
 * does, so a wording change is one edit and not a hunt through a screen.
 *
 * No dashes: they read as machine-written, and this is the app talking.
 */
export const MACHINE_MODEL_LABEL = "Your xBloom";

export const MACHINE_MODEL_DESCRIPTION =
    "The two machines grind on different scales, so a recipe written for one " +
    "is wrong on the other. Pick yours and the app will ask xBloom for the " +
    "right version.";

export const MACHINE_MODEL_OPTIONS = [
    {value: "studio",   label: "Studio"},
    {value: "original", label: "Original"}
] as const;
```

- [ ] **Step 4: Add the row**

In `components/MachineSection.tsx`, add the imports:

```ts
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import {
    MACHINE_MODEL_DESCRIPTION,
    MACHINE_MODEL_LABEL,
    MACHINE_MODEL_OPTIONS
} from "@/constants/machineCopy";
import {isMachineModel} from "@/library/machine/machineModel";
import {useSetting} from "@/hooks/useSetting";
```

Inside the component:

```ts
    const [machineModel, setMachineModel] = useSetting("machineModel");
```

And in the returned tree, above the pairing controls, because which machine you own is prior to which one you are connected to:

```tsx
            <SettingsChoiceRow
                label={MACHINE_MODEL_LABEL}
                description={MACHINE_MODEL_DESCRIPTION}
                value={machineModel}
                options={MACHINE_MODEL_OPTIONS}
                onChange={(value) => {
                    if (isMachineModel(value)) setMachineModel(value);
                }}
            />
```

The guard is not ceremony: `SettingsChoiceRow`'s `onChange` is typed `(value: string) => void`, so without it the setting's union type is lost.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest app/__tests__/settings.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add constants/machineCopy.ts components/MachineSection.tsx app/__tests__/settings.test.tsx
git commit -m "Ask which xBloom this is"
```

---

## Task 9: Read what the machine says it is

**Files:**
- Modify: `constants/machine.ts`
- Modify: `library/machine/Transport.ts:22` (the `MachineTransport` interface), `:279-289` (connect)
- Modify: `library/machine/__tests__/FakeTransport.ts`
- Modify: `library/machine/Machine.ts` (pass the readings through)
- Test: `library/machine/__tests__/Transport.test.ts`

**The rule this task implements:** record everything, act on almost nothing. A positive match against a string we have read off a real Studio sets the setting. Anything else is stored and ignored. We own no original xBloom, so "not the Studio's string" cannot be verified as meaning Original, and it would misfire on a firmware revision.

**`MachineTransport` is an interface, not just a class.** `Machine` is driven by a scripted fake in every test above this layer, which is the entire reason the interface exists. Adding a field to `BleTransport` alone would not compile, and would not be reachable from `useMachine`.

- [ ] **Step 1: Write the failing test**

Add to `library/machine/__tests__/Transport.test.ts`:

```ts
it("reads what the machine calls itself", async () => {
    BleManager.read = jest.fn(async () => [0x58, 0x31, 0x35]); // "X15"
    const transport = new BleTransport();
    await transport.connect("device-1");
    expect(transport.modelNumber).toBe("X15");
    expect(BleManager.read).toHaveBeenCalledWith(
        "device-1", DEVICE_INFO_SERVICE, MODEL_NUMBER_CHARACTERISTIC
    );
});

it("connects anyway when the machine will not say", async () => {
    // Older firmware need not implement the Device Information Service, and a
    // machine that brews perfectly well is not a connection failure.
    BleManager.read = jest.fn(async () => { throw new Error("no such characteristic"); });
    const transport = new BleTransport();
    await expect(transport.connect("device-1")).resolves.toBeUndefined();
    expect(transport.modelNumber).toBe("");
});
```

Add the imports for `DEVICE_INFO_SERVICE` and `MODEL_NUMBER_CHARACTERISTIC` from `@/constants/machine`, and follow the file's existing pattern for mocking `BleManager`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/machine/__tests__/Transport.test.ts`
Expected: FAIL, `Cannot find name 'DEVICE_INFO_SERVICE'`.

- [ ] **Step 3: Add the UUIDs and the known strings**

Append to `constants/machine.ts`:

```ts
/**
 * The standard Bluetooth Device Information Service, and the characteristic
 * that carries the model number.
 *
 * Not xBloom's own service: these are assigned numbers every compliant device
 * may implement, and many do not. Every read of them is best effort.
 */
export const DEVICE_INFO_SERVICE = "0000180A-0000-1000-8000-00805F9B34FB";
export const MODEL_NUMBER_CHARACTERISTIC = "00002A24-0000-1000-8000-00805F9B34FB";

/**
 * Model strings that are certainly an xBloom Studio.
 *
 * Deliberately empty until somebody reads one off real hardware and adds it.
 * An empty list means detection never fires, which is the correct behaviour
 * for a guess we cannot check: the setting simply stays where the user left it.
 *
 * Only ever matched positively. A string that is not on this list is **not**
 * evidence of an original xBloom, because we own none to read, and treating it
 * as such would also misfire on a firmware revision. See issue #138.
 */
export const STUDIO_MODEL_STRINGS: readonly string[] = [];
```

- [ ] **Step 4: Read it on connect**

In `library/machine/Transport.ts`, add to the imports from `@/constants/machine`:

```ts
    DEVICE_INFO_SERVICE,
    MODEL_NUMBER_CHARACTERISTIC,
```

Add two public fields beside `deviceId`:

```ts
    /** What the machine last said it was, or empty when it would not say. */
    public modelNumber = "";
    /** The name the machine advertised when it was found. */
    public advertisedName = "";
```

In `scan`, where the peripheral is accepted, record the name as well as returning it:

```ts
                    this.advertisedName = name;
                    found.set(peripheral.id, {id: peripheral.id, name});
```

In `connect`, after `negotiateMtu` and before `this.deviceId = id`:

```ts
        // Best effort, like the MTU above. The Device Information Service is
        // optional and older firmware need not carry it, so a machine that
        // will not say what it is still connects and still brews. Recorded
        // rather than acted on here: what to do with the answer is a decision
        // for the layer that owns the setting.
        await this.readModelNumber(id);
        this.deviceId = id;
```

And the method itself, beside `negotiateMtu`:

```ts
    private async readModelNumber(id: string): Promise<void> {
        try {
            const bytes = await BleManager.read(
                id, DEVICE_INFO_SERVICE, MODEL_NUMBER_CHARACTERISTIC
            );
            this.modelNumber = String.fromCharCode(...bytes).replace(/\0+$/, "").trim();
        } catch {
            this.modelNumber = "";
        }
    }
```

The trailing-NUL strip is not defensive padding: a fixed-width GATT string characteristic is conventionally NUL-padded, and an unstripped one would never match a string constant.

- [ ] **Step 5: Widen the interface and the fake**

In `library/machine/Transport.ts`, add to the `MachineTransport` interface, below `scan`:

```ts
    /** What the connected machine says it is, or empty when it will not say. */
    readonly modelNumber: string;
    /** The name the machine advertised when it was found. */
    readonly advertisedName: string;
```

In `library/machine/__tests__/FakeTransport.ts`, add the two fields beside the other public knobs so a test can script them:

```ts
    public modelNumber = "";
    public advertisedName = "XBLOOM TEST";
```

- [ ] **Step 6: Pass them through `Machine`**

`useMachine` holds a `Machine`, not a transport, so the readings have to be reachable from there. In `library/machine/Machine.ts`, beside the other delegating members:

```ts
    /** What the radio last heard the machine call itself. Delegated, not stored:
     *  a copy here would go stale the moment the transport reconnected. */
    get modelNumber(): string { return this.transport.modelNumber; }
    get advertisedName(): string { return this.transport.advertisedName; }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx jest library/machine/ && npm run typecheck`
Expected: PASS, including the pre-existing connect tests, and no type errors. The typecheck is what proves the fake satisfies the widened interface.

- [ ] **Step 8: Commit**

```bash
git add constants/machine.ts library/machine/Transport.ts library/machine/Machine.ts \
        library/machine/__tests__/FakeTransport.ts library/machine/__tests__/Transport.test.ts
git commit -m "Ask the machine what it is, and accept that it may not say"
```

---

## Task 10: Store the readings, and act only on a certain one

**Files:**
- Modify: `hooks/useMachine.ts` (the `LinkStore` type, both of its implementations, and `attemptLink`)
- Test: `hooks/__tests__/useMachine.test.ts`

**Where this goes, and why not in the hook body.** `useMachine` does not receive a settings store it can be handed in a test. It reaches for `sharedSettings()` through a small injected seam called `LinkStore`, whose comment says "Injected, so the algorithm is testable". That is the seam to extend. Writing settings directly from the hook body instead would be both untestable and a lint error: `react-hooks/set-state-in-effect` is an error in this repo.

The write belongs in `attemptLink`, after the connect has succeeded, and **outside** the existing `if (id !== remembered)` block. That block only fires when the remembered id changed; the readings should be refreshed on every successful connect, because firmware can change under a machine whose id did not.

- [ ] **Step 1: Write the failing test**

Add to `hooks/__tests__/useMachine.test.ts`, inside the existing `describe`:

```ts
it("records what the machine said, without touching the setting", async () => {
    const transport = new FakeTransport();
    transport.modelNumber = "XB-MYSTERY-9";
    transport.advertisedName = "XBLOOM-77";
    const recorded: {model: string; name: string}[] = [];
    const store = {
        rememberedId: () => "AA:BB",
        rememberId: () => {},
        recordMachine: (reading: {model: string; name: string}) => { recorded.push(reading); }
    };

    await openLink(new Machine(transport, {frameGapMs: 0}), store, async () => true);

    expect(recorded).toEqual([{model: "XB-MYSTERY-9", name: "XBLOOM-77"}]);
});

it("records the reading even when the machine was already remembered", async () => {
    // Firmware can change under a machine whose identifier did not, so this
    // must not ride along on the "new machine" branch.
    const transport = new FakeTransport();
    transport.modelNumber = "XB-2";
    const recorded: unknown[] = [];
    const store = {
        rememberedId: () => "AA:BB",
        rememberId: () => { throw new Error("should not re-remember a known machine"); },
        recordMachine: (reading: unknown) => { recorded.push(reading); }
    };

    await openLink(new Machine(transport, {frameGapMs: 0}), store, async () => true);

    expect(recorded).toHaveLength(1);
});
```

Then a test for the guarded correction, which reads the settings seam the hook actually uses:

```ts
it("leaves the setting alone for a machine it does not recognise", async () => {
    mockSeed.machineModel = "original";
    const transport = new FakeTransport();
    transport.modelNumber = "XB-MYSTERY-9";

    const {result} = await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));
    await act(async () => { await result.current.connect(); });

    // Unrecognised is not evidence of anything. The user's answer stands.
    expect(result.current.machineModel).toBe("original");
});

it("corrects the setting when the machine is certainly a Studio", async () => {
    mockSeed.machineModel = "original";
    const transport = new FakeTransport();
    transport.modelNumber = STUDIO_MODEL_STRINGS[0] ?? "nothing matches an empty list";

    const {result} = await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));
    await act(async () => { await result.current.connect(); });

    // Written so it passes with STUDIO_MODEL_STRINGS empty and starts asserting
    // real behaviour the moment Task 11 fills it in, without being edited.
    const expected = STUDIO_MODEL_STRINGS.length > 0 ? "studio" : "original";
    expect(result.current.machineModel).toBe(expected);
});
```

Add the import:

```ts
import {STUDIO_MODEL_STRINGS} from "@/constants/machine";
```

`mockSeed` is the existing per-test settings seed at the top of the file, and `beforeEach` already clears it. `FakeTransport` is `@/library/machine/__tests__/FakeTransport`. Both are already imported.

Remember `renderHook` is async in RNTL v14, and an `unmount()` must be wrapped in `await act(...)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest hooks/__tests__/useMachine.test.ts`
Expected: FAIL, `recordMachine` is not part of `LinkStore` and nothing calls it.

- [ ] **Step 3: Widen `LinkStore`**

In `hooks/useMachine.ts`, extend the type at roughly line 42:

```ts
/** What the radio heard about the machine itself, as opposed to the link. */
export type MachineReading = {model: string; name: string};

/** Where the remembered machine is kept. Injected, so the algorithm is testable. */
export type LinkStore = {
    rememberedId: () => string;
    rememberId: (id: string) => void;
    /**
     * Record what the machine said it was.
     *
     * Separate from `rememberId` because it answers a different question. The
     * id is how to find this machine again; this is what the machine is, and
     * it is kept as evidence rather than as configuration. See issue #138.
     */
    recordMachine: (reading: MachineReading) => void;
};
```

- [ ] **Step 4: Implement it in both stores**

In `settingsStore()` at roughly line 35:

```ts
function settingsStore(): LinkStore {
    return {
        rememberedId: () => sharedSettings().get("machineDeviceId"),
        rememberId: (id) => sharedSettings().set("machineDeviceId", id),
        recordMachine: (reading) => applyMachineReading(sharedSettings(), reading)
    };
}
```

And in the hook's own store at roughly line 390, beside `rememberId: setRemembered`:

```ts
                recordMachine: (reading) => applyMachineReading(sharedSettings(), reading),
```

- [ ] **Step 5: Write the rule in one place**

Add to `hooks/useMachine.ts`, above `settingsStore`:

```ts
/**
 * Store what the machine said, and change the setting only when it is certain.
 *
 * The reading is kept always. It is allowed to overrule the user only on a
 * positive match against a string read off real hardware, because a string we
 * have never seen is not evidence of an original xBloom: we own none to read
 * one from, and a firmware revision would produce an unfamiliar string too.
 * `STUDIO_MODEL_STRINGS` is empty until somebody fills it in, and an empty list
 * matches nothing, so detection is inert rather than wrong.
 */
function applyMachineReading(settings: Settings, reading: MachineReading): void {
    settings.set("machineModelString", reading.model);
    settings.set("machineName", reading.name);
    if (STUDIO_MODEL_STRINGS.includes(reading.model)) {
        settings.set("machineModel", "studio");
    }
}
```

Add the import for `STUDIO_MODEL_STRINGS` from `@/constants/machine`, and for the `Settings` type from `@/library/Settings` if it is not already imported.

- [ ] **Step 6: Call it on every successful connect**

In `attemptLink`, after the `try`/`catch` around `machine.connect(id)` and **before** the existing `if (id !== remembered)` block:

```ts
    // Every successful connect, not only a new machine: firmware can change
    // under an identifier that did not.
    store.recordMachine({model: machine.modelNumber, name: machine.advertisedName});
    if (id !== remembered) {
```

- [ ] **Step 7: Expose the setting on the link**

So the hook's consumers and the tests above can read it, add to the `MachineLink` type and to the object the hook returns:

```ts
    /** Which machine the user says this is. The setting, not a reading. */
    machineModel: MachineModel;
```

In the hook body, beside the other `useSetting` reads:

```ts
    const [machineModel] = useSetting("machineModel");
```

Import the type from `@/library/machine/machineModel`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx jest hooks/__tests__/useMachine.test.ts && npm run typecheck`
Expected: PASS, and no type errors. The typecheck proves you updated every `LinkStore` literal; there are two in this file and there may be more in tests.

- [ ] **Step 9: Commit**

```bash
git add hooks/useMachine.ts hooks/__tests__/useMachine.test.ts
git commit -m "Remember what the machine said, and believe it only when it is sure"
```

---

## Task 11: Read a real Studio and fill in the blank

**Files:**
- Modify: `constants/machine.ts` (`STUDIO_MODEL_STRINGS`)

This task needs a physical xBloom Studio and cannot be done in a simulator.

- [ ] **Step 1: Build to a device**

```bash
npm run ios -- --device
```

Target the iPhone 17 Pro. NFC and Bluetooth both need real hardware.

- [ ] **Step 2: Connect to the machine, then read the stored value**

Pair as usual, then look at the machine console in Settings. If the console does not display `machineModelString`, add a diagnostic line there showing it, following the pattern of the other console readouts.

- [ ] **Step 3: Record it**

Put the exact string into `constants/machine.ts`:

```ts
export const STUDIO_MODEL_STRINGS: readonly string[] = ["<the exact string, verbatim>"];
```

If the read came back empty, leave the array empty and note in the commit message that this firmware does not implement the Device Information Service. That is a real finding and belongs on #138.

- [ ] **Step 4: Confirm the guarded correction now has teeth**

Run: `npx jest hooks/__tests__/useMachine.test.ts`
Expected: PASS. The third test now asserts `"studio"` rather than `"original"`, without having been edited.

- [ ] **Step 5: Commit**

```bash
git add constants/machine.ts
git commit -m "Record what a real Studio calls itself"
```

---

## Task 12: Close the loop on the docs and the issue

**Files:**
- Modify: `docs/machine-integration/cloud-api.md`
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1: Update the cloud API notes**

`api/_lib/xbloom.ts:80` points at `docs/machine-integration/cloud-api.md` for the `adaptedModel` reasoning. Update that document: the single-partition choice recorded there has been replaced. Say that minting follows the user's machine, that the mint's lookup follows the payload, and that the library walk reads both partitions and why.

- [ ] **Step 2: Update the architecture contract**

`.github/copilot-instructions.md` does not yet mention the machine model. Add a line to the `library/` section:

```
  - `machine/machineModel.ts` — which xBloom this phone drives, and its `adaptedModel` wire value. The two machines grind on different scales and the scales **do not convert** (918 paired hub recipes, R^2 = 0.444); anywhere both are needed, both are fetched. `adaptedModel` also partitions the service account's rows, which is why `cloudLibrary` reads both and only minting follows the setting.
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm run lint && npm test && npx expo-doctor
```

Expected: all four green. CI runs exactly these and expo-doctor is a hard failure.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/machine-integration/cloud-api.md .github/copilot-instructions.md
git commit -m "Write down that there are two machines"
git push -u origin community-hub
```

Open the PR against `hessius/XBRecipeWriterPlus`, closing #138. Always pass `--repo hessius/XBRecipeWriterPlus`: `gh` resolves to the upstream fork otherwise.

---

## Verification before calling this done

- [ ] An original xBloom owner can set their machine, and a pod import returns a grind in the 2 to 30 band rather than 32 to 74.
- [ ] Switching the setting back and forth does not create duplicate rows in the service account. Share a recipe, switch, switch back, share again, and confirm the same link comes back.
- [ ] A share link minted as Original still opens.
- [ ] The cloud library still lists everything it listed before the change.
- [ ] `machineModel` survives a backup and restore; `machineModelString` and `machineName` do not.
- [ ] A machine that does not implement the Device Information Service still connects and brews.

## Not in this plan

- **Widening `GRIND_SIZE`** in `cardLimits.ts`. The encoder emits `value - 40` and an Original's 26 would be a negative byte. Card writing for an Original is unsolved and stays unsolved.
- **The BLE wire format.** `protocol.ts` is the Studio's. Whether an Original speaks it is unknown and untestable here.
- **Anything about the community hub.** That is phase 2, and it depends only on the setting this plan adds.
