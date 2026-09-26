# Tags on a recipe

**Issue:** #101, part of #95
**Status:** approved 2026-09-25
**Visual:** `docs/superpowers/specs/2026-09-25-recipe-tags-visual.html`

## The problem

Some recipes are built for one bean. "Designed for light roast" is a statement
of intent, made by the person who wrote the recipe, and #104 wants to hold it
against the evidence a recipe accumulates from its brews.

The storage for that already exists and has for a while. `Recipe.tags`
normalises through `setTags`, projects into `recipe_tags`, round-trips through
backup with tests, and loads as `[]` on an older recipe. What does not exist is
any way for a user to put a tag on a recipe while looking at it. `setTags` is
called from `hooks/useRecipeLibrary.ts` and nowhere else, so today a tag can
only be created by filing a recipe onto a shelf from the library screen.

So this is a UI issue wearing a data issue's clothes. The work is the control.

## Decision: one set of tags, and intent is a reading of it

A recipe has one set of tags. A tag that happens to be in the shared coffee
vocabulary of #100 is also read as intent.

The property that makes a tag intent is not who authored it or which control it
was typed into. It is whether the term is one the brews are also described in.
Intent exists only so #104 can say "designed for light roast, proven with washed
x6", and that sentence needs both sides speaking one vocabulary.

`intentTags(recipe)` is therefore **computed, never stored**: `recipe.tags`
intersected with the #100 vocabulary. No schema change, no migration, no new
backup handling. That is the same doctrine #95 already applies to evidence, now
applied to the other side of the same comparison. Both halves are derived and
both correct themselves.

### Intent covers three of #100's four fields, not four

#100 has four bean fields, but only roast, process and fermentation are drawn
from closed lists. Origin is free text, so there is no way to tell a tag meaning
"Huila" from a tag meaning "Morning": both are just words somebody typed. A tag
cannot be read as an origin intent without the app guessing, and guessing is the
thing `podCoffee.ts` already refused to do when it left out `roast` rather than
invent one from a value that was `1` on every pod.

So `intentTags` matches against `ROASTS`, `PROCESSES` and `FERMENTATIONS` only.
A recipe designed for a particular origin can say so in its note, which is what
the note is for. If #104 later wants origin intent it will need a control that
declares it as an origin rather than a tag that happens to look like one, and
that is #104's problem to have.

Matching is on `tagKey`, so "washed" typed lower case is the same intent as
"Washed", while the chip keeps the user's own spelling.

Two consequences, both wanted:

- The shelf and the intent are one query. "Recipes designed for light roast" is
  a shelf the user gets for free the moment intent exists.
- Nothing is un-undoable. Removing the tag removes the intent.

## Decision: every tag draws the same

Earlier thinking here was to draw a vocabulary tag differently from a user's own
word, reusing the Doto-versus-plain distinction `ShelfRoom` already makes between
a shelf the app invented and a shelf a person made.

**Dropped.** The justification did not survive being stated plainly. Every tag
already filters and groups the library, so it is not true that the app
understands one and not the other: "Dad's" gets a shelf exactly like "Washed"
does. The real difference is narrower, that a vocabulary tag can be compared
against what a brew record says was in the hopper and "Dad's" cannot, and that
difference is worth drawing only once there is a comparison on screen to point
at.

Until #104 exists, a second typeface would be a difference the user has to guess
the meaning of. So:

- One face for every tag, casing kept exactly as typed.
- `intentTags(recipe)` still exists and is still the recipe's half of #104.
- If the distinction is ever drawn, it belongs in #104, beside the sentence that
  explains it.

This also disposes of the risk the issue named, that a user renames a shelf to a
vocabulary term and quietly acquires an intent. There is no longer anything to
notice, because until #104 the acquired intent does nothing.

## The control

A **Tags** section in the About deck, immediately after the note. Both are the
user's own words about the recipe, so they belong together; the pod, the
provenance mark and the brew history below them are all things the app knows
rather than things the user said.

Four states, drawn in the visual at true device width:

- **Untagged.** A single dashed "+ Add". Nothing suggests the recipe is
  unfinished: no prompt, no empty slots, no red. A recipe with no tags is the
  normal case and by far the commonest one.
- **Tagged.** A wrapping row of chips, each with a remove affordance, then
  "+ Add".
- **Adding.** The chip row grows a text field. Suggestions appear beneath it.
- **At the font-scale cap.** Chips wrap rather than truncate. A tag that is cut
  off is a tag the user cannot check they typed correctly, and the longest word
  in the #100 vocabulary is "Carbonic maceration".

### Suggestions

One list, mixing two sources, undifferentiated:

- Tags already used anywhere in the library, from
  `RecipeDatabase.countRecipesByTag()`, which already returns every tag with a
  count and is already ordered largest-first. No new query.
- The #100 vocabulary.

Matching is on `tagKey`, the JavaScript-folded form, because SQLite's NOCASE is
ASCII-only and would call "CAFÉ" and "café" two different tags while the model
calls them one.

A suggestion already on this recipe is not offered again.

The two sources are not labelled or separated. Under the one-face decision there
is nothing to tell the user, and a header saying "from your library" over one
group would reintroduce exactly the distinction that was just dropped.

## Writing

Tags are written through `Recipe.setTags`. Direct assignment bypasses the
normalisation and `MAX_TAGS_PER_RECIPE`, and this is the one place a user can
reach it, so that matters more here than anywhere else.

`setTags` already folds case-insensitively while keeping the first spelling the
user typed, drops blanks and non-strings, enforces `MAX_TAG_LENGTH` (32) and
caps at `MAX_TAGS_PER_RECIPE` (20). The control adds no rules of its own. It
must not pre-validate in a way that disagrees with `setTags`, or the user gets
two different answers about the same tag depending on how it arrived.

The editor dispatch is `(label: string, value: string) => void` and tags are an
array, so they do not go through it. `useRecipeEditor` grows a named operation
instead, in the manner of `toggleFavourite`, `addPour` and `setBypassEnabled`,
which already sit beside the string dispatch for exactly this reason.

The editor mutates its `Recipe` in place and republishes by bumping a key. Tags
follow that, like every other field. Do not clone into state.

## What this does not do

- **Nothing is written to the card.** The byte layout is fixed and its spare
  space is not ours.
- **Nothing writes a tag on the user's behalf.** Not from the pod, not from a
  brew, not from an import. A recipe's intent is authored or it does not exist.
  The pod read-through in #100 is the brew side and deliberately has no
  counterpart here: an intent the user did not state is not an intent.
- **No empty state copy.** See above.

## Done when

- A recipe's tags can be edited from the recipe editor, through `setTags`.
- `intentTags(recipe)` exists as a derived reading and is the only way anything
  asks what a recipe is designed for.
- Every tag draws the same, whatever it is.
- Adding a tag in the editor puts the recipe on that shelf in the library, and
  removing it takes the recipe off. That is one field with two views, not a
  leak.
- A recipe saved before this change is unaffected, and a recipe with no
  vocabulary tags reports no intent rather than an empty one.
- `backup`, `offline_backup` and `uid` still hold their raw card bytes.
