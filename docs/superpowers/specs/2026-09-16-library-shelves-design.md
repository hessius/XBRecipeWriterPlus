# A library worth keeping: shelves, sort, and what a recipe says about itself

## Why

The library screen has one job and currently does half of it. It lists recipes
and it opens them. It cannot help you find one, and it cannot tell you what one
is for.

The stated problem, in the words of the person with a hundred of them: *finding
the one I want for a particular coffee or style, finding that new recipe I just
added, but also remembering what a recipe is, why it is, it makes it hard for me
to know what to try for a new coffee.*

Three problems wearing one coat, and only one of them is search:

1. **Narrowing** the library to a kind of recipe. A filter problem.
2. **Finding what changed recently.** A sort problem. Today the list is sorted
   A to Z with no alternative, so a recipe added five minutes ago is buried in
   the middle of the alphabet.
3. **Reading a row and knowing what it is for.** Neither. The row shows a name,
   a dose, a ratio and a grind size, which is what the machine needs and says
   nothing about why the recipe exists.

This design answers all three, plus the place the answers have to live once
there are more of them than a card can hold.

It covers #72 (tags, filter, search) and #106 (groups). It shares a boundary
with #95 (the brew history roadmap) and states that boundary explicitly, because
both touch the same screen and neither should have to redesign it twice.

It rests on the `recipe-index` branch, whose rule it inherits without amendment:
**`recipes.recipeJSON` is the only truth, and every other column is a rebuildable
cache.**

## What a row says

### Two registers, not one

A recipe has two kinds of thing to say about itself, and they must not compete
for the same line.

**Evidence** is derived from brews: an average rating, a count, a recency. It
joins the stats row at the trailing end, where the dose, ratio and grind already
sit. It costs no height at all.

```
Ethiopia Guji washed
Bright and floral, works cold
★  18 G   1:16   GRIND 62            ★4.3 · 12 · 3d
```

**A description** is authored, one short line, and it takes a prose line of its
own. It is the answer to "why is this recipe", and nothing derived can produce
it.

There is no setting to choose between them and no animation alternating them. A
row with both shows both. A row with neither shows neither, and looks exactly
like a row does today.

While the card is in editing mode, the duplicate and delete glyphs occupy the
trailing end of the stats row, so evidence is hidden there. It is the same
space, and the glyphs win because they are interactive.

### Equal height comes from an equal line budget

Every card gets exactly **two lines of prose**. Either the title takes both, or
the title takes one and the description takes the other.

This is the rule, not a fixed pixel height. `components/RecipeCard.tsx:239`
uses `minHeight` deliberately, and the comment there records why: a fixed height
"plus the clip below would crop the stats away" at large Dynamic Type sizes. A
line budget stays equal at any text size; a pixel height stops being equal at the
first accessibility setting anyone changes.

So:

- A recipe with no description keeps `numberOfLines={2}` on its title, as today.
- A recipe with a description drops its title to `numberOfLines={1}`.
- `minHeight` stays. `height` never appears.

A long title with a description truncates. That is the trade, and it is
deliberate: a title that needs two lines plus an explanation is a recipe whose
name is doing the description's job.

### The description is capped where it is typed

Roughly 60 characters, enforced in the editor with a live counter, not clipped
silently at the row. A limit a user can see is a limit; a limit they discover by
having their words vanish is a bug.

It travels through backup like any other authored field.

## The rail

### The vertical budget is the whole problem

Stack a search field, a sort control, a filter row and a section header above a
list and the screen is 57% chrome before a single recipe appears. On a library of
a hundred that is a bad trade; on a library of ten it is absurd.

So one rail, one row high, holding everything.

```
┌─────────────────────────────────────────────────────────┐
│  ⌕  │ ☰ ▦ │  ⇅  │  TEA   SINGLE POUR   GRIND …         │
└─────────────────────────────────────────────────────────┘
      pinned          │ hairline │      scrolls
```

### Pinned leading cluster, scrolling filters

> **Superseded** by "Revision: the filters move to a second rail" below, which
> moves the chips out of this row and retires the divider. The reasoning here is
> kept because the revision is an answer to it.

Three controls pin to the leading edge behind a hairline divider: **search**,
**view mode**, **sort**. Filter chips scroll past them.

The divider is structural, not decorative. Left of it are controls that are
always reachable. Right of it is the filter vocabulary, which is as long as the
library is varied. Without the divider a user has no way to know that the row
scrolls, or that three of its items do not.

**Search is an icon-only chip that expands into a field on tap.** It collapses on
clear. Search is the least used of the three in a library this size and the most
expensive in width, so it pays for its space only when in use.

### The rail shrinks but its targets do not

The rail persists as the list scrolls and shrinks somewhat. It cannot shrink
below the touch minimum.

`components/HomeHeader.tsx:19` sets `TOUCH_TARGET = 44` and explains that glyphs
are padded rather than given `hitSlop`, "because hit slop on adjacent controls
overlaps into the gap between them and the later sibling wins". Chips in a rail
are adjacent siblings. Slop cannot rescue a chip that has been drawn too small.

