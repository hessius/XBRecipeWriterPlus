# Tags on a brew

Design for recording what coffee a brew was made with. Part of the brew history
strand (#95), and the thing #104 needs before it can group or compare anything.

## The problem

The app records how a brew ran in great detail and nothing at all about what
went into it. Two brews of the same recipe a month apart, one with a washed
Kenyan and one with a natural Ethiopian, are indistinguishable in history.

That is the single largest gap in the record, because the bean is the variable
the drinker changes most often and the one they are most likely to be trying to
learn about.

## Where the fact lives

On the **brew**, not the recipe. A recipe is a set of instructions and is reused
across bags. The bean is a fact about one particular run. See #95 for why the app
never tags a recipe.

## The vocabulary

Four fields, all optional, all single-valued.

| Field | Values |
| --- | --- |
| Origin | free text |
| Roast | Light, Medium, Dark |
| Process | Washed, Natural, Honey |
| Fermentation | Anaerobic, Carbonic maceration, Lactic, Co-ferment, Experimental |

Plus free-text custom tags, many per brew, for anything the fields do not cover.

**Unset is a real state.** It is not "Medium", not "Washed", not an empty string
pretending to be an answer. Every surface that renders a field must have a way of
showing that nobody has said, and every query that groups by a field must be able
to exclude the unset ones rather than bundling them into a bucket.

### Why process and fermentation are two fields

The eight terms span two axes. Washed, natural and honey describe how the fruit
came off the seed. Anaerobic, carbonic maceration and lactic describe the
fermentation, and co-ferment describes something added to it. Bags routinely say
"anaerobic natural", and both halves of that are true at once.

One single-valued field would force the user to discard half of what the bag
says, and #104 would then be comparing groups that are missing information in a
way it cannot see.

### Why origin is free text

There is no list of origins that is both short enough to pick from and specific
enough to be worth having. "Ethiopia" is too coarse to learn anything from and a
list of washing stations is too long to scroll. Free text with normalisation is
the honest answer.

### Why not tasting notes

A different axis and a much larger vocabulary. They can live in the brew note
(#99) until they earn their own structure. Adding them here would turn a small
pickable vocabulary into a taxonomy nobody maintains.

## Presets and custom tags

Free text alone cannot be filtered: "natural", "Natural" and "naturals" are three
tags and one coffee. The presets are what make #104 possible at all.

Custom tags are allowed, but they are deliberately **not** the mechanism
filtering depends on. They normalise through `library/tagKey.ts`, exactly as
recipe tags already do, so two spellings of one term collapse to one term. That
makes them searchable without making them groupable, which is the right
distinction: a user's private shorthand should find its brews again without
pretending to be a dimension of analysis.

The vocabulary is defined in **one place**, the way `constants/brewCopy.ts` owns
copy, so the editor and the filter cannot drift apart.

## What the pod already knows

This is the part that is not obvious and that the original issue did not account
for.

`brews.coffee` already stores a `PodCoffee` blob for any brew whose recipe came
from an xPod import, and that blob already contains `origin` and `process`, taken
from xBloom's undocumented API as free text. Two of the four fields above
therefore already have a value for a whole class of brews, arriving without
anyone typing anything.

Ignoring that would mean a pod user retyping what the app already knows, and
would mean #104 grouping only hand-tagged brews while real data sat unused in the
next column. Copying it into the new fields would mean writing an assertion into
the database that the user never made, and for `process` it would mean guessing:
xBloom sends an arbitrary string, not one of our three presets.

### The resolution

**Store only what the user actually set. Resolve at read time.**

A single accessor answers "what is this brew's origin / process", in order:

1. the user's value, if they set one
2. otherwise the pod's value, if the recipe came from a pod
3. otherwise unset

`process` resolves to a preset only when the pod's string matches one. When it
does not, the result is unset rather than a guess. There is precedent for this
exact instinct in the same file: `PodCoffee` deliberately has no `roast` field,
because the value was `1` on all five pods probed and the code says plainly that
an invented roast level is worse than none.

Consequences worth stating, because each is a decision:

- #104 groups on the **resolved** value, so pod brews join the comparison
  without anyone tagging them.
- The database never contains a preference the user did not express. Deleting a
  user's value reverts to the pod's, rather than to blank.
- A pod whose process is "anaerobic natural" contributes `Natural` to process and
  nothing to fermentation, because only the fruit-removal term matched. That is a
  partial answer, and partial is correct. The user can complete it.

### Making it visible

The read-through is only honest if the user can see it. A value inherited from
the pod must be **visibly the pod's**, not indistinguishable from one they chose.

- An inherited value renders in the same place as a set one, but marked as coming
  from the pod, and the marking must survive at a glance rather than requiring a
  tap.
- Editing an inherited value is a single action, not a "clear then set". The
  inherited value is the starting point of the control, not an obstacle to it.
- Clearing a user value returns the field to the pod's value, visibly, rather
  than to blank. Otherwise the user clears a field, sees a value still there, and
  concludes the clear failed.
- A field with no user value and no pod value looks like neither of the above: it
  is plainly empty and invites an answer.

Exact treatment is a layout question, to be settled with a visual pass rather
than asserted here.

## No inheritance from the previous brew

A new brew starts blank. It does not inherit the previous brew's beans for the
same recipe.

Retyping the same bag is real friction and the original issue was right to raise
it. But an inherited value is an assertion the user did not make, and unlike the
pod case there is nothing to mark it as. The day they open a new bag it becomes
false without anyone touching it, and #104 would then draw conclusions from it.

Note the asymmetry with the pod: a pod's origin is a fact about *this* brew's
coffee, asserted by the pod and attributable to it. The previous brew's bag is a
guess about this brew, attributable to nobody.

## Storage

Preset fields become columns on `brews`: `origin`, `roast`, `process`,
`fermentation`. Custom tags get a `brew_tags` table.

The split follows what each is for. The preset fields get grouped and compared,
which is a column's job. Custom tags are open-ended and many-per-brew, which is a
table's job.

Both follow the existing migration pattern in `BrewDatabase.ts`: additive
`ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT`, one migration step per change,
never a rewrite. The empty-string default is the existing sentinel for "not set"
on that table and is already used by `coffee`.

The values are **snapshotted at write time**, like every other value on a brew
row. Recipe name, accent and volumes are already copied rather than joined, so
that renaming or deleting a recipe cannot rewrite history. Tags follow the same
rule for the same reason.

## Backup and restore

Tags must survive backup and restore (#96), which makes them part of a trust
boundary rather than just a schema change.

- Both the columns and the `brew_tags` rows go into the backup.
- On restore, a preset field whose value is not in the vocabulary is treated as
  unset, not carried through. An untrusted file must not be able to introduce a
  ninth process.
- Custom tags are re-normalised through `tagKey` on the way in rather than
  trusted as stored.
- Adding a field to the vocabulary must not require remembering to add it to the
  backup separately. `Settings` learned this the hard way when `showHints` went
  missing from backups because the list was written out by hand.

## Where the fields are entered

Wherever the rating is entered. These are the same kind of thing: metadata about
a brew that the user supplies after the fact rather than during it.

That makes placement a **#142** decision rather than a #100 one. #142 is already
reconsidering the finished-brew screen as the place to ask for a rating, on the
grounds that most people walk away with the cup and rate later if at all. The
same argument applies here, and more strongly: the bag is in the user's hand at
the moment the brew ends and will not be reconstructed a day later.

This spec defines the fields, their resolution and their storage. #142 decides
where they are asked for, and they are asked for together.

## Done when

- A brew can carry the four preset fields and any number of custom tags.
- The vocabulary lives in one place and cannot drift between editor and filter.
- Unset is distinguishable from set at every surface and in every query.
- A pod brew's origin and process resolve from the pod without being written to
  the database, and the user can see that is what happened.
- Tags survive backup and restore, and an untrusted backup cannot introduce a
  value outside the vocabulary.
