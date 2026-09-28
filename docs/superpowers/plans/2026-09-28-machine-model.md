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
- Modify: `app/settings.tsx` (the `settingsSnapshot()` object, a `useSetting` read, and `applySettings`)
- Test: `app/__tests__/settings.test.tsx`

**Read this before you start.** `settingsSnapshot()` is an **inner function** of `SettingsScreen`, declared at roughly line 184. It closes over the component's `useSetting` state variables and returns them as an object literal in shorthand form. It is **not** exported, takes no arguments, and must stay that way. Do not lift it to module scope, do not give it a `Settings` parameter, and do not give it a defaults fallback: a snapshot that can read anything other than the live state is a backup that can silently export defaults instead of the user's real settings, which is the exact `showHints` failure the comment above it describes.

**Why this task touches two files at once:** `settingsSnapshot()` returns `Record<Exclude<SettingKey, BackupExcluded>, unknown>`. Adding a key to `DEFAULTS` that is neither in the returned object nor on `NOT_IN_BACKUP` is therefore a **compile error**. That type is the safety net, not a test — which is why Step 2 below runs `npm run typecheck` rather than Jest.

**There are three keys, and they are not alike.** `machineModel` is the user's answer and belongs in backups. `machineModelString` and `machineName` are readings taken off a physical machine; restoring them onto a phone that never took the reading would turn evidence into fiction, so they are excluded.

- [ ] **Step 1: Add the three keys to `Settings.ts`**

First the import, beside the two existing `import type` lines at the top of the file (note this file uses **single** quotes for imports):

```ts
import type {MachineModel} from './machine/machineModel';
```

`machineModel.ts` imports nothing, so this is not a cycle.

In `DEFAULTS`, immediately after the `machineDeviceId` entry:

```ts
    /**
     * Which xBloom this phone is driving.
     *
     * The setting is the truth and detection may only ever refine it. A scan
     * would find an original: `Transport.scan` is unfiltered and matches the
     * name prefix as well as the service UUID. But everything after discovery
     * is the Studio's: `MACHINE_SERVICE` and its characteristics are what a
     * connection resolves, and the model is read over that connection. A
     * machine we cannot finish connecting to therefore never yields a reading,
     * so its owner would sit on a wrong default forever. Detection would help
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

Then **add** the two readings to the existing `BackupExcluded` union and `NOT_IN_BACKUP` array. Read the current members first and append to them; do not retype the list from memory, and do not remove anything already there.

Add to the `NOT_IN_BACKUP` doc comment, after the `labsUnlocked` paragraph:

```
 * `machineModelString` and `machineName` are held out because they are
 * readings, and a reading restored onto a phone that never took it is not
 * evidence any more. The whole reason they are stored is to be trustworthy
 * about what a real machine said.
```

- [ ] **Step 2: Run the typecheck to watch the safety net fire**

Run: `npm run typecheck`
Expected: **FAIL**, with an error on `settingsSnapshot`'s return type saying `machineModel` is missing. This is the compile error doing its job; if it does not fire, you have put `machineModel` in the wrong list and the rest of this task is unsafe.

- [ ] **Step 3: Read the setting in the screen**

In `app/settings.tsx`, beside the other machine reads at roughly line 129-133:

```ts
    const [machineModel, setMachineModel] = useSetting("machineModel", settings);
```

`machineAutoStart` directly above it carries a comment explaining that it is read here although it is shown elsewhere. The same is true of `machineModel`: Task 8 draws its row inside `MachineSection`. Extend that existing comment to cover both rather than writing a second one.

- [ ] **Step 4: Put it in the snapshot**

Add `machineModel` to the object literal inside `settingsSnapshot()`, in shorthand, on the line with the other machine keys:

```ts
            firstBrewDone, machineConsoleAcknowledged, machineConsoleConfirmations,
            machineModel, machineAutoStart, animateBrewChart, brewTraceRetention,
```

Run `npm run typecheck` again. It should now be clean. That is the whole of the export half of the contract.

- [ ] **Step 5: Write the failing restore test**

The import half needs a real test. The existing "restores every setting a backup carries" test builds its fixture with `typeof value === "boolean" ? !value : value`, so for a **string** setting it round-trips the default against the default and would pass even if restore were never wired. It cannot catch this key.

Add to `app/__tests__/settings.test.tsx`, beside that test:

```ts
it("restores which machine you own, not just the default", async () => {
    // The generic restore test flips booleans, so a string setting round-trips
    // its own default through it and proves nothing. This one names a value
    // that is not the default: somebody who corrected their machine by hand
    // and then moved phones must not silently land back on Studio.
    const storage = memoryStorage();
    mockPickBackup.mockResolvedValue(
        backupOf([recipeNamed("A", "u1")], {machineModel: "original"})
    );
    mockApplyRestore.mockReturnValue({status: "restored", added: 1});
    await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

    await fireEvent.press(screen.getByRole("button",
        {name: "Restore from a backup, Adds anything your library does not already have."}));
    await settleSheet();
    await fireEvent(screen.getByLabelText(/settings from this backup/i),
                    "checkedChange", true);
    await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

    expect(new Settings(storage).get("machineModel")).toBe("original");
});
```

Match the surrounding tests for the exact helper names and the button labels; `memoryStorage`, `backupOf`, `recipeNamed` and `settleSheet` are all already in that file. Copy the interaction sequence from "restores every setting a backup carries" rather than the one written above if the two disagree.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx jest app/__tests__/settings.test.tsx -t "restores which machine you own"`
Expected: FAIL, the setting is still `"studio"`.

