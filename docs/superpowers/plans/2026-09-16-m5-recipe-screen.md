# M5 Phase 5: The Recipe Screen — Implementation Plan

> **Shipped.** All eight tasks are done. The one thing this plan asked for that
> automated checks cannot give is the device pass: three segments at 390 pt is a
> width claim RNTL performs no layout to test.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third deck that holds what a recipe *is*, so the brew deck can go back to holding only what it *does* — and with it, the one place a description can finally be typed.

**Architecture:** No new screen. `app/editRecipe.tsx` grows a third segment on the deck switch it already has, and two controls move into it from the bottom of the brew deck, where they have always been identity rather than parameters. The recipe's name moves to the header and is edited through a sheet rather than in place. Everything the deck shows already exists in `Recipe`: `description` and the three import fields landed in phase 1 and in the account import, unrendered, waiting for this.

**Tech Stack:** TypeScript, Tamagui, Jest with `@testing-library/react-native` v14.

**Design docs:**
- `docs/superpowers/specs/2026-09-16-library-shelves-design.md` — §The recipe screen, §What a row says, §Storage
- `docs/superpowers/specs/2026-09-14-recipe-index-design.md`

**Branch:** `m5-recipe-screen`, off `main`, in its own worktree.

**Depends on:** phase 1 only (merged in #116 and #118). Independent of the rail
and of shelves, and can be built beside either.

---

## Scope

This plan finishes the part of phase 2 the foundation plan deliberately left
undone. The description was stored, validated and indexed there and deliberately
not rendered, because the ABOUT deck is where it is typed and shipping a
rendered field with no way to author one would have been a dead field.

**In scope:** the third deck and its four sections, the header rename sheet, the
pod section's four states, the description field and the card's line budget, the
`showRecipeAvatars` setting, and a single stubbed evidence line.

**Not in scope:** recent brews, brew comparison and the tag profile. #95 owns
them, and the design's §Boundary with #95 is explicit that this plan builds the
section they land in, already named and already scrolled to, and nothing more.
Rating capture is #99.

---

## Before you start

Read the design's §The recipe screen in full. It carries three arguments that
are load-bearing and are not repeated here: why renaming is a sheet rather than
an inline field, why the pod control *clears* the custom name rather than
copying the pod's, and why moving the XID field means moving its machinery.

Repository rules that bite here specifically:

- **Colour from `constants/colors.ts`, motion from `constants/motion.ts`.**
- **The React Compiler is on.** No `useMemo`/`useCallback`; do not read whole
  `props` inside a hook. `useRecipeEditor` already accepts a `try`/`finally`
  bailout and is commented as such — do not add more.
- **Mutate the `Recipe` in place and bump the key counter.** Do not clone into
  state and do not make `Recipe` immutable. That was a deliberate performance
  decision.
- **Declare components at module scope.** A component defined inside another
  component's body remounts on every render and loses its state. That bug has
  been fixed twice in this repo already, and this plan adds several components
  to a very large file.
- **No em dashes in user-facing copy.** Doto caps for system labels, Inter
  sentence case for prose and for anything a person authored.
- Run `npm run typecheck`, `npm run lint` and `npm test` before each commit.

---

### Task 1: A third segment on the deck switch

`components/DeckSwitch.tsx` carries BREW and STAGES and is already built to be
"what a screen reader means by a tab". The only obstacle to a third is a helper
called `half()`.

Generalise it to N segments. At 390 pt three segments are about 119 pt each,
which holds `STAGES · 4` comfortably; confirm that on the smallest supported
width, since RNTL performs no layout.

`ABOUT` joins BREW and STAGES.

**Verify:** existing DeckSwitch tests stay green, plus a new one for three
segments and for the accessibility role and state of each.

---

### Task 2: Move identity off the brew deck

`Recipe ID` (`app/editRecipe.tsx:416`) and `Name` (`:426`) move to ABOUT.

**Move the machinery with them.** `onXidFocusChange`, the deferred apply in
`applyOrDefer` and the lookup debounce exist because rendering while an
uncontrolled field is focused resets its native text and swallows keystrokes.
That behaviour is not optional and does not survive being retyped into a new
file: move the code, do not rewrite it.

The `ScrollView` comment at `:1103` names these two fields as the reason the
screen needs `automaticallyAdjustKeyboardInsets`. Once they are gone, check
whether the brew deck still needs it; if it does not, say so in the comment
rather than silently removing the prop.

**Verify:** the existing XID lookup and focus tests move with the code and stay
green. A test that typing into the XID field on ABOUT does not lose keystrokes
while a lookup is in flight.

---

### Task 3: The header rename sheet

The recipe's name moves into the screen header with a pencil glyph beside it,
and tapping it opens a sheet holding **Name alone**.

- Not an inline field. A header that collapses on scroll, with a keyboard
  arriving under it, is the bug shape that works on one platform and not the
  other.
- A new recipe still opens on BREW, its header reading `New recipe` as a
  tappable placeholder. No rule about landing decks is invented.
- Renaming works from all three decks, which it never has.
- `ScreenHeader.tsx` draws the app's own headers; the native one is off per
  route. Do not reach for react-navigation header options.

**Verify:** tests that the sheet opens from each deck, that saving renames, that
cancelling does not, and that the header announces itself as a button.

---

### Task 4: NOTE, and the description

The first ABOUT section. One line, Inter sentence case, capped at **60
characters** — the cap the design places where the text is typed, not where it
is drawn.

The field writes `recipe.description`, which phase 1 already stores, validates
in `backup.ts` and indexes as `hasDescription`.

Then the card's half of it: **equal height comes from an equal line budget**
(design §). A card with a description and a card without must occupy the same
height, which is why the budget is in lines rather than in points.

**Verify:** the cap is enforced at entry; a 60 character description and an
empty one produce the same card height; a description survives a backup round
trip (that test may already exist from phase 1 — extend rather than duplicate).

---

### Task 5: The pod section

Mirrors `components/ImportResult.tsx`, so a pod looks the same the day it is
imported and a year later. **Always drawn**, including for a recipe with no pod,
because a person looking for the field needs it in a fixed place.

Four states, from the design's table: no pod; linked and following the pod
(`✓ USING THIS NAME`); linked and renamed (plus a `USE THIS NAME` control); and
lookup failed, which uses the existing `xidLookupFailed` copy.

**The control clears `recipe.name` rather than copying `xbloomName` into it.**
An empty custom name is not a missing value: it means follow the pod, and
`displayName()` is already built that way. Copying would freeze a string that
the pod can later change out from under.

**Verify:** a test per state, and specifically that `USE THIS NAME` leaves
`xbloomName` untouched and empties `name`.

---

### Task 6: FROM, and the avatar setting

The `FROM` section shows `sharedBy` and, when `showRecipeAvatars` is on,
`sharedByAvatar`.

- **A claim, not an identity.** Copy says "arrived from BrewMind", never "by
  BrewMind".
- `showRecipeAvatars` is a new `Settings.DEFAULTS` key, **off by default**, and
  must also be added to `settingsSnapshot()` in `app/settings.tsx` or it will
  not reach a backup.
- A 40 pt mark replaces the accent mark on a row when on. **Any failure to load
  falls silently back to the accent mark.** A missing image is never an error
  and never a broken-image box.
- Account-library imports carry no `sharedBy` at all, only `imageURL`, and that
  is correct rather than a gap: recipes in your own library have no other author
  to name. The section must read sensibly with the field absent.

**Verify:** the fallback on load failure, the absent-field case, and that the
setting reaches a built backup.

---

### Task 7: HOW IT HAS GONE, stubbed

One summary line drawn from `brews` with the query it already supports: how many
times, and when last. Nothing more.

This exists so #95 lands in a section that is already there, already named and
already scrolled to, rather than having to invent a home for its output — which
is what usually forces a screen to be redesigned twice.

A recipe never brewed says so plainly, in one line, without inviting anything.

**Verify:** the never-brewed case, the once case and the many case.

---

### Task 8: The sweep

- **Accessibility.** Three tabs announced as tabs with their selected state; the
  header name announced as a button; every section reachable in order.
- **Copy review** against `docs/copy.md`, with the claim-not-identity rule and
  the no-dashes rule checked explicitly.
- **Docs.** Mark phase 5 done in the design's shipping order, and note in
  `.github/copilot-instructions.md` that identity lives on ABOUT, since the
  brew-deck location is currently what a reader would find.

**Verify:** full gate — `npm run typecheck && npm run lint && npm test && npx
expo-doctor` — plus a device pass, because three segments at 390 pt is a width
claim RNTL cannot check.

---

## What "done" looks like

A recipe screen that can answer what a recipe is for, what it is linked to,
where it came from and how it has gone, with a name you can change from
anywhere in it, and a brew deck that once again holds only brew parameters.
