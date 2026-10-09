# Easy Mode Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build package 10's persistent A/B/C editor, immutable transaction
journal and scripted writer, with an explicit production-integration block
until the shared machine owner supplies the exclusive port.

**Architecture:** New slot modules use the existing database and BLE recipe
encoder without changing Recipe or backups. One externally subscribed store
feeds the screen and library markers. The writer consumes an injected exclusive
port; it does not reach around the shared machine owner.

**Tech Stack:** TypeScript, Expo Router SDK 57, Tamagui, expo-sqlite, Jest's
iOS/Android projects, RNTL v14 and real node:sqlite persistence fixtures.

---

## File responsibilities

- `library/slots/slotModel.ts`: snapshot validation/encoding, three-slot types,
  wire comparisons, edited/deleted labels and library markers.
- `library/slots/SlotDatabase.ts`: machine-keyed JSON records, checked hydration,
  atomic journal changes and stable subscriptions.
- `library/slots/slotWriter.ts`: exclusive-port interface, persist-before-send
  orchestration, confirmed-boundary recovery and unavailable production port.
- `hooks/useEasyModeSlots.ts`: external store subscription and event actions.
- `components/EasyModeSlots.tsx`: presentational editor/picker/recovery states.
- `components/SlotMarker.tsx`: shared list/tile marker rendering.
- `app/easyMode.tsx`: route, machine binding, whole-library input and header.
- Existing context/card/shelf/machine-panel surfaces: optional entry/marker
  props, no new swipe action or drawer-signature change.
- `docs/release-2.1.0-changes.md`: actual evidence and open release gates.

## Task 1: snapshots and wire validation

- [ ] Create `library/slots/__tests__/slotModel.test.ts` with valid coffee
  fixtures built from Recipe and Pour, independent expected payload bytes and
  these assertions:

```ts
expect(prepareSet([snapshotRecipe(recipe), snapshotRecipe(recipe),
    snapshotRecipe(recipe)])[0]).toEqual(
    Array.from(buildType2(11510, Uint8Array.from([0, 2,
        ...encodeCoffeeBlob(recipe)])))
);
expect(() => snapshotRecipe(tea)).toThrow(/tea/i);
expect(() => snapshotRecipe(withBypass)).toThrow(/bypass/i);
expect(snapshotStatus(saved, undefined)).toBe("removed");
```

- [ ] Run `npx jest --runTestsByPath library/slots/__tests__/slotModel.test.ts
  --runInBand --silent`; expect a missing module failure.
- [ ] Implement `slotModel.ts` with `SLOT_NAMES = ["A", "B", "C"]`,
  `SlotIndex = 0 | 1 | 2`, `SlotSnapshot`, `SlotSet`, `SlotRecord` and
  `SlotJournal`. Snapshot creation rejects unsupported recipes and uses
  `brewProblems`, integer/finite wire guards and `encodeCoffeeBlob`.
  `prepareSet` constructs all three `buildType2(11510, [index, 0x02, ...blob])`
  frames only after all three snapshots validate. Compare actual blob bytes,
  not JSON metadata, for edited state.
- [ ] Add tests for grinder-off `0xFE`, ratio ceiling, unset agitation,
  invalid C preventing all preparation, renamed sources, repeated assignments
  and markers separately identifying draft/written/incomplete state.
- [ ] Rerun the same selector and commit only this model/test pair.

## Task 2: real persistence and durable boundaries

- [ ] Create `library/slots/__tests__/SlotDatabase.test.ts` using
  `createTestDatabase()` injected through a narrow synchronous SQL interface.
  Cover separate machines, three empty first-use slots, snapshot updates,
  deleted source preservation, malformed JSON, duplicate transaction refusal,
  rollback and restart from each receipt boundary:

```ts
store.begin(deviceId, journal);
store.dispatching(deviceId, journal.id, 0);
const reopened = new SlotDatabase(sql);
expect(reopened.read(deviceId).journal?.inFlight).toBe(0);
expect(reopened.read(otherId).journal).toBeNull();
```

- [ ] Run `npx jest --runTestsByPath
  library/slots/__tests__/SlotDatabase.test.ts --runInBand --silent`; expect
  a missing module failure.
- [ ] Implement one new `easy_mode_slots(deviceId TEXT PRIMARY KEY,
  recordJSON TEXT NOT NULL)` table via `appDatabase()`. Check persisted shape,
  snapshots, frames, journal indices and identity when reading. Never return
  an empty set on malformed storage. Use `withTransactionSync` for read/modify/
  write; publish a new stable cached snapshot only after commit.
- [ ] Expose `read`, `subscribe`, `assign`, `begin`, `dispatching`,
  `acknowledge`, `fail` and `complete`. Every transaction mutation checks its
  ID. Assignment is refused while a journal exists. Completion atomically
  copies written snapshots and clears the journal only after three receipts.
- [ ] Rerun the persistence/model selectors and commit.

## Task 3: scripted exclusive writer and recovery