- [ ] **Step 7: Handle it on the way back in**

In `applySettings`, beside the other validated reads at roughly line 274:

```ts
        // Validated rather than assigned: this value came out of a file the
        // user could have edited, and an unrecognised model would be stored
        // and then read back as a machine that does not exist.
        if (isMachineModel(incoming.machineModel)) {
            setMachineModel(incoming.machineModel);
        }
```

Add the import:

```ts
import {isMachineModel} from "@/library/machine/machineModel";
```

Note `app/settings.tsx` uses **double** quotes for imports, unlike `library/Settings.ts`. The neighbouring restores use `isSortAxis`, `isLibraryView` and `asTemperatureUnit` in the same shape, so follow those.

- [ ] **Step 8: Run everything**

Run: `npx jest app/__tests__/settings.test.tsx library/__tests__/backup.test.ts && npm run typecheck && npm run lint`
Expected: PASS throughout, no type errors, no new lint errors.

**Do not add a global mock to `jest.setup.js`.** If a test needs a native module stubbed, the house pattern is a per-file `jest.mock` with a comment saying why, as `hooks/__tests__/useMachine.test.ts` does for `react-native-ble-manager`. A global stub changes the behaviour of every suite in the repo, including the ones whose job is to exercise that module. If you find yourself needing one, stop and report it instead.

- [ ] **Step 9: Commit**

```bash
git add library/Settings.ts app/settings.tsx app/__tests__/settings.test.tsx
git commit -m "Store which machine this phone drives, and what it said it was"
```

---

## Task 3: The share payload accepts either partition

**Files:**
- Modify: `api/_lib/payload.ts:110` (the `SharePayload` type), `:162` (the check), `:235` (the sanitised copy)
- Test: `api/__tests__/payload.test.ts:96`

**Why:** this is the server-side validator for the share-minting API. It currently hard-rejects anything but `1`. It is a genuine trust boundary and stays one: `0` and `3` return nothing upstream and must still be refused.

**`api/` restates the pair on purpose. Do not import `machineModel.ts` here.** Vercel deploys this directory alone, with `installCommand: "echo skipping install: the mint function has no dependencies"`, and every file under `api/` imports nothing but node builtins. Reaching into `library/` would make the function's bundle depend on the app tree. So `1 | 2` is written out here, with a comment naming `library/machine/machineModel.ts` as the other copy, and the two must be changed together. This is the one deliberate duplication in the machine-model work.

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
- Modify: `library/cloud/cloudLibrary.ts`
- Test: `library/cloud/__tests__/cloudLibrary.test.ts`

**Why this is not a substitution.** This function answers "what has this account minted". That answer does not depend on which machine the user owns today. If it read only the current partition, a user who corrected their setting would find every earlier link missing, and `useShareRecipe`'s fingerprint check would mint a duplicate row on every subsequent share. Spec §4.4.

### Read this before you write anything

The existing page loop cannot simply be wrapped in a second loop. It carries three exits, and one of them is stateful:

```ts
if (!Array.isArray(response.list)) {
    if (out.length > 0) {
        throw new CloudError("server", "xBloom stopped mid-list");
    }
    break;
}
```

`out.length > 0` is how the function tells "this account is empty" from "the server stopped part way through a walk". With a single shared accumulator across both partitions that test becomes wrong in the common case: nearly every user has rows in partition 1 and none in partition 2, so partition 2's first page would find `out.length > 0` and throw `"xBloom stopped mid-list"` on a perfectly healthy account. Sharing would break for almost everybody.

**So extract the page walk into its own function, one that owns its own accumulator**, and have the partition loop concatenate the results. Each partition then judges its own emptiness, which is what the check was always asking.

The other two exits are page-level and stay inside the extracted function: the short-page `break` ends that partition's walk, and the `MAX_PAGES` throw must stay a throw — reaching the cap is still a failure to find an ending, and it must abort the whole call rather than quietly returning one partition.

- [ ] **Step 1: Write the failing tests**

