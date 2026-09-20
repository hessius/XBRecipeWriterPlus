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

For a **user-authored recipe** XBRW++ holds no bean data at all. There is no
roaster, origin, process or roast date on `Recipe`, and the only coffee
identity is a recipe name someone typed. Guessing at a person's shelf from a
recipe name would produce silent mis-attribution, which is worse than asking.

So the link carries brew figures, and the form is where the user settles the
bean, the mill and the preparation method. `grinderName` and
`preparationMethod` travel as **name hints** that make the dropdowns open on
the right thing when a match exists, and are harmless when it does not.

The consequence to accept: **there is no fully automatic export.** A human
confirms each brew. That was requested, and it is not available under this
design.

### 2.1.1 The exception: an xPod knows its coffee

An earlier draft of this section said we hold "no bean data whatsoever". That
was wrong, and the correction matters enough to record rather than quietly
overwrite. It was drawn from a test fixture in which `podsVo.subtitle` was
`"Ethiopia"`, which invited the reading that `subtitle` carries origin.

A probe of the live endpoint (`tRecipeDetailOfPods.thtml`, pods `NLC001`
through `NLC005`) shows `subtitle` is **empty** on real pods, and that
`podsVo` is far richer than we use. We read three of its thirteen fields:

| `podsVo` | Example (`NLC001`) | BC `Bean` |
| --- | --- | --- |
| `theName` | Kenya Sakami Gloria Natural Batian | `name` |
| `origin` | Nabiswa, Kenya | `variety[].origin` |
| `process` | Natural | `variety[].processing` |
| `varietal` | Batian | `variety[].variety` |
| `flavor` | Cherry・strawberry・blueberry | `aromatics` |
| `introduce` | producer narrative, ~400 words | `note` |
| `type` | Single Origin | `beanMix` |
| `roast` | `1` | `degreeOfRoast`, **meaning unverified** |
| `imagePath` | S3 URL | bean photo |

`roast` was `1` on all five pods sampled, so whether it is a roast level or a
constant is unknown. It is **not mapped** until a pod is found that differs.
There is no roaster and no roast date; both are simply absent, and BC's fields
for them stay empty rather than being invented.

That is close to a complete BC bean rather than a weak name hint. Three rules
keep it from undoing the decision above:

1. **Captured at import, not at export.** We already make a network call when
   importing an xPod recipe, so the coffee is stored on the `Recipe` then. An
   export must not depend on an undocumented third-party API being reachable;
   putting a live fetch in the middle of a user action makes the feature fail
   on a train.
2. **Snapshotted onto the brew record**, like `recipeName`, `accent` and
   `plan`. A recipe later re-pointed at a different pod must not rewrite what
   last month's brew says it was made with.
3. **Always a hint, never a UUID.** BC resolves beans by UUID with no name
   fallback (above), so the block can only ever be matched by name against
   beans the user already has (§4.5.1 decision 5). On a miss it is dropped and
   the coffee's name goes in the note. Bean *creation* stays out of scope (§9).

**Default: attached when the recipe is an unedited xBloom import** (`source ===
"import"` with an `xid` and no subsequent user edit), and off once the recipe
has been edited. The reasoning is that an untouched pod recipe almost certainly
brewed that pod, whereas an edited one is the case the user described: a recipe
kept and reused with a different coffee. It is one tap either way in the export
sheet, and BC's form is a second confirmation regardless.

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
| `grinderUsed?: boolean` | `recipe.grinder` | whether `mill` may be claimed |
| `coffee?: PodCoffee` | `recipe.coffee`, §2.1.1 | `bean` hints |

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

### 3.1 The mill is the machine, when the grinder ran

`recipe.grinder` is a plain boolean, so this needs no inference: when it is
true the xBloom ground the coffee, and `mill` can be asserted rather than
guessed. `grinderRpm` goes to `mill_speed` and `grindSize` to `grind_size`,
both already in the table above.

When it is false the coffee was ground somewhere we know nothing about. `mill`
is then **omitted entirely** rather than defaulted, and the note says the
coffee was pre-ground. This is the same judgement as the `grindSize === 81`
rule and must stay consistent with it: the two are the same fact read from two
places, and `grinderUsed` is recorded so a later reader does not have to
recover it from a sentinel.

