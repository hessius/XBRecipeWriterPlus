# A shelf you made, a tag you typed, and the difference between them

## Why

Four tags typed into the recipe editor became four shelves, each holding one
recipe, filed under a heading that says YOUR SHELVES. The user did not put them
there. They also carry no art, so they read as four blank squares claiming to be
collections.

Three separate faults, one cause.

1. **The app cannot tell the two apart.** `setShelfMembers` writes a tag;
   `TagSection` writes the same tag. Nothing stored says which door it came
   through, so the grid files every tag under YOUR SHELVES and is wrong about
   most of them.
2. **The grid contradicts itself about the floor.** `buildShelves` never
   suppresses a manual shelf, on the argument that a shelf of one is a shelf
   somebody has only just started. `shelfIdsOf` reads art only for tags clearing
   `MIN_COUNT`. So a one-recipe tag shelf is drawn and then refused a picture.
   That is a bug on its own terms, whatever is decided about headings.
3. **The library has no front door for "everywhere".** A recipe that fits no
   category is reachable only by clearing filters by hand.

The first fault is about provenance, and no count recovers it. It has to be
stored.

## What this is not

This design deliberately stops short of the larger idea it sits next to: a shelf
as a **saved query** with several tags and an `all`/`any` mode, plus a nudge when
a tag has grown enough to be worth promoting. That is a real feature with a data
model, a picker and a backup story, and it gets its own session.

Two things are worth recording now, because both were assumed missing and both
already work:

- **A shelf is already a live tag rule.** `setShelfMembers` stores no membership
  list. It writes the tag onto the recipes that were ticked, and the shelf's
  query is `EXISTS (SELECT 1 FROM recipe_tags t WHERE t.uuid = recipes.uuid AND
  t.tagKey = ?)`. Tag a recipe in the editor and it joins the shelf by itself.
  The picker is a bulk tag editor.
- **Filters already intersect.** `buildLibraryQuery` joins every applied filter
  with `AND`, so two tag chips already give the intersection. What is missing is
  not the filtering; it is that a *shelf* can only be one filter id.

What the saved-query feature adds is therefore narrow, and it subsumes this
design's storage: once a shelf is a stored definition, "I made this one" is
simply "there is a row for it". The marker introduced here migrates into that
row mechanically, one marked tag becoming one single-tag shelf.

## Provenance is a list, in the format we already have

A new setting, `myShelves`, holds the filter ids created through NEW SHELF. Its
stored form is the one `hiddenShelves` already uses: a JSON array of canonical
ids, with a comma-separated list still read so an older build's answer is not
lost, and unknown ids carried rather than dropped.

Carrying unknown ids matters for the same reason it does there. A tag disappears
when its last recipe is deleted and returns on a restore; forgetting that the
shelf was yours because it happened not to be on screen would quietly demote it.

### Tag ids fold too

`canonicalShelfId` folds an author id through `tagKey` and leaves everything
else alone. It is extended to fold a `tag:` id the same way.

This is the bug class its own comment already describes for authors. A shelf
renamed from `Mornings` to `mornings` is one shelf everywhere downstream, because
every query compares `tagKey`, but it would present a different id here and the
stored answer would be lost. `hiddenShelves` gets the fix on the way past: a tag
shelf put away under one spelling stays away under the other.

### The lifecycle

| Act | Effect on `myShelves` |
|---|---|
| `nameShelf` | mark the new id |
| `renameShelf` | unmark the old id, mark the new one |
| `deleteShelf` | unmark |
| MAKE IT A SHELF | mark |
| MAKE IT A TAG | unmark |

### It goes in the backup allowlist

`myShelves` must be added to **both** `Settings.DEFAULTS` and `settingsSnapshot()`
in `app/settings.tsx`. They are separate lists. Adding a key to `DEFAULTS` alone
does not put it in a backup, which is how `showHints` went missing, and a
restored library that forgot which shelves were yours would refile all of them
under FROM TAGS.

A test asserts the key is in the snapshot. The snapshot is an allowlist and
allowlists rot silently.

## The grid becomes three sections

`Shelf.kind` grows from two values to three.

| kind | section | contents | gate |
|---|---|---|---|
| `manual` | YOUR SHELVES | tags in `myShelves` | none |
| `tag` | FROM TAGS | every other tag | `availableFilters` |
| `auto` | AUTO SHELVES | stock shelves, author shelves, ALL RECIPES | `availableFilters` |

An empty section is not drawn, heading included, as today. YOUR SHELVES keeps
its NEW SHELF button under it whether or not it holds anything, because that
button is the only place a shelf can be made.

### Why a tag you did not make is gated

`buildShelves` already answers this for author shelves: *"nobody assembled it: it
is a question the app asks of the library, the same as TEA or STRONG. There is no
membership to edit, only recipes that did or did not arrive from that person."*

A tag typed into the editor was not assembled into a shelf either. It therefore
gets the same treatment as every other shelf the app invented: the floor of 3,
the 80% ceiling, and the applied-filter passthrough that keeps a shelf you are
standing in on screen whatever its count.

The floor is the shared `MIN_COUNT`, not a second constant. A number that means
one thing in one place and something near it in another has to be justified in
both forever.

