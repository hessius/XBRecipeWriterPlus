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

No API on either side, and no native module. `xbrw` is already a registered
scheme (`app.json`), so the link works with no config change.

## The contract, and the one place it is ambiguous

#159 is a published contract. BrewMind is building the producing side and
Beanconqueror the consuming side, both from the field table in that issue, so
**the table is normative and this document does not improve on it.** Field names
are taken verbatim even where a different name would read better.

One divergence has to be recorded rather than silently resolved.

`docs/superpowers/specs/2026-09-20-beanconqueror-brew-export-design.md:462` names
Beanconqueror's own model field `roastingDate`, and #159's table says
`bean.roastDate`. They are not the same string. Beanconqueror's `Bean` model also
spells several others differently from the table: `roast` for `roastLevel`,
`processing` for `process`, `cupping_points` for `cuppingScore`,
`decaffeinated` for `decaf`.

**We follow #159.** Both integrating parties are reading that table, so matching
their published names is what keeps the three sides in agreement; matching
Beanconqueror's internal model instead would mean BrewMind sends a key we do not
read. The mapping from our block onto Beanconqueror's model is Beanconqueror's
to write, which is the same division of labour the existing block already uses
(`beanMix`, `aromatics` and `imageUrl` are already our spellings, not theirs).

This is called out in the PR so it can be corrected in one place if Beanconqueror
has in fact built against `roastingDate`.

## 1. The bean block

### The widened type

`library/podCoffee.ts` gains the fields in #159's table. The existing fields keep
their names and meanings, so nothing already emitted changes shape.

| `PodCoffee` field | URL param | Type | Source today |
| --- | --- | --- | --- |
| `name` | `bean.name` | string, required | pod + BrewMind |
| `roaster` | `bean.roaster` | string | BrewMind |
| `roastDate` | `bean.roastDate` | string, ISO 8601 date | BrewMind |
| `roastLevel` | `bean.roastLevel` | string | BrewMind |
| `origin` | none | string | pod only |
| `country` | `bean.country` | string | BrewMind |
| `region` | `bean.region` | string | BrewMind |
| `farm` | `bean.farm` | string | BrewMind |
| `farmer` | `bean.farmer` | string | BrewMind |
| `elevation` | `bean.elevation` | integer, metres | BrewMind |
| `process` | `bean.process` | string | pod + BrewMind |
| `fermentation` | `bean.fermentation` | string | BrewMind |
| `variety` | `bean.variety` | string | pod + BrewMind |
| `beanMix` | `bean.beanMix` | string | pod + BrewMind |
| `aromatics` | `bean.aromatics` | string | pod + BrewMind |
| `note` | `bean.note` | string | pod + BrewMind |
| `cuppingScore` | `bean.cuppingScore` | number | BrewMind |
| `decaf` | `bean.decaf` | boolean, from `1`/`0` | BrewMind |
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
| Short text (`name`, `roaster`, `roastLevel`, `country`, `region`, `farm`, `farmer`, `variety`, `beanMix`, `process`, `fermentation`) | 120 |
| `aromatics` | 500 |
| `note` | 2000 |
| `roastDate` | ISO 8601 date, parsed |
| `elevation` | integer 0..10000 |
| `cuppingScore` | number 0..100 |
| `url`, `image` | https only, 2000 |

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
`roastLevel` through `isRoast`, `process` through `isProcess`, `fermentation`
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

Adds `expo-web-browser`, installed with `npx expo install` so it stays pinned to
SDK 57.

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
  a missing share, every field, the caps, `1`/`0` decaf, https-only, and a
  hostile link.
- `library/__tests__/podCoffee.test.ts` — the widened parsers, including that
  pod output is unchanged.
- `library/brew/handoff/__tests__/envelope.test.ts` — **unamended**, proving the
  pod block did not move.
- A round-trip test that a BrewMind coffee survives store, hydrate and envelope,
  which is the whole point of the feature.
- `app/__tests__/native-intent.test.ts` — an import link returns `null`.