The mill **name** is deliberately under-claimed as `"xBloom"` rather than
`"xBloom Studio"`. BC matches mills by UUID and creates on miss, so a wrongly
specific name becomes a permanent duplicate in someone's mill list that they
did not ask for and will not know to clean up. A vaguer truth costs nothing; a
confident error costs a row forever.

We could be more specific, and currently throw the means away. `Transport.ts`
reads the advertised BLE name into `FoundMachine.name` at scan time, and
nothing persists it: `Settings.DEFAULTS` holds `machineDeviceId` and no name.
Keeping it is a small change. Whether that string actually separates the two
models is **not answerable from our code** — it depends on what each firmware
advertises, and the proper route would be the BLE Device Information Service
(`0x180A`) `Model Number String`, which we have never read. Both are
observations to make, not conclusions to reason to, and neither blocks this
design.

### 3.2 `adaptedModel` is the model discriminator, and we hardcode it

Found while probing the pod endpoint for §2.1.1, and recorded here because it
is a live correctness issue in its own right rather than a Beanconqueror
matter.

The same pod returns a **different recipe per model**:

| xid | model 1 grind | model 2 grind | model 1 dose | model 2 dose |
| --- | --- | --- | --- | --- |
| NLC001 | 55 | 26 | 15 | 15 |
| NLC002 | 48 | 24 | 15 | 15 |
| NLC003 | 58 | 26 | 15 | 15 |
| NLC004 | 55 | 25 | 18 | 15 |
| NLC005 | 57 | 27 | 18 | 15 |

Flow rates differ too. `podsVo` is byte-identical across the two, which is the
tell: the coffee is model-independent, the brew recipe is not. Only `1` and `2`
return rows; `0` and `3` come back empty.

**Model 1 is the xBloom Studio**, confirmed against the official app, which
shows grind 55 for `NLC001`. Model 2 is therefore the original xBloom, and its
grind band of roughly 24–27 sits **below `GRIND_SIZE.min = 40`** in
`cardLimits.ts` — our card encoding cannot represent an original's grind
setting at all. This is consistent with #68, which hardware-verified the 40–80
band on a Studio.