So shrinking is a reduction in the rail's own vertical padding. **Chip height
stays at 44 and never moves**, and an icon-only chip is 44 wide as well as tall.
The rail gets shorter; the targets inside it do not.

### Revision: the filters move to a second rail

One row held everything right up until a device saw it. On a small phone the
pinned cluster, the divider and a sort chip wide enough to name its axis leave
the filter row squeezed to two chips, and the view segmented pair above has not
even been built yet. Add it and the budget is one chip. A row that can show one
of twelve filters is not a filter row; it is a rumour of one.

Widening the row is not available, so the filters leave it.

```
┌─────────────────────────────────────────────────────────┐
│  ⌕ SEARCH ────────────────────────┤ ☰ ▦  ⇅ RECENT  ⌗ 2 ⌄│  always
├─────────────────────────────────────────────────────────┤
│  TEA   SINGLE POUR   GRIND   FROM ANNA   xBLOOM PODS …  │  on demand
└─────────────────────────────────────────────────────────┘
```

The top rail keeps the controls that act on the whole library however it is
narrowed: search, view, sort. **Search leads and takes the width; the buttons sit
to the trailing edge.** A **filter button joins them** and reveals a second rail
beneath, which is nothing but filter chips at the full
width of the screen. Twelve chips two at a time becomes twelve chips five at a
time with a scroll that is a scroll rather than a cliff.

**The hairline divider between pinned and scrolling goes.** It earned its place
by marking where the row stopped being pinned, and with the filters gone the top
rail is pinned all the way across. Keeping it would be ornament, and the rule
that it must never be removed as ornament cuts both ways.

**The filter button carries the count, because a hidden filter is worse than a
cramped one.** A chip a user can see is a chip they can see is on; a chip behind
a button is a library quietly missing recipes with no visible reason. The button
shows the number of applied filters at all times, including zero.

**The fill means something is filtered. The caret means the rail is open.** The
button has two binaries to report and `RailChip` allows the fill exactly one of
them: its own doctrine is that the fill *is* the state, because the editor's
action bar established that one step of ink is not a state. So the two must be
carried by structurally different things.

The fill goes to the filtering, not the disclosure. Whether the rail is open is
already visible — the rail is directly beneath the button — so spending the fill
on it would buy nothing and leave *closed with filters applied* drawn identically
to *closed with none*, which is the one state where the app is hiding recipes.
It also keeps the grammar the rest of the rail already speaks: a filled chip
means this control is doing something to your library, exactly as the sort chip
fills once it leaves the default. The caret takes the disclosure, which is what
carets are for.

    closed, none    ⌗ 0 ⌄   outline
    closed, two     ⌗ 2 ⌄   filled
    open,   none    ⌗ 0 ⌃   outline
    open,   two     ⌗ 2 ⌃   filled

**Search flexes rather than taking a fixed width, and it flexes whether or not
it is in use.** A hardcoded field width overflows the cluster on a small phone
and pushes the trailing control off an edge that cannot scroll, and no single
number is right across every device. Search takes whatever the buttons leave.

It keeps that width when idle. The earlier reading -- an icon-only square that
pays for its space only while in use -- was right when twelve filter chips were
competing for the same row, and stopped being right the moment they moved out.
There is nothing left to give the width back *to*: a 44-point square beside two
buttons leaves a long dead gap in the middle of the rail, which reads as a
missing control rather than as restraint. So the idle state is a full-width
field showing its own word, and the rail is always full.

What changes on activation is therefore small on purpose -- the field takes the
sort chip's word as extra room and grows into it. The control does not leap
across the rail; it is already where it will be, and the tap only puts a cursor
in it. Search does not get a rail of its own: vertical space is
the scarcest thing on this screen and saving it is the entire reason the rail
exists.

**The second rail opens by itself when a filter is already applied.** Not as a
convenience: it is the same argument. If the user arrives at a narrowed library
the narrowing has to be on screen, and the button's count alone tells them *that*
something is filtered without telling them *what*. Applied means open, until the
user says otherwise.

**Until the user says otherwise** is the whole of it. The intent is three-valued:
unsaid, open, closed. Unsaid follows the filters; a tap settles it and wins from
then on. Holding the rail open against a tap because a filter is applied would
make the button dead on exactly the screen where it is most likely to be pressed,
and a dead control teaches a user that the app is broken faster than a rail in
the wrong state teaches them anything at all. Beyond that the intent is
transient, like the filters themselves, and is not a setting.

This costs a row of height, but only while the user is filtering, which is
exactly when they have asked for it. The permanent chrome gets *shorter*, not
taller: one rail without a filter row is less than one rail with a strangled one.

### Revision: the hint comes out

