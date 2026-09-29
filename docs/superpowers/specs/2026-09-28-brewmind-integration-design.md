# BrewMind integration

Implements #159.

## The short version

Two independent halves, both built here.

1. **Importing.** A deep link `xbrw://import?v=1&source=brewmind&share=<url>&bean.*=...`
   becomes a fourth door onto the import sheet we already have, carrying the
   coffee BrewMind knows about into `PodCoffee`, which is already the block we
   hand to Beanconqueror.
2. **Recipe creation.** A button opens `brewmind.coffee/?client=xbrw&v=1` in an
   auth session, which returns when BrewMind fires the link above, so the round
   trip never leaves the app.

No API on either side, and no custom native code. `xbrw` is already a
registered scheme (`app.json`), so the link itself works with no config
change. The one new dependency, `expo-web-browser`, does carry Apple and
Android native modules of its own, which is why this is still a
native-affecting change (see §3).

## The contract, and the one place it is ambiguous

#159 said the field names were Beanconqueror's. On five of them they were not.

`Bean` and `IBeanInformation` in the Beanconqueror repository spell them
`roastingDate`, `roast`, `processing`, `cupping_points` and `decaffeinated`;
#159's first table said `roastDate`, `roastLevel`, `process`, `cuppingScore` and
`decaf`. The point of this block is that it needs no mapping layer at the far
end, and a block that is nearly their names has all the cost of matching them
and none of the benefit.

**The names are Beanconqueror's, and the issue was corrected to match.** That
is the direction the drift gets fixed in, because only one of the three sides
has a model that already exists and is already shipped to users. BrewMind had
not started building when this was settled.

Their *names* are copied. Their structure and two of their types are not:

- Beanconqueror nests the origin fields in a `bean_information[]` array,
  because a blend has several of them. A single coffee has one, and flattening
  it costs nothing the far end cannot undo.
- `cupping_points` and `elevation` are strings in their model and numbers here.
  A score and a height in metres are quantities, and the whole reason this
  block exists is that a value should not decay into text on the way through.

The old spellings are still read, at both doors. `library/podCoffee.ts` exports
`LEGACY_NAMES` and applies it to stored records, so a recipe or brew written
while the app spoke the old names does not quietly lose its process and roast
level; `library/brewmindLink.ts` folds the same map into its parameter aliases,
so a link minted against the first table still works. One map, two doors: two
hand-maintained copies of a rename eventually disagree about one field, and the
one that disagrees fails silently.

## 1. The bean block

### The widened type

`library/podCoffee.ts` gains the fields in #159's table. The existing fields keep
their names and meanings, so nothing already emitted changes shape.

| `PodCoffee` field | URL param | Type | Source today |
| --- | --- | --- | --- |
| `name` | `bean.name` | string, required | pod + BrewMind |
| `roaster` | `bean.roaster` | string | BrewMind |
| `roastingDate` | `bean.roastingDate` | string, ISO 8601 date | BrewMind |
| `roast` | `bean.roast` | string | BrewMind |
| `origin` | none | string | pod only |
| `country` | `bean.country` | string | BrewMind |
| `region` | `bean.region` | string | BrewMind |
| `farm` | `bean.farm` | string | BrewMind |
| `farmer` | `bean.farmer` | string | BrewMind |
| `elevation` | `bean.elevation` | integer, metres | BrewMind |
| `processing` | `bean.processing` | string | pod + BrewMind |
| `fermentation` | `bean.fermentation` | string | BrewMind |
| `variety` | `bean.variety` | string | pod + BrewMind |
| `beanMix` | `bean.beanMix` | string | pod + BrewMind |
| `aromatics` | `bean.aromatics` | string | pod + BrewMind |
| `note` | `bean.note` | string | pod + BrewMind |
| `cupping_points` | `bean.cupping_points` | number | BrewMind |
| `decaffeinated` | `bean.decaffeinated` | boolean, from `1`/`0` | BrewMind |
| `url` | `bean.url` | string, https only | BrewMind |
| `imageUrl` | `bean.image` | string, https only | pod + BrewMind |

Two entries need explaining because the names do not line up.

`origin` has **no URL param**. #159 replaces it with `country`/`region`/`farm`/
`farmer`, which is the finer-grained shape. It stays on the type because the pod
path populates it and `resolvedOrigin` in `library/brew/beanTags.ts` reads it;
removing it would drop a field from every existing pod brew. BrewMind sends the
finer fields and leaves `origin` empty, which is what #159 means by "the pod path
simply leaves the new ones empty", read in the other direction.