We send `adaptedModel: 1` from six call sites, and `api/_lib/payload.ts:162`
rejects anything else. That was a deliberate single-partition choice and it
serves the common machine correctly. The unknown consequence was that original
owners receive Studio grind settings. **This is out of scope here and belongs
in its own issue**; it is written down because the evidence was gathered in
this session and would otherwise be lost.

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

  "bean": {                        // optional, §2.1.1; hints only, never a UUID
    "name": "Kenya Sakami Gloria Natural Batian",
    "origin": "Nabiswa, Kenya",
    "process": "Natural",
    "variety": "Batian",
    "aromatics": "Cherry・strawberry・blueberry",
    "beanMix": "Single Origin",
    "note": "…producer narrative…",
    "imageUrl": "https://…png"
  },

  "flow": {                        // optional
    "fidelity": "full",            // "full" | "downsampled"
    "t":              [ … ],       // ms, delta-coded
    "waterDispensed": [ … ],       // 0.1 g, delta-coded
    "weight":         [ … ],       // 0.1 g, delta-coded
    "temperature":    [ … ]        // optional; MEASURED only. XBRW++ emits none
  },

  "metrics": [                     // optional, declared labelled series
    {
      "key":  "targetTemperature",
      "name": "Target temp",
      "unit": "°C",
      "kind": "target",            // "target" | "measured"
      "t": [ 0, 50000, 96000, 141000 ],
      "v": [ 94, 93, 93, 93 ]
    }
  ],

  "imported": {                    // optional, opaque to BC
    "source": "xbrw",              // the APP that wrote this, for icon lookup
    "sourceName": "XBRecipeWriter++",
    "sourceUrl": "https://github.com/hessius/XBRecipeWriterPlus",
    "device": "xBloom Studio",     // the MACHINE, display text
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

**`flow.temperature` exists in the schema and we never populate it.** The
envelope is neutral, and a sender with a temperature probe should have somewhere
to put its readings. We have none: `BrewSample` is `{at, water, cup, pour}` and
the machine's `Notification` union carries no temperature at all. That array is
for measurements, and we have no measurement to put in it.

**`metrics` is where a declared series goes**, and it is the honest home for
our per-stage temperature (§4.5.1 decision 3). It maps one-to-one onto BC's
`customMetrics` and `customAxes`, which `graph-helper.service.ts` already
renders as Plotly traces on their own axes with a translated name and a legend
chip, so it costs no upstream work.

`kind` is the point of the block. `"measured"` and `"target"` are different
claims about the world, and a schema that cannot tell them apart invites
exactly the misrepresentation §4.5.1 decision 3 was worried about. It also
generalises: a sender with a pressure or flow *target* alongside its readings
has somewhere truthful to put both.

`t` here is absolute milliseconds and is **not** tied to `flow.t`. A step
function changes only at stage boundaries, so a four-stage brew is four points
rather than a value per sample, and the series costs nothing against the size
budget.

**`source` is the application, not the machine.** An earlier draft used
`"xbloom"` for both, which conflated two different facts. The payload dialect
is set by whatever *wrote* the record, so `source` identifies the sending app
and `device` carries the hardware as display text. This matters beyond
tidiness: the provenance chip answers "where did this come from", whose honest
answer is an app, and keying the icon map on the app is what makes §4.4.1
legally trivial.

**`imported.params` is opaque by contract.** BC stores it and never parses it.
Nothing in BC's generic schema knows what a pour pattern is, which is the point
of a neutral design. The data survives BC's own backup, and is there if anyone
ever wants to draw an xBloom stage ladder.

**`bean` is absent far more often than present.** It appears only for an
unedited xPod recipe (§2.1.1). Every field in it is optional, no field is a
UUID, and a decoder that ignores the block entirely must still produce a
correct brew. `roaster` and `roastingDate` are not in the block because the pod
endpoint does not carry them; they are left for the user rather than invented.

**`grinderName` is omitted, not defaulted, when the grinder did not run**
(§3.1), and stays `"xBloom"` rather than naming a model we cannot yet
distinguish.

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
  imported?: {
    source: string; sourceName: string; sourceUrl?: string;
    device?: string; schema: number; params: any;
  };
}
```

No enum, no switch, no rendering coupling, and it persists through BC's backup
like everything else on `Brew`. `source: "xbrw"` is data, not a case
statement, so **no vendor name enters BC's type system**.

### 4.4 The provenance chip

Sender branding without sender branching. BC's logos are files at
`src/assets/custom-ion-icons/beanconqueror-<vendor>-logo.svg`, registered as
`ion-icon` names, so the chip is a map lookup with a text fallback:

```html
@if (brew?.customInformation?.imported; as imported) {
  <ion-chip outline="true" (click)="openSource(imported)">
    @if (importIcon) { <ion-icon [name]="importIcon" /> }
    {{ imported.sourceName }}
  </ion-chip>
}
```

`importIcon = IMPORT_SOURCE_ICONS[imported.source] ?? null`.

- Known sender → a logo chip, like Meticulous.
- Unknown sender → a text chip reading "XBRecipeWriter++". The general case,
  not a degraded one.
- Adding a sender later → an SVG and one map line. A two-line PR that needs no
  understanding of the import path.

`sourceUrl` makes the chip tappable, which is the whole of our attribution ask
(§4.4.3). It is validated as `https:` and opened through BC's existing external
link path; a `javascript:` or `file:` URL from a crafted link must never reach
an opener.

`sourceName` arrives from an untrusted URL. Angular escapes interpolation, so
this is not an injection risk, but it is length-capped and non-empty-checked in
the same validation pass as everything else, or a crafted link renders a chip
the width of a paragraph.

### 4.4.1 We ship the illustration, not xBloom's logo

An earlier draft said "we ship the mechanism and an empty map", on the reasoning
that pushing a vendor's trademark into someone else's GPL repository was the
maintainer's call. Having actually used the app, that was over-cautious, and it
misread what BC does.

BC's `PREPARATION_TYPES` enum names **46 brewers**, and almost all of them are
trademarks belonging to companies with no involvement in the project: Hario
V60, Chemex, AeroPress, Kalita Wave, Bialetti, Origami, Orea, Cafelat, Flair,
Fellow Stagg, Espro Bloom, Moccamaster, Delter, December, Cafec, Tricolate,
ROK, Ratio Six, Karlsbader Kanne. Naming a product in order to identify it is
ordinary use, and it is the house pattern, not an exception to it.

The asset set has **two visually distinct registers**, and the difference is
not cosmetic:

| Register | Examples | Size | What it is |
| --- | --- | --- | --- |
| Stylized illustration | `preparation-v60` 2.8 KB, `-chemex` 3.6 KB, `-aeropress` 3.1 KB, `-kono` 1.3 KB, `-origami` 1.1 KB | 1–11 KB | Original line drawing, 200×200, `fill="none"`, hand-authored paths |
| Traced product artwork | `preparation-gaggiuino` 900 KB, `-sanremo-you` 703 KB, `-meticulous` 574 KB, `-xenia` 395 KB, `-move2` 356 KB | 356–900 KB | Detailed renders, and only for the five live-connection integrations |

The `beanconqueror-<vendor>-logo.svg` files are a third thing again, and
smaller than either: `meticulous-logo.svg` is an Adobe Illustrator export
carrying the brand red `#EE380F`. Those are **real vendor logos**, and they
exist for the five machines BC actually integrates with, whose makers had
reason to hand over brand assets.

