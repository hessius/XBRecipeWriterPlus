# Design: handing a finished brew to Beanconqueror

**Issues:** #123 (feasibility). Depends on #109, widened (see §3).
**Upstream:** `graphefruit/Beanconqueror`, GPL-3.0. Revives
[#280](https://github.com/graphefruit/Beanconqueror/issues/280), closed
`not_planned` on 2025-08-23 without a comment.
**Findings against** `graphefruit/Beanconqueror@master`, read 2026-09-20.
**Status:** approved 2026-09-20. Revised the same day after the maintainer
responded (see §2.2.1).

## 1. What this is

A finished brew leaves XBRW++ as a deep link, and arrives in Beanconqueror as a
pre-filled New Brew form: dose, water, beverage weight, time, temperature,
grind, a flow graph, and a written summary of the stages.

The user picks the coffee. That is a design decision, not a shortfall, and §2.1
says why.

It is a one-way handoff. Nothing is read back, nothing in BC is overwritten, and
a user who never opens Beanconqueror is unaffected.

### 1.1 What #123 established, and what has changed since

#123 concluded that no supported route into Beanconqueror exists, and it was
right about all four channels it checked. Two further findings, from reading
`brew-add.component.ts` and `uiBrewHelper.ts`, change the size of the ask
rather than the conclusion:

- **The receiving plumbing already exists.** `brew-add.component.ts` declares
  `@Input('brew_template') brew_template: Brew`, `@Input() brew_flow_preset:
  BrewFlow` and `@Input() bean_preset: Bean`, and calls `saveFlowProfile()` on
  save. `uiBrewHelper` already opens that form two ways: `repeatBrew(_brew)`
  passes a template, `addBrewFromVisualizerWithGraph(_brewFlow)` passes a
  graph. **The helper this design needs is the union of two methods upstream
  already has.**
- **`intent-handler.service.ts` is a single `if`/`else` chain.** A new verb is
  one branch.

So the missing piece is a verb and a decoder, not an architecture.

### 1.2 The size objection, measured

The maintainer's stated doubt was payload size. It does not survive
measurement. Against a real export, `gummy-worms-sprout-coffee-roasters-
2026-09-19.json`, 979 samples over 188 seconds:

| Encoding | Bytes | base64url chars | 400-char chunks |
| --- | ---: | ---: | ---: |
| As exported | 58,879 | 78,508 | 197 |
| gzip, no other change | 9,217 | 12,292 | 31 |
| Round floats to 0.1 + brotli | 3,766 | 5,024 | 13 |
| **Columnar + delta + gzip** | **2,319** | **3,092** | **8** |
| Columnar + delta + brotli | 2,052 | 2,736 | 7 |

The file is large because it stores `204.40899658203125` per sample. Transposed
to four integer columns and delta-coded, it collapses by 29×.

**gzip, not brotli.** The 267-byte difference does not justify a wasm decoder
upstream, and BC already ships `@zip.js/zip.js`, so gzip costs it no new
dependency.

## 2. Decisions that shape everything else

### 2.1 The user picks the coffee

A BC `Brew` references `bean`, `mill`, `method_of_preparation` and `water` as
UUIDs into local storage, resolved strictly by UUID **with no name fallback**:
`getByUUID` returns undefined for an unknown id,
`initializeByObject(undefined)` is a silent no-op, and the result is a blank
Bean with `uuid: ''` and no error raised. `canBrewBoolean = hasBeans &&
hasPreparationMethods && hasMills` is a hard precondition on brewing at all.

XBRW++ holds **no bean data whatsoever** — there is no roaster, origin, process
or roast date on `Recipe` or `XBloomRecipe`, and the only coffee identity we
have is a recipe name and an xPod id. Guessing at someone's shelf from a recipe
name would produce silent mis-attribution, which is worse than asking.

So the link carries brew figures, and the form is where the user settles the
bean, the mill and the preparation method. `grinderName` and
`preparationMethod` travel as **name hints** that make the dropdowns open on
the right thing when a match exists, and are harmless when it does not.

The consequence to accept: **there is no fully automatic export.** A human
confirms each brew. That was requested, and it is not available under this
design.

### 2.2 Vendor-neutral, deliberately

The upstream ask is an **import API**, not xBloom support.

#### 2.2.1 What the maintainer said, 2026-09-20

The proposal was put to graphefruit directly before this spec was finished. His
position, paraphrased from that exchange:

- **Size is settled.** "3kb sounds good."
- **Chunking is mandatory, and he knows why:** "if the param gets to long it's
  truncated and lost by the OS." This vindicates §4.1's explicit `n` chunk
  count, which exists to catch exactly that.
- **The open question is data, not transport:** "we need to talk about which
  data and how to populate them, the json is currently giving some data but
  like the stages etc aren't supported in bq."
- **He is content with an xBloom-specific import**, and sceptical of
  abstraction: "BQ already have several different implementations for SANREMO
  you, Xenia, gaggiuino etc, every one behaves completely different."

#### 2.2.2 Why neutral still, and where he is right

His scepticism is earned and should not be argued away. Five integrations have
taught him that devices do not generalise.

But his five are all **pull** integrations: BC as client, polling a live device
over its own protocol, where the semantics genuinely are incommensurable. This
is a **push** of an already-normalised brew record that has stopped happening.
The two are different problems, and the difference is where the abstraction
belongs:

- **Semantics do not generalise.** He is right. BC should map xBloom's fields
  concretely, with no speculative interface for devices that do not exist.
- **Transport does generalise.** Chunking, base64url, inflate, CRC, version
  negotiation, truncation detection and validation are identical for every
  sender, and are the part that is fiddly to get right. Solving them once per
  vendor is the waste.

So the synthesis this spec adopts: **one verb and one envelope, with a `source`
discriminator and a per-source mapper.** BC implements the xBloom mapper first
and only — concrete, testable, no abstraction on speculation. A second device
later is a mapper function, not a new verb plus decoder plus chunker plus
validator.

The abstraction sits in the transport, not in the semantics. That concedes his
point in full and keeps the value.

#### 2.2.3 The rest of the case

It is also what #280 actually asked for, and it matters for tone: the
maintainer is overwhelmed, and #1163 was closed three weeks before this
proposal with "there hasn't been any success yet to get a collaboration with
xBloom". `grep -ri xbloom src/` returns nothing. A proposal landing that soon
after must say plainly that XBRW++ is not the vendor.

Every existing BC integration — Gaggiuino, Meticulous, Sanremo, Xenia, Move2 —
has BC as the client pulling from a device acting as server. Nothing pushes in.
This is the first push, so it should be the general one.

### 2.3 Licence separation

Beanconqueror is GPL-3.0. XBRW++ grants MIT over its own contributions, and
`NOTICE` already draws that line.

**No BC source is vendored into this repository, including `bean.proto`.** Our
encoder is written from observation of BC's field names, which is
interoperation and is fine. The decoder lives only in the BC fork, under GPL.
This shapes the file layout in §4 and the test strategy in §7.

## 3. Prerequisite: #109, widened

Brew records currently carry no dose, no ratio and no grind. Confirmed against
`BrewRecord` and against a real export file, whose `brew` object is exactly:
`id`, `recipeUuid`, `recipeName`, `accent`, `startedAt`, `pouringAt`,
`endedAt`, `outcome`, `failure`, `pours`, `waterTotal`, `cupTotal`,
`heldSeconds`, `stalls`, `plan`, `stageWater`, `rating`, `note`, `pinned`,
`hasStream`.

BC's two headline brew fields are `grind_weight` (dose) and `grind_size`, and
without a dose BC cannot compute `getBrewRatio()` or extraction yield at all. A
brew would land looking half empty.

So #109 widens from "record the grind" to four fields on `BrewRecord`, all
optional so existing rows read exactly as they do now — the convention
`pouringAt`, `plan`, `stageWater`, `stalls` and `bypass` already follow:

| Field | Source at brew time | BC destination |
| --- | --- | --- |
| `dose?: number` | `recipe.dosage`, g | `grind_weight` |
| `ratio?: number` | `recipe.ratio` | enables `getBrewRatio()`, EY |
| `grindSize?: number` | `recipe.grindSize`, 40–81 | `grind_size` (a string upstream) |
| `grinderRpm?: number` | `recipe.grindRPM` | `mill_speed` |

**Copied, not joined**, like `recipeName`, `accent` and `plan`. Editing or
deleting a recipe must not rewrite history, which matters more here than
elsewhere: a brew exported last month and re-exported today must produce the
same numbers.

`grindSize` of 81 means the grinder was off. It must not export as `"81"`,
which reads as an absurdly coarse setting; `grind_size` is omitted and the note
says the coffee was pre-ground.

**This work pays off independently of Beanconqueror.** #103 (compare brews of
one recipe) and #98 (aggregate by recipe) both need it: two brews cannot be
compared without knowing whether the dose or the grind moved between them. It
ships on its own schedule, with the export gated off.

