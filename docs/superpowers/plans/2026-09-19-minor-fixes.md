# The swept-up session: seven small things that were filed and left

Status: in progress.

M5 shipped and the app is 2.0.0. What is left behind it is a drawer of small
issues, most of them opened by review of the very branches that just merged,
plus two from a beta tester. None of them is a milestone. Together they are one
session.

They are grouped here by where the risk is rather than by size, because two of
them touch a trust boundary and one changes the schema, and those want the most
care. The order is deliberate: the schema change lands before the search fix
that needs it, and the two `app/index.tsx` fixes land next to each other so the
screen is only reasoned about once.

Every task is test-first. A test written against behaviour that already works
passes for the wrong reason, so each one is mutation-probed before it counts as
done.

## Task 1: A refused shelf name keeps the typing (#130)

`NameShelfSheet.submit()` clears the field the moment it calls `onName`, but
`nameShelf` can refuse: a name that folds onto an existing shelf is notified
about and returned from early, leaving the sheet open, complaining, and empty.
Amending a near miss means typing the whole name again.

- [x] `onName` reports acceptance. The screen already knows whether it took the
      name, so let it say so rather than making the sheet infer it. A boolean
      return is enough; the sheet clears and closes on true and keeps the text
      on false.
- [x] The failure path already notifies, so the sheet adds no copy of its own.
      Two messages for one refusal is worse than none.
- [x] Check the rename path as well as the create path. Both go through the
      same sheet and both can be refused, so a fix that only covers one is half
      a fix.
- [x] Tests: a refused name leaves the field holding what was typed and the
      sheet open; an accepted name clears and closes. Probe by returning `true`
      unconditionally.

## Task 2: SELECTED shows what SELECTED is looking at (#129)

`app/index.tsx` chooses between the list and `EmptyQuery` on
`library.recipes.length === 0`, which is the query's answer. The list it then
draws is `shownRecipes`, which while picking with SELECTED on is read from the
whole table instead. The two disagree in both directions, and the case the chip
exists for is the one that breaks: narrow to nothing, tap SELECTED to review
the shelf being built, and the recipes are there behind a NO MATCHES panel.

- [x] Gate the empty branch on what is actually rendered, `shownRecipes` (or
      `listItems`, whichever is the true input to the `FlatList`), not on the
      query's count.
- [x] Give the nothing-ticked case its own line. The search-and-filter copy is
      wrong there: nothing was searched for. Something plain, no dashes, in the
      voice of `docs/copy.md`.
- [x] Tests: SELECTED with a query matching nothing still lists the ticked
      recipes; SELECTED with nothing ticked draws its own line rather than a
      blank area or the search copy.

## Task 3: Survive one unreadable blob (#124)

`queryRecipes` hydrates every selected row with `new Recipe(undefined, json)`
unguarded, and so does `retrieveAllRecipes`. A blob that will not parse throws
during the library's first render and takes the home screen with it, so the
user has no route to export, repair, or even see the other recipes, all of
which are intact. `migrateIndex` already treats an unreadable row as something
to survive, so one path in this class has the right instinct and cannot be
reached because the crash happens first.

- [x] **Policy: skip the row and count it.** A placeholder recipe is a second
      kind of `Recipe` flowing through a library that assumes every one of them
      is real, and the editor, the card writer and the shelf resolvers would
      each need to learn about it. Skipping is the change that fits. Silence is
      the cost, so it is bought off in the next bullet rather than ignored.
- [x] One shared hydrate helper used by both read paths, so they cannot drift.
      It returns the recipe or `null`, and logs the uuid it could not read.
- [x] `allRecipes()` keeps throwing. A backup built from a table with an
      unreadable row must refuse rather than quietly ship a partial one; that
      instinct is already there and is right.
- [x] Surface the count somewhere the user can find it. Settings already has a
      diagnostics-shaped corner; a line saying how many rows could not be read
      is enough, and it is what stops a vanished recipe from being a mystery.
- [x] Tests: a table with one bad blob renders the rest; the rendered count
      matches what the list draws; a backup over the same table refuses.

## Task 4: A dose of 0 is a corrupt file, not a 15 g recipe (#117)

`Recipe.ts` reads the dose with a truthiness check, so a stored `dosage: 0`
falls through to the field initialiser and the recipe silently becomes a
plausible-looking wrong one, whose next stop is a genuine card.

- [x] Validate the dose range in `RECIPE_FIELDS` in `library/backup.ts`, the
      file whose whole job is to be a trust boundary. **Do not loosen the
      constructor**: it is deliberately forgiving so it can migrate the app's
      own old shapes, which is exactly what makes it useless as a validator.