Phase 3 shipped a one-line hint above the rail naming what the row does,
dismissed on first use and gated behind `showHints`. Device review rejected it:
search, sort and filter are self-evident from their glyphs, and the line looked
wrong where it sat. It goes entirely, along with its setting key. A rail that
needs a caption is a rail with the wrong glyphs.

### View mode is a segmented pair, not a toggling icon

A single icon that switches views is ambiguous in a way that has no fix: a grid
glyph might mean "you are in grid" or "tap for grid", and both readings are
common enough that users of the same app disagree.

The answer is to show both options and light the active one.
`components/SegmentedControl.tsx` and `components/SegmentedRow.tsx` are already
the house idiom for one of a short list, so this is an existing component in a
new place rather than a new control.

It also solves the shrink problem. A segment can lose padding without eroding its
neighbour's boundary, because the boundary is drawn.

No teaching animation. Motion confirms a switch; it does not explain a button.
Anything that needs explaining on first use needs explaining on every first use,
including after a reinstall.

### Last view is remembered

Globally, in `Settings`. A ten recipe library and a hundred and eighty recipe
library want different front doors, and the app should not have an opinion about
which one a person is.

## Shelves

### Every shelf is a query

This is the entire data model.

- An **auto shelf** queries index columns. `isTea`, `cupType`, `pourCount`,
  `grinder`, `xid`, `sharedBy`.
- A **manual shelf** queries a tag.

Nothing else exists. There is no `shelves` table and no `shelf_members` table.
The grid never needs to know which kind it is drawing, and nothing can go stale,
because nothing is stored twice.

Tags live in `recipes.recipeJSON`, as the `recipe-index` design already
specifies, because `buildBackup` round-trips the blob through
`JSON.parse(JSON.stringify(recipe))`. A side table would be invisible to export.
That is the `showHints` failure, and it is not repeated here.

This collapses #72 and #106 into one feature. Applying a tag and adding to a
shelf are the same gesture with a friendlier word on it.

### A manual shelf cannot be empty

It follows from the model: a shelf with no members has nothing to store it in.

Two consequences, both of which improve the flow:

- **You create a shelf by choosing its members.** The flow ends in the picker
  rather than starting with an empty box.
- **Removing the last member removes the shelf**, with a confirmation that says
  so before it happens.

Shelf ordering is deliberately absent. See #111, which records the three options
and what would justify paying for one.

### Stock auto shelves

Shipped as index queries. None of them is stored, so none of them can be wrong.

| Shelf | Query |
|---|---|
| Tea | `isTea = 1` |
| xBloom pods | `cupType = XPOD` |
| Overflow protection off | `cupType = OMNI` |
| Other brewer | `cupType = OTHER` |
| Single pour | `pourCount = 1` |
| Many stages | `pourCount >= 4` |
| Grinder off | `grinder = 0` |
| xBloom recipes | `xid IS NOT NULL` |
| Strong | `ratio <= 14` |
| Long | `ratio >= 17` |
| Hot | `maxTemp >= 94` |
| From <author> | `sharedBy = ?`, one shelf per distinct author |
| Recently added | `createdAt` within 30 days |

`cupType` values come from `library/Recipe.ts:7`: `XPOD 0x00`, `OTHER 0x01`,
`OMNI 0x02` (which the UI calls "overflow protection off"), `TEA 0x03`.

### Suppression applies to derived shelves only

An auto shelf is not drawn when it holds **fewer than 3 recipes**, nor when it
holds **more than 80% of the library**. The first stops the app inventing noise;
the second stops it presenting the whole library as a category.

Neither rule applies to anything a person authored. One favourited recipe is a
decision, not noise, and a manual shelf of two is a shelf.

### A shelf opens into itself

**Reversed after device testing.** This section used to say the opposite: that
tapping a shelf returned you to list view with that shelf applied, the filter
chips dimmed, and the grid was somewhere you passed through. On a phone that
reads as the app undoing the thing you just asked for. You tap a square, the
squares vanish, you are back in the list you left, and the only sign anything
happened is a chip. The reasoning was sound and the result was not.

Tapping a shelf now opens that shelf, and stays in the shelf idiom: the shelf's
name as the heading, its recipes as tiles of the same square, and a way back to
the grid. A shelf is a place, not a lens you borrow.

What this costs is the swipe tile. A square tile has no room to swipe open, so
write, brew and delete are reached by a long press, which opens the overflow
sheet the row already uses. This is the one door the grid and the list share, so
the actions cannot drift apart between the two views.

The list view keeps filter chips and they keep working. They are a different
instrument: a chip narrows what you are looking at, a shelf is a thing you
opened. The two only competed when tapping a shelf turned into applying a chip.

### The rail belongs to the view, not to the screen

**Added after device testing.** Phase 3 built the rail for a screen that had one
view, then phase 4 pushed a second control into the same row, and at 320 pt the
result was four controls fighting over a rail that comfortably holds two.

The rail is drawn per view, and each view is asked what it actually needs:

