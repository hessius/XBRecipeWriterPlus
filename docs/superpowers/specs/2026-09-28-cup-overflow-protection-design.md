# Which cup type turns overflow protection off

Settles #151.

## The short version

Our card bytes are correct. Our sentence about them is not. `OTHER`, not `OMNI`,
is the cup type the machine brews without overflow protection, and the fix is
copy plus one pair of library shelves. No byte changes, no migration.

## What #151 proposed, and why it is not what we are doing

The issue proposed swapping `CUP_TYPE.OTHER` and `CUP_TYPE.OMNI`, on the
inference that xBloom's cloud API enumerates cup types `1 xPod, 2 Omni, 3 Other,
4 Tea`, that every position except those two is the cloud value minus one, and
that a single crossed pair is more likely to be our mistake than the vendor's
ordering.

Three things say otherwise.

**Pour patterns cross the same way.** The card numbers them `CENTERED 0,
CIRCULAR 1, SPIRAL 2`; the cloud numbers them `1 Centered, 2 Spiral, 3
Circular`. Cloud minus one gives Centered, Spiral, Circular against the card's
Centered, Circular, Spiral: the middle two are crossed, exactly as the cup types
are. `library/cloud/__tests__/mapRow.test.ts:148-151` already records this in as
many words. One crossed pair is an anomaly; two is the vendor's habit, and the
inference the issue rests on does not survive it.

**`OMNI = 0x02` is the oldest value in the file.** Before `8e0df64` the enum read
`XPOD 0x00, OMNI 0x02, TEA 0x23, OTHER 0x04 // works as coffee, probably the same
as Omni`. Omni's byte was known from real cards; Other's was a guess, later
corrected to `0x01`. The two later commits named "hotfix: reorder cups" moved
declaration order for the editor's segmented row and changed no value.

**The observation behind the report is about names, not bytes.** It is
well established outside this app that Omni brews with overflow protection and
Other brews without it. That is a statement about the two cup types, and it is
satisfied by the bytes we already write: a user who picks OTHER writes `0x01`,
the machine reads Other, and nothing stops the water. Under the swap the same
user would write a byte the machine read as Omni and protection would have been
on, which is the opposite of what everyone reports.

Independent support for the naming, from our own protocol notes:
`docs/machine-integration/cloud-api.md:145` calls the cloud value `2 =
Omni/Dripper`. Omni is xBloom's own dripper and the machine knows its shape; a
third-party brewer it does not, so it does not try.

`ble-protocol.md:311` records a narrower cup weight range for the xDripper than
for "other", which points the same way, but it is not offered as evidence here:
that section is headed a `corroborated conflict`, only one of its three sources
splits the values by cup type at all, and our own `setCupFrame` sends the wider
range for every coffee brew. The naming does not need it.

## What changes

### 1. The constants

`library/Recipe.ts` keeps `XPOD 0x00, OTHER 0x01, OMNI 0x02, TEA 0x03`. The
`// no overflow protection` comment moves from `OMNI` to `OTHER`, and the block
gains a short note recording why, with the two document references above. The
note is the point: without it this gets re-litigated the next time somebody reads
the cloud ordering.

### 2. The migration at `library/Recipe.ts:280`

`else if (this.cupType === 0x04) { this.cupType = 0x01; // 0x01 is for Other }`
is unchanged and stays correct as written. #151 raised it as a question that
could not be settled from the comment; with no swap, both readings of the
author's intent give the same answer.

### 3. The help copy

`constants/recipeHelp.ts`, `cup` entry:

- **Hint:** `Other turns overflow protection off.`
- **Detail:** Omni is xBloom's own dripper, so the machine knows when the cup is
  full and stops. Other is for third-party brewers it cannot measure, so nothing
  stops it.

House voice: no em dashes, and no dashes generally. The hint stays inside the
ninety characters `docs/help-copy.md` allows.

### 4. The library shelves

`library/libraryFilters.ts` binds `overflowOff` to `OMNI` and `otherBrewer` to
`OTHER`. Corrected, "overflow off" means `OTHER`, so the two shelves would select
the same recipes and `OMNI`, which `library/newRecipe.ts:57` makes the default
for every new recipe, would have no shelf at all.

The pair is renamed to the words the editor already uses for the same choice:

| id | label | clause | glyph |
| --- | --- | --- | --- |
| `omniDripper` | `OMNI DRIPPER` | `cupType = OMNI` | the cone dripper drawing |
| `otherBrewer` | `OTHER BREWER` | `cupType = OTHER` | the overflowing cup drawing |

The two existing drawings change owners rather than being redrawn. The cone
dripper on its stand is literally what an Omni Dripper is, and the cup spilling
over its rim belongs with the type that can spill. In `constants/dotIcons.ts`
the cone-dripper drawing, today `shelfOtherBrewer`, becomes `shelfOmniDripper`,
and the overflowing-cup drawing, today `shelfOverflowOff`, takes the freed name
`shelfOtherBrewer`. No pixels change; only which shelf each set of pixels
belongs to.

The id is persisted in one place, and the rename has to be spoken there.
`hooks/useLibraryQuery.ts` holds the query itself in memory, persisting only
`librarySort`, `librarySortDirection`, `libraryFavouritesFirst` and
`libraryView`. But the shelves a user has put away are a separate, durable
answer: `hiddenShelves` and `myShelves` store canonical shelf ids as JSON, and
`canonicalShelfId` in `library/hiddenShelves.ts` folds author and tag ids while
returning a stock id unchanged. A stored `overflowOff` would therefore match no
shelf after the rename, `OMNI DRIPPER` would reappear in the grid of anybody who
had put it away, and the dead id would ride along in their backups.

That is precisely the failure the module's own doc comment says it carries
unknown ids to avoid. So `canonicalShelfId` folds `overflowOff` to `omniDripper`
alongside the folds already there. Nothing on disk is rewritten in place: the
stored string is folded on read, and rewritten the next time the list is
touched, which is how the older comma-separated format is already handled.

Rejected alternatives: keeping both labels and swapping only their clauses,
which leaves `OTHER BREWER` selecting xBloom's own dripper; and deleting
`overflowOff` outright, which leaves the commonest cup type unshelved.

### 5. The documentation

- `.github/copilot-instructions.md:80`, which records the wrong constant as
  settled.
- `docs/superpowers/specs/2026-09-16-library-shelves-design.md:311,366`.
- `docs/help-copy.md:80,84` and `docs/copy.md:167,306,308`, which mirror the
  strings in §3 and the shelf labels in §4.
- `library/shareLink.ts:56-58`, whose comment is still true but names Other as
  the type a `+1` would turn into an Omni; it gains the corrected consequence.

`app/about.tsx:70` (`OVERFLOW PROTECTION OFF: LIVE A LITTLE`) names no cup type
and is left alone.

## Testing

Nothing here changes a byte, so `library/__tests__/cardFixtures.ts` and every
card round trip stay untouched, which is the outcome the fixture's independence
exists to make visible.

- `library/__tests__/libraryFilters.test.ts:241-247` is updated for the renamed
  ids and their swapped clauses, and keeps asserting that each shelf selects
  exactly one of the two recipes.
- `library/__tests__/RecipeDatabase.index.test.ts:752-765` is updated for the
  rename.
- `constants/__tests__/dotIcons.test.ts` covers the renamed glyphs.
- A new assertion in `library/__tests__/libraryFilters.test.ts` pins the pair
  apart: a recipe with `cupType = OMNI` must not appear on `otherBrewer`, and a
  recipe with `cupType = OTHER` must not appear on `omniDripper`. The bug this
  spec fixes is exactly the two being confused, so the test says so directly.

No hardware confirmation is required **for the bytes**, and none is claimed
**for the behaviour**. The two are worth separating, because #151 conflated
them and so does a reading of this document that stops at the heading.

The byte values need no device check: this branch changes none of them, so no
card it writes differs by a single bit from one `main` writes today. That is
checkable from the diff rather than from a machine.

The behaviour claim, that OTHER is the cup type the machine brews without
overflow protection, does not follow from the bytes and is not derived from
them. It rests on the owner's report, corroborated by the cloud API naming
value 2 the dripper. The cloud API does not document overflow protection and is
not offered as though it did; it establishes which cup has which *name*, and
the report supplies the behaviour. A device check would upgrade that, and is
welcome, but it gates nothing here for one reason: **picking Other wrote `0x01`
before this branch and writes `0x01` after.** The machine does exactly what it
did. The only thing that changes is whether the app warns the user first, and
the copy being replaced warned them the wrong way round, which is the surprise
#151 was reported about.