So the line to draw is clear:

- **We contribute `beanconqueror-preparation-xbloom.svg`**: an original
  stylized line drawing of the machine, in the register the other forty sit
  in — 200×200, `fill="none"`, no brand colour, no wordmark, drawn by us and
  not traced from xBloom's marketing renders or product photography.
- **We do not contribute an xBloom logo.** No `beanconqueror-xbloom-logo.svg`.
  That set belongs to integrations whose vendors supplied the artwork, and we
  are not xBloom and cannot supply it. What goes in the logo slot is our own
  mark, not theirs — §4.4.2.
- **We do not mirror the heavy register.** The 356–900 KB traced files belong
  to live-connection integrations. An xBloom arriving over a link is not a
  connected device in BC's sense, and half a megabyte in someone else's bundle
  is a poor way to introduce yourself.

This is a branded integration in exactly the way Chemex and Kalita are branded
integrations: named, drawn, and unaffiliated.

### 4.4.2 Two slots, two marks

The logo slot has an occupant after all, and it is not xBloom's. The two icon
slots answer different questions, and the answers are different marks:

| Slot | Question | Mark |
| --- | --- | --- |
| Preparation type | What did you brew on? | An xBloom. Original line drawing, §4.4.1 |
| Provenance chip | Where did this record come from? | **XBRecipeWriter++.** Our own logo |

Putting our logo on the preparation type would assert that the coffee was
brewed with XBRecipeWriter++, which is false, and it would sit in a list where
every other entry is a vessel. Putting the machine on the provenance chip would
answer the wrong question. This is the reason `source` names the app and
`device` names the hardware (§4.2).

The chip is ours by right: `assets/branding/xbrw-icon.svg` was drawn for this
project and is ours to license. **That removes the only legally awkward asset
from the PR.** The chip was otherwise going to be bare text, so this is a
strict improvement as well as a simpler contribution — we grant our own mark
rather than asking a maintainer to accept someone else's.

Two practical constraints on the file. It is 1024×1024 with an opaque black
`rect` and two Gaussian-blur filters, which in BC's `ion-icon` set renders as a
black square and ignores theming entirely. A **flattened monochrome variant**
is needed: no filters, no background, sized to the icon set. BC's logo slot
does permit brand colour — `meticulous-logo.svg` carries `#EE380F` — so colour
is available if it reads better, but the filters and the background are not.

The grant should be stated rather than implied. `LICENSE` covers this
repository's contributions under MIT and `NOTICE` draws that line; a
contributed mark needs one explicit sentence in the PR granting use for the
purpose of identifying this integration. GPL covers code, not trademarks, and
leaving it unsaid would hand the maintainer an ambiguity he did not ask for.

### 4.4.3 Discovery, and how much to ask for