- **List view** carries the view toggle, search, sort, and the filter button.
- **Shelf view** carries the view toggle and nothing else. It has no sort,
  because shelf ordering is deferred and out of scope, so the control would
  offer an axis that does not exist. It has no filter button, because a filter
  and a shelf narrow the same library by the same means and a filtered shelf
  grid is two instruments pointed at one target. It has no search, because the
  thing worth finding in a grid of eight named squares is already on screen.

Search returns to a square chip when idle, and when it opens it is drawn **over**
the rest of the rail rather than pushing it. Phase 3 had search flex to fill the
rail, which was right for a rail holding search and two buttons and wrong the
moment a segmented pair joined it: a flexing field and a fixed pair share a row
by taking width from each other, and the field lost. Overlaying means opening
search cannot move the toggle, and the field gets the whole rail regardless of
what is underneath it.

The view toggle is built from the rail's own metrics rather than the shared
`SegmentedControl`, which is a settings component and is also used by
`SortSheet`. Bending it to match the rail would change two screens that did not
ask to be changed; matching it in a rail-owned control cannot.

### Shelf art is a slot, not a decision

The mark is deliberately unsettled and is going to testers. What the spec commits
to is the contract that lets any of the candidates drop in:

```tsx
<ShelfMark
  kind="auto" | "manual"
  glyph={DotIcon | undefined}   // auto only
  accents={string[]}            // dominant first
  profiles={Pour[][]}           // up to 3 members
  size={44}
/>
```

- **44 pt square, always.** A variant swap cannot reflow the grid.
- **All variants are fed from the same props.** Nothing is fetched, nothing is
  stored, nothing can go stale.
- **At most 3 members are read** for the profile variant, chosen by the shelf's
  own sort, so a shelf of forty does not draw forty staircases.
- **A dev setting selects the variant**, so one tester build carries all of them.

The candidates:

- **A: accent mosaic.** A 2 by 2 of member accents. Free, and at eight shelves
  they are interchangeable, because there are only 8 coffee and 4 tea accents.
- **B: superimposed pour profiles**, each member drawn in its own accent. The
  only candidate where the picture is derived from the recipes rather than
  decorating them: a single pour shelf looks flat, a four stage shelf looks
  busy.
- **C: accent field with a dot matrix glyph** from `constants/dotIcons.ts`,
  remembering that the 9 by 9 grid takes only axis aligned runs and pure
  diagonals.

The leading hybrid is **C for auto shelves and B for manual ones**, which is more
than a compromise. Auto shelves are a closed set that ships with the app, so
every glyph is drawn once at design time. Manual shelves are open ended, so they
take the derived mark. No user ever picks a glyph, and no shelf is ever left
without a mark. The art then carries meaning: a glyph says the app found this
shelf, stacked profiles say you built it.

The favourites shelf tests that grammar and passes it. Its membership is authored
one tap at a time, so it takes the profile mark and sits under `YOUR SHELVES`.

It is the one shelf that is authored without being a tag. Its query is
`favourite = 1` against the index column, not a tag lookup, because the favourite
is already a field on the recipe with its own controls in the header and the
swipe tray. Introducing a parallel `favourite` tag would give one piece of state
two homes and a way to disagree with itself. So the rule is slightly wider than
"manual means tag": a shelf is a query, most authored shelves query a tag, and
this one queries the field that its own dedicated control writes.

**One risk to watch in testing.** Pour profiles are already drawn on every recipe
card. If a shelf of three shows the same three silhouettes as the cards beneath
it, the grid may read as a smaller copy of the list rather than a level above it.

### Vocabulary

Two headings, both Doto caps, matching `NO RECIPES YET` and `NO BREWS YET`:

- `YOUR SHELVES`
- `AUTO SHELVES`

The word "shelf" is introduced through `constants/recipeHelp.ts`, which is
already the data-driven mechanism for explaining a concept behind the `showHints`
setting. A `shelves` topic joins it. No tutorial, no new voice.

### The picker is the library screen in selection mode

Choosing members for a shelf must not be a plain scrollable list. It was designed
for a hundred and eighty recipes, and a hundred and eighty checkboxes is not a
picker.

So it is the same screen: same rail, same chips, same search, plus a tick per
row and a bottom bar.

Three rules make it survive filtering:

- **Filters compose with selection.** Narrow to tea, tick three, clear the
  filter, and the three stay ticked.
- **A `SELECTED (n)` chip** so members can always be brought back into view.
  Without it, changing the lens makes your own choices vanish.
- **The bottom bar counts the shelf, not the view.** `4 ON THIS SHELF`, never
  the number visible under the current filter.

## Sort

### Axes

Six, each with a neutral name, because a direction control makes
"Ratio, low to high" a lie half the time.

