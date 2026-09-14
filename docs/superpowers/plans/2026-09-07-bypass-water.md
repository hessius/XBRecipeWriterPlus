# Bypass water — preserve and display

## Why

Bypass water is a separate volume of water at its own temperature, dispensed
alongside the brew for dilution (Aeropress-style). A reviewer asked for it, and
investigating that request found something worse than a missing feature: bypass
is a property xBloom recipes already carry, and **we drop it silently at every
boundary we own.**

- Importing from xBloom discards it — `XBloomRecipe.getRecipe()` never reads the
  three fields.
- Minting a share link discards it — `buildSharePayload` hardcodes bypass off.
- Writing to a card discards it — and cannot do otherwise.

That last one is proven rather than assumed. The user brewed a genuine card whose
cloud recipe has `bypassVolume 15.0`, and the machine poured no bypass water.
Both real card dumps we hold re-encode byte for byte with every byte accounted
for and the remainder zero: there is no spare field. **Bypass cannot live on a
card.** Since the 32-byte signature is derived from the card serial by xBloom and
cannot be regenerated, that is permanent, not a limitation we can engineer away.

So the loss at the card is unavoidable and must be *declared*. The loss at import
and share is a straightforward bug.

## Scope

This plan is **preserve and display only**. It stops the data loss and makes
bypass visible. It deliberately excludes:

- **Editing bypass.** Comes later; the agreed home is its own section below the
  stages, since bypass is a finishing step rather than a stage.
- **Brewing bypass over BLE.** `Machine.ts` already sends command 8102 as
  `[bypass_vol, bypass_temp×10, dose]` with the bypass arguments zeroed. Sending
  real values needs a float32-bits helper that does not exist, and the protocol
  note records an unresolved question about what `×10` means. Only the machine
  can answer that, so brewing waits for a device round.

**Tea does not get bypass.** Tea is special-cased throughout — volumes clamped to
90 ml, dose forced to 5 g, ratio recomputed — and the siphon drain is already
described as bypass internally. Keep it simple: tea recipes carry bypass off.

## Invariants

- **Bypass water is additional to brew water.** Pour volumes must still sum to
  exactly `dosage × ratio`. `isPourVolumeValid()` and `autoFixPourVolumes()` must
  not learn about bypass; if a test of theirs changes, something is wrong.
- **A recipe without bypass must produce a byte-identical share payload to the
  one it produces today.** `shareSnapshot` is compared against a freshly built
  payload to decide whether an existing link still describes the recipe. If the
  defaults shift, every already-shared recipe would look stale and re-mint a
  duplicate in the service account. The current constants — `bypassTemp: 85`,
  `bypassVolume: 0`, `isEnableBypassWater: 2` — are therefore the required
  defaults of the model, not an arbitrary choice.
- **`isEnableBypassWater` is 1 for on and 2 for off.** Inherited from xBloom, and
  the inverse of what anyone would guess.
- **The card path is untouched.** `getData` and `parseData` must not change. The
  real-card characterisation tests in `library/__tests__/Recipe.realCards.test.ts`
  are the guard, and a change there is a regression until proven otherwise.

---

## Task 1 — Carry bypass on the recipe

**Files:** `library/Recipe.ts`, plus a new test file.

Add three public fields:

```ts
public bypassEnabled: boolean = false;
public bypassVolume: number = 0;   // millilitres
public bypassTemp: number = 85;    // degrees Celsius
```

Persistence is automatic — `RecipeDatabase` stores `JSON.stringify(recipe)` — but
**reading is not**. The `Recipe(undefined, json)` constructor assigns field by
field, so the fields must be read there with defaults, or bypass will not survive
a save/load cycle *or* `RecipeDatabase.duplicate()`, which copies by stringifying
and re-parsing.

Legacy records predate the fields, so `?? false` / `?? 0` / `?? 85` is the
migration, in the same style as the `name`/`createdAt` defaults already there.

A recipe parsed from a card must come back with bypass off — cards cannot carry
it, so the `data` branch of the constructor needs no change, but a test should
pin that.

**Tests:**
- A recipe saved and reloaded keeps enabled, volume and temperature.
- Legacy JSON with no bypass keys loads with bypass off, 0 and 85.
- A duplicated recipe keeps its bypass.
- A recipe parsed from card bytes has bypass off.
- Pour-volume validity is unchanged by bypass: a valid recipe stays valid when
  bypass is switched on, and `getTotalVolume()` does not include bypass water.

---

## Task 2 — Keep bypass when importing from xBloom

**Files:** `library/XBloomRecipe.ts`, existing import tests.