### A tag below the floor is drawn nowhere

It is not hidden. It is on the recipe, it is a chip on the rail, and it is found
by search. Drawing it a second time as a not-quite-shelf is what made the grid
confusing to begin with.

### FROM TAGS is the nursery

The section is the promotion hint in its cheapest form: a tag appears there
exactly when it has grown enough to be worth a shelf. Its tile carries the tag
actions plus **MAKE IT A SHELF**, which marks it and moves it up permanently.
A YOUR SHELVES tile carries **MAKE IT A TAG**, so the promotion is reversible
and a mistap is not a trap.

A tag shelf draws like a manual one in a room. It is a tag either way, and its
membership is editable either way.

### Nothing is marked at the upgrade

There is no record of which existing tags were shelves, and inventing one would
be a guess. Every tag starts unmarked, so on first launch after this change the
grid files all of them under FROM TAGS, those below the floor disappear, and one
tap promotes the ones that were really shelves.

This is the honest outcome and it is also the one the user asked for. The
alternative, marking everything, keeps exactly the four accidental shelves this
design exists to remove.

## ALL RECIPES

A stock filter whose clause is `1 = 1`.

Stated as a clause rather than special-cased, so nothing downstream needs to know
about it: `buildLibraryQuery`, `countRecipesByFilter` and `shelfMembers` all take
it unchanged, and the shelf gets art through the ordinary path.

- Its count is the whole library, which trips the 80% ceiling immediately, so it
  waives both gates with the `authored` flag introduced for FAVOURITES in #141.
- It sits **last in AUTO SHELVES**, above the put-away footer.
- It can be put away like any other auto shelf.
- It needs a glyph in `constants/dotIcons.ts` and `constants/shelfGlyphs.ts`.
  `SHELF_GLYPHS` is `Record<FilterId, DotIconName>`, so a missing glyph is a
  compile error rather than a blank tile.

### It is a shelf, not a door

It opens into a room holding everything, rather than clearing filters and
returning to the list. The alternative was considered and rejected: every other
tile opens a room, and one tile that navigates instead is a tile that behaves
differently for no visible reason.

### It is excluded from the rail

`availableFilters` feeds the rail's chips as well as the grid, and #141 was
careful that the two cannot disagree about which shelves exist. ALL RECIPES is
the one entry that has to, because a chip that narrows nothing is noise on a rail
whose whole job is narrowing.

The exception is declared rather than improvised: a `gridOnly` flag on the stock
filter, honoured by the chip builder. A reader who wonders why the rail and the
grid differ finds the answer on the filter itself.

## The art bug

`shelfIdsOf` reads art for every shelf that is drawn, which after this change is:

- every stock id, ALL RECIPES included
- every tag in `myShelves`, **at any count**
- every other tag clearing `MIN_COUNT`
- every author clearing `MIN_COUNT`

The read is one synchronous query per id on the drawing thread, so the set has to
stay bounded. It does: the ungated half is the marked list, which is short
because a person makes shelves by hand, and the unbounded half, tags and authors
arriving with imported recipes, is gated.

## The room stops assuming it is small

`ShelfRoom`'s header explains why it is not virtualised: *"a shelf is bounded by
what one person saved, nothing here needs recycling."* ALL RECIPES is precisely
the shelf that is not bounded.

Its `ScrollView` becomes a `FlatList` of rows, with the name and count as
`ListHeaderComponent`. The comment's stated objection, a virtualised list nested
inside a scroll view, does not apply: the `ScrollView` being replaced *is* the
scroll container. Every room benefits, not only the new one.

Scroll position is still not carried between the grid and the room. That decision
is unaffected and its reasoning stands.

## Testing

Unit, in `library/`:

- `shelves.test.ts`: the three kinds; a marked tag of one is drawn and an
  unmarked tag of one is not; a tag reaching the floor appears under FROM TAGS;
  the applied passthrough still holds for a tag shelf.
- `libraryFilters.test.ts`: the `1 = 1` clause resolves in all three query
  shapes; ALL RECIPES survives both suppression gates; `gridOnly` keeps it off
  the chip list while leaving it in the grid's.
- `hiddenShelves.test.ts`: a `tag:` id folds, and a shelf put away under one
  spelling stays away under the other.
- A settings test asserting `myShelves` is in `settingsSnapshot()`.

Component:

- `ShelfGrid`: three headings appear and disappear with their sections; a FROM
  TAGS tile offers MAKE IT A SHELF and a YOUR SHELVES tile offers MAKE IT A TAG.
- `ShelfRoom`: still draws its recipes after virtualisation. RNTL v14 cannot
  inspect a child's props, so the assertion is on rendered text and test IDs.

Every test is proved to fail against the current code before the change lands,
and the guards are mutation-proved after it.

## On device

The grid is the whole point, so it is checked by eye:

- the four accidental shelves are gone from YOUR SHELVES
- the shelf that was really yours is in FROM TAGS and one tap promotes it
- a promoted shelf stays promoted across a restart
- every drawn tile has art, including a marked shelf holding one recipe
- ALL RECIPES draws, opens, scrolls smoothly, and can be put away and brought
  back
- a backup taken and restored keeps the promotions