| Axis | Direction labels | Source |
|---|---|---|
| Name | `A TO Z` / `Z TO A` | `sortName` |
| Date added | `NEWEST` / `OLDEST` | `createdAt` |
| Last brewed | `RECENT` / `LONGEST AGO` | `brews.startedAt` |
| Times brewed | `MOST` / `LEAST` | `count(brews)` |
| Ratio | `LOW TO HIGH` / `HIGH TO LOW` | `ratio` |
| Rating | `BEST` / `WORST` | `avg(brews.rating)` |

Direction is a segmented pair under the axis list, worded rather than arrowed,
for the same reason the view switch is a segmented pair: an up arrow on
"Times brewed" is genuinely ambiguous.

Each axis carries a sensible default direction, so choosing one never needs a
second tap. Two of the reversals earn their place rather than existing for
symmetry: **longest ago** finds what you have neglected, and **worst first**
finds what needs retuning.

### Three rules that keep it honest

- **A sort never hides a recipe.** Under last brewed and times brewed, a recipe
  never brewed still appears, sorted last, in name order.
- **Every axis falls back to name for ties.** Otherwise nine recipes at zero
  brews arrive in whatever order SQLite felt like, and it changes between
  launches.
- **Sort is global**, one key in `Settings.DEFAULTS`. Per shelf sounds richer and
  is worse: the order would change for a reason the user cannot see, and the chip
  would report a state belonging to something other than the thing they last
  touched.

Adding it to `DEFAULTS` is also how it reaches a backup, since `buildBackup`
derives from `DEFAULTS` rather than naming keys.

### The chip names itself only when it is not the default

At `Name, A to Z` the sort chip is a 44 pt square glyph. The moment the sort
changes, it
takes the accent fill and shows its axis: `⌄ ADDED`, `⌄ LAST BREWED`.

Same rule as the filter chips. A library in an unusual order must never look like
a library in its usual order.

Labels are Doto caps and short, because the pinned cluster is expensive. At
44 pt per icon chip, 88 for the segmented pair, 6 pt gaps and a 9 pt divider,
it costs about **203 pt of a 390 pt screen** at the default sort and about
**235 pt** once the sort names itself. That leaves roughly 155 pt and 123 pt
for filter chips respectively, which is one chip and part of a second. The part
chip is what tells the user the row scrolls.

### Favourites first is a modifier, not an axis

A switch beneath the direction control. An axis would replace your sort; a
modifier composes with it. Favourites A to Z, then the rest A to Z. Favourites
newest first, then the rest newest first.

When on, two Doto section headers appear: `FAVOURITES` and `ALL RECIPES`. They
are drawn only when both sections have something in them, because a heading over
the entire list is not a heading.

### `createdAt` is backfilled in insertion order

Every recipe already on a phone predates the column. Backfilled to a single
timestamp they would all tie, the name tie break would take over, and
"Date added" would look identical to "Name" until the user added something.
Correct, and indistinguishable from a bug.

Backfilling in insertion order gives a stable and plausible ordering on day one.

**In the index, not in the blob.** Nothing outside the index column reads
`createdAt`, so the backfill happens during `migrateIndex` from `ORDER BY rowid`,
which is the insertion order and does not change between rebuilds. Writing a
manufactured timestamp into every legacy recipe's stored JSON would put an
invention in the user's own file to settle a sort order, and
`RecipeDatabase.index.test.ts` already holds a rule that a rebuild never rewrites
a blob. The ordinals are small integers, so they sort below every genuine
millisecond timestamp and the undated library sits before the dated one.

## Favourites

A favourite is authored intent, which #95 permits on the recipe as long as it
never pretends to be evidence.

**Where it is set:**

- **The swipe tray**, as a third tile beside COPY and DELETE.
  `components/SwipeableRecipeRow.tsx:38` already works out that three tiles fit
  while leaving a 52 pt grab strip at 320 pt, and that four would not. The tray
  is two trays: the leading one manages the recipe as an object, which is what
  marking it is. The trailing one is things you do with the recipe.
- **The recipe screen header**, opposite the back glyph, so the header reads
  leave, identity, keep.

**Where it shows:** a filled star at the leading end of the stats row on the
card. Evidence took the trailing end; favourite takes the front. Both are free,
and the two lines of prose rule is untouched.

It is a recipe field, travels in backup, and gets an index column.

## Rating, and the brew nobody watched

### The scale is already decided

#99 fixes it: **five stars, whole steps, with an explicit "unrated" that is not
zero.** Unrated and bad must be distinguishable or #104's averages lie. Every
existing brew becomes unrated on upgrade.

### A rating you type by hand is a brew the app did not watch

#95 is explicit that the brew is the observation and the recipe is the inference,
and that the two must not share a field. So **the recipe gets no rating field.**

The problem this appears to create is that a rating then requires a Bluetooth
brew, and a user who writes cards and brews at the machine could never produce
one. The sort axis would ship permanently empty for them.

The resolution is to give that user the thing they actually have: a brew that
happened where the app could not see it. They tap a star, and the app writes a
`brews` row with no stream and no samples.