## 4. The wire format

Versioned, and deliberately **not** shaped like BC's internals, so an upstream
refactor is a decoder change there rather than silent breakage here.

### 4.1 Transport

```
beanconqueror://ADD_BREW?v=1&n=8&shareBrew0=…&shareBrew1=…
```

400-character chunks in `shareBrewN` params, mirroring the `shareUserBeanN`
convention and regex style upstream already uses, so the handler reads as
idiomatic BC. An `https://beanconqueror.com/?shareBrew0=…` sibling is accepted
too, matching how the bean share has both forms.

`n` is the chunk count. The bean share infers it from a regex over the param
names and needs no count; carrying it explicitly lets the decoder reject a
truncated URL **before** inflating, with a precise reason rather than a generic
failure. gzip's own CRC32 catches corruption within the chunks, so the two
together cover both truncation and mangling.

**Codec:** `JSON → gzip → base64url → chunk`.

base64url is chosen for a specific reason beyond tidiness. BC's bean handler
carries `userBeanJSON.replace(/ /g, '+')` with a comment that Android replaces
`+` with spaces in query params. **base64url's alphabet contains no `+` and no
`/`.** The encoding cannot hit a bug upstream has already been bitten by, and a
test asserts the property rather than trusting it.

### 4.2 Payload

```jsonc
{
  "v": 1,
  "app": { "name": "XBRW++", "version": "1.6.0" },

  "brew": {
    "date": "2026-09-19T07:41:03.852Z",
    "doseIn":      { "value": 15,  "unit": "g" },   // -> grind_weight
    "waterIn":     { "value": 240, "unit": "ml" },  // -> brew_quantity + type
    "beverageOut": { "value": 204, "unit": "g" },   // -> brew_beverage_quantity + type
    "brewTime": 188,                                // s -> brew_time (+ms)
    "temperature": 89,                              // -> brew_temperature
    "grindSize": "62",                              // string, as BC's field is
    "grinderName": "xBloom",                        // name hint -> mill
    "preparationMethod": "xBloom",                  // name hint -> method_of_preparation
    "bloomTime": 50,                                // -> coffee_blooming_time
    "firstDripTime": 31,                            // -> coffee_first_drip_time
    "note": "…generated stage summary…"
  },

  "flow": {                        // optional
    "fidelity": "full",            // "full" | "downsampled"
    "t":              [ … ],       // ms, delta-coded
    "waterDispensed": [ … ],       // 0.1 g, delta-coded
    "weight":         [ … ],       // 0.1 g, delta-coded
    "temperature":    [ … ]        // optional
  },

  "imported": {                    // optional, opaque to BC
    "source": "xbloom",            // stable lowercase key, for icon lookup
    "sourceName": "xBloom Studio", // display text, always present
    "schema": 1,
    "params": { /* plan, pattern, agitation, bypass, stalls, xid */ }
  }
}
```