The chip attributes but does not discover: only someone who has already
imported a brew ever sees it. A BC user who owns an xBloom and has never heard
of XBRW++ has no path to us at all. Three asks, smallest first, genuinely
independent, and he can take any subset:

1. **The chip is tappable**, opening `sourceUrl`. Attribution, plus a route
   onward for anyone who has already received a brew. Cost: one click handler
   and a scheme check.
2. **`docs/import-api.md` lists known senders.** Documentation, no UI, no
   promotional surface. It also serves the neutral design: the point of a
   published schema is that a list of implementers can exist.
3. **A line under the xBloom preparation type**, noting that brews can be
   imported from XBRecipeWriter++. This is the only one that reaches a user who
   has never imported anything, because choosing that preparation type is the
   moment they self-identify as an xBloom owner.

The third is the real ask and should be presented as such rather than slipped
in. It is promotional surface in someone else's app, from a project he has no
relationship with, in a repository where he has already declined an xBloom
integration once. If he takes one and two and refuses the third, that is a
reasonable place to land and the feature is undamaged.

**We reciprocate regardless**, stated up front rather than offered as a trade:
XBRW++ points at Beanconqueror from its own export surface (§5.3). That costs
him nothing, does not depend on his answer, and is the half of this we control.

### 4.4.4 `PREPARATION_TYPES.XBLOOM`

The consequence of the above is that xBloom becomes a preparation type rather
than only a string in an envelope. Three touch points, all one-liners:

1. `PREPARATION_TYPES.XBLOOM = 'XBLOOM'` in the enum.
2. `case PREPARATION_TYPES.XBLOOM: return 'beanconqueror-preparation-xbloom';`
   in `Preparation.getIcon()`.
3. Registration of the SVG alongside the other custom ion icons, plus i18n
   label.

`getPresetStyleType()` needs **no** case: its `default` is
`PREPARATION_STYLE_TYPE.POUR_OVER`, which is what an xBloom is. The five
`ESPRESSO` cases are the exceptions, and we are not one.

This also gives the `preparationMethod` name hint of §4.2 a real target. Before
this section it was a string that might coincidentally match something a user
had typed; with the type present, matching is meaningful and the dropdown opens
on the right entry.

**It stays orthogonal to the transport.** §2.2 is unchanged: the `ADD_BREW`
verb, the envelope and the `source` discriminator remain vendor-neutral, and a
second device could be added without touching any of it. The branding lives
entirely in presentation, which is precisely where BC already keeps it for the
other forty-six.

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
| stage 1 temperature | `brew_temperature` | a setpoint, and a truer number than the field usually holds |
| `grindSize` (§3) | `grind_size` | string; 81 omits |
| `grinderRpm` (§3) | `mill_speed` | |
| stage 1 pause | `coffee_blooming_time` | judgement call, flagged |
| first `cup > 0` | `coffee_first_drip_time` | measured, not stopwatched |
| `samples.water` | `BrewFlow.waterDispensed` | |
| `samples.cup` | `BrewFlow.weight` | |
| `coffee.*` (§2.1.1) | `Bean` name match | xPod only, match or drop, never a UUID |
| `metrics[]` | `BrewFlow.customMetrics` + `customAxes` | per-stage target temperature; already rendered |

**Tier 2, human-readable in `note`.** The generated summary spells out every
stage: volume, temperature, pattern, agitation, pause. It renders in BC today,
in a field that already exists, with **zero upstream work**. A BC user reading
a brew sees the stages whether or not BC ever models them.

**Tier 3, structural in `imported.params`.** Plan, pour pattern, agitation,
bypass, stalls, xPod id. BC stores it and never parses it. It survives BC's
backup, and it is there if anyone ever wants to draw an xBloom stage ladder.

So "not supported in BQ" stops being a blocker: tier 2 makes stages visible
without a data model, and tier 3 makes them recoverable without a commitment.

And one dimension of a stage does better than "carried". The temperature
profile is **drawn**, on BC's own chart, through `customMetrics` — machinery
that already exists and already renders. That is the strongest available answer
to "the stages aren't supported": for the axis that matters most to an xBloom
user, they turn out to be.

**What BC has and we do not:** mill identity beyond "an xBloom ran" (§3.1),
preparation, water, `tds`, pressure, and — for every recipe that is not an
unedited xPod import — the bean. All are left for the user or omitted; none is
guessed.