There is never a second number, so there is nothing to reconcile. Averages, times
brewed, last brewed and the row's evidence all keep working with no special case.
And a card-only user gains a brew history, which today they have none of.

The precedent is in the codebase already: `hasStream` exists so a record whose
samples were swept still shows its figures, it just has no trace to draw. An
unobserved brew is that idea one step further, a record with no figures either,
carrying only what a person put there.

`brews` lives in the same database file as `recipes`
(`library/BrewDatabase.ts:50` opens `xbrecipewriter.db`), so every brew derived
sort axis is one `LEFT JOIN` rather than a cross store merge.

**Two rules keep it honest:**

- **Never averaged.** An unobserved brew has `waterTotal 0` and `heldSeconds 0`.
  It is excluded from every machine derived figure. It counts for rating, times
  brewed and last brewed, and for nothing the machine would have measured.
- **It says so.** The record reads `NOT WATCHED` where a watched brew shows its
  figures.

**One entry point.** The star on a recipe is all the user touches. If there is a
brew from today it rates that; if not it writes an unobserved one. The mechanism
is never explained because it never needs to be.

## The recipe screen

### A third deck

`components/DeckSwitch.tsx` already carries BREW and STAGES, its comment at line
29 says it is built to be "what a screen reader means by a tab", and its segments
are `flex: 1`. The only obstacle to a third is that the helper is called
`half()`. At 390 pt three segments are about 119 pt each, which holds
`STAGES · 4` comfortably.

`ABOUT` joins them, holding four short sections:

```
NOTE        what this recipe is for
XBLOOM POD  what it is linked to
FROM        where it arrived from
HOW IT HAS GONE   rating summary, then #95's history
```

This is not a dumping ground, because the deck also takes two things out of a
deck where they never belonged. `Recipe ID` and `Name` sit at
`app/editRecipe.tsx:416` and `:426`, near the bottom of the **brew** deck, and
the `ScrollView` comment at line 1103 names them directly as the reason the
screen needs `automaticallyAdjustKeyboardInsets`. They are identity and a lookup
key, not brew parameters.

### Tap the title to rename

The recipe's name moves to the screen header, with a pencil glyph beside it,
because the roadmap rules out hidden functionality and a title that happens to be
tappable is hidden.

**Tapping it opens a rename sheet. It does not edit in place.** An editable field
inside a header that collapses on scroll, with a software keyboard arriving under
it, is the shape of bug that works on one platform and not the other. A sheet has
none of that: the header may collapse, the keyboard belongs to the sheet, and it
behaves identically from all three decks.

This also removes a problem rather than answering it. A new recipe opens on BREW
exactly as it does today, with the header reading `New recipe` as a tappable
placeholder. Nothing regresses and no rule has to be invented about landing
decks. And renaming works from STAGES, which it never has.

The sheet holds **Name alone**.

### The pod section

The XID does not belong behind the title. It is a lookup key, not a name, and
nobody hunting for it would tap a title they are happy with. It gets its own
section in ABOUT, mirroring `components/ImportResult.tsx` so a pod looks the same
the day you import it and a year later.

It is always drawn, including for a recipe with no pod, because a person looking
for the field needs it in a fixed place.

**Four states:**

| State | Shows |
|---|---|
| No pod | The ID field and one line of explanation |
| Linked, following the pod | ID, pod image, pod name and subtitle, `✓ USING THIS NAME` |
| Linked, renamed | the same, plus a `USE THIS NAME` control |
| Lookup failed | `xidLookupFailed` copy: the ID is saved and will be retried |

**The control clears the custom name rather than copying the pod's.**

`recipe.xbloomName` and `recipe.name` are already separate fields, and the
comment at `hooks/useRecipeEditor.ts:210` records why: "the user's own `name` is
left untouched, so a sync can no longer silently overwrite a name they typed."
`displayName()` falls back to the pod name when yours is empty. **An empty custom
name is not a missing value. It means follow the pod.**

Copying would freeze a string: the pod name changes or the ID is corrected, and
yours says something slightly wrong forever. Clearing restores the link so the
title tracks the pod, which is what the code was built to do. One tap in, one tap
out, and the state is visible in both directions.

**Moving the field moves its machinery.** `onXidFocusChange`, the deferred apply
in `applyOrDefer` and the lookup debounce exist because rendering while an
uncontrolled field is focused resets its native text and swallows keystrokes.
That is not optional behaviour and does not survive being retyped into a new
file.

### The avatar setting

`showRecipeAvatars`, off by default, exists to find out whether avatars help at
all.

When on, a 40 pt mark replaces the accent mark on a row: `shareMemberHead` for a
shared import, `podsVo.imagePath` for an XID recipe. Any failure to load falls
silently back to the accent mark, and a missing image is never an error.

It partly reopens the roadmap's deferred "recipe images" item, and only partly: a
40 pt mark is a much smaller promise than a hero image.

## Storage

### New `Recipe` fields