**Units are explicit, never implied.** BC's `brew_quantity_type` is an enum of
GR/ML; getting it wrong silently corrupts every ratio downstream.

**`firstDripTime` is genuinely ours to give** — read off the sample stream as
the first `cup > 0`. It is real measured data BC would otherwise ask a user to
stopwatch.

**`bloomTime` is a judgement call**, taken from stage 1's pause. The schema doc
says so rather than presenting it as measured.

**`imported.params` is opaque by contract.** BC stores it and never parses it.
Nothing in BC's generic schema knows what a pour pattern is, which is the point
of a neutral design. The data survives BC's own backup, and is there if anyone
ever wants to draw an xBloom stage ladder.

### 4.3 Where `imported` lives, and why not `preparationDeviceBrew`

`IPreparationDeviceBrew` is `{ type: PreparationDeviceType; params: any }`, and
at first glance its `any` looks like the natural home. It is not.
`PreparationDeviceType` drives **live-connection UI** — header chips with
connected and disconnected WiFi and Bluetooth variants. A value that is never
connected, because it arrived as a link, would thread a dead state through
screens built for a live machine.

Instead, `ICustomInformationBrew` — today a one-field interface — gains one
optional field:

```ts
export interface ICustomInformationBrew {
  visualizer_id: string;
  imported?: { source: string; sourceName: string; schema: number; params: any };
}
```

