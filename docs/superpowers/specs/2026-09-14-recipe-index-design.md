# The recipe index — design

Status: approved, **not implemented**
Branch: originally `recipe-index`; that branch has since drifted into unrelated
work and is not where this will be built.
Target: `main`, held from a public release until library management (#72) gives
it a reason to exist.
Issue: #72 (carries this refactor), unblocks #106, reserves ground for #59.

`RecipeDatabase` stores each recipe as one JSON blob in
`recipes(uuid, recipeJSON)`. You cannot filter, sort, group or count a blob, so
every library feature on the roadmap — search, tags, filters, groups, and later
the cloud's sync state — is waiting on this.

This document specifies the storage change and nothing else. It adds no screen
and no user-visible behaviour. It is deliberately shipped before anything
depends on it so that the migration meets real libraries while the cost of
being wrong is still a rebuild.

---

## 0. What has changed since this was approved

Written 14 September, built on the `recipe-index` branch, and not yet merged.
`main` still carries the original `recipes(uuid, recipeJSON)` table with no index
columns, so nothing here has met a real library yet. But the code exists and its
tests pass, so treat this document as describing something real that needs
rebasing, not a proposal. See the plan's header for the state of that branch.

Two things have happened since, and both only add entries to §2.1 rather than
changing the rule.

**M6 landed, gated off** (#112). It added `cloudId` and `cloudFingerprint` to
`Recipe` as its sync state. Note where they went: onto the model, and therefore
into the blob and into backups, **not** into the descriptor array. §2.1's note
that `sharedTableId` is "reserved ground for M6" turned out to be unnecessary
rather than wrong — M6 needed no reserved column, because the blob already
carries anything a recipe knows about itself. A field earns a column here only
when something needs to filter, sort or group by it, and nothing filters by a
sync fingerprint. M6 also added `sharedBy`, `sharedByAvatar` and `imageURL`,
which are recipe content and likewise live in the blob; `sharedBy` earns a column
below because author shelves group by it.

**M5 was designed** ([the library shelves
spec](2026-09-16-library-shelves-design.md)), and it is the thing that gives
this index its reason to exist. It needs four descriptors this document does not
list:

| Column | Type | Indexed | Wanted for |
|---|---|---|---|
| `xid` | TEXT | ✓ | the "from xBloom" shelf, and dedup on import |
| `sharedBy` | TEXT NOCASE | ✓ | author shelves, one per person whose link you imported |
| `favourite` | INTEGER | ✓ | the favourites-first sort modifier, and its shelf |
| `hasDescription` | INTEGER | | filtering to recipes that say what they are for |

`favourite` and the description are fields M5 adds to `Recipe`; the other two
already exist. Each addition is one entry in the descriptor array and one
`INDEX_REVISION` bump, which is exactly the property §2.1 was built for, so
adding them is a matter of doing it rather than of deciding anything.

Nothing else in this document is stale.

---

## 1. The rule

**`recipes.recipeJSON` is the only truth. Every other column and every other
table is a cache of it, and may be dropped and rebuilt at any time without
loss.**

That is the whole design. Everything below is consequence.

### 1.1 Why the blob stays

The obvious instinct is to normalise properly and retire the blob. That
instinct is wrong here, and it is worth writing down why, because it will
recur.

`Recipe`'s constructor (`library/Recipe.ts:165-239`) is roughly thirty `??`
fallbacks: cup types `0x23`/`0x13`/`0x04`, pours that an older version stored
as JSON strings inside an array, `title` before it was renamed `name`,
`createdAt` before it existed. It is not defensive clutter. It is a **lazy
migration layer** — an old record repairs itself on read, with no migration
step, no downtime, and no moment at which a user's only copy of their recipes
is half-converted.

The same object is also the backup file format: `buildBackup` round-trips
recipes through `JSON.parse(JSON.stringify(recipe))` (`library/backup.ts:54`).

So retiring the blob does not delete a workaround. It deletes the migration
mechanism and requires rebuilding it as versioned, destructive SQL. That is
more machinery, not less, and each future migration would run against data the
user cannot get back.

Derived index columns are not a compromise position. They are the same pattern
as SQLite's FTS external-content tables and Postgres generated columns, and
they come with a rule a new contributor cannot misapply: *the blob wins.*
The alternative's rule is "these nine fields live here, the rest live there",
which is the kind of rule that rots.

### 1.2 What this is not

- No change to the card byte format, `parseData`, or `getData`.
- No change to the `xbrecipewriter.db` filename. Renaming it would orphan every
  recipe already on a phone; this is settled and permanent.
- No column is authoritative for anything.
- `BACKUP_VERSION` is not bumped. See §4.4.

---

## 2. Shape

```
recipes(uuid TEXT PRIMARY KEY, recipeJSON TEXT, <index columns…>)
recipe_tags(uuid TEXT, tag TEXT COLLATE NOCASE)   -- derived, rebuilt
schema_meta(key TEXT PRIMARY KEY, value TEXT)     -- holds the descriptor hash
```

### 2.1 The descriptor array

`library/recipeIndex.ts` holds one array. The DDL, the indices, the
INSERT/UPDATE column lists, and the rebuild are all generated from it. Adding a
filterable field is one entry and nothing else — the column list never appears
in a second place where it can drift.

This matters because the repository has met the drifting-list failure before:
`Settings.DEFAULTS` exists precisely because `showHints` once went missing from
backups by being named in some places and not others.

```ts
type IndexColumn = {
    name:     string;
    type:     "TEXT" | "INTEGER" | "REAL";
    collate?: "NOCASE";
    indexed?: boolean;
    from:     (r: Recipe) => string | number | null;
};
```

| Column | Type | Indexed | From |
|---|---|---|---|
| `sortName` | TEXT NOCASE | ✓ | `hasName() ? displayName() : null` |
| `createdAt` | INTEGER | ✓ | `createdAt` |
| `source` | TEXT | ✓ | `source` |
| `accentIndex` | INTEGER | | `accentIndex ?? null` |
| `cupType` | INTEGER | ✓ | `cupType` |
| `isTea` | INTEGER | ✓ | `isTea() ? 1 : 0` — see §2.7 |
| `dosage` | REAL | | `dosage` |
| `ratio` | INTEGER | ✓ | `ratio` |
| `grindSize` | INTEGER | ✓ | `grindSize` |
| `grinder` | INTEGER | | `grinder ? 1 : 0` |
| `grindRPM` | INTEGER | | `grindRPM` |
| `pourCount` | INTEGER | ✓ | `pours.length` |
| `totalVolume` | REAL | | `getPourTotalVolume()` — see §2.5 |
| `minTemp` | INTEGER | | lowest set pour temperature, `null` if none |
| `maxTemp` | INTEGER | | highest set pour temperature, `null` if none |
| `bypassEnabled` | INTEGER | | `bypassEnabled ? 1 : 0` |
| `sharedTableId` | INTEGER | | `sharedTableId ?? null` |

`minTemp`/`maxTemp` are a pair rather than a single summary because
temperature is per-pour and the useful question is a range.

`sharedTableId` is reserved ground for M6. It is the one column that is not
"filterable recipe property" — sync state is genuinely not recipe content, so
it would be a real column under any scheme.

### 2.5 `totalVolume` is the sum of pours, not dose × ratio

`getTotalVolume()` (`library/Recipe.ts:410`) is **dose × ratio** — the target
the machine validates against, not what the recipe dispenses. The sum of the
pours is `getPourTotalVolume()`, and `isPourVolumeValid()` (line 455) enforces
that the two agree within 1 ml.

For a valid recipe they are therefore the same number, and either would do. For
an invalid or half-authored one they diverge — and a blank recipe with no
stages would claim to make 240 ml while dispensing nothing. The index stores
what the recipe actually pours, so a filter never advertises water that will
not arrive.

### 2.6 `-1` is not a temperature

`Pour.temperature` initialises to `-1` (`library/Pour.ts:17`), the same
never-set sentinel as `agitation`. Unset pours must be excluded before taking
the minimum, or a single half-filled stage drags `minTemp` to `-1` and every
temperature range filter silently matches it.

If no pour carries a set temperature, both columns are `null`.

### 2.7 `isTea` is its own column, not derived from `cupType`

`accentGroupFor` (`library/accent.ts:5-11`) asks `recipe.isTea()` rather than
comparing `cupType`, and says why: the tea byte can carry the default cup count
in its high nibble, and legacy cards arrive as `0x13` or `0x23`. Every one of
those normalisations lives behind `isTea()`, and the comment warns that a
second copy of the predicate would silently miss the next such fix.

A `WHERE cupType = 4` in the accent query would be exactly that second copy. So
`isTea()` is projected into its own column and the predicate stays in one
place — which is the same reason the whole index is generated from one array.

### 2.2 `sortName` is NULL for a nameless recipe

Not the placeholder. `placeholderName()` (`library/Recipe.ts:384`) calls
`toLocaleDateString(undefined, …)`, so it is **locale-dependent**. Indexing a
resolved `displayName()` would freeze the device's language into the sort key
at save time and leave it stale if the user changed language.

Storing NULL lets "sort by name" put unnamed recipes deliberately last rather
than scattering them under a localised string, and keeps the placeholder
computed at render where it belongs. This is the same principle #106 states for
automatic groups: a derived label is a question asked, never a row stored.

### 2.3 Automatic tags need no storage

"Tea", "single pour", "high ratio", "grinder off" are predicates over columns
already in the table above. They are queries. Nothing about them is persisted.

### 2.4 `COLLATE NOCASE`

On `sortName` it is what makes search case-insensitive without a duplicate
lowercase column. On `recipe_tags.tag` it is what makes filtering agree with
the case-insensitive dedupe in §4.1 rather than quietly disagreeing with it.

---

## 3. Lifecycle

### 3.1 On open, in order

1. `CREATE TABLE IF NOT EXISTS recipes(uuid, recipeJSON)` — unchanged, so an
   existing database is untouched by this step.
2. One `ALTER TABLE recipes ADD COLUMN` per descriptor, **each in its own
   `try/catch`**. `IF NOT EXISTS` on `ADD COLUMN` is not portable across the
   SQLite versions Expo ships; `BrewDatabase.ts:88-110` already establishes
   catching the failure instead, and this follows it.
3. `CREATE TABLE IF NOT EXISTS` for `recipe_tags` and `schema_meta`.
4. `CREATE INDEX IF NOT EXISTS` per `indexed` descriptor.
5. Read `schema_meta.indexHash`. If it differs from the current hash — which
   includes the first run, where it is absent — rebuild.

Every index column is **nullable with no default**. That is what makes step 2
a no-op on re-run and makes a partially completed previous run self-healing.

### 3.2 Rebuild

In one transaction: read `uuid, recipeJSON` for every row, construct the
`Recipe`, write the projected columns, clear and repopulate that row's
`recipe_tags`, then store the new hash.

`recipeJSON` is never written during a rebuild. If the transaction fails the
hash is not stored, so the next open retries — **a half-rebuilt index cannot
persist**.

### 3.3 The hash, and its one honest limitation

The hash covers descriptor names, types and collations — *shape*.

It cannot cover a `from` body. Hermes compiles to bytecode and
`Function.prototype.toString()` returns `"[bytecode]"` in a release build, so
hashing the source would work in development and silently stop working in
production. That failure mode — correct in dev, silent in release — is worse
than not trying.

So the module carries an explicit `INDEX_REVISION` constant, combined into the
hash, with the rule stated in a comment: **change a `from` body, bump the
revision.** A unit test pins the hash, so changing the array without bumping
fails CI with a message saying exactly that.

### 3.4 Columns are never dropped

`ALTER TABLE … DROP COLUMN` requires SQLite ≥ 3.35, which is not safe to assume
across every OS version this app supports. A retired descriptor leaves a
nullable orphan column that nothing reads — a few bytes per row.

The alternative is the create-copy-drop-rename table rebuild, which would be
the only operation in this design that copies blobs. Introducing a
blob-touching operation to reclaim a few bytes is a bad trade, and this
decision is deliberate rather than an omission.

### 3.5 Write path

`insertRecipe` and `updateRecipe` write blob, columns and tags **in a single
transaction**. A row can therefore never carry an index describing a different
recipe than its blob.

### 3.6 Compatibility

`retrieveAllRecipes()` keeps its exact signature and behaviour; every existing
caller is unaffected. New query methods are added alongside it, returning
lightweight rows rather than `Recipe` objects — which is the entire point of
the exercise.

### 3.7 Accent, the first beneficiary

`insertRecipe` currently calls `assignAccent(recipe, this.retrieveAllRecipes())`
— it parses the **entire library** to choose a colour. `insertRecipes` loops
that. Restoring a hundred recipes therefore constructs on the order of five
thousand `Recipe` objects.

With `accentIndex` indexed, `assignAccent` takes the indices from one query.
The refactor pays for itself on a path that already ships.

### 3.8 Performance

`expo-sqlite`'s sync API runs on the JS thread, so a rebuild blocks it. It
happens once per schema change over a library realistically in the hundreds.

The plan will include an **actual measurement** against a seeded library of 500
rather than an assurance. If the number is bad, the fallback is specified here
in advance: rebuild lazily per row on first read, with the hash written only
once every row has been visited.

**Measured: 14 ms** for 500 recipes, on `node:sqlite` under Jest (stable across
three runs), against a 3000 ms ceiling. A device is slower than a development
machine, but not by the two orders of magnitude that would make this visible.
The lazy fallback is not needed and has not been built.

---

## 4. Tags

### 4.1 Tags live in the blob

`Recipe.tags: string[] = []`, read in the constructor with the same forgiving
shape-check as every other field — a non-array becomes `[]`, non-string entries
are dropped. An old record self-heals exactly as it does for `createdAt` and
`source`.

This was not the first plan. A standalone `recipe_tags` table holding user data
seemed natural, until `buildBackup`'s `JSON.parse(JSON.stringify(recipe))`
made clear that such a table is **invisible to export** — tags would have
silently vanished from every backup until someone special-cased them. That is
the `showHints` failure again, and this design refuses to reintroduce it.

Putting tags in the blob also makes the design uniform: there is no user data
anywhere that a rebuild can lose, so §1's rule has no exceptions.

A tag is recipe content in the same sense a name is. It travels with the recipe
into a backup, into a duplicate, and later into a sync.

Normalisation happens in `Recipe`, not at call sites: trim, drop empties, and
**dedupe case-insensitively while keeping the first spelling the user typed**,
so "Espresso" and "espresso" are one tag and it stays capitalised the way they
first wrote it.

Limits, which exist to stop a corrupt or hostile backup putting something
absurd in the database rather than to constrain normal use:

- **32 characters** per tag. Longer tags are dropped on import, not truncated —
  a truncated tag is a plausible-looking wrong tag.
- **20 tags** per recipe.

### 4.2 The join table

`recipe_tags(uuid, tag)`, unique on `(uuid, tag)`, indexed on `tag`, `tag`
collated `NOCASE`. Purely derived; rebuilt with everything else.

### 4.3 `backup.ts` sanitises tags rather than rejecting

The validator gains a `tags` rule beside the existing ones
(`library/backup.ts:226`). A malformed `tags` field costs the recipe its tags,
not its existence.

This is a deliberate departure from how that file treats every other field, and
the reason is specific. `backup.ts` is severe because a bad recipe's next stop
is a genuine card, and a malformed write to a genuine card is not trivially
recoverable. A tag never reaches a card, never reaches the machine, and never
reaches a share payload. Rejecting an otherwise-perfect recipe over a
decorative field would be the harm, not the protection.

### 4.4 What falls out for free

- `duplicateRecipe` copies the blob, so a copy inherits its tags.
- Export and import carry tags with no envelope change.
- `BACKUP_VERSION` is **not** bumped. An older app reading a newer backup
  ignores the unknown field, which is already how `parseBackup` behaves, and
  bumping would make old apps refuse a file they can in fact read.

### 4.5 Share links are unaffected

Verified rather than assumed: `buildSharePayload` (`library/shareLink.ts:108`)
selects explicit fields. Adding `tags` to `Recipe` cannot perturb
`canonicalSnapshot`, so no already-shared recipe re-mints.

This check is recorded because the file's own comments warn twice that a field
that varies invisibly makes a shared recipe read as stale and mints a duplicate
row in the service account.

---

## 5. How it proves itself

The claim under test is narrow and checkable: **the index always agrees with
the blob, and the blob is never harmed.**

### 5.1 Migration, against a genuinely old database

Not a mocked one — and this requires replacing the test harness first.

The current `RecipeDatabase.test.ts` mock is a hand-rolled in-memory fake that
pattern-matches a handful of query shapes and ignores SQL entirely. It cannot
execute an `ALTER TABLE`, hold a column, honour `COLLATE NOCASE`, or fail a
duplicate `ADD COLUMN` — so it could never prove anything this design claims.
Its own header comment concedes it "only needs to understand the handful of
literal query shapes RecipeDatabase actually sends".

The replacement runs **real SQLite**: Node 26 ships `node:sqlite` (3.53.2), so
`expo-sqlite`'s `openDatabaseSync` is mocked with a thin adapter over
`DatabaseSync`. No new dependency, and `execSync` / `runSync` / `getAllSync` /
`getFirstSync` / `withTransactionSync` map onto it almost directly.

The test then creates `recipes(uuid, recipeJSON)` by hand with the exact
pre-refactor DDL, inserts real legacy blobs — including ones exercising the
`0x23`/`0x13`/`0x04` cup-type migrations and pours-as-strings — and *only then*
constructs `RecipeDatabase`.

Assert: every column populated, every blob byte-identical to what went in.

This is the only test that proves the thing we are actually afraid of, and it
is only honest because the SQL is real.

### 5.2 Rebuild

Change the descriptor hash, reopen, assert columns and tags recomputed.

Then the failure case: make a projection throw partway through a rebuild,
assert the hash was **not** stored and that the next open retries cleanly.

### 5.3 Idempotence

Open, close, open. No duplicate columns, no duplicate tags, no second rebuild.
This is what catches the `try/catch` `ALTER` going wrong.

### 5.4 Agreement, as a property

For a set of recipes, every indexed column equals the value projected from that
row's blob — written as a property over the descriptor array, so a column added
later is covered without anyone remembering to cover it.

Two projections get explicit cases of their own, because both have a wrong
answer that looks plausible:

- a recipe whose pours do **not** sum to dose × ratio, asserting `totalVolume`
  follows the pours (§2.5), and a stageless recipe, asserting `0`;
- a recipe with one temperature set and one left at `-1`, asserting `minTemp`
  is the set value and not the sentinel (§2.6).

### 5.5 Orphan tolerance

Add a column, rebuild, retire it, rebuild again, assert reads still work.

### 5.6 Tags

Normalisation; case-dedupe keeping the first spelling; both caps; backup
round-trip; a backup with no `tags` field; and hostile input — `tags: "nope"`,
`tags: [1, 2]`, five hundred tags, a tag of ten thousand characters.

### 5.7 Unchanged behaviour

The existing `RecipeDatabase` and `backup` suites must pass **untouched**. If a
test in them needs editing, that is a regression until argued otherwise.

### 5.8 Sabotage checks

Every new test has its fix reverted to confirm it actually fails. The
`LivingMark` brand-mark regression during 1.6.0 is why this is not optional
here: a test that passes for the wrong reason is worse than no test, and RNTL's
async `render` makes silent passes easy.

---

## 6. Release

Merged to `main` and installed on a real device to meet real libraries early.
**Held from a public release** until #72's user-facing library management gives
it a reason to exist.

The argument for a derived index was that mistakes stay recoverable. Shipping
the schema ahead of anything that depends on it is what actually collects that:
if the migration is flawed, it surfaces while the only thing built on it is
nothing.