All read forgivingly in the `Recipe(json)` constructor, defaulting when absent or
of the wrong type, exactly as `tags` is. None of them appears in `getData()` or
`parseData()`, and none affects the card bytes or the CRC.

| Field | Holds |
|---|---|
| `description` | The authored one line, capped at 60 characters |
| `favourite` | Boolean |
| `tags` | From `recipe-index`; manual shelf membership |
| `sharedBy` | `shareMemberName` from the share detail response |
| `sharedByAvatar` | `shareMemberHead`, https only |
| `imageURL` | `podsVo.imagePath`, https only |

The last three are captured at import time by the account import work, because
they exist only in the API response at the moment of import. A recipe imported
before the fields exist has lost them permanently, and recovering them would mean
re-fetching every share link a user has ever imported.

**`sharedBy` and `sharedByAvatar` arrive only from a share link**, not from the
account library. `XBloomRecipe.fromAccountRow` wraps a bare `recipeVo`, and
`shareMemberName` / `shareMemberHead` are siblings of that object in the
share-detail response rather than fields inside it, so a row from your own
library carries neither.

That is correct rather than a gap: recipes in your own xBloom library are ones
you authored, so there is no other author to name. It matters for two things
though. Author shelves are built from share-link imports only, which is what
makes a `BrewMind` shelf meaningful in the first place. And `imageURL` does
survive an account import, because it comes from `podsVo.imagePath` inside the
recipe object, so the pod section works for both routes.

`library/backup.ts` gets a validator entry for each. Per the existing rule there,
a malformed value is dropped and the recipe is kept. URLs from an untrusted file
accept `https://` only.

### New index columns

Added to the descriptor array in `library/recipeIndex.ts`. No `INDEX_REVISION`
bump is needed: the schema hash covers the shape of that array, so adding a
column changes it and every install rebuilds on next open. The revision number
exists only for the case the hash cannot see, a changed `from` body with the
shape left identical, which is invisible because
`Function.prototype.toString()` returns `"[bytecode]"` under Hermes in release
builds.

`xid`, `sharedBy`, `favourite`, and `hasDescription` (presence only, so that
"has a note" can be a filter). Brew aggregates are joined at query time rather
than stored.

### New settings

All in `Settings.DEFAULTS`, which is what carries them into a backup.

| Key | Default |
|---|---|
| `libraryView` | `list` |
| `librarySort` | `name` |
| `librarySortDirection` | `asc` |
| `libraryFavouritesFirst` | `false` |
| `showRecipeAvatars` | `false` |
| `shelfMarkVariant` | tester-controlled, through LABS |