No enum, no switch, no rendering coupling, and it persists through BC's backup
like everything else on `Brew`. `source: "xbloom"` is data, not a case
statement, so **no vendor name enters BC's type system**.

### 4.4 The provenance chip

Vendor branding without vendor branching. BC's logos are files at
`src/assets/custom-ion-icons/beanconqueror-<vendor>-logo.svg`, registered as
`ion-icon` names, so the chip is a map lookup with a text fallback:

```html
@if (brew?.customInformation?.imported; as imported) {
  <ion-chip outline="true">
    @if (importIcon) { <ion-icon [name]="importIcon" /> }
    {{ imported.sourceName }}
  </ion-chip>
}
```

`importIcon = IMPORT_SOURCE_ICONS[imported.source] ?? null`.

- Known vendor → a logo chip, like Meticulous.
- Unknown vendor → a text chip reading "xBloom Studio". The general case, not a
  degraded one.
- Adding a vendor later → an SVG and one map line. A two-line PR that needs no
  understanding of the import path.

**We ship the mechanism and an empty map.** The xBloom mark belongs to xBloom;
pushing a vendor's trademark into someone else's GPL repository is the
maintainer's decision, not ours to make for him. xBloom gets the text chip.

`sourceName` arrives from an untrusted URL. Angular escapes interpolation, so
this is not an injection risk, but it is length-capped and non-empty-checked in
the same validation pass as everything else, or a crafted link renders a chip
the width of a paragraph.

## 4.5 What maps where, and what BC does not have to support

The maintainer's open question is "which data and how to populate them ... like
the stages etc aren't supported in bq". The answer is that **stages do not need
to be supported. They need to be carried.** Everything we hold lands in one of
three tiers, and only the first requires BC to do anything.

**Tier 1, flattened into fields BC already has:**

| Ours | BC field | Note |
| --- | --- | --- |
| `dose` (§3) | `grind_weight` | |
| `waterTotal` | `brew_quantity` + type `ML` | |
| `cupTotal` | `brew_beverage_quantity` + type `GR` | |
| duration | `brew_time` (+ms) | |
| stage 1 temperature | `brew_temperature` | BC has one, we have per stage |
| `grindSize` (§3) | `grind_size` | string; 81 omits |
| `grinderRpm` (§3) | `mill_speed` | |
| stage 1 pause | `coffee_blooming_time` | judgement call, flagged |
| first `cup > 0` | `coffee_first_drip_time` | measured, not stopwatched |
| `samples.water` | `BrewFlow.waterDispensed` | |
| `samples.cup` | `BrewFlow.weight` | |

**Tier 2, human-readable in `note`.** The generated summary spells out every
stage: volume, temperature, pattern, agitation, pause. It renders in BC today,
in a field that already exists, with **zero upstream work**. A BC user reading
a brew sees the stages whether or not BC ever models them.

**Tier 3, structural in `imported.params`.** Plan, pour pattern, agitation,
bypass, stalls, xPod id. BC stores it and never parses it. It survives BC's
backup, and it is there if anyone ever wants to draw an xBloom stage ladder.

So "not supported in BQ" stops being a blocker: tier 2 makes stages visible
without a data model, and tier 3 makes them recoverable without a commitment.

**What BC has and we do not:** bean, mill, preparation, water, `tds`, pressure.
All are left for the user or omitted; none is guessed.

### 4.5.1 Open questions for the maintainer

Genuinely open, and his to answer:

1. **`realtimeFlow`** — should we compute flow and send it, or send
   `waterDispensed` and let BC derive it as it does for scales?
2. **Placement** — is `customInformation.imported` the right home, or would he
   rather it sat elsewhere?
3. **Temperature** — is flattening per-stage temperature to stage 1's value
   acceptable, or should it travel only in `flow.temperature`?
4. **Mill and preparation** — match by name with create-on-miss, or always
   leave them to the user?

## 5. The XBRW++ side

Three layers, one job each, so the format is testable without a URL and the URL
without a brew.