### 4.5.1 Decisions taken, and why

An earlier draft left six questions for the maintainer. That was the wrong
shape of ask. Six open questions is homework handed to someone who has already
said he is stretched; six decisions with reasons is a review, which is both
less work and easier to disagree with. Each of these is a position we can
defend and none is expensive to reverse.

**Every one of them is marked in `docs/import-api.md`, and any of them can be
overruled in review without redesigning anything.**

**1. Flow: we send what we measured, and no derivative.**

`waterDispensed` and `weight` only. No `realtimeFlow`.

Flow is a derivative of weight, and BC already computes its own:
`IBrewWeightFlow` carries `calculated_real_flow`, `smoothed_weight` and
`not_mutated_weight`, which is a smoothing pipeline tuned to scale hardware.
A curve we smoothed our way, sitting on the same axes as natively produced
curves, is a subtle inconsistency that would be noticed later and blamed on the
import. Sending the measurement and letting BC derive keeps imported and native
brews identical in shape, and it survives BC changing its smoothing.

Partial series are ordinary rather than degraded: `BrewFlow`'s constructor
initialises all thirteen arrays to `[]`, and a pour-over logged with a scale
already has an empty `pressureFlow`. We are not introducing a new case.

It is also free bytes in a 2.3 KB budget.

**2. Placement: `customInformation.imported`, as designed.**

§4.3 gives the reasoning — `preparationDeviceBrew` threads live-connection
state through screens built for a connected machine. One optional field on a
one-field interface, no enum, no switch. It is additive and it is the single
cheapest thing in this document to move, so it is not worth blocking on.

**3. Temperature: the scalar, plus a labelled target series.**

`brew_temperature` gets stage 1. The per-stage figures travel as a **declared
target metric** (§4.2), not as `temperatureFlow`.

An earlier draft sent the scalar and nothing else, on the reasoning that
emitting the plan's temperatures would dress an intention up as a measurement.
That applied a standard BC does not apply to itself, and it threw away
something that actually distinguishes xBloom recipes.

**We still do not measure temperature.** The machine's `Notification` union is
`status`, `event`, `waterWeight`, `cupWeight`, `MachineInfo` and `unknown`;
every temperature symbol in `library/machine/` is outbound. That fact is
unchanged and it is why the series is labelled.

But two things make the earlier conclusion wrong:

1. **`brew_temperature` is natively an intention.** A V60 user types what they
   set the kettle to; it then drifts in the gooseneck, over the pour, and in
   their memory. An xBloom's figure is a commanded setpoint on a closed-loop
   heated machine, tracked by the hardware. Against that field's typical
   content ours is the *more* faithful number, not the less.
2. **Per-stage temperature is a real distinction.** A brew at 94/93/93/93 and
   one at 92/88/85 are different brews. Dropping the profile to a single
   scalar loses the thing an xBloom user would most want to compare.

The reason not to use `temperatureFlow` is narrower than "it is not measured":
its fields are `actual_temperature` and `old_temperature`, which is sensed
language, and a synthesized series there sits on the same axis as genuinely
measured water and weight with nothing to tell them apart.

`customMetrics` and `customAxes` are the right home, and BC built them for
exactly this. `graph-helper.service.ts` turns each entry into a Plotly scatter
trace on its own axis from `y11` upward, with a translated name, light and dark
colours, and a legend chip. **This needs no upstream change whatsoever** — it
is existing, rendered machinery, so the profile becomes visible on the chart
without asking him for anything.

The axis is named "Target temp" and carries `°C`. Nothing claims to be a
reading, the data is on the graph where it can be compared, and if the machine
ever starts reporting a probe value the series moves to `temperatureFlow` and
the label changes with it.

Cost on the wire is close to nothing: a step function changes only at stage
boundaries, so a four-stage brew is four points.

**4. Mill and preparation: match or nothing. Never create.**

BC's own precedent decides this. `findBeanByInternalShareCode` looks up an
incoming reference and, on a miss, does nothing at all — `if (bean) { ... }`
with no `else`. An incoming reference in BC matches an existing entity or is
silently dropped; nothing in the codebase creates one on behalf of a link.