The tester build no longer needs a bespoke mechanism for that last one. M6
(#112) shipped `labsUnlocked`, a settings key that reveals a LABS section,
revealed by seven taps on the version line in About, and it was built as a
general mechanism with this setting explicitly in mind. `shelfMarkVariant` is a
row in that section. It does not read `__DEV__` or an EAS channel, so it works
in a production TestFlight build, which is how the testers will get it.

### New `brews` columns

`rating` (nullable, distinct from zero) and `observed` (0 for a hand entered
brew). `library/backup.ts` does not carry brews today, which #96 must fix before
ratings ship, or a phone migration silently drops the only copy of
user-authored data.

## Boundary with #95

M5 builds the ABOUT deck, the switch going from two segments to three, and
everything authored: note, favourite, pod section, source. It **stubs** the
evidence half as a single summary line drawn from `brews` with the one query it
already supports.

#95 fills in recent brews, comparison and the tag profile, landing in a section
that is already there, already named, already scrolled to.

M5 therefore ships alone and is useful alone, and the brew history work never has
to invent a home for its output. That is the thing that usually forces a screen
to be redesigned twice.

## Copy rules this design must follow

- **No em dashes, and dashes avoided generally**, in every user-facing string.
  The shipped app already contains none; this writes the rule down.
- Doto caps for machine readouts and system labels, Inter sentence case for
  anything a person authored or reads as prose, per
  `components/DotMatrixText.tsx:108`.
- `sharedBy` is a **claim, not an identity**. Copy says "recipes that arrived
  from BrewMind", never "by BrewMind".

## Shipping order

This design is larger than one sitting, and the pieces have a dependency order
worth stating so the plan does not have to rediscover it.

1. **Foundation.** The new `Recipe` fields, their `backup.ts` validators, the
   index columns and the `INDEX_REVISION` bump, and the new `Settings.DEFAULTS`
   entries. Nothing visible ships, and everything after this is additive.
   Depends on `recipe-index` landing, and on the account import work capturing
   `sharedBy`, `sharedByAvatar` and `imageURL`.

   **Both dependencies have moved since this was written.** The account import
   landed in #112 and captured all three fields, so that half is done. The
   recipe index is built but unmerged: 28 commits on the `recipe-index` branch,
   implementing [its design](2026-09-14-recipe-index-design.md) and
   [plan](../plans/2026-09-14-recipe-index.md) in full, never pushed until now
   and never opened as a PR. `main` still carries the plain
   `recipes(uuid, recipeJSON)` blob table, so phase 1 still comes first, but it
   is a rebase rather than a build. §0 of that design lists the four descriptors
   M5 and M6 add to it.

   Phase 1 and the favourite are planned together in
   [`2026-09-16-m5-foundation-and-favourites.md`](../plans/2026-09-16-m5-foundation-and-favourites.md),
   which also records why the description is not in that plan: it is typed on
   the ABOUT deck, so it ships with phase 5 rather than being rendered with
   nowhere to author it.
2. **The row.** Description, the equal height line budget, the favourite star
   and its swipe tile, and evidence as a stats row suffix. Useful on its own:
   it answers "remembering what a recipe is" without any of the rest.
3. **The rail. Done in phase 3.** Search, sort with direction and favourites
   first, and filter chips are shipped. Useful on its own. Planned in
   [`2026-09-16-m5-rail.md`](../plans/2026-09-16-m5-rail.md), which cut two
   things from this bullet deliberately: the view segmented pair goes with phase
   4, because the half it switches to is the shelf grid, and the Rating sort
   axis goes with #99, because until a rating exists the axis sorts nothing.
4. **Shelves. Shipped.** The query model, the grid, the stock auto shelves,
   shelf creation and the selection mode picker, plus the view segmented pair
   phase 3 deferred. Needs 3, because the picker is the library screen with its
   rail. Planned in
   [`2026-09-17-m5-shelves.md`](../plans/2026-09-17-m5-shelves.md).
4b. **What device testing sent back.** The rail per view, and a shelf that opens
   into itself rather than dissolving into a filter. Both are reversals of
   decisions this design made, recorded in §"The rail belongs to the view" and
   §"A shelf opens into itself". Needs 4. Planned in
   [`2026-09-17-m5-shelf-rooms.md`](../plans/2026-09-17-m5-shelf-rooms.md).
5. **The recipe screen.** The third deck, the header rename sheet, the pod
   section. Independent of 3 and 4; needs only 1. Planned in
   [`2026-09-16-m5-recipe-screen.md`](../plans/2026-09-16-m5-recipe-screen.md),
   which also picks up the description and the card's line budget left behind
   by phase 1.

`ShelfMark` variants and the avatar setting ride along with 4 and 2
respectively, and both are behind switches, so neither blocks a release.

## Out of scope

- **Shelf ordering.** Deferred, with the options recorded in #111.
- **Rating capture UI on the brew screen and brew record.** #99 owns it. This
  design owns only the recipe side star and the sort axis that consumes it.
- **Recent brews, comparison, tag profiles** in the ABOUT deck. #95.
- **Recipe hero images.** The avatar setting is a 40 pt mark and nothing more.
- **A bottom tab bar or a hamburger menu.** Ruled out by the roadmap, and the
  tester mockup that suggested one is otherwise the source of the shelf grid.
- **Nested shelves, smart shelves with user-authored queries, shelf sharing.**

## Testing

**Library:**

- A card with a description clamps its title to one line; without one it keeps
  two. Both report the same height at default and at large text sizes.
- A description over 60 characters cannot be typed, and the counter reflects it.
- Evidence is absent from the stats row while the card is in editing mode.

**Shelves:**

- An auto shelf with 2 members is not drawn; with 3 it is. An auto shelf holding
  81% of the library is not drawn; at 80% it is.
- A manual shelf with 1 member is drawn.
- Removing the last member of a manual shelf prompts, and removes the shelf.
- A manual shelf round-trips through `buildBackup` and `parseBackup`.
- `ShelfMark` renders at 44 pt for every variant, and reads at most 3 members.

**Sort:**

- Every axis is stable across two reads with ties present.
- Under last brewed, a never-brewed recipe appears last rather than being
  omitted. The count of rows is unchanged by any sort.
- Favourites first with zero favourites draws no headers; with all favourites
  draws none either.
- `librarySort` survives a backup round trip.

**Picker:**

- A selection survives a filter change and a lens change.
- The bottom bar count reports shelf members, not visible rows.

**Recipe screen:**

- The rename sheet opens from all three decks, and with the header collapsed.
- A new recipe opens on BREW with a tappable placeholder title.
- `USE THIS NAME` clears `name` and leaves `xbloomName` untouched, and
  `displayName()` then returns the pod name.
- The XID field still defers its lookup while focused after the move.

**Rating:**

- An unobserved brew counts toward rating, times brewed and last brewed, and is
  excluded from every water and time aggregate.
- Unrated is distinguishable from 1 star in an average.

Component tests use `renderWithProviders` from `test-utils/render.tsx`, with
`render`, `fireEvent` and `renderHook` all awaited, and assert on text, test IDs
and accessible labels rather than inspecting the tree.

**NFC and BLE are untouched by this design**, which is the one piece of good news
about its size: nothing here can be verified only on a device.