`imageUrl` keeps its name although the param is `bean.image`. The key is already
in the shipped envelope and in
`docs/superpowers/specs/2026-09-20-beanconqueror-brew-export-design.md`, so
renaming it would break the half of the contract that already works.

### `recipe.url`, the producer's own page

Requested by BrewMind on #159 and accepted. It is the canonical page for the
recipe on the producer's own site, so somebody can go back and read why the
recipe looks the way it does.

It is **not** on the bean. It is not the share link either: a share link
resolves to xBloom's copy of the numbers, and this is the page that explains
them, which is exactly the part a recipe loses coming through xBloom. So it
lives on the `Recipe` as `recipeUrl`, https only, checked by the same
`httpsUrl` the coffee's own link goes through.

It surfaces twice:

- **The editor's FROM section** gains a button, labelled "View on BrewMind"
  where the producer is known and "View the recipe page" where it is not. The
  section used to draw only for a sharer or a pod ID; a page is now reason
  enough on its own, because a BrewMind recipe may have neither.
- **The Beanconqueror export note**, on a line of its own below the figures:
  `Recipe: <url>`. Its own line because a URL is the one thing in that note
  long enough to wrap, and Beanconqueror once rendered notes in a narrow
  no-wrap block.

For the note to carry it, the brew has to know it, so `BrewRecord` gains
`recipeUrl` and `brews` gains a column with the `''` sentinel `coffee` already
uses. Copied at write time for the same reason `recipeName` and `accent` are:
an export must still say where the recipe came from after the recipe itself
has been deleted.

### Why the pod output does not change

`podCoffeeFromPodsVo` maps only the fields the pod endpoint carries. The new
fields are absent from `podsVo`, so an xPod recipe produces byte-identical
output to today. `library/brew/handoff/__tests__/envelope.test.ts:102-114` pins
that object and must still pass **unamended**, which is the check that this half
is additive.

### Length caps live at the URL, not in the parser

The stored/pod parser gains the new fields with type validation only. It does
**not** gain length caps, and this is deliberate: an xPod `introduce` is a
producer narrative running to several hundred words, so a cap added there would
start silently dropping a field that works today.

Untrusted length is a property of where the value came from, not of the type, so
the caps live in the URL parser where the untrusted value arrives:

| Field group | Cap |
| --- | --- |
| Short text (`name`, `roaster`, `roast`, `country`, `region`, `farm`, `farmer`, `variety`, `beanMix`, `processing`, `fermentation`) | 120 |
| `aromatics` | 500 |
| `note` | 2000 |
| `roastingDate` | ISO 8601 date, parsed, calendar checked |
| `elevation` | integer 1..10000 |
| `cupping_points` | number above 0, up to 100 |
| `url`, `image` | https only, 2000 |

Zero is refused for both numbers rather than kept. Nothing grows at sea level
and nobody scores a coffee zero, so a zero is overwhelmingly an empty field
serialised as a number, and keeping it would print a confident wrong figure on
a bean card. This matches the rule the brew rating already follows, where 0 is
unrated rather than a verdict of nothing.

Over-length drops the field and keeps the rest, following
`normaliseBeanTags`: a truncated farm is a different farm. A block with no usable
`bean.name` yields no bean at all, per #159.

`library/brew/handoff/encode.ts` does not degrade the bean block under URL
pressure, it throws, so these caps are also what keeps a hostile link from
making a brew unexportable. Total capped size is roughly 3 kB before gzip,
against a 131 kB budget.

## 2. The deep link

### Grammar

```
xbrw://import?v=1&source=brewmind&share=<xBloom share URL>&bean.name=...
```

`v` must be `1`. An unknown version is refused outright rather than
best-guessed, which is the whole point of #159 putting a version in: a link
minted against a future grammar must not be half-read by this build.

`source` is recorded, not gated. Today only `brewmind` maps to a provenance;
anything else still imports, and the recipe reads as an ordinary import. The
link is useful to anyone who can mint one, and refusing an unknown producer
would buy nothing.

`share` goes through `parseImportInput`, unchanged, so the recipe half needs no
new code and the deep link cannot drift from the paste field.

### Where it attaches