| Module | Responsibility |
| --- | --- |
| `library/brew/brewNote.ts` | The human-readable stage summary. Pure, no dependencies. |
| `library/brew/handoff/envelope.ts` | `StoredBrew` + samples → the neutral object. Knows the schema, unit tags, `firstDripTime`, the `imported` block. No compression, no URLs. |
| `library/brew/handoff/encode.ts` | Object → chunked URL. Columnar-delta, gzip, base64url, size budget. Knows nothing about brews. |
| `hooks/useBrewHandoff.ts` | The action: gather, encode, open, handle refusal. |

**One new dependency:** `fflate` for gzip. Pure JS, around 8 KB, no native code,
so no prebuild and no `expo.version` bump. React Native has no built-in zlib.

### 5.1 The note

Rendered from the record, pinned by test rather than by eye, and shared by
every path that wants a human-readable brew. From the Gummy Worms brew:

```
Brewed on xBloom Studio, logged with XBRW++
Recipe: Gummy Worms - Sprout coffee roasters

Stage 1   45 ml   89°C   spiral, agitated before and after
                         then pause 50 s
Stage 2  100 ml   88°C   circular
                         then pause 26 s
Stage 3   95 ml   88°C   circular

Water 240 ml · in cup 204 g · 3:08 total · held 34 s past plan
```

Follows `docs/copy.md`: no em dashes and no stray dashes, hence the middots. It
reads as something a person wrote, which is the point of putting it in front of
a Beanconqueror user.

### 5.2 The hook

Modelled on `useBrewExport`: a ref guard set synchronously before the first
`await` so a double tap cannot fire twice, `busy` exposed for the button, a
silent catch for cancellation.

**Deliberately no `canOpenURL`.** Detecting whether BC is installed requires
`LSApplicationQueriesSchemes` in `ios.infoPlist`, which is a native change, a
prebuild and an `expo.version` bump for a feature that is gated off. Instead we
attempt `openURL` and catch the rejection, surfacing a toast through
`notify.ts`.

### 5.3 Placement and gating

The action sits beside the existing export actions on the brew record screen.

Gated behind a **module constant, not a user setting**. A toggle for something
that cannot work until an upstream PR lands is noise in a screen the user must
read, and `DEFAULTS` is the list that drives backups: a key added there ships in
every backup file forever. The constant flips in the PR that follows the
maintainer's agreement, and is deleted once released.

Everything in §3, §5.1 and the two pure modules ships and earns its keep with
the flag off.

## 6. Degradation and errors

### 6.1 The size budget

A 979-sample brew is not the ceiling; a long recipe or a future higher sample
rate could be several times that. A URL the OS silently truncates produces a
gzip stream that fails to inflate, and the user sees a generic "unrecognised
link" with no idea why.

`encode.ts` enforces a **32,768-character budget on the assembled URL**, scheme
and every param included, not on the payload alone. That is roughly ten times a
typical brew and far below any plausible platform ceiling. Over budget, it
degrades in defined steps:

1. Full stream. Essentially always.
2. Halve the sample rate, repeatedly, while over budget.
3. At 1 Hz and still over, drop `flow` and send figures plus note.

`flow.fidelity` records which step was taken, so the receiving end never
presents a thinned curve as a complete one. A brew whose stream has already
been swept by the retention setting (`hasStream: false`) takes step 3 directly,
so that path is exercised rather than discovered.

### 6.2 Our failures

| Condition | Behaviour |
| --- | --- |
| BC not installed | `openURL` rejects; toast via `notify.ts` |
| BC installed but too old | BC's own "unrecognised link" message. Undetectable from here, and the right place for it to come from. |
| Double tap | Ref guard before the first `await` |
| Old row without §3 fields | Those fields omitted; the brew still exports |
| Grinder off | `grind_size` omitted, note says pre-ground |

### 6.3 The decoder is a trust boundary

It validates rather than trusts, for the reason `backup.ts` already records: a
forgiving constructor is useless as a validator, and a half-built `Brew`
reaching the form is worse than a rejected link. A chunk count that disagrees
with `n`, bad base64, failed inflate or CRC, wrong `v`, missing required
fields, absurd magnitudes, over-long `sourceName` — each produces BC's existing
error message and no partial state.

## 7. Proof

Only one rung is genuinely unknown; the rest is arithmetic or unit-testable.

