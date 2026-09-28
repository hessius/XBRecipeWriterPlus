# The rating moment, and what happens on a resend

Issue: #142. Status: built.

## The problem

A brew can be rated in exactly two places today: on the finished-brew screen at
the moment it completes, and on its record in the brew history. The first is the
only one anybody reaches by accident, and it asks at the worst possible time.
The machine has just finished; the cup is under the spout, not in your hand. You
have not tasted it. You walk away with it, and by the time you have an opinion
the screen is gone and the only way back is a history list you have to go
looking for.

The second half of the problem is the handoff. A brew sent to Beanconqueror
carries whatever rating it had at the moment it was sent, and an envelope has no
brew id, so a later rating cannot be attached to the row already over there. The
app does not even record that a brew was sent, so it cannot warn anybody.

## What this builds

1. A rating prompt in the bottom bar, shown on your next visit to the app when
   the last brew is still unrated.
2. A note sheet behind the stars, so a verdict is not reduced to a number.
3. Truthful copy on the Beanconqueror door, once a brew has been sent.
4. The stars offered on the way to Beanconqueror, so a rating usually travels
   with the brew rather than arriving too late.

It does not build notifications. See "Refused", below.

## 1. Where the prompt lives

The bottom bar. `LiveBrewBar` is already mounted beside the navigator in
`app/_layout.tsx` rather than inside a screen, precisely so that a brew you
walked away from is still there when you come back, and the rating question has
exactly the same shape. It is also the only surface in the app that can speak
without being visited.

`LiveBrewBar` becomes the owner of the slot rather than the owner of one bar. It
holds a single decision:

- a live run, in any phase, draws `BrewMiniBar` as it does today;
- otherwise an unrated brew, if there is one, draws the new `BrewRatingBar`;
- on `/brew`, `/brewRecord` and `/brewHistory` neither draws, unchanged.

**A live run always wins.** A brew that is happening is time critical and a
question about an old one is not, so the question simply waits until the new
brew is over.

`BrewMiniBar` is not extended to do both jobs. It has nine states already and
every one of them is about a machine that is running; a tenth about a machine
that stopped an hour ago would share the skeleton and nothing else. The two
components are siblings of the same size and padding.

## 2. What the bar says

Two rows, the brew named by figures a recipe cannot claim:

```
+-------------------------------------------------------------+
|  /\__      14:32 · 244 G                                     |
| /    \__   MORNING BLOEM · HOW WAS IT       * * * * *        |
+-------------------------------------------------------------+
```

The trace at 86x34 on the left, exactly as the live bar draws it, from the
stored stream where the retention sweep has not taken it and from the plan alone
where it has.

The figures lead because the recipe name does not identify a brew. You may have
brewed the same recipe three times this week; `14:32 · 244 G` is this one. The
name follows on the second row, where it is context rather than the subject.

The left of the bar is one tap target and opens the record, the same as the live
bar. The stars are their own target on the right. Two affordances competing in
one bar is the thing `BrewMiniBar`'s comment warns about, but the stars are not
a second route to the same place: one opens the brew, the other answers the
question, and the stars are visibly a control rather than a label.

There is a dismiss control, as on the live bar, in the same position.

## 3. What a star does

Tapping a star writes the rating immediately, through the existing
`useBrewJudgement`, which means it also pins the brew exactly as it does
everywhere else. Then a sheet opens with the note field in it.

The rating is already saved by the time the sheet appears. Dismissing the sheet
loses nothing, which is what makes the sheet acceptable at all: it is an offer
of somewhere to say more, not a form standing between you and a saved verdict.

The sheet is an `XbrwSheet` holding the brew's name and figures, `BrewJudgement`
(so the stars stay adjustable and the note field is the one the rest of the app
uses), and nothing else. Not the full record screen. The user was explicit that
being thrown into a whole screen for a five second gesture would be annoying,
and the record is one tap away on the bar itself.

The note is not expanded in place inside the bar. The bar is mounted beside the
navigator and has no scroll view of its own, so a text field grown inside it has
nothing to lift it clear of the keyboard.

## 4. Which brew gets asked about, and for how long

**The most recent countable brew, within sixteen hours, once.**