- [ ] Create `library/slots/__tests__/slotWriter.test.ts` with an injected
  scripted port, clock and real store. Record the journal synchronously inside
  `sendAndConfirm` to prove persistence precedes each send.

```ts
interface SlotPort {
    available: boolean;
    acquire(identity: {deviceId: string; serial: string | null}): Promise<SlotLease>;
}
interface SlotLease {
    sendAndConfirm(frame: Uint8Array, index: SlotIndex): Promise<void>;
    confirmSaved(): Promise<void>;
    release(completed: boolean): void;
}
```

  `sendAndConfirm` resolves only on an unambiguous machine receipt;
  `confirmSaved` requires fresh final completion from the same attempt.
  The lease must subscribe to final completion before A so fast completion
  cannot be lost while awaiting C. On release(false), a shared owner must
  retain the machine's recovery reservation.
- [ ] Run `npx jest --runTestsByPath
  library/slots/__tests__/slotWriter.test.ts --runInBand --silent`; expect
  a missing module failure.
- [ ] Implement `slotWriter.ts`: acquire before journal creation, persist
  prepared set before A, mark in-flight before dispatch, acknowledge before
  proceeding, and complete only after `confirmSaved`. Catch only to persist
  failure detail, release the lease and rethrow. Preserve journal uncertainty
  if persistence itself fails. Transaction IDs discard stale mutations.
- [ ] Recovery acquires the same identity and sends only remaining frames from
  a confirmed boundary. Reject non-null `inFlight` and all-ACK/missing-final
  recovery without a verified resolution contract. Do not replay or infer
  receipt from idle. The unavailable production port throws a specific
  integration block before any storage/radio mutation.
- [ ] Cover invalid/prevalidation, unavailable/busy acquire, native failure,
  missing/duplicate receipt (port refusal), missing completion, restart,
  serial mismatch, recovery byte identity and concurrent calls. Run all three
  domain selectors and commit.

## Task 4: dedicated editor and native entry surfaces

- [ ] Create `components/__tests__/EasyModeSlots.test.tsx` with
  `await renderWithProviders(...)`, awaited presses and semantic assertions:

```tsx
expect(screen.getByText(/cannot tell us/i)).toBeOnTheScreen();
expect(screen.getByRole("button", {name: "Write all three slots"}))
    .toBeDisabled();
expect(screen.getByText(/leaves your machine in EASY/i)).toBeOnTheScreen();
```

  Test the full-set incoming-recipe replacement choice, picker candidates,
  explicit update, removed source, integration block and recovery lock.
- [ ] Run `npx jest --runTestsByPath
  components/__tests__/EasyModeSlots.test.tsx --runInBand --silent`; expect
  a missing component failure.
- [ ] Implement `useEasyModeSlots` using `useSyncExternalStore` and the lazy
  shared SlotDatabase. Event handlers assign/update/call the writer and surface
  errors explicitly. No effect-seeded/reset state or hand memoization.
- [ ] Implement the stacked editor using existing Tamagui/ScreenHeader idioms,
  a virtualized whole-library picker in XbrwSheet, all-sheet accessibility
  isolation, a pinned write action, immutable journal view and live progress.
  `EasyModeSlots` accepts the store record, all recipes, incoming recipe and
  event callbacks; this allows isolated component tests.
- [ ] Implement `/easyMode`, register `headerShown: false`, use remembered
  device identity and reported serial, read recipes through the existing
  database's `retrieveAllRecipes`. Parse incoming recipe JSON explicitly,
  report malformed route input, and do not mutate library recipes.
- [ ] Add optional `onEasyMode` to RecipeOverflowSheet, MachinePanel,
  RecipeCard and RecipeShelfTile. Wire home and editor context entry, all
  matching accessibility actions, and shelf room forwarding.
- [ ] Render `SlotMarker` from shared per-device assignment data on RecipeCard
  and RecipeShelfTile, forwarded by SwipeableRecipeRow and ShelfRoom.
  Preserve existing tray verbs, drawer signature and card touch behaviour.
- [ ] Test marker and entry rendering in component tests, plus route/context
  wiring. Run affected component/screen selectors and commit.

## Task 5: evidence and integration handoff

- [ ] Update the release ledger with the actual software scope, restrictions,
  shared-owner port contract and production-write block. List physical gates
  without implying any hardware test was executed.
- [ ] Run `npm run typecheck`, targeted slot/UI/regression selectors and
  `npx eslint` on changed TypeScript files. Resolve defects caused by this work.
  Do not launch a competing full suite or shared-device build.
- [ ] Run `git diff --check`, inspect the final diff for accidental Recipe,
  backup, Machine or protocol changes, and commit final evidence.
- [ ] Leave the isolated branch/worktree intact. Report the implemented scope
  and the production integration block plainly. No main merge, PR or automated
  review is authorised.

## Self-review

The tasks cover every approved design surface. Production machine wiring and
ambiguous-receipt recovery are intentionally blocked contracts, not unassigned
implementation tasks. New SQLite records are excluded from recipe backups by
separation, not by changing their shared schema. Heavy integration/device
checks remain with the release coordinator.