Add to `library/cloud/__tests__/cloudLibrary.test.ts`. Match the file's existing way of injecting or mocking `post` — if the module imports `post` directly rather than receiving it, mock the module the way the neighbouring tests already do, and read them for the exact shape before writing.

```ts
it("reads both partitions, because a link minted before a correction still exists", async () => {
    // The same recipe is a different row on each machine, and this answers
    // "what has this account minted", not "what can this phone brew".
    const asked: number[] = [];
    // ... respond with one row per partition, tagged so they can be told apart
    const rows = await fetchCloudRecipes(aSession());

    expect(new Set(asked)).toEqual(new Set([1, 2]));
    expect(rows).toHaveLength(2);
});

it("lets the second partition be empty without calling it a broken walk", async () => {
    // The regression this task is most likely to introduce. Nearly every user
    // has rows under 1 and none under 2; if the two partitions share an
    // accumulator, the emptiness check reads the first partition's rows and
    // reports a healthy account as a server that stopped mid-list.
    // Respond: partition 1 returns a short page of rows, partition 2 returns
    // no `list` key at all.
    const rows = await fetchCloudRecipes(aSession());

    expect(rows).toHaveLength(/* however many partition 1 returned */);
});

it("still refuses a walk that stops part way through one partition", async () => {
    // And the check must keep working *within* a partition: a first page that
    // fills and a second that answers with no list is a broken walk, not an
    // empty account.
    await expect(fetchCloudRecipes(aSession()))
        .rejects.toThrow(/stopped mid-list/);
});
```

`aSession()` is a stand-in; use whatever the file already uses. Fill in the response scripting to match the file's existing mocking style. The third test may already exist in some form — if it does, leave it alone and make sure it still passes rather than writing a second copy.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest library/cloud/__tests__/cloudLibrary.test.ts`
Expected: FAIL. The first because only partition `1` was asked for.

- [ ] **Step 3: Extract the page walk**

Move the existing loop body into a function that takes the partition and returns the rows it found, owning its own `out`. Keep every comment attached to the logic it explains — they describe failures that actually happened and are worth more than the diff noise of moving them.

```ts
/**
 * One partition's rows, walked to the end.
 *
 * Its own accumulator on purpose. The mid-list check below asks "have we
 * already collected rows in *this* walk", which is how an empty account is
 * told from a server that stopped part way through one. Sharing an accumulator
 * across partitions would make a user with rows under 1 and none under 2 --
 * which is nearly all of them -- look like a broken walk.
 */
async function fetchPartition(
    session: Session,
    adaptedModel: number,
    signal?: AbortSignal
): Promise<CloudRow[]> {
```

- [ ] **Step 4: Walk both**

Add the import:

```ts
import {ADAPTED_MODEL} from "@/library/machine/machineModel";
```

And replace the body of `fetchCloudRecipes`:

```ts
    const out: CloudRow[] = [];
    // Both partitions, not the user's current one. This answers "what has this
    // account minted", and that does not change when somebody corrects which
    // machine they own. Reading only the current partition would hide every
    // earlier link from the fingerprint check, which would then mint a
    // duplicate row on every share. See the design spec, section 4.4.
    for (const adaptedModel of Object.values(ADAPTED_MODEL)) {
        out.push(...await fetchPartition(session, adaptedModel, signal));
    }
    return out;
```

Sequential rather than `Promise.all`, to keep the existing behaviour under an `AbortSignal` and to avoid doubling the load this puts on xBloom's endpoint in one burst.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest library/cloud/ && npm run typecheck && npm run lint`
Expected: PASS, including every pre-existing test about partial page walks. Those tests are the point: this task must not change what a broken walk means, only how many walks there are.

- [ ] **Step 6: Commit**

```bash
git add library/cloud/cloudLibrary.ts library/cloud/__tests__/cloudLibrary.test.ts
git commit -m "Walk both partitions, so correcting your machine does not hide your links"
```

---

## Task 7: The pod lookup asks for the right machine

**Files:**
- Modify: `library/XBloomRecipe.ts` (the constructor at :26, `fromAccountRow` at :45, the `byXid` request body at :279)
- Modify: `hooks/useRecipeImport.ts:272`
- Modify: `hooks/useRecipeEditor.ts:231`, `:402`, `:416`
- Test: `library/__tests__/XBloomRecipe.endpoint.test.ts` (the endpoint tests live there; `XBloomRecipe.bypass.test.ts`, `xbloomPodCoffee.test.ts`, `shareLink.test.ts` and `recipeAttribution.test.ts` also construct one and will need the new argument)

**Scope note:** `adaptedModel` is sent only on the `byXid` path, the pod lookup at `tRecipeDetailOfPods.thtml`. The share-id path at `RecipeDetail.html` does not send one and does not need one. This is also why the phase 2 hub work is unaffected: hub rows import by share link.