- *Countable* is `countsAsBrewed` as it stands: `done` and `endedOnMachine`. A
  refusal before anything was sent writes no row at all, so it cannot be asked
  about. A brew stopped mid way produced a cup with something in it and is a
  legitimate thing to have an opinion about, but it is not counted evidence
  anywhere else in the app and must not become so here.
- *Watched*, so a hand-logged row written by the recipe star is never asked
  about. It was rated at the moment it was created; that is the whole reason it
  exists.
- *Unrated*, meaning `rating = 0`. Rating it on the finished-brew screen means
  the bar never appears.
- *Within sixteen hours of `endedAt`*. Long enough that a brew made at breakfast
  is still asked about in the evening, short enough that yesterday's is not.
- *Not dismissed.*

A newer brew replaces the question outright. There is no queue. What is being
fixed is that the moment was wrong, not that ratings are being lost, and #95 is
explicit that unrated is a legitimate state rather than a gap to be filled. A
prompt that can accumulate is a prompt that starts being dismissed reflexively,
at which point it is worth nothing.

**The question is asked on arrival, not on departure.** The candidate is read
when the provider mounts and when the app returns to the foreground, and at no
other time. Dismissing the live bar at the end of a brew therefore does not
hand the slot straight back to a rating question, which would read as the bar
refusing to go away. The question waits for your next visit, which is the whole
premise of the feature.

## 5. How dismissal is remembered

A single setting, `ratingPromptDismissed`, holding the id of the brew whose
question was dismissed.

Because only the most recent brew is ever asked about, one id is all the state
there is. This avoids a migration on `brews`, and the setting disappears from
relevance the moment a newer brew exists. It goes in `NOT_IN_BACKUP`: it is a
fact about this phone having been shown a question, not a fact about the brew,
and restoring it onto another phone would suppress a question that phone never
asked.

There is also `askForRatings`, default on, in Settings beside the other brewing
preferences. A bar that appears unbidden and has no off switch is a support
request waiting to happen, and somebody who never rates anything should be able
to say so once instead of dismissing a brew at a time.

## 6. The end-of-brew rating stays

`BrewJudgement` remains on the finished-brew screen, outside the `ViewShot`,
for the reason its comment already gives: that is the moment somebody with an
immediate opinion has one, and it costs nothing when they do not, because the
bar only ever asks about a brew that is still unrated.

Its copy changes. Today the screen says `HOW WAS IT` and leaves you to work out
whether this is your only chance. It gains one quiet line saying the rating can
wait, so walking away is visibly a choice rather than a loss. The line lives in
`constants/brewCopy.ts` with the rest of the brew copy and is passed in, so the
record screen's copy of the same control does not grow a sentence that is untrue
there.

## 7. Beanconqueror, and the second send

Two changes, and neither needs anything from upstream.

### `sentAt`

A new column on `brews`, `sentAt INTEGER NOT NULL DEFAULT 0`, written when a
handoff link is opened, by both the single and the batch path. It is the
timestamp of the last send, not a count: what the copy needs to say is "this has
been sent before", and the last time is the more useful of the two facts.

Opening a deep link is not proof of delivery. The app cannot know whether
Beanconqueror was installed, whether it understood the envelope, or whether the
user cancelled out of it, so `sentAt` means "we handed this over", and every
piece of copy built on it is phrased as what this app did rather than what the
other app received.

### The door stays open, and says what a second send means

The button is never disabled. A send that silently failed on the other side must
be retryable, and a greyed-out door with no way past it turns one lost brew into
a permanent one.

Instead, a line under the button appears once `sentAt > 0`, saying when it was
sent and that sending again adds a second brew over there rather than updating
the first. That is the honest description of an envelope with no brew id in it.

### The stars are offered on the way out

When the record screen's handoff is pressed on a brew with no rating, a sheet
opens first: the stars, the note field, a SEND button and a way to send without
rating. Answer it and the verdict is in the envelope; skip it and the send
proceeds exactly as it does today.

This is the actual fix for the resend problem. A warning explains why the rating
did not travel; asking first mostly stops it from happening. It reuses the same
sheet body as the rating prompt, so there is one note field and one set of
stars in the app rather than three.