`getRecipe()` currently reads dose, ratio, grind, rpm and cup type from
`recipeVo` and ignores `isEnableBypassWater`, `bypassVolume` and `bypassTemp`.
Read all three.

Treat the cloud as untrusted, exactly as the existing code does for `rpm` (which
falls back to 120 when out of its 60–120 range). The share-link schema already
records the accepted ranges: volume 0–500, temperature 0–100. Anything outside
them, missing, or not a finite number falls back to the defaults with bypass off
— an implausible value is far more likely to be a schema change than a real
recipe, and silently brewing someone a strange dilution is worse than ignoring it.

Bypass is only enabled when `isEnableBypassWater === 1` **and** the volume is
above zero: a recipe flagged on with no water is off in every way that matters.

Tea imports force bypass off, per the scope decision.

**Tests:** enabled import carries all three values; `isEnableBypassWater: 2`
yields bypass off; missing fields yield bypass off; out-of-range volume or
temperature yields bypass off; a tea import yields bypass off.

---

## Task 3 — Keep bypass in a minted share link

**Files:** `library/shareLink.ts`, existing share-link tests.

Replace the three hardcoded constants in `buildSharePayload` with the recipe's
own values, keeping tea forced off alongside the existing tea handling for
grinder size and rpm.

**The critical constraint is the no-bypass case.** A recipe with bypass off must
produce exactly the payload it produces today — `bypassTemp: 85`,
`bypassVolume: 0`, `isEnableBypassWater: 2` — because `canonicalSnapshot` is
compared against stored snapshots to decide whether to re-mint. Because the model
defaults match those constants, this falls out naturally, but it must be pinned
by a test rather than left to luck.

Note `api/_lib/payload.ts` validates incoming payloads against ranges already; it
needs no change, but the values we now send must stay inside them.

**Tests:** a bypass recipe mints `isEnableBypassWater: 1` with its volume and
temperature; a non-bypass recipe mints a payload byte-identical to today's; a tea
recipe with bypass set mints bypass off; the canonical snapshot of an unchanged
non-bypass recipe is unchanged.

---

## Task 4 — Show that a recipe has bypass

**Files:** `app/editRecipe.tsx` or the appropriate recipe view, a new component,
`constants/colors.ts` if a new semantic colour is needed, `docs/copy.md`.

Bypass is currently invisible, so an imported recipe would carry it with no way to
know. Show it as a read-only row in its own section **below the stages** — the
agreed home for the editable version later, so the read-only form should sit
where the control will, not somewhere it will have to move from.

It appears only when bypass is enabled. A row reading "off" for every recipe
anyone has ever made is noise.

Copy must go in `docs/copy.md` with the rest. Follow the register: British
English, sentence case in prose, units lower-case in Inter and upper-case in
Doto, "Tap" for on-screen targets.

Colour comes from `constants/colors.ts` — no hex literals, no named CSS colours,
and a semantic name rather than a literal one.

**Tests:** the section renders with the volume and temperature when bypass is on;
it is absent when bypass is off. Render through `renderWithProviders` from
`test-utils/render.tsx`, and remember that `render` and `fireEvent` are
asynchronous — a missing `await` leaves the screen empty and passes for the wrong
reason.

---

## Task 5 — Confirm before a card write drops bypass

**Files:** the card-write path (`hooks/useCardWriter.ts` and its dialog owner),
`docs/copy.md`.

Writing a bypass recipe to a card loses the bypass, permanently and silently.
That is exactly what happened to the user, and it is the reason this plan exists.

Require a **blocking confirmation** before such a write: explain that cards cannot
store bypass water, that the recipe on the card will brew without it, and that the
saved recipe keeps its bypass. Continuing takes an explicit tap. Cancelling writes
nothing.

Only when `bypassEnabled` — an unconditional dialog would train the user to
dismiss it unread, which is how the warning stops working.

Follow the existing dialog pattern: `Dialog` + `Adapt platform="touch"` + `Sheet`,
as in `ImportRecipeComponent.tsx`. Declare components at module scope — a
component defined inside another component's body is a new type every render, so
React remounts it and discards its state. That bug has already been fixed twice
in this repo.

**Tests:** a bypass recipe does not reach `writeCard` until confirmed; cancelling
writes nothing; confirming writes; a non-bypass recipe writes with no dialog.

---

## Out of scope, recorded so it is not lost

- Editing bypass in the editor.
- Sending bypass over BLE, and resolving what `bypass_temp × 10` means.
- Event 40520 (`RD_Bypass`) during a brew, which would let the brew screen show
  the bypass pour. Single-source and unverified when this was written.
  *Since verified:* a frame log of 2026-09-10 caught 40520 firing after the
  drawdown, with no fourth 40510. See `docs/machine-integration/ble-protocol.md`.
