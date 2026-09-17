# Rating a brew, and keeping the ones that mattered

Design for #99, with the two issues it cannot ship without: #97 (pinning a brew
against the retention sweep) and the brew half of #96 (carrying history through
backup and restore).

## The problem

A brew record says what the machine did. Water, cup, held time, a trace, a
ladder. It says nothing about whether the coffee was any good, which is the only
question the user actually had. Every later feature in #95 -- comparing two
brews of the same recipe, finding the settings that worked, a derived tag
profile, the Rating sort axis the rail already has a hole for -- rests on there
being a judgement to read. None of it can be built on a machine log alone.

So this phase adds the first user-authored data in the brew database: a rating
and a note.

## The scale, decided once

**Five stars, whole steps, and zero means unrated.**

The scale is the interface to every later filter and average, so it is picked
once and not revisited. Whole steps because a half star is a distinction nobody
can make about a cup of coffee twenty seconds after drinking it, and because the
first thing a half star buys is an argument about whether 3.5 rounds up.

Zero is not a rating. It is the absence of one, and it must stay distinguishable
from a bad brew or #104's averages will lie: a library where every unrated brew
counts as nought stars would rank a much-brewed recipe below a once-brewed one
for no reason but silence. Every brew already in the database becomes unrated on
upgrade, which is the truth about them.

`avg(rating)` therefore always filters `rating > 0`, and a recipe with no rated
brews has no average rather than an average of zero. That guard is the same
shape as the never-brewed-last guard `librarySort` already carries, which is why
the Rating axis is one more entry there and not a new mechanism.

## The note

Free text, no ceiling, no counter, no ceremony. It goes nowhere near a card, so
none of the card's limits apply, and the sixty-character cap on a recipe's note
exists because that note has to fit on a library row. A brew note has one place
it is read and all the room it wants.

An empty note is no note. There is no separate "has a note" flag to disagree
with the text.

## Judging pins

Rating or annotating a brew sets `pinned`, and the retention sweep skips pinned
rows.

The retention setting exists because a stream is roughly 2 400 rows and the
figures are five numbers; sweeping streams keeps the database honest without
losing history. But a judgement with no trace left to look at is a judgement you
cannot act on: "this one was 5 stars" is worth keeping precisely so you can go
and see what the machine did differently, and the sweep would take that away
from exactly the brews the user cared enough to mark.

Pinning is implicit rather than a third control. A user who has just said this
brew was good has already said it is worth keeping, and a separate pin toggle
would ask them to say it twice. The record screen shows the pin as a state, not
as a question -- and offers to release it, because the escape hatch for an
implicit action is being able to undo it, not being asked first.

Unpinning does not restore a swept stream, and nothing pretends otherwise:
`hasStream` already tells a record whether its trace survived.

## Where the rating is captured

**At the end of the brew, and again on the record.**

The moment the user is holding the cup is the only moment they will rate it. A
rating that can only be given from a history screen is a rating nobody gives, so
the finished-brew summary carries the control.

It sits **below the captured region, not inside it.** The export is a picture of
what the machine did, and the `ViewShot` node is deliberately the same node the
screen draws, so anything added inside it is added to every PNG anybody shares.
An empty five-star row in a shared image is an invitation to rate somebody
else's brew. A rating given *before* the export does belong in the picture, but
that is a different feature (the summary would have to know it had been rated)
and it is not worth the coupling here.

The record screen carries the same control, so a brew can be rated later or
re-rated, and so the note can be written when the user has had time to think.

## Where the rating is read

The history row shows the stars it has, and nothing where it has none. An
unrated brew must not read as a bad one, which rules out five hollow stars as
the resting state: the row shows the rating or it shows nothing at all.

A pinned brew is marked on the row, quietly, because the mark's job is to
explain why a six-month-old brew still has a trace.

The note is not on the row. A row is a glance and a note is a sentence.

## Storage

Three columns on `brews`, added with the same `try`/`catch ALTER TABLE` the four
before them used, because `IF NOT EXISTS` on `ADD COLUMN` is not portable across
the SQLite versions Expo ships:

- `rating INTEGER NOT NULL DEFAULT 0`
- `note TEXT NOT NULL DEFAULT ''`
- `pinned INTEGER NOT NULL DEFAULT 0`

They are columns on `brews` rather than a table of their own for the reason
every other value on that row is copied at write time: a brew is a thing that
happened, and its judgement belongs to it. Deleting the brew takes the judgement
with it, which is right.

`judge(id, {rating, note})` is one statement and sets `pinned = 1` in the same
write, so the pin cannot lag the judgement. `setPinned(id, false)` is the only
way back off.

## Backup

The envelope grows a `brews` array: the records, **not** the streams.

A stream is hundreds of kilobytes and a record is a few hundred bytes. A backup
that carried every trace would be a file the user cannot mail, to protect data
the retention sweep is already allowed to delete on the device. What cannot be
recovered from anywhere is the judgement, and that rides on the record.

Restored records come back with `hasStream: false`, which the record screen
already knows how to draw: figures without a trace. Merging is by `id` and never
overwrites, exactly as recipes merge, so restoring an old backup over a live
history cannot rewrite a rating given since.

A brew whose fields will not validate is skipped and counted, not dropped
silently, and never rejects the recipes in the same file: the recipes are the
thing the backup exists to protect, and a malformed brew row must not cost them.

`BACKUP_VERSION` does not move. An older app reading a newer file ignores a key
it does not know, and loses nothing it had; the version is for a change an app
*cannot* read, and this is not one.

## The Rating sort axis

`librarySort` already documents the hole: `BEST` / `WORST`, default `desc`, over
`avg(brews.rating)` with the never-rated guard. With ratings in the database it
becomes one more entry in `SORT_AXES`, one more name in `SORT_AXIS_ORDER`, and
one more aggregate column in the brews join in `libraryQuery.ts`.

The join is already unconditional, and stays that way: adding `avgRating` to it
means every query has the column whichever axis is chosen, and the same
statement is exercised in one shape.

## Out of scope

- **Tagging a brew** (bean, roast, process) and the derived recipe profile.
  #104 owns those; this phase deliberately ships only the rating they average.
- **The evidence suffix on the library row**, which is #104's average rendered.
- **Comparing two brews.** #95's own bullet.
- **Rating filters** (`RATED`, `4 STARS AND UP`) on the rail.
- **Carrying streams through backup.**

## Testing

- A rated brew survives a sweep that would otherwise take its stream; an unrated
  one does not.
- Rating pins; annotating pins; unpinning leaves the rating alone.
- `rating = 0` is what every pre-existing row reads as, and is excluded from an
  average.
- A recipe with no rated brews sorts last under both directions of the Rating
  axis.
- A rating and a note round-trip through `buildBackup` and `parseBackup`.
- A brew entry with a rating of 9, of `"5"`, or with a note that is not a
  string, is skipped and counted, and the recipes in the same file still come
  back.
- Restored records report `hasStream: false`.
- The finished-brew capture does not contain the rating control.
- The history row shows no stars for an unrated brew.