- [x] The card range is 1 to 31. Use `library/cardLimits.ts` rather than
      restating the numbers, so the two cannot drift.
- [ ] The rejection message names the recipe and the field, as the other field
      failures in that file do.
- [x] Tests: a backup carrying `dosage: 0` is refused; one carrying a legal
      dose restores unchanged; the constructor is untouched, proved by a direct
      test that `new Recipe(undefined, ...)` with a 0 still behaves as it did.

## Task 5: Fold accents in description and sharedBy (#125)

Search matches five things and three of them fold correctly. `description` and
`sharedBy` hold the user's original text and are matched literally, so a
description containing `CAFÉ` is not found by a search for `café`. SQLite's
`lower()` is ASCII-only, so this cannot be closed with a better query: the fold
has to happen in JavaScript and be stored, the way `sortName` and `tagKey`
already are.

- [ ] `descriptionKey` and `sharedByKey` columns in `library/recipeIndex.ts`,
      projected through the same folding helper the other keys use.
- [ ] `INDEX_REVISION` bump, so every existing device rebuilds. `schemaHash`
      derives from it, so this is the one switch.
- [ ] `searchClause` matches the folded columns with the folded pattern, and
      the comment above `columns` is rewritten: it currently explains why those
      two travel with the unfolded pattern, and that reasoning is about to stop
      being true.
- [ ] **Size it before committing to it.** A description is free text and may
      be long, so this roughly doubles what the index stores for it. Measure
      against a realistic library; if it is material, fold only a bounded
      prefix and say so in a comment.
- [ ] Tests: mixed-case accented text in each field is found from either
      casing; an existing index at the old revision rebuilds rather than
      answering wrongly.

## Task 6: Half-step ratios (#122)

A beta tester reports that xBloom's own app supports 1:15.5 and that importing
such a recipe leaves you unable to work with it. The model already handles a
fractional ratio end to end, because a shared link forced it to.
`app/editRecipe.tsx` using `step={1}` on the ratio is the whole of the bug, and
it has two consequences: a half ratio cannot be authored, and worse, cannot be
*preserved*, since one tap on the stepper turns 15.5 into 16.5.

- [ ] `step={0.5}` on the ratio field. `Stepper` already switches to the
      decimal keypad for a fractional step and `stepped()` already rounds to
      the decimals the step implies, so there is nothing else to build.
- [ ] **The card gate stays exactly as it is.** `library/cardLimits.ts` rejects
      a non-integer ratio and that is load-bearing: `Recipe.getData()` pushes
      the ratio straight into a byte, and a fractional value there reaches a
      genuine card. Do not relax it.
- [ ] Confirm the gate's message reaches the user. Someone who deliberately set
      15.5 needs to see that the card is refusing, not the app.
- [ ] Check every place a ratio is formatted, so 1:15.5 renders as itself and
      is neither rounded for display nor shown as floating-point noise.
- [ ] Tests: an imported half ratio survives a stepper tap; the card gate still
      refuses it and says why; `autoFixPourVolumes` still terminates on a half
      ratio. The last is a regression guard for a hung JS thread, so it is
      worth having by name.

## Task 7: One clock for the wordmark (#120)

Seen once on device: the home wordmark drawn at its expanded size and clipped
while everything around it had collapsed. `components/HomeTitle.tsx` drives the
glyph from a Reanimated shared value but takes its layout box from the plain
`fontSize` prop, which switches instantly. Two clocks, so an interrupted timing
leaves a large glyph in a compact box.

- [ ] Drive the box from the same shared value as the glyph. One clock is the
      fix; reconciling on focus is a patch over the same bug.
- [ ] All timing from `constants/motion.ts`, as everything animated here is.
- [ ] Revisit `COLLAPSE_SHRINK = 140` in `hooks/useCollapsibleHeader.ts` while
      in the file. It is documented as the height of everything the screen
      folds away, and the rail was added to that screen without the number
      being revisited.
- [ ] Tests: the box and the glyph read the same value; a collapse interrupted
      part-way still settles compact. Given how little of this is assertable
      through the renderer, keep the test honest about what it proves.

## Gate

The session is done when all seven issues are closed, and:

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` with no new warnings
- [ ] the full suite green, with the test count higher than the 3901 that
      merged with 2.0.0
- [ ] no colour literal and no bespoke duration added, per the house rules
- [ ] no em dash in any user-facing string
