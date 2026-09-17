# Rating a brew — Implementation Plan

Implements [`2026-09-18-brew-judgement-design.md`](../specs/2026-09-18-brew-judgement-design.md),
which closes #99 and the two issues it stands on, #97 and the brew half of #96.

**Shipped.** All seven tasks are done and the gate is green. The one thing
automated checks cannot give is the device pass: stars and a note on a real
finished brew, a judged brew surviving a retention sweep that takes its
neighbours, and a backup written on one phone restoring its history on another.
None of that can be exercised in a simulator, because none of it starts without
a machine.

Each task is one commit, and each one leaves the gate green: `npx tsc --noEmit`,
`npx eslint .` (0 errors, 12 baseline warnings), `npm test`, `npx expo-doctor`.
Every new test is mutation-probed before its commit.

## Task 1 — The three columns

`library/BrewDatabase.ts`. `rating`, `note` and `pinned` on `brews`, each added
through the same `try`/`catch ALTER TABLE` as `pouringAt` and friends, each with
a default that reads correctly on a row written before it. `BrewRecord` grows
the three fields as optional; `hydrate` fills them.

`judge(id, {rating, note})` writes both and sets `pinned = 1` in one statement.
`setPinned(id, pinned)` is the way back off. `sweep` skips pinned rows.

Tests: a judged brew keeps its stream through a sweep and an unjudged one does
not; judging pins; unpinning leaves the rating; a row written before the columns
reads 0 / "" / false.

## Task 2 — The stars

`components/BrewStars.tsx`. Read-only by default, interactive when given an
`onRate`. Five whole steps; zero draws nothing at all rather than five hollow
stars, because an unrated brew must not read as a bad one.

Accessible as a single control: `accessibilityRole="adjustable"`, a label that
says the rating in words, and per-star labels when it is interactive so a
screen-reader user can set one. Colour from `constants/colors.ts`.

Tests: nothing rendered at zero; N filled at N; pressing the third star reports
3; pressing the third star when it is already 3 reports 0, because the only way
to take a rating back is the star that gave it.

## Task 3 — Judging a finished brew

`components/BrewJudgement.tsx`: the stars and a note field, one line of Doto
above them. Wired into `app/brew.tsx` **below** the `ViewShot`, and into
`app/brewRecord.tsx`.

The note is uncontrolled and flushed on blur, the pattern the editor's fields
already use. Nothing is written until there is something to write: an untouched
control does not pin.

Tests: the capture region does not contain the control; rating from the finished
screen writes and pins; the record screen seeds from the stored record; a note
typed and blurred is written once.

## Task 4 — Reading it back

`components/BrewHistoryRow.tsx` shows the stars it has and nothing where it has
none, plus a quiet pin mark whose job is to explain why an old brew still has a
trace. `app/brewRecord.tsx` shows the pin as a state with a release.

Tests: an unrated row draws no stars; a rated one draws its own; the pin mark
appears only when pinned; releasing unpins without touching the rating.

## Task 5 — Through a backup

`library/backup.ts` grows a `brews` array on the envelope, records only. A
validator per field, a skip-and-count for anything malformed, and a merge by
`id` that never overwrites. Restored records report `hasStream: false`.
`BACKUP_VERSION` does not move.

`app/settings.tsx` and `hooks/useBackup.ts` carry the records in and out, and
the restore summary counts brews alongside recipes.

Tests: a rating and a note round-trip; a rating of 9, of `"5"`, and a
non-string note are each skipped and counted; a malformed brew does not cost the
recipes in the same file; a restore does not overwrite a live judgement.

## Task 6 — The Rating axis

`avgRating` joins in `libraryQuery.ts` as `AVG(rating) FILTER`-equivalent over
rated rows only, and `librarySort.ts` grows the `rating` axis the comment there
already describes: `BEST` / `WORST`, default `desc`, never-rated last in both
directions.

Tests: a recipe with no rated brews sorts last both ways; an unrated brew does
not drag an average down; the axis survives a backup round trip.

## Task 7 — The sweep

`.github/copilot-instructions.md` gains the judgement in the brew-path section.
The roadmap's M5 row and the shelves design's shipping order record phase 5 and
this one. #99, #97 and the brew half of #96 close with what shipped and what did
not.