- **PoC-0 — payload size. Done.** §1.2.
- **PoC-1 — format round trip.** A test in this repository: encode a real brew,
  decode it with a **from-scratch reader written against BC's field list**, and
  assert every target field lands. No BC checkout, no GPL contact. The
  `cardFixtures.ts` discipline: an independent reimplementation, so the round
  trip proves something instead of restating the encoder.
- **PoC-2 — the real unknown.** A BC fork branch with the handler, in a
  simulator, receiving an actual ~3 KB `beanconqueror://ADD_BREW` URL.
  **Whether a URL that size survives Capacitor's `appUrlOpen` cannot be derived
  by arithmetic.**

**PoC-2 is iOS only.** Android has never been verified on SDK 57 (#5), so we
cannot test it honestly. The write-up states the Android position as reasoning
rather than measurement: the Binder transaction limit is around 1 MB and this
payload is roughly 0.3% of it, and confirmation is invited from the maintainer
or an Android user.

**The PR is opened only if PoC-2 passes.** It is also the artefact for the
conversation: a branch to check out and a video of a brew landing in his own
add form is a different proposition from a feature request.

### 7.1 Tests

In XBRW++:

- `brewNote.test.ts` — wording pinned
- `encode.test.ts` — exact delta round trip; chunk boundaries; and an explicit
  assertion that the alphabet contains no `+` and no `/`
- `envelope.test.ts` — unit tags, `firstDripTime`, grinder-off, absent §3 fields
- `sizeBudget.test.ts` — a synthetic 3,000-sample brew degrades through the steps
- `useBrewHandoff.test.ts` — double-tap guard, rejecting `openURL`
- `roundTrip.test.ts` — PoC-1

In the BC fork: decoder unit tests per rejection case, in the repo's existing
setup.

## 8. The upstream PR

| File | Change |
| --- | --- |
| `src/interfaces/brew/ICustomInformationBrew.ts` | the optional `imported` block |
| `src/classes/brew/customInformationBrew.ts` | field init |
| `src/services/intentHandler/intent-handler.service.ts` | one `else if` for `ADD_BREW`, plus the `?shareBrew0=` sibling |
| `src/services/brewImport/brewImport.service.ts` *(new)* | decode, inflate, validate, build `Brew` + `BrewFlow` |
| `src/services/uiBrewHelper.ts` | `addBrewFromImport(brew, brewFlow)` |
| `src/components/brew-information/…` | the provenance chip and icon map |
| `src/assets/i18n/*.json` | error strings |
| `docs/import-api.md` *(new)* | the schema, so anyone can emit it |

Inflate uses `@zip.js/zip.js`, already a dependency. **No new packages.**

### 8.1 The write-up, before the code

Ordered by his interest:

1. What this is, in one line: an implementation of #280.
2. It is smaller than it sounds. Name the symbols that already exist:
   `brew_template`, `brew_flow_preset`, `addBrewFromVisualizerWithGraph`,
   `repeatBrew`, `saveFlowProfile`.
3. The size objection, measured. The table from §1.2.
4. base64url has no `+`, so the Android query-param bug he worked around cannot
   occur.
5. Neutral by design. One verb, any device, published schema. He implements it
   once instead of accepting a sixth bespoke integration.
6. We do the work: PR, tests, docs, i18n. He reviews.
7. Honest limits, stated before he finds them: iOS-measured only; Android
   reasoned; the bean stays user-chosen because UUID resolution has no name
   fallback and we refuse to guess at someone's shelf.

And, plainly, given #1163: **we are not xBloom.** XBRW++ is a third-party
community app; xBloom has no involvement in it and has not asked for this. He
was told to go ask the vendor, the vendor never came, and the people actually
blocked by that are users. One paragraph, and it stops the proposal being read
as the thing he already declined.

## 9. Out of scope

Stated so it does not creep in:

- **No automatic export on brew finish.** §2.1 rules it out.
- **No bean creation**, and no guessing at an existing one.
- **No writing into BC's storage.** `uiStorage.__importBackup` overwrites whole
  keys, so a file carrying a `BREWS` array replaces the user's entire history.
  #123 found this. Nothing here goes near it.
- **No file-based import**, for the same reason.
- **No batch export.** One brew first.
- **No read-back.** Ratings and notes entered in BC stay in BC.
