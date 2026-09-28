# Browse the community recipe hub

**Issue:** [#73](https://github.com/hessius/XBRecipeWriterPlus/issues/73)
**Also closes:** [#138](https://github.com/hessius/XBRecipeWriterPlus/issues/138)
**Date:** 2026-09-28

## 1. What this is

xBloom publishes a recipe catalogue at `collective.xbloom.com`, served by
`collective-api.xbloom.com`. It is unauthenticated, it holds 3,020 recipes, and
every row carries a share link the app's existing importer already accepts. This
spec adds a place in XBRW++ to browse it, and the machine-model concept that
browsing it correctly turns out to require.

The dependency runs that way round and not the other. #73 looked like a screen;
it is a screen sitting on top of #138.

## 2. The evidence

Everything below was verified live against the API on 2026-09-28 rather than
taken from prior art. The reference implementation consulted for endpoint names
was `saya6k/hacs-xbloom` (MIT).

### 2.1 The API

Base `https://collective-api.xbloom.com`. No auth, no `Referer`, no
`User-Agent`. A bare `Content-Type: application/json` POST works. This is a
different backend from `client-api.xbloom.com`, which the app already uses.

| Endpoint | Body | Returns |
| --- | --- | --- |
| `POST /communityRecipe/recipe/criteria` | `{}` | the facet vocabularies |
| `POST /communityRecipe/index/page` | see below | a page of rows |
| `POST /communityRecipe/recipe/detail` | `{"id": <int>, "type": 1}` | one recipe, with `introduce`, `uploadDate`, `pourList` |

Search fields: `pageIndex`, `pageSize`, `keyword`, `recipeType` (coffee 1, tea
2), `recipeUserType` (official 1, user 2), `sort` (date 1, likes 2, downloads
3), `sortType` (asc 1, desc 2), `originIds`, `varietalIds`, `processIds`,
`roastList`, `flavorIds`, `machineList`, `cupTypeList`. `pageSize: 100` is
honoured. The response's `data` carries `pageIndex`, `pageSize`, `totalPage`,
`total` and `list`.

Facet sizes: 28 origins, 49 varietals, 93 flavours, 9 processes, 5 roasts, 3
coffee types. Machines are `J15` (Studio) and `J20` (Original). Cup types are
xPod 1, Omni 2, Other 3, Omni Brewer 4.

Criteria items are `{"name": "Light Roast", "value": "1"}`. The `value` is a
string; a row's `roast` is an int. A row's `roast` of `0`, and a null, both mean
unset: 479 of 3,020 rows are in that state.

### 2.2 The catalogue is not a community

2,974 of the 3,020 rows are published by `xBloom Official`. Only 46 are genuine
user submissions, and all 46 are Studio. The screen should be understood as a
catalogue browser that happens to include user recipes, not as a social feature.

### 2.3 Two machines, two grind scales, and no conversion

The hub publishes the same recipe once per machine. That makes it a paired
dataset, which is what settles #138's open question 3.

Across 918 pairs that match unambiguously by name (exactly one Studio row and
one Original row bearing it):

| Field | Differs |
| --- | --- |
| `grinderSize` | 895 / 918 (97%) |
| `cupType` | 285 / 918 (31%) |
| `dose` | 20 / 918 (2%) |
| ratio (`grandWater`) | 18 / 918 (2%) |
| `rpm` | 16 / 918 (2%) |
| `volume` | 7 / 918 (1%) |
| `pourCount` | 3 / 918 (0%) |

So grind is the machine-specific field and dose is not. #138 saw dose differ on
two of five pods; at this sample size it differs on 2%. Nothing should be built
on a per-model dose.

The scales do not convert. Over 1,053 pairs:

- median difference 39, standard deviation 8
- best linear fit `studio = 0.640 * original + 42.91`, R² = 0.444
- that fit lands within ±2 grind steps on 215 of 1,053 pairs (20%)
- mean absolute error 5 steps, worst case 35

A slope of 0.64 is not an offset and an R² of 0.44 is not a relationship you can
put in a `Recipe`. These read as independently retuned recipes rather than one
number expressed two ways.

**The app must never convert a grind size between machines.** Where both are
needed, both must be fetched. This is the same rule `podCoffee.ts` already
applies to roast: an invented value is worse than no value.

Observed bands: Studio 32 to 74 across 1,697 recipes, Original 2 to 30 across
1,323. `GRIND_SIZE.min = 40` in `cardLimits.ts` excludes every Original recipe,
and must not be widened (the encoder emits `value - 40`).

### 2.4 The metadata is dirty

Inherited either way, so the normaliser is where it gets handled.

- Official rows pre-join facet arrays into a single element. Three separators
  are in use across the catalogue: `·`, `•`, and a plain space.
- Some `process` values are unparsed JSON that leaked through as a string,
  literally `["Washed"]`.
- Values are not always true. `Brazil Anaerobic Honey` is filed under origin
  `Colombia`, and its `introduce` describes a different lot again.
- Process free text across 2,747 entries: 924 `Washed`, 535 `Natural`, 74
  `Honey`, 51 `Anaerobic`, 44 `水洗`, 34 `Various`, 33 `Anaerobic Natural`, 28
  `Anaerobic Washed`, 26 `Co-ferment`, 25 `Fully Washed`, 21 `日晒`, 21
  `Advanced`, 18 `washed`, 17 `Dried`.
- Every `likesCount` sits just under 5,000, so the figure is not a real
  popularity signal and is not displayed.

### 2.5 The cup type ordering

The hub's `cupTypeList` runs xPod, Omni, Other, Omni Brewer. The app's
`CUP_TYPE` is XPOD 0, OTHER 1, OMNI 2, TEA 3. The middle two are swapped. This
is real evidence for open issue #151 and is recorded here rather than concluded.
Nothing in this spec depends on resolving it.

## 3. Phasing

Three phases, each its own PR off `main`, each in its own worktree. Phase 1 is
the only risky edit in the programme and is isolated so it can be reviewed and
reverted on its own.

1. **The machine model.** Closes #138. One settings row of UI.
2. **The hub.** Client, browse destination, detail route, save.
3. **The coffee.** Vocabulary widening, `recipe.coffee`, the import toggle.

Phase 2 depends on phase 1's setting. Phase 3 depends on phase 2's normaliser.

## 4. Phase 1: the machine model

### 4.1 The setting is the truth

`Settings.DEFAULTS` gains `machineModel`, defaulting to `studio`. It is added to
`settingsSnapshot()` in `app/settings.tsx` so it survives a backup; the
snapshot's return type makes omitting it a compile error.

A settings row offers Studio and Original. It is never silently overridden.

Detection was considered as the primary mechanism and rejected. A scan would
find an Original: `Transport.scan` is deliberately unfiltered and matches the
`XBLOOM` name prefix as well as the service UUID, with a comment saying why.
Everything after discovery is the Studio's, though. `MACHINE_SERVICE` and its
characteristics are what `connect` resolves, and the model is read over that
connection, so a machine we cannot finish connecting to never yields a reading.
Its owner sits on a default that is wrong for them indefinitely. Detection would
help everyone except the people it exists for.

### 4.2 Detection may only refine

On connect, a best-effort read of the Device Information Service (`0x180A`)
`Model Number String`. The read is allowed to fail and its failure is not
surfaced.

The string is stored raw. It is acted on only through a positive match against
the Studio's own string, which is learned from real hardware during
implementation. A non-match leaves the setting exactly as it is and records what
was seen.

Treating "not the Studio's string" as proof of an Original is forbidden. We own
no Original, so that inference cannot be verified, and it would misfire on a
firmware revision.

`Transport.scan` already reads the advertised name into `FoundMachine.name` and
discards it. That is persisted too. Neither reading changes behaviour in this
phase; both exist so #138's first open question can eventually be answered from
real devices rather than guessed at.

### 4.3 Threading `adaptedModel`

`adaptedModel` becomes a function of the setting: Studio 1, Original 2. The
hardcoded `1` is replaced at `library/XBloomRecipe.ts:263`,
`library/shareLink.ts:138`, `library/cloud/cloudLibrary.ts:41`,
`api/_lib/xbloom.ts:113`, `api/_lib/xbloom.ts:169` and
`api/_lib/payload.ts:235`.

Note that `XBloomRecipe` sends `adaptedModel` only on the `byXid` pod path.
`RecipeDetail.html`, which serves share ids, is not given one and does not need
one.

`api/_lib/payload.ts:162` currently rejects anything but 1. It becomes "1 or 2",
and `api/__tests__/payload.test.ts:96` is updated to pin both the acceptance of
2 and the continued rejection of 0 and 3. Only 1 and 2 return rows upstream;
that partition is real and stays enforced.

The client sends the model; the server does not infer it. `recipeFields` in
`api/_lib/xbloom.ts` echoes `payload.adaptedModel` rather than writing its own,
and the mint's row lookup uses the same value it created with, because a row
created in one partition is invisible to a lookup in the other.

### 4.4 The partition is not the machine

`shareLink.ts:137` records that `adaptedModel` "partitions the account's
library". `cloudLibrary.ts:41` walks that partition to find what the service
account holds. Those two facts together mean the setting cannot simply be
substituted at every site.

A user who mints links as a Studio owner and later corrects the setting to
Original would have every earlier row fall out of the walk. `shareLink`'s
fingerprint would then find no existing link for a recipe that has one, and mint
a duplicate row into the service account, every time.

So the two uses are separated:

- **Minting** uses the setting. A link describes a recipe for a particular
  machine, and an Original's grind tagged as a Studio's would be wrong for
  whoever opens it.
- **The library walk** in `cloudLibrary` reads **both** partitions and
  concatenates, because the question it asks is "what has this account minted",
  and the answer does not depend on what the user owns today. This costs a
  second page walk and is bounded by the same `MAX_PAGES`.
- **The mint's own row lookup** in `api/_lib/xbloom.ts` uses the model the row
  was created with, which it now has from the payload rather than from a
  constant.

Without §4.4 this phase would quietly corrupt the shared account for anyone who
changes the setting, which is precisely the group the setting exists for.

## 5. Phase 2: the hub

### 5.1 `library/hub/`

Pure TypeScript, no React, mirroring the split `library/brew/` already uses.

- **`hubApi.ts`** — the three endpoints and their request and response types.
  The only file that performs a fetch.
- **`hubCriteria.ts`** — the facet vocabularies, fetched once and held in
  memory for the session. Owns the roast mapping, including that `0` and null
  are unset.
- **`hubRow.ts`** — normalising one row. Every mess in §2.4 is contained here:
  splitting pre-joined facets on all three separators, discarding the leaked
  JSON, trimming, dropping empties.
- **`hubQuery.ts`** — builds the one search request, the way `libraryQuery.ts`
  builds the one library statement. Machine comes from the setting and is not
  user-selectable: browsing the other machine's recipes has no use, because the
  grind numbers would be wrong for the machine you own and cannot be corrected.

Nothing under `library/hub/` imports `Recipe`. A hub row becomes a `Recipe` only
at save, and only through the existing importer.

### 5.2 The destination

A new route. Not part of the library screen, for two reasons. The first is that
`libraryQuery.ts` is the single statement that searches, filters and orders the
library, and a catalogue of 3,020 entries forced through a query built for a
personal library would make one of the two worse at its job. The second is that
the two data shapes barely overlap: a hub row has origin, varietal, process,
roast, flavour, a photo, an author and no brew history, no accent, no tags and
no card bytes.

Layout:

- `ScreenTitle` with the result count as its Doto superscript.
- `RailSearchField` for the keyword, and a `RailChip` rail for origin, roast,
  process, flavour and sort. Chips open pickers populated from the server's own
  vocabularies, which is what keeps filtering correct on rows whose own text is
  malformed. Free-text search alone would miss them.
- Rows are photo-led. The bag shot at 104pt square, the name in Inter, origin
  and process in Doto caps, and dose, ratio and grind as accented Doto figures.
  The photo survives into the library as `recipe.imageURL` regardless of the
  coffee toggle (§6.4), so the browse screen and the thing it feeds show the
  same picture.
- `likesCount` is not shown (§2.4).

Long press enters select mode, reusing `SelectableRecipeRow`'s 26pt tick and a
save bar. Multi-select is not a new interaction to learn; it is the shelf member
picker.

Paging is `pageSize: 100` on scroll.

### 5.3 Getting there

A row inside `ImportSheet`, and a CTA on `EmptyLibrary`.

`ImportSheet` is the honest home: import is already a three-door concept and
browsing is a fourth answer to the same question. `EmptyLibrary` is where the
catalogue does the most good, because a new user with nothing has no reason to
open the import sheet, and 1,697 published recipes is a better first screen than
a prompt to scan a card.

`HomeHeader` does not gain a seventh glyph. A shelf in the library was rejected:
it would edit the shelf room.

Nothing in `app/index.tsx`, `libraryQuery.ts`, `libraryFilters.ts`,
`librarySort.ts` or the shelf room changes.

### 5.4 The detail route

Photo, the `introduce` paragraph, flavour notes, author, and the stage plan from
`pourList` drawn with `BrewStageLadder`, all before the recipe is owned. A save
button, and beside it the coffee toggle from §6.3.

The detail fetch is required regardless of the route's existence, because
`introduce` is the only source of the coffee's note.

### 5.5 Saving

One row is one `shareRecipeLink` handed to `parseImportInput` and
`XBloomRecipe`, both of which work unmodified: `parseImportInput` is
deliberately host-agnostic and accepts any host with an `?id=` parameter.

A batch is N of those, sequential. Sequential rather than parallel because the
endpoint is undocumented and rate limits are unknown. It shows a progress line
and reports partial failure by naming which rows landed, rather than resolving
to a single success or failure.

Duplicates go through `duplicates.ts` exactly as any other import does.

Recipes whose grind falls outside the card band are saved unchanged. They are
marked as unwritable in the library, which `cardLimits.ts` already handles: it
emits a `grindTooFine` message for sub-40 grinds today. Card writing is no
longer the only path to brewing, so an unwritable recipe is still a useful one.

## 6. Phase 3: the coffee

### 6.1 Widening the vocabulary

`beanTags.ts` is a closed vocabulary with an explicit rule: exact match only, "a
near miss is refused rather than repaired". The hub's vocabulary is wider.
Rather than discard 44% of the process values, the vocabulary widens.

- `PROCESSES` gains `Semi-Washed`, `Wet-Hulling`, `Enzyme Process`.
- `ROASTS` gains `Medium-Light`, `Medium-Dark`.
- `FERMENTATIONS` is unchanged. The hub's `Anaerobic Fermentation`, `Carbonic
  Maceration` and `Lactic Fermentation` map onto the `Anaerobic`, `Carbonic
  maceration` and `Lactic` that are already there, which is a good sign that the
  two models were drawn from the same reality.
- Matching becomes case-insensitive, which recovers the 18 rows spelling it
  `washed`.

The widening is **additive only**. No existing brew row is rewritten and no
existing value changes meaning. A user who recorded `Medium` for a medium-light
bean keeps `Medium`. #104 groups on these strings, and a remapping would
re-group data the user has already recorded; an addition does not.

Values with no home stay unset on the brew rather than being rounded to a
neighbour. `Various`, `Advanced` and `Dried` are not processes and are not
treated as one.

### 6.2 `recipe.coffee`

`PodCoffee` maps onto a hub row almost field for field: `name`, `origin`,
`process`, `variety` from `varietal`, `aromatics` from `flavor`, `imageUrl`,
`beanMix` from the `coffeeTypeList` facet, and `note` from the detail endpoint's
`introduce`.

`podImageUrl`'s https check applies unchanged.

One thing the pod path cannot do and this one can: `podCoffee.ts` deliberately
omits roast, because it was `1` on all five pods probed and "an invented roast
level is worse than none". The hub carries a real roast with a five-value lookup
table. Hub recipes can therefore supply a roast that the xPod path cannot, which
matters for the Beanconqueror export.

### 6.3 The toggle

Browsing is not owning. Most hub recipes are for a coffee the user does not
have, so attaching the coffee is a separate claim from taking the recipe.

A toggle on the detail route, defaulted off, carried into the save. In select
mode it is one toggle on the save bar covering the batch, because twelve
selected recipes cannot be twelve sheets.

`BeanProfile` is derived from brew rows and not from recipes, so this never
populates the ledger by itself. What it does is let the app answer the bean
question instead of asking it, and carry the answer into an export.

### 6.4 Artwork is not the coffee

`Recipe.imageURL` is a separate field from `recipe.coffee`, and
`XBloomRecipe.ts:105` already draws the line: "XBRW's `imageURL` and BC's
`imageUrl` share a source, not an owner."

The artwork is attached always, toggle or not. What a recipe looks like is a
fact about the recipe, in the way that what coffee you happen to own is not.
`PodSection` already draws `recipe.imageURL`, so a saved hub recipe carries its
bag shot exactly the way an xPod import does, and the browse screen does not
show a picture that then vanishes on save.

With the toggle off, `recipe.coffee` is left unset and the origin, process,
varietal, flavour and roast are not stored. The photo is not a claim about the
user's cupboard; those fields are.

## 7. Provenance

`RecipeSource` gains `hub`, with a verb for `placeholderName`. A `RecipeSource`
value rather than a reserved tag: the verb map is a `Record<RecipeSource,
string>`, so adding a case is a compile error until it is handled, the value
cannot be edited or deleted by the user, and it does not consume one of the 20
tag slots. Writing facet values into tags was rejected for the same reason: tags
are the user's own vocabulary, and the data already has a home in `coffee`.

`sharedBy` and `sharedByAvatar` are set from `userName` and `userAvatar`, so
author shelves work with no new machinery. Because 2,974 rows are `xBloom
Official`, that one shelf is large; `availableFilters`' 80% ceiling hides it
once enough of a library comes from there and shows it while it is still a
minority, which is the correct behaviour without a special case. The 46 genuine
user authors each make a small shelf, and those are the interesting ones.

### 7.1 A gap this opens

`backup.ts:341` validates `source` as any string, and `Recipe.ts:320` assigns it
unchecked. A backup carrying an unknown source therefore produces
`verb[this.source] === undefined` and a recipe displayed as `undefined 5 Oct`.
Adding a value makes that path reachable, so both sites gain a known-source
check falling back to `import`. This is a trust boundary: `backup.ts` exists
because the `Recipe` constructor is deliberately forgiving and useless as a
validator.

## 8. Failure and offline

No caching. The hub is either live or unavailable, and the library is the app's
offline surface.

A failed search shows a retry line rather than an empty state, because "no
results" and "no network" must not look the same. A failed detail fetch keeps
the row and says so. A failed save inside a batch is named in the result.

A cached catalogue was considered and rejected: it is a second database with its
own retention and sweep, for a screen that is only opened when the user wants
something they do not already have.

## 9. Testing

- `library/hub/__tests__/` covers the normaliser against the real malformed rows
  in §2.4: the `["Washed"]` leak, all three separators, roast `0`, an empty
  facet array, and the mis-filed origin. Fixtures are captured from live
  responses and committed, so no test touches the network.
- `hubQuery` is tested the way `libraryQuery` is: the request it builds for a
  given set of chips, including that the machine always comes from the setting.
- Component tests for the row, the rail and select mode, asserting on text,
  test IDs and accessible labels. RNTL v14 has removed `UNSAFE_getAllByType`, so
  a child's props cannot be inspected.
- Phase 1 pins that the API validator accepts `adaptedModel` 2 and still rejects
  0 and 3.
- Phase 3 pins that widening is additive: a brew recorded as `Medium` still
  reads as `Medium` and still groups with its peers.

## 10. Not doing

- **Converting a grind size between machines.** Ever. §2.3.
- **Widening `GRIND_SIZE`** in `cardLimits.ts` to admit Original recipes. The
  encoder emits `value - 40`.
- **Flavour notes as tags.** 93 values into a 20-slot vocabulary that belongs to
  the user.
- **A cached catalogue.** §8.
- **Liking, uploading, or following.** The hub's write endpoints are
  authenticated and 98% of the catalogue is official anyway.
- **Surfacing the 46 user recipes separately.** `recipeUserType: 2` exists and
  can be a chip later if the ratio ever changes.
- **Resolving the cup type ordering** in §2.5. Recorded as evidence for #151.
- **A hub shelf in the library.** §5.3.