So: case-insensitive name match against **non-archived** entries, because
`repeatLastBrewForBeanByInternalShareCode` filters on `finished === false` for
bean, mill and preparation alike. No match means the field is left unset and
the form asks, which is already guaranteed to work: `canBrewBoolean` requires
the user to own at least one mill and one preparation before they can brew at
all.

This is also why §3.1 under-claims the mill name as `"xBloom"`. Under
match-or-nothing a wrong name simply fails to match and costs nothing, whereas
under create-on-miss it would be a permanent duplicate. The conservative
transport rule and the conservative naming rule support each other.

**5. Bean: match by name, and nothing more in v1.**

The same precedent, the same answer. The `bean` block (§2.1.1) is matched
against existing non-archived beans by name; on a miss the block is dropped and
the coffee's name appears in the note, so the user can see what it was while
choosing for themselves.

Bean **creation** stays out (§9). It is a larger conversation than this feature
and it would make an import able to write new top-level entities into someone's
library, which is a much bigger trust ask than adding one brew.

Worth recording for later rather than proposing now: BC's existing bean share
link already creates beans today, with no upstream change at all. An xPod
coffee could in principle be delivered that way. It is rejected for v1 because
handing a user two links for one brew is a poor experience, but it means bean
creation is reachable without new machinery if anyone wants it.

**6. The marks and the hints: offered, separable, pre-emptively droppable.**

§4.4.1 to §4.4.3. We contribute `PREPARATION_TYPES.XBLOOM`, an original
stylized drawing in the V60 and Chemex register, our own logo for the
provenance chip, a tappable chip, and a known-senders list in the docs.

The one genuine ask is the line under the xBloom preparation type, and it is
offered in its own commit with the expectation that it may be declined. Nothing
in the import path reads the enum member and no brew depends on either icon, so
every piece of this can be dropped without touching the feature.

**The decoder detail we owe him.** BC's flow series carry `timestamp` and
`brew_time` as **strings**, and value entries as `old`/`actual` pairs rather
than single readings. The decoder reconstructs both: the pair falls out of the
delta encoding for free, since the previous value is what the delta was applied
to, and both time fields are derived from `t`. This is BC's format, produced by
BC's decoder, from our neutral envelope — which is the whole point of not
shaping the wire format like BC's internals (§4).

## 5. The XBRW++ side

Three layers, one job each, so the format is testable without a URL and the URL
without a brew.

| Module | Responsibility |
| --- | --- |
| `library/brew/brewNote.ts` | The human-readable stage summary. Pure, no dependencies. |
| `library/brew/handoff/envelope.ts` | `StoredBrew` + samples → the neutral object. Knows the schema, unit tags, `firstDripTime`, the `bean` and `imported` blocks. No compression, no URLs. |
| `library/brew/handoff/encode.ts` | Object → chunked URL. Columnar-delta, gzip, base64url, size budget. Knows nothing about brews. |
| `hooks/useBrewHandoff.ts` | The action: gather, encode, open, handle refusal. |

The xPod coffee is captured **outside** these modules, in the import path that
already talks to the pod endpoint (§2.1.1), and snapshotted onto the brew
record alongside the widened #109 fields. `envelope.ts` reads it off the record
and never fetches. That keeps the one network dependency where a network
already was.

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

**The reciprocal pointer.** When the action is enabled, the export surface
names Beanconqueror and links to it: a one-line credit, copy following
`docs/copy.md` and the no-dash rule, with the BC name as plain text rather than
a logo we have no licence to ship. This is not contingent on §4.4.3 — it is
offered whatever he decides, because the good-faith half of an integration
should not be conditional on getting the promotional half. It costs one string
and it is entirely ours to give.

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

`sourceUrl` deserves its own line because it is the one field that becomes an
action rather than text. It is rejected unless it parses and its scheme is
`https:`; a `javascript:` or `file:` URL arriving from a crafted link must
never reach an opener. The chip is not rendered as tappable when `sourceUrl`
is absent or refused.