`app/+native-intent.tsx` returns `null` for an import link, exactly as it does
for the share-extension handle. The reasoning is already written there: a
returned path is a *destination*, and `xbrw://import` is not an address in this
app. Letting it through routes to `[...unmatched]`, and on a cold start that
happens before the library screen has mounted, so the link would be swallowed.
Returning `null` leaves the router where it is and lets the screen handle it.

`app/index.tsx` gains a fourth door beside the three it already wires, reading
the URL with `expo-linking`'s `useURL()` and de-duplicating on the same
`handled`/`lastSeen` ref pattern the share intent uses. It sets `importOpen` and
calls the existing `importer.resolveNow(source, "shared")`. No second
`ImportSheet`, no second lookup path.

`"shared"` is the right intent and not a new one: the value came from outside
the field, so the field should be hidden while it resolves, and a failure should
restore the field without raising the keyboard on somebody whose attention was
in another app. That is the same situation, so it gets the same answer.

### How the coffee reaches the recipe

`resolveNow` takes an optional decoration applied to the fetched recipe before
de-duplication:

```typescript
resolveNow(source, intent, {coffee, source: "brewmind"})
```

Applied to the *candidate*, before `resolveOnOpen`. The consequence is
deliberate: when the link points at a recipe already in the library, the stored
recipe wins and its own coffee is kept. A link should not silently rewrite the
coffee on a recipe the user has already edited, and "already in your library"
is what the sheet says in that case.

### Provenance

`RecipeSource` gains `"brewmind"`. It is a closed union with a
`Record<RecipeSource, string>` of placeholder verbs, so the compiler refuses the
addition until the verb exists: `"BrewMind Recipe"`, matching `"Imported
Recipe"`.

### Tags

Derived only from the closed vocabulary in `library/brew/beanTags.ts`:
`roast` through `isRoast`, `processing` through `isProcess`, `fermentation`
through `isFermentation`. Exact matches only, and a miss is unset rather than
invented, which is the rule those predicates already enforce.

Roaster and origin are deliberately **not** tagged, per #159: the tag list must
not become a second copy of the bean record.

`podCoffee.ts`'s existing refusal to record a pod roast level is unaffected. It
refuses because xBloom's value was an unexplained constant; BrewMind states a
roast level outright, so this is not the app guessing.

Tags are written through `recipe.setTags`, never by assignment, so they are
normalised and capped.

## 3. Recipe creation

`https://brewmind.coffee/?client=xbrw&v=1` opens in
`WebBrowser.openAuthSessionAsync(url, "xbrw://import")`. That API exists to
return control when a page redirects to a given scheme, which is exactly the
handoff #159 describes, and it dismisses the browser itself.

If BrewMind honours `client=xbrw` the user never presses anything: the session
returns with the import URL, which goes through the same parser as a cold deep
link. If BrewMind does not, the session is an ordinary in-app browser and the
user falls back to sharing the link, which already works. Both outcomes are
useful, so this does not depend on BrewMind shipping anything.

Adds `expo-web-browser`, pinned to `~57.0.3` so it stays on SDK 57. It was
written into `package.json` by hand: `npx expo install` fails with
`EALLOWSCRIPTS` under npm 12, which is the fallback the repo notes already
describe.

The package ships Apple and Android native modules, so this is a
native-affecting change and `expo.version` is bumped with it, as
`runtimeVersion.policy` is `appVersion`.

### The silent-failure problem, unresolved

#159 notes that a custom scheme fails silently when the app is not installed.
Nothing here fixes that, because it cannot be fixed from this side: a universal
link needs `apple-app-site-association` served from `brewmind.coffee`, which is
BrewMind's domain. The grammar is transport-independent, so moving to a universal
link later changes the transport and not the contract. Recorded as an open
question on the issue rather than pretended away.

## 4. What is deliberately not built

Everything #159 lists as later: a BrewMind API, native-to-native transport, and
context passed on the way over. The first version stays something one side can
build alone.

## Testing

- `library/__tests__/brewmindLink.test.ts` — the URL grammar: version gating,
  a missing share, every field, the caps, `1`/`0` decaffeinated, https-only, and a
  hostile link.
- `library/__tests__/podCoffee.test.ts` — the widened parsers, including that
  pod output is unchanged.
- `library/brew/handoff/__tests__/envelope.test.ts` — **unamended**, proving the
  pod block did not move.
- A round-trip test that a BrewMind coffee survives store, hydrate and envelope,
  which is the whole point of the feature.
- `app/__tests__/native-intent.test.ts` — an import link returns `null`.