### Read this before you write anything

The plan's earlier draft of this task described a constructor that does not exist. The real one takes a single `ImportSource`, the discriminated union `parseImportInput` produces:

```ts
    constructor(source: ImportSource) {
        this.byXid = source.kind === "xid";
        this.id = source.kind === "xid" ? source.xid : source.id;
    }
```

There are **four** production call sites, not one:

| Site | What it is |
| --- | --- |
| `hooks/useRecipeImport.ts:272` | the import sheet's lookup |
| `hooks/useRecipeEditor.ts:231` | refreshing a held recipe's xBloom name |
| `hooks/useRecipeEditor.ts:402` | restore from XID |
| `hooks/useRecipeEditor.ts:416` | restore from share link |

Three of them are the ones #138 is actually about — a user who restores a recipe from its XID gets the Studio's grind silently written over their own.

`XBloomRecipe.fromAccountRow` also constructs one, but it pre-populates `xbRecipeJSON` and its only caller (`library/cloud/mapRow.ts:47`) goes straight to `getRecipe()`. It never fetches, so the model is inert there.

### The model is a required argument, not a defaulted one

Give the constructor a second parameter with **no default**. A default would make a forgotten call site compile and silently ask for the Studio, which is exactly the shape of the bug this task closes. Making it required turns the next forgotten call site into a type error.

`library/` must not import from `hooks/`, so `XBloomRecipe` does not read the setting itself. It is told.

- [ ] **Step 1: Write the failing test**

Add to `library/__tests__/XBloomRecipe.endpoint.test.ts`, following that file's existing fetch-mocking pattern (read it first; do not invent a new one):

```ts
it("asks the pod endpoint for the machine the user owns", async () => {
    await new XBloomRecipe({kind: "xid", xid: "ETH120"}, "original")
        .fetchRecipeDetail();

    const body = JSON.parse(bodyOfLastRequest());
    expect(body.adaptedModel).toBe(2);
});

it("still asks for the Studio when that is the machine", async () => {
    await new XBloomRecipe({kind: "xid", xid: "ETH120"}, "studio")
        .fetchRecipeDetail();

    const body = JSON.parse(bodyOfLastRequest());
    expect(body.adaptedModel).toBe(1);
});
```