It applies to the record screen only.

- Not the batch handoff, on the same grounds the bean name question already
  avoids it: once is a courtesy, once per brew across a selection is a
  questionnaire.
- Not the finished-brew screen, where `BrewJudgement` is already on screen a few
  points above the button. A sheet asking for something visible behind it is
  noise.

If the brew also needs a bean name, the rating sheet comes first and the
existing `BeanNameSheet` follows, so the last thing before the link opens is the
mechanical question rather than the reflective one.

## Refused

**Notifications.** There is no `expo-notifications` in the tree, so this means a
native module, a permission prompt, a runtime version bump, and scheduling state
that has to be cancelled in step with the rating, because a notification about a
brew you already rated is worse than none. The premise of the prompt is that you
open the app and the question is waiting; someone who does not open the app
within sixteen hours is not going to rate that brew because their phone buzzed.
Deferred to its own issue so the decision can be revisited, not carried here.

**Attaching a later rating to the brew already in Beanconqueror.** It would need
an id in the envelope and an update path on their side. Out of scope for this
repo and not deferred.

## Architecture

New:

| File | Holds |
| --- | --- |
| `library/brew/ratingPrompt.ts` | The rule, in plain TypeScript: given a row and a `now`, is this a brew worth asking about? Plus `RATING_PROMPT_WINDOW_MS`. |
| `hooks/useRatingPrompt.ts` | The candidate, re-read on mount and on foreground; `rate`, `dismiss`. |
| `components/BrewRatingBar.tsx` | The bar. Presentational; every decision arrives as a prop. |
| `components/BrewNoteSheet.tsx` | The sheet behind the stars, shared with the pre-send ask. |

Changed:

| File | Change |
| --- | --- |
| `components/LiveBrewBar.tsx` | Chooses which bar occupies the slot. |
| `library/BrewDatabase.ts` | `lastUnrated(now)`; `sentAt` column, migration, `markSent(id, at)`; `sentAt` through hydrate and insert. |
| `library/Settings.ts` | `ratingPromptDismissed`, `askForRatings`; the first also in `NOT_IN_BACKUP`. |
| `app/settings.tsx` | The `askForRatings` row, and both keys in `settingsSnapshot()` or its exclusion list. |
| `constants/brewCopy.ts` | The rating prompt's words, the wait-a-while line, the already-sent line. |
| `hooks/useBrewHandoff.ts`, `hooks/useBrewBatchHandoff.ts` | Record the send. |
| `app/brewRecord.tsx` | The already-sent line, and the pre-send rating sheet. |
| `app/brew.tsx` | The wait-a-while line on `BrewJudgement`. |

The boundary that matters is that the rule is not in the component. Whether a
brew should be asked about is a question with five clauses and a clock in it,
and it is answered in one pure function that a test can drive through every
combination without rendering anything or opening SQLite.

Nothing new writes ratings. `useBrewJudgement` and `BrewDatabase.judge` are the
write path, unchanged, so the pin-with-the-verdict rule holds here for free.

## Testing

- `ratingPrompt.ts`: each clause alone, the window boundary at sixteen hours
  either side, a hand-logged row, a cancelled row, a rated row, a dismissed row.
- `BrewDatabase`: `lastUnrated` against a real SQLite database through
  `test-utils/sqlite.ts`, including that it picks the newest of several and
  ignores other recipes' brews and non-counted outcomes. `sentAt` survives
  insert, hydrate and the migration path.
- `useRatingPrompt`: rating writes through and clears the prompt; dismissal
  persists; a foregrounding re-reads.
- `LiveBrewBar`: a live run beats a pending question; a silent route hides both;
  neither present draws nothing.
- `BrewRatingBar`: figures and name rendered, a star press reports the rating,
  accessibility labels name the brew by its figures.
- `app/brewRecord`: the already-sent line appears only after a send; the
  pre-send sheet appears only for an unrated brew and the send still happens
  when it is skipped.
- Copy: the existing no-dashes sweep extended over the new exports.

NFC is not involved. Nothing here needs a physical card. The bar and the sheet
do want a look on a real device, because the bar sits on the home indicator and
the sheet is opened from above the navigator.