`sourceUrl` deserves its own line because it is the one field that becomes an
action rather than text. It is rejected unless it parses and its scheme is
`https:`; a `javascript:` or `file:` URL arriving from a crafted link must
never reach an opener. The chip is not rendered as tappable when it is absent
or refused.

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
| `src/components/brew-information/…` | the provenance chip, icon map, and the tappable `sourceUrl` handler |
| `src/assets/custom-ion-icons/beanconqueror-xbrw-logo.svg` *(new)* | **our** mark, flattened and granted, §4.4.2 |
| `src/enums/preparations/preparationTypes.ts` | `XBLOOM` |
| `src/classes/preparation/preparation.ts` | one `getIcon()` case; `getPresetStyleType()` needs none |
| `src/assets/custom-ion-icons/beanconqueror-preparation-xbloom.svg` *(new)* | original stylized illustration, §4.4.1 |
| `src/assets/i18n/*.json` | error strings, preparation label, the §4.4.3 hint |
| `docs/import-api.md` *(new)* | the schema, so anyone can emit it, plus the known-senders list |

Inflate uses `@zip.js/zip.js`, already a dependency. **No new packages.**

The preparation type, the two icons and the §4.4.3 hints are **separable from
the rest**. If the maintainer wants the transport without the branding, or the
branding reviewed on its own, they split cleanly along the table above: nothing
in the import path reads `PREPARATION_TYPES.XBLOOM`, and neither icon is
required for a brew to land correctly. Offering them as separate commits is the
courteous default.

**The xBloom illustration is deferred until he agrees.** Drawing it is
illustration work rather than code, it must match the line weight of `v60` and
`chemex` rather than be a traced silhouette, and commissioning it before there
is a decision would be spending effort to create an obligation. The text
fallback covers the gap in the meantime.

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
   once instead of accepting a sixth bespoke integration. Branding is
   orthogonal and lives where his already does: a preparation type and a
   stylized illustration, in the register V60 and Chemex sit in (§4.4.1),
   offered as a separate commit he can take or leave.
6. We do the work: PR, tests, docs, i18n. He reviews.
7. Honest limits, stated before he finds them: iOS-measured only; Android
   reasoned; the bean stays user-chosen, because BC's own precedent is
   match-or-nothing and we are not going to be the first thing in the codebase
   that writes new entities into a library from a link. For an unedited xPod
   recipe we do hold real coffee data (§2.1.1), and even then we only match it
   by name and otherwise put the name in the note.
8. **Decisions, not questions.** §4.5.1 settles all six and shows the working,
   including the two places BC's own code made the choice for us. He is being
   asked to review positions rather than answer a quiz, and each one names what
   it would cost to reverse. This is the difference between a contribution and
   a support request, and it is the point of the whole write-up.

And, plainly, given #1163: **we are not xBloom.** XBRW++ is a third-party
community app; xBloom has no involvement in it and has not asked for this. He
was told to go ask the vendor, the vendor never came, and the people actually
blocked by that are users. One paragraph, and it stops the proposal being read
as the thing he already declined.

## 9. Out of scope

Stated so it does not creep in:

- **No automatic export on brew finish.** §2.1 rules it out.
- **No bean creation**, and no guessing at an existing one. The xPod `bean`
  block (§2.1.1) is a prefill hint; whether BC ever creates from it is his call
  (§4.5.1 decision 5), not something this design assumes.
- **No fix for the `adaptedModel` grind-scale split.** §3.2 records the
  evidence; the fix belongs in its own issue and touches the import and share
  paths, not the export.
- **No BLE model detection.** §3.1 says why it cannot be concluded from code,
  and the mill name under-claims instead.
- **No xBloom logo or wordmark upstream**, and nothing traced from xBloom's
  product photography or marketing renders. §4.4.1 draws the line: an original
  stylized illustration, in BC's own register, and nothing else. The logo slot
  carries **our** mark, which is ours to grant (§4.4.2).
- **No paid or commissioned artwork before there is an agreement.** The
  illustration is deferred (§8).
- **No writing into BC's storage.** `uiStorage.__importBackup` overwrites whole
  keys, so a file carrying a `BREWS` array replaces the user's entire history.
  #123 found this. Nothing here goes near it.
- **No file-based import**, for the same reason.
- **No batch export.** One brew first.
- **No read-back.** Ratings and notes entered in BC stay in BC.
