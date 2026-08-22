# Data model and persistence — design

**Sub-project 2 of the [XBRW++ overhaul](2026-08-22-ui-overhaul-roadmap.md).**

**Goal:** Give a recipe a name it owns, an identity that does not depend on that
name, and a provenance. Give the app a settings store. Remove the global
title-uniqueness rule that auto-saving is about to make untenable.

**Depends on:** sub-project 1, for `library/accent.ts` only. The roadmap lists
this sub-project as independent; that predates #28, which puts the accent
resolver here.

**Issues:** [#28](https://github.com/hessius/XBRecipeWriterPlus/issues/28),
[#29](https://github.com/hessius/XBRecipeWriterPlus/issues/29),
[#8](https://github.com/hessius/XBRecipeWriterPlus/issues/8).

---

## The problem

Three defects share one root cause: the app has no concept of recipe identity
apart from the recipe's name.

**The name does too much.** `Recipe.title` is simultaneously the name you type,
the name xBloom publishes, and the app's uniqueness key. The card itself holds
no name at all — only the XID in bytes 32–38 — so on read the name is fetched
from `client-api.xbloom.com` using that XID. The sync button next to the field
silently overwrites whatever you typed, and silently does nothing when there is
no XID. Nothing in the UI says any of this (#8).

**Uniqueness is enforced globally.** `RecipeDatabase.doesTitleExist()` rejects
any recipe whose name matches another, case-insensitively. Two cards can
legitimately share a name, and most have no XID to tell them apart (#29).

**Identity is about to matter much more.** Sub-project 5 auto-saves on import
and on card read. Every save then runs into the uniqueness check, and the user
is not there to resolve it.

## Decisions

### Names are two fields, both optional

| Field | Meaning |
|---|---|
| `name` | Local, user-chosen. `""` when unset. |
| `xbloomName` | Cached from `client-api`, never hand-edited. `""` when unknown. |

`name` stays empty until the user renames something. Until then the recipe
displays the borrowed `xbloomName`, which a sync keeps current. Renaming is what
opts a recipe out of tracking xBloom.

The alternative — copying the xBloom name into `name` at import — was rejected.
Under auto-save most recipes are never named by hand, so every one of them would
carry a frozen snapshot of a name that then goes stale with no way to tell it
apart from a name the user chose.

Both fields are optional and the XID is optional too, so a recipe can have no
name from any source. The display rule is a chain, and it lives on `Recipe` so
that no screen reimplements it:

```
displayName() = name → xbloomName → xid → placeholder
```

The placeholder is provenance and date — `"Read 4 Mar"`, `"Imported 4 Mar"`,
`"Copy"` — omitting the date when `createdAt` is `0`. A content-derived label
such as `"18 g · 1:16"` was rejected: `RecipeCard` already shows dose, ratio and
grind beside the name, so it would only repeat itself.

`hasName()` returns false exactly when the placeholder is in use, so the UI can
render it muted rather than as a name the user chose.

### `title` is deleted, not aliased

20 call sites across 9 files, plus 4 test suites. A deprecated getter would be
the smaller diff today and a slow leak afterwards, with new code free to keep
picking the wrong one.

### Two new fields carry provenance

| Field | Meaning |
|---|---|
| `createdAt` | Epoch ms. `0` means unknown. |
| `source` | `"read" \| "import" \| "duplicate" \| "manual"`. |

`"manual"` is the value legacy rows migrate to and the default for a recipe
built in the editor. It does not imply the create-from-scratch feature, which
remains deferred under #25.

They feed the placeholder above, but they are worth having regardless: the
recipe list has no stable sort order today, and de-duplication needs a tiebreak
when content matches.

### Identity is the card payload

```
fingerprint() = hex(getData(null).slice(32))
```

The 32-byte signature prefix is sliced off, so a card-read recipe and an
imported one compare equal when writing either would produce the same card.
`name`, `uuid`, `accentIndex` and `backup` are excluded by construction.

**Two recipes are the same when writing either produces the same card.**

Computed on demand and never persisted. A stored fingerprint would be silently
invalidated by any future change to the byte format; a computed one re-derives.
Libraries here are tens of recipes, so scanning them all costs nothing.

Rejected alternatives: XID or share-ID equality fails exactly where it is needed,
because a card with no XID never de-duplicates and an edited recipe wrongly
merges with its untouched original. A hand-written field comparison says the
same thing as the fingerprint but maintains its field list by hand, and would
drift from the byte format the first time either changed.

A consequence worth naming: changing the grind size by one step makes it a
different recipe. That is correct — it is a different card — but it means
tweaking and re-reading the same card produces two entries.

### De-duplication is silent, and only on the automatic paths

"Overwrite" is unreachable. If two recipes match by fingerprint they write
identical bytes, so overwriting changes nothing except discarding the existing
recipe's local name and accent. The real choice is only whether to create a
second copy.

| Path | Behaviour |
|---|---|
| Import, card read | Check the fingerprint. On a hit, skip the insert, report *"Already in your library"*, and reveal the existing recipe. |
| Duplicate, editor save | Never check. Always write. |

Automatic actions are cautious; actions the user took deliberately are obeyed.
No dialog — which also keeps this sub-project clear of the dialog language,
which belongs to sub-project 3.

On a skipped duplicate the existing recipe is revealed — scrolled to and briefly
highlighted — so the app does not appear to have done nothing. This sub-project
delivers only the `existing` recipe in the return value that makes that
possible; the reveal itself is implemented at the call site, and how it looks
belongs to sub-projects 3 and 4.

This removes today's behaviour where saving a recipe whose name matches another
is blocked by an alert. Two recipes may now share a name; they are told apart by
accent colour, pour silhouette and date, which is what sub-project 1 built.

### The accent index becomes real

Assigned on every insert via `nextAccentIndex(group, inUse)`, where `inUse` is
the accent indices of existing recipes in the same half of the palette.
Reassigned on save when the cup type crosses the coffee/tea boundary, because
the two halves do not overlap.

Recipes saved before the field existed keep taking the uuid-hash fallback in
`library/accent.ts`, so they need no migration. `RecipeWithAccent` is deleted.

### Sync stops being destructive

The sync button refreshes `xbloomName` only. A local name always wins the
display, so a sync can no longer discard one. Reverting to xBloom's name is
clearing the field, not a separate action.

It is disabled when there is no XID and no share ID, which fixes the silent
no-op in #8, and it gains the accessibility label it currently lacks.

The label and tooltip copy proposed in #8 belong to the editor redesign in
sub-project 4, not here.

### Settings live in the existing database

A `settings(key TEXT PRIMARY KEY, value TEXT)` table in `xbrecipewriter.db`,
behind `library/Settings.ts`:

- a `DEFAULTS` map that is the single source of both the key list and their types
- JSON-encoded values
- a corrupt or unparseable value falls back to its default rather than throwing

One key to start, `showCoffeeMarker: true`, because `RecipeCard` already takes
the prop. The React hook that subscribes to it is sub-project 6's.

`expo-sqlite/kv-store` was rejected: once wrapped for types and defaults it is
most of this module anyway, and it adds a second database file. Adding
`async-storage` buys nothing over either and costs a native dependency.

### Migration is lazy

In the `Recipe(json)` constructor, beside the existing cup-type fixes — the
pattern this codebase already uses. No SQL migration, so rows are rewritten only
when something touches them and a downgrade stays survivable.

| Field | Legacy default |
|---|---|
| `name` | `json.title` when `json.name` is absent |
| `xbloomName` | `""` |
| `createdAt` | `0` |
| `source` | `"manual"` |
| `accentIndex` | absent — falls through to the uuid hash |

Legacy recipes almost all have a title, so they will never reach the placeholder
path. `createdAt = 0` groups them at one end of any sort. A rowid-ordered
backfill of plausible dates was rejected: it invents data.

The `settings` table is the only new DDL, created with `IF NOT EXISTS` alongside
`recipes`.

## Interfaces

```ts
// library/Recipe.ts
name: string;
xbloomName: string;
createdAt: number;
source: RecipeSource;
accentIndex?: number;

displayName(): string;
hasName(): boolean;
fingerprint(): string;

// library/RecipeDatabase.ts
insertIfNew(recipe: Recipe): {inserted: boolean; existing: Recipe | null};
// insertRecipe, updateRecipe, cloneRecipe unchanged in signature
// doesTitleExist removed

// library/Settings.ts
getSetting<K extends SettingKey>(key: K): SettingValue<K>;
setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): void;
```

`createTitle` keeps its `(Copy)(n)` numbering, but scans only names equal to the
one being copied — a local nicety rather than a global constraint.

## Error handling

- If `getData` throws on a malformed recipe, its fingerprint is treated as
  unique. A broken import should land in the library to be inspected, not vanish
  into a de-duplication branch.
- `insertRecipe` keeps throwing on a uuid collision. `insertIfNew` reports its
  outcome in the return value instead, because its callers are automatic.
- An unknown settings key is a compile error via the `DEFAULTS` map. A corrupt
  stored value falls back to the default and logs.

## Testing

`library/__tests__`, no React:

- **Migration** — legacy JSON to `name`, and a round-trip proving a re-save does
  not lose the old title.
- **`displayName`** — all four rungs and the doubly-empty case.
- **`fingerprint`** — asserted against a literal expected byte string, in the
  spirit of `cardFixtures.ts`, so the test is not merely self-consistent. Plus
  proof it is unchanged by `name`, `uuid`, `accentIndex` and `backup`.
- **`insertIfNew`** — hit and miss, and explicit inserts bypassing it.
- **`Settings`** — defaults, round-trip, unknown key, corrupt value.

## Out of scope

- The card byte format. `getData` and `parseData` are read, never changed, and
  the existing characterisation tests must stay green without edits.
- List sorting and the editor's name-field copy — sub-project 4.
- A React hook over the settings store, and the settings screen — sub-project 6.
- The duplicate-detected toast's appearance — sub-project 3 owns feedback.

## Done when

- A recipe has a local name, a cached xBloom name, a provenance and a persisted
  accent, and `title` no longer exists.
- Two recipes may share a name; identity is the card payload.
- The import and card-read paths that exist today call `insertIfNew` and
  de-duplicate silently; explicit actions always write. Wiring the auto-save
  paths sub-project 5 adds is that sub-project's job.
- `library/Settings.ts` stores one real setting.
- Typecheck, lint, tests and expo-doctor are green.