`bodyOfLastRequest()` is a stand-in: read how the existing tests reach the request body and use that. Both cases are needed — one alone cannot tell "reads the argument" from "hardcoded to the value the test happens to pass".

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/XBloomRecipe.endpoint.test.ts`
Expected: FAIL. The first test fails because the body carries `1`; both may also fail to compile on the second argument, which is equally good evidence.

- [ ] **Step 3: Take the model on the constructor**

In `library/XBloomRecipe.ts`, add the import:

```ts
import {adaptedModelFor, type MachineModel} from "@/library/machine/machineModel";
```

Store it, required:

```ts
    private model: MachineModel;

    /**
     * @param model which machine the recipe is being fetched for. Consulted
     * only by the pod endpoint, which returns a different grind under each;
     * the share endpoint has no such field. Required rather than defaulted
     * because a forgotten call site silently asking for the Studio is #138.
     */
    constructor(source: ImportSource, model: MachineModel) {
```

Set `this.model = model;` alongside the existing assignments, keeping the comment already on that constructor attached to the lines it explains.

In `fromAccountRow`, pass `"studio"` with a comment saying why the value cannot matter:

```ts
        // Inert: this instance is handed its `recipeVo` outright and never
        // fetches, so no endpoint ever reads the model.
        const instance = new XBloomRecipe({kind: "xid", xid}, "studio");
```

And in the `byXid` body, replace the hardcoded `1`:

```ts
            // The pod carries one coffee and two recipes. Asking under the
            // wrong machine returns a grind on the other machine's scale,
            // which is what #138 was opened about.
            adaptedModel:      adaptedModelFor(this.model),
```

- [ ] **Step 4: Pass the setting from all four call sites**

Both hooks reach the setting through `sharedSettings()` rather than `useSetting`, because the value is read once at fetch time and a `useSetting` subscription would re-render the editor whenever any machine setting changed. `hooks/useMachine.ts:34` is the existing example of this choice.

In each of `hooks/useRecipeImport.ts` and `hooks/useRecipeEditor.ts`, add:

```ts
import {sharedSettings} from "@/hooks/useSetting";
import {asMachineModel} from "@/library/machine/machineModel";
```

(each file may already import one of these — check before adding a duplicate) and pass the model at every construction, for example:

```ts
        const xb = new XBloomRecipe(
            source, asMachineModel(sharedSettings().get("machineModel"))
        );
```

`asMachineModel` rather than a bare `get`, because `SettingValue` widens the stored union back to `string`; it coerces an unreadable value to the Studio rather than refusing.

Do all four. Verify none is left with:

```bash
grep -rn "new XBloomRecipe" --include=*.ts --include=*.tsx . | grep -v node_modules
```

- [ ] **Step 5: Update the other constructions in tests**

`shareLink.test.ts:260`, `xbloomPodCoffee.test.ts:135`, `XBloomRecipe.bypass.test.ts:40` and the remaining ones in `XBloomRecipe.endpoint.test.ts` all need the second argument. Pass `"studio"` — none of them is about the machine, and changing what they ask for would change what they test.

Any hook test that now runs through `sharedSettings()` needs the settings mock rather than a real store, which under Jest throws `NativeDatabase is not a constructor`. The house pattern is per-file and documented at the top of `test-utils/settingsMock.ts`:

```ts
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());
```

Do **not** add a global mock to `jest.setup.js`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest library/ hooks/ && npm run typecheck && npm run lint`
Expected: PASS, no type errors, no new lint errors. Then run the full `npx jest` — this touches the editor and the importer, so the blast radius is wider than the two directories.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Ask a pod for this machine's recipe, not the Studio's"
```

---

## Task 8: The settings row

**Files:**
- Modify: `components/MachineSection.tsx`
- Test: `components/__tests__/MachineSection.test.tsx`

### Read this before you write anything

An earlier draft of this task said to create `constants/machineCopy.ts` and to put the test in `app/__tests__/settings.test.tsx`. Both were wrong:

- **No copy module.** All three sibling rows in `MachineSection.tsx` (`Start brewing automatically`, `Animate the brew chart`, `Keep raw brew traces`) write their label and description inline. A `constants/` module holding the strings for one row would be inconsistent with the file it serves, and `constants/brewCopy.ts` exists because brew copy is shared across several screens. This is not. Inline it like its neighbours.
- **The test belongs beside the component.** `components/__tests__/MachineSection.test.tsx` already exists and already covers the other rows (see `offers auto-start, off, because committing is what starts a grinder`). Follow it.

Two more things the draft missed:

- `MachineSection` takes an optional `settings` prop and **passes it to every `useSetting`** — it is the injection seam the settings screen's tests drive. `useSetting("machineModel")` without it would read the shared SQLite store instead, which cannot open under Jest.
- `SettingsChoiceRow` already sits in the import list. Do not add it twice.

- [ ] **Step 1: Write the failing tests**

Add to `components/__tests__/MachineSection.test.tsx`, matching the style of the row tests already there:

```tsx
it("asks which xBloom you own, because the two grind on different scales", async () => {
    await renderWithProviders(<MachineSection/>);

    expect(screen.getByText("Your xBloom")).toBeTruthy();
    expect(screen.getByText("Studio")).toBeTruthy();
    expect(screen.getByText("Original")).toBeTruthy();
});

it("remembers the original xBloom when that is what you picked", async () => {
    await renderWithProviders(<MachineSection/>);

    await fireEvent.press(screen.getByText("Original"));

    // The control is driven by the setting, so the value coming back is the
    // evidence it was stored rather than merely pressed.
    expect(screen.getByLabelText("Your xBloom")).toBeTruthy();
    await waitFor(() =>
        expect(screen.getByText("Original").props.accessibilityState?.selected).toBe(true));
});
```

The second test's last assertion is a **stand-in**: read how `SegmentedControl` marks the chosen option (`components/SegmentedControl.tsx`) and assert on whatever it actually renders. RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`, so assert on text, test IDs or accessible state — never on a child component's props. If the selected state is not observable, drive the assertion through the file's `useSetting` mock instead.

Note that this file's `useSetting` mock is per-hook `React.useState(DEFAULTS[key])`, so the value does round-trip within a render tree.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/MachineSection.test.tsx -t "xBloom you own"`
Expected: FAIL, unable to find text "Your xBloom".

- [ ] **Step 3: Add the row**

In `components/MachineSection.tsx`, add the import:

```ts
import {isMachineModel} from "@/library/machine/machineModel";
```

Add the options constant beside `RETENTION_OPTIONS`:

```ts
const MACHINE_MODEL_OPTIONS = [
    {value: "studio",   label: "Studio"},
    {value: "original", label: "Original"}
] as const;
```

Read the setting alongside the other three, **passing `settings`**:

```ts
    const [machineModel, setMachineModel] = useSetting("machineModel", settings);
```

And put the row at the very top of the returned tree, above the status line, because which machine you own is prior to which one you happen to be connected to:

```tsx
        <SettingsSection title="Machine">
            <SettingsChoiceRow
                label="Your xBloom"
                description="The two machines grind on different scales, so a recipe written for one is wrong on the other. Pick yours and the app asks xBloom for the right version."
                value={machineModel}
                options={MACHINE_MODEL_OPTIONS}
                onChange={(value) => {
                    if (isMachineModel(value)) setMachineModel(value);
                }}/>

            {status !== "connected" && (
```

`isMachineModel` rather than a cast: `SettingsChoiceRow`'s `onChange` is typed `(value: string) => void`, so the setting's union is lost on the way through and has to be recovered. The guard form is right here rather than `asMachineModel`, because this value came from the control's own option list — anything else is a bug, not a stale preference to coerce.

Copy note: no dashes anywhere in the description. They read as machine-written, and this is the app talking.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/MachineSection.test.tsx && npx jest app/__tests__/settings.test.tsx`
Expected: PASS. The settings screen renders this section, so its own tests are the check that the new row did not disturb the screen around it.

- [ ] **Step 5: Commit**

```bash
git add -A
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

The existing `jest.mock("react-native-ble-manager", ...)` factory has no `read`. Add `read: jest.fn().mockResolvedValue([])` to it beside the others rather than assigning `BleManager.read = ...` inside a test, which would leak the stub into every test after it. Drive each case with `(BleManager.read as jest.Mock).mockResolvedValueOnce(...)` / `.mockRejectedValueOnce(...)`.

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
    /**
     * The name the machine advertised when it was found.
     *
     * Only ever set by a scan, and `attemptLink` skips the scan whenever an
     * identifier is remembered — so for a returning user this stays empty for
     * the whole life of the link. Empty therefore means "did not learn", never
     * "the machine is nameless", and the layer that stores it has to treat the
     * two differently or a normal reconnect would erase what an earlier scan
     * found out.
     */
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
- Modify: `hooks/useMachine.ts` (the `LinkStore` type, both of its implementations, `attemptLink`, and the hook's return)
- Modify: `hooks/__tests__/useMachine.test.ts` (including replacing its forked settings mock)

**Where this goes, and why not in the hook body.** `useMachine` reaches the settings store through a small injected seam called `LinkStore`, whose comment says "Injected, so the algorithm is testable". That is the seam to extend. Writing settings directly from the hook body instead would be both untestable and a lint error: `react-hooks/set-state-in-effect` is an error in this repo.

The write belongs in `attemptLink`, after the connect has succeeded, and **outside** the existing `if (id !== remembered)` block. That block only fires when the remembered id changed; the readings should be refreshed on every successful connect, because firmware can change under a machine whose id did not.

### Read this before you write anything

An earlier draft of this task was written against a hook that does not quite exist. Four things it got wrong, all of which will bite in the first ten minutes:

1. **`useMachine` does take an injectable store.** Its signature is `useMachine(injected?: Machine, options: MachineOptions = {})`, and `MachineOptions = RetryOptions & {settings?: Settings}`. Every `useSetting` call in the hook already passes `options.settings`. Anything you add must too, or the settings screen's injected store is bypassed. Reach for `options.settings ?? sharedSettings()` where you need a whole `Settings`.

2. **`hooks/__tests__/useMachine.test.ts` has its own forked settings mock** — a per-hook `React.useState(key in mockSeed ? mockSeed[key] : DEFAULTS[key])` that provides no `sharedSettings` at all. A hook that writes through `sharedSettings()` while the test reads through that `useSetting` has **two stores**, so the correction this task implements would be invisible to every assertion. Step 0 replaces it.

3. **`applyMachineReading` has to be exported** for the Step 5 tests to call it directly. Module-private is not enough.

4. **`SettingValue<"machineModel">` widens the stored union back to `string`.** `useSetting("machineModel", ...)` therefore hands back a `string`, not a `MachineModel`, so Step 7 needs `asMachineModel` from `@/library/machine/machineModel`. This is the same trap Task 5 hit.

- [ ] **Step 0: Put the test file on the shared settings mock**

Replace the forked mock and the `mockSeed` object at the top of `hooks/__tests__/useMachine.test.ts` with the house one-liner. `app/__tests__/machine.test.tsx` did this already and its comment says why:

```ts
// `useSetting` reaches for the shared SQLite-backed store, which cannot open
// under Jest. This file now needs `sharedSettings` as well, because the link
// records what the machine said through it -- and a per-hook stand-in would
// give the writer and the reader two different stores, so a correction would
// be invisible to every assertion here.
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());
```

Import `sharedSettings` from `@/hooks/useSetting` and convert the four `mockSeed.<key> = value` lines to `sharedSettings().set("<key>", value)`.

The shared store lives for the whole file rather than per test, so `beforeEach` has to put back what a test changed. Extend the existing one:

```ts
    beforeEach(() => {
        __resetSharedMachine();
        // The mock's store outlives each test, unlike the seed object it
        // replaced, so every key a test writes has to be put back by hand.
        for (const key of ["machineDeviceId", "machineModel",
                           "machineModelString", "machineName"] as const) {
            sharedSettings().set(key, DEFAULTS[key]);
        }
    });
```

Import `DEFAULTS` from `@/library/Settings`.

**Expect some existing tests in this file to need attention.** They previously got a fresh per-hook value; they now share one store, which is what production does. Run them before you change anything else so you can tell a failure you caused from one you inherited. If a failure needs a judgment call rather than a reset, stop and report it rather than guessing.

- [ ] **Step 1: Run the existing tests to confirm the swap is clean**

Run: `npx jest hooks/__tests__/useMachine.test.ts`
Expected: PASS, unchanged count. This is a refactor with no behaviour in it; do not go on until it is green.

Commit this on its own, so the behaviour change that follows has a clean diff:

```bash
git add hooks/__tests__/useMachine.test.ts
git commit -m "Put the machine link tests on the shared settings mock"
```

- [ ] **Step 2: Write the failing tests**

Add to `hooks/__tests__/useMachine.test.ts`, inside the existing `describe`:

```ts
it("records what the machine said, without touching the setting", async () => {
    const transport = new FakeTransport();
    transport.modelNumber = "XB-MYSTERY-9";
    transport.advertisedName = "XBLOOM-77";
    const recorded: MachineReading[] = [];
    const store = {
        rememberedId: () => "AA:BB",
        rememberId: () => {},
        recordMachine: (reading: MachineReading) => { recorded.push(reading); }
    };

    await openLink(new Machine(transport, {frameGapMs: 0}), store, async () => true);

    expect(recorded).toEqual([{model: "XB-MYSTERY-9", name: "XBLOOM-77"}]);
});

it("records the reading even when the machine was already remembered", async () => {
    // Firmware can change under a machine whose identifier did not, so this
    // must not ride along on the "new machine" branch.
    const transport = new FakeTransport();
    transport.modelNumber = "XB-2";
    const recorded: MachineReading[] = [];
    const store = {
        rememberedId: () => "AA:BB",
        rememberId: () => { throw new Error("should not re-remember a known machine"); },
        recordMachine: (reading: MachineReading) => { recorded.push(reading); }
    };

    await openLink(new Machine(transport, {frameGapMs: 0}), store, async () => true);

    expect(recorded).toHaveLength(1);
});

it("leaves the setting alone for a machine it does not recognise", async () => {
    sharedSettings().set("machineModel", "original");
    const transport = new FakeTransport();
    transport.modelNumber = "XB-MYSTERY-9";

    const {result} = await renderHook(() => useMachine(new Machine(transport, {frameGapMs: 0})));
    await act(async () => { await result.current.connect(); });

    // Unrecognised is not evidence of anything. The user's answer stands.
    expect(result.current.machineModel).toBe("original");
    // But it is still written down, which is the whole point of collecting it.
    expect(sharedSettings().get("machineModelString")).toBe("XB-MYSTERY-9");
});

it("corrects the setting when the machine is certainly a Studio", async () => {
    sharedSettings().set("machineModel", "original");
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

And the two that pin the blank-reading rule, which call the function directly because it is the rule itself rather than the plumbing:

```ts
it("keeps what an earlier connect learned when this one learns nothing", async () => {
    // The returning user's case: no scan, so no advertised name, and firmware
    // that does not carry the Device Information Service says nothing either.
    const settings = sharedSettings();
    settings.set("machineModelString", "X15");
    settings.set("machineName", "XBLOOM-77");

    applyMachineReading(settings, {model: "", name: ""});

    expect(settings.get("machineModelString")).toBe("X15");
    expect(settings.get("machineName")).toBe("XBLOOM-77");
});

it("takes each half of a reading on its own", async () => {
    // A returning user learns a model and no name, because the scan was
    // skipped. Half a reading must not be thrown away with the other half.
    const settings = sharedSettings();
    settings.set("machineName", "XBLOOM-77");

    applyMachineReading(settings, {model: "X15", name: ""});

    expect(settings.get("machineModelString")).toBe("X15");
    expect(settings.get("machineName")).toBe("XBLOOM-77");
});
```

Add the imports:

```ts
import {STUDIO_MODEL_STRINGS} from "@/constants/machine";
import {DEFAULTS} from "@/library/Settings";
import {sharedSettings} from "@/hooks/useSetting";
```

and extend the existing import from `@/hooks/useMachine` with `applyMachineReading` and the `MachineReading` type.

Remember `renderHook` is async in RNTL v14, and an `unmount()` must be wrapped in `await act(...)`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest hooks/__tests__/useMachine.test.ts`
Expected: FAIL. `applyMachineReading` and `MachineReading` do not exist, `recordMachine` is not part of `LinkStore`, and `machineModel` is not on the link.

- [ ] **Step 4: Widen `LinkStore`**

In `hooks/useMachine.ts`, beside the existing `LinkStore` type:

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

- [ ] **Step 5: Write the rule in one place**

Add to `hooks/useMachine.ts`, above `settingsStore`:

```ts
/**
 * Store what the machine said, and change the setting only when it is certain.
 *
 * Exported for its own tests: this is the rule, and the rest of this file is
 * the plumbing that carries a reading to it.
 *
 * The reading is kept always. It is allowed to overrule the user only on a
 * positive match against a string read off real hardware, because a string we
 * have never seen is not evidence of an original xBloom: we own none to read
 * one from, and a firmware revision would produce an unfamiliar string too.
 * `STUDIO_MODEL_STRINGS` is empty until somebody fills it in, and an empty list
 * matches nothing, so detection is inert rather than wrong.
 *
 * A blank reading is "did not learn", never "learned it is blank", so it is
 * dropped rather than written, and each half is judged on its own. Both halves
 * go blank in ordinary use and neither is a discovery: the Device Information
 * Service is optional, and `advertisedName` is only ever filled in by a scan,
 * which `attemptLink` skips for a returning user. Writing a blank through would
 * erase what an earlier connect found out, on the reconnect after it, for
 * almost everybody, and these two keys exist to be trustworthy about what a
 * real machine said.
 */
export function applyMachineReading(settings: Settings, reading: MachineReading): void {
    if (reading.model !== "") settings.set("machineModelString", reading.model);
    if (reading.name !== "") settings.set("machineName", reading.name);
    // Inside the emptiness guard on purpose. `[].includes("")` is already
    // false, but a later edit that put "" on the list by accident would
    // otherwise promote every machine that stayed silent to a Studio.
    if (reading.model !== "" && STUDIO_MODEL_STRINGS.includes(reading.model)) {
        settings.set("machineModel", "studio");
    }
}
```

Add the import for `STUDIO_MODEL_STRINGS` from `@/constants/machine`. `Settings` is already imported as a type in this file; check before adding it again.

- [ ] **Step 6: Implement it in both stores**

`settingsStore()` runs outside React, so it takes the shared store:

```ts
function settingsStore(): LinkStore {
    return {
        rememberedId: () => sharedSettings().get("machineDeviceId"),
        rememberId: (id) => sharedSettings().set("machineDeviceId", id),
        recordMachine: (reading) => applyMachineReading(sharedSettings(), reading)
    };
}
```

The hook's own store must honour the injected one, exactly as its `useSetting` calls already do. In `connect`, beside `rememberId: setRemembered`:

```ts
                recordMachine: (reading) =>
                    applyMachineReading(options.settings ?? sharedSettings(), reading),
```

- [ ] **Step 7: Call it on every successful connect**

In `attemptLink`, after the `try`/`catch` around `machine.connect(id)` and **before** the existing `if (id !== remembered)` block:

```ts
    // Every successful connect, not only a new machine: firmware can change
    // under an identifier that did not.
    store.recordMachine({model: machine.modelNumber, name: machine.advertisedName});
    if (id !== remembered) {
```

- [ ] **Step 8: Expose the setting on the link**

So the hook's consumers and the tests above can read it, add to the `MachineLink` type:

```ts
    /** Which machine the user says this is. The setting, not a reading. */
    machineModel: MachineModel;
```

In the hook body, beside the other `useSetting` reads:

```ts
    const [machineModelSetting] = useSetting("machineModel", options.settings);
```

and in the returned object:

```ts
    return {
        machine, status, error, remembered, connect, forget,
        // `SettingValue` widens the stored union back to `string`, so this has
        // to be narrowed rather than asserted. Coerced rather than refused,
        // because there is a correct answer to fall back on.
        machineModel: asMachineModel(machineModelSetting)
    };
```

Import `asMachineModel` and the `MachineModel` type from `@/library/machine/machineModel`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx jest hooks/__tests__/useMachine.test.ts && npx jest && npm run typecheck && npm run lint`
Expected: PASS throughout, and no type errors. The typecheck is what proves you updated every `LinkStore` literal; there are two in the hook file and more in the tests.

- [ ] **Step 10: Commit**

```bash
git add -A
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

**Carried over from the Task 8 review, decide before opening the PR:** an Original owner now reads `"Your xBloom Studio has to be switched on and nearby."` on the connect row (`components/MachineSection.tsx`), directly under the row where they just said they do not own a Studio. It was correctly left alone in Task 8, because making that copy conditional is only worth doing once Tasks 9 and 10 have established whether the BLE link works on an Original at all. By this point that is known, so either soften the copy or write the open question into the PR body.

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
