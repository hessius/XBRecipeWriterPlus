# Sub-project 5: Import overhaul — design

Status: approved
Date: 2026-08-25
Depends on: sub-project 2 (data model), sub-project 3 (navigation shell), sub-project 4 (the editor)

## What this ships

One import sheet, reached from three doors, that accepts either an xBloom share
link or a bare pod code, resolves it against xBloom's API, and hands the recipe
to the editor unsaved.

`ImportRecipeComponent` — the Tamagui `Dialog` that has done this job since
before the overhaul — is deleted rather than refactored.

## Corrections to the roadmap

### The dependency list is wrong

The roadmap has sub-project 5 depending on 2 and 3. It also depends on **4**:
the sheet is an `XbrwSheet`, which sub-project 4 introduces, and sub-project 4
removed the `saveEnabled` route param that today's import path passes to the
editor. This work branched from `sp4-editor`, which merged to main first.

### "Clipboard detection" becomes a paste affordance

The roadmap asks for clipboard detection. The platforms do not offer it. Reading
clipboard *contents* is never free:

| | presence (`hasStringAsync`) | contents (`getStringAsync`) |
|---|---|---|
| iOS | `UIPasteboard.hasStrings` — silent | `UIPasteboard.string` — "Allow Paste?" prompt |
| Android | `primaryClipDescription.hasTextContent` — silent | reads `primaryClip` — Android 12+ "pasted from…" toast |

Both rows were read from the `expo-clipboard` 57.0.1 source rather than inferred.

So the app can learn *that* the clipboard holds text, silently, on both
platforms — but not *what* it holds. "Is this an xBloom link?" cannot be
answered without a prompt or a toast. Detection-on-open would therefore have
interrupted every single opening of the sheet, including the ones where the user
came to type a pod code.

What ships instead is the presence check, used to decide whether a paste
affordance is offered at all, plus an explicit paste action that reads contents
only when the user asks for it. Section 6 describes the one place this is taken
further.

### This sub-project is native-affecting

`expo-clipboard` is a new native module. `runtimeVersion.policy` is `appVersion`,
so this carries an `expo.version` bump in `app.json` and a
`npx expo prebuild --clean`. Sub-project 3 could say "no prebuild"; this one
cannot.

## Not in scope

Recipe images beyond the transient pod mark (deferred programme-wide), import
history or recents, QR scanning, and bulk import.

## Decisions

| Question | Decision |
|---|---|
| What the field accepts | Share link or bare pod code, sniffed — no mode switch |
| After a successful lookup | The editor opens unsaved. No confirm step |
| Paste vs typing | A paste resolves *and* navigates; typing resolves but waits |
| Why | A paste is atomic; typing has no reliable "finished" signal |
| The found panel | Name, subtitle, pour profile, dose/ratio/stages, pod mark |
| The pod photo | A circular mark, top right, silently absent when there is none |
| Errors | Inline in the sheet. Never a native `Alert`, never a toast |
| Already in the library | The existing recipe opens, and the app says so |
| A share intent | Opens the sheet in its fetching state, then the editor |
| Clipboard contents | Read only on an explicit paste, never on open |
| The `IMPORT` tile | A disguised `UIPasteControl` on iOS 16+ when the clipboard has text |

## 1. What counts as importable

`library/importInput.ts` — pure, no React, no network:

```ts
type ImportSource =
    | {kind: "share"; id: string}
    | {kind: "xid"; xid: string};

function parseImportInput(raw: string): ImportSource | null;
```

A **share link** is any `http(s)` URL carrying a non-empty `id` query parameter.
A **pod code** is anything satisfying the existing `isValidXID`: three letters,
an optional `T`, then two or three digits. Anything else is `null`.

The two cannot be confused for one another, which is why there is no mode switch
in the UI. Asking the user to declare which one they hold would be asking for
information the app already has.

### The host is deliberately not checked

Any `http(s)` URL with an `id` is accepted, without an allowlist of xBloom
domains. This is already how `app/index.tsx` treats an inbound share intent; the
id is opaque to us; and the server rejects a bad one anyway. A host allowlist
would buy nothing and would break silently on the day xBloom changes domain. The
cost of being wrong is one wasted request and a "No recipe with that code."

### `XBloomRecipe` stops guessing

`XBloomRecipe`'s constructor currently picks its endpoint with
`id.length <= 7`. Once `parseImportInput` has already decided, that heuristic is
both redundant and unsound — a short share id would be sent to the pod endpoint.
It takes the parsed kind explicitly instead.

`fetchRecipeDetail` also gains an `AbortSignal` parameter, so a superseded
lookup can actually be stopped rather than merely ignored.

## 2. The state machine

`hooks/useRecipeImport.ts` owns every rule below. It is the only place the
paste/typing distinction exists.

### Detecting a paste

React Native 0.86 has no `onPaste` on `TextInput` — verified by grepping the
component, not assumed. A paste is therefore inferred from the size of the
change: in `onChangeText`, a jump of more than one character since the last
value is a paste, and a jump of exactly one is typing.

A pasted share link is a jump of dozens of characters and a pasted pod code five
or six, so the inference is never close in practice. The single *accidental*
miss is pasting one character, which is treated as typing and merely waits for
the debounce — harmless, because it only makes an atomic value wait.

The dangerous direction is the opposite one: a false *paste*, where typing is
read as atomic and **navigates** without asking, yanking the user into the editor
mid-keystroke. That is precisely the harm the atomic/deliberate rule exists to
prevent, so it is not benign and must be guarded, not shrugged off.

One way it could happen is a batching hole: two `onChangeText` calls in one React
tick both reading the same pre-batch value, so the second sees a delta of two.
That hole is closed by tracking the previous value in a ref updated
*synchronously* inside the handler, rather than reading it from render state.

The ref does **not** close a second hole: a multi-character *native* commit is
genuinely indistinguishable from a paste. An Android IME committing a composed
word, a keyboard suggestion-bar tap, a QuickType autocorrect replacing a token,
or dictation all arrive as one `onChangeText` of more than one character and will
navigate. `ETH120` is exactly the shape of token a suggestion bar offers as a
single insert once it has been typed before. See Known risks.

### States and transitions

States are `idle | resolving | found | error`.

| From | Event | To |
|---|---|---|
| any | text changes by 1 character | `idle`, debounce armed |
| any | text changes by more than 1 character | `resolving`, **atomic** |
| any | the sheet's paste affordance is used | `resolving`, **atomic** |
| any | the tile's paste shortcut delivers text (§6) | `resolving`, **shortcut**, field hidden |
| any | a share intent delivers an id | `resolving`, **atomic**, field hidden |
| `idle` | debounce elapses, input parses | `resolving`, **deliberate** |
| `idle` | debounce elapses, input does not parse | `idle` — no request |
| `resolving` | resolved, atomic | `onOpenRecipe` called immediately |
| `resolving` | resolved, shortcut, recipe **not** already held | `onOpenRecipe` called immediately |
| `resolving` | resolved, shortcut, recipe already held | `found`, **field restored** — degrades, does not navigate |
| `resolving` | resolved, deliberate | `found` — waits for a press |
| `resolving` | failed | `error`, **field restored** — a failed lookup always leaves a field to retry from |
| `found` or `error` | text changes | `idle`, result cleared |

**Atomic input navigates; deliberate input waits.** A paste, a share intent and
the tile shortcut all deliver a complete value in one event, chosen deliberately
by the user. Typing delivers a value that is complete only by guesswork.

**The shortcut is atomic that degrades.** The tile's paste shortcut (§6)
navigates like an atomic value on a *new* recipe, but the clipboard is sticky:
after importing recipe A its link is still there, so tapping IMPORT resolves A
again. Re-opening A would make the shortcut a trap. Instead a shortcut that
resolves to a recipe already in the library **does not navigate** — it degrades
to the `found` panel *and* restores the field, so the user can enter a different
recipe, which is what they opened the tile for. A share intent stays atomic and
still navigates to a held recipe (with the "Already in your library" toast),
because re-sharing a specific link is a fresh deliberate act on that link. An
in-sheet paste into the field also stays atomic: the user is already looking at
the field, so navigating with the toast is coherent and the field is right there
as the escape hatch.

**`showField` is the hook's, not the screen's.** Whether the sheet draws its
input field is owned by `useRecipeImport`, because the shortcut's degrade is
discovered only *after* the fetch — the screen cannot decide it from a prop set
when the sheet opened. The hook hides the field while an atomic or shortcut value
resolves and restores it when a shortcut degrades or when any lookup fails — a
failure has nothing to navigate to, so the field must come back as the way to
retry or correct; the sheet reads `importer.showField`. There is no `showField` prop and no screen-level state for
it: one rule, one place.

### Two timers, with different jobs

**600 ms — the lookup debounce.** Armed only when the input *parses*.

The pod code grammar is prefix-ambiguous: `^[A-Za-z]{3}T?[0-9]{2,3}$` accepts two
or three digits, so `ETH12` and `ETH120` are both complete. No timer can tell
"finished typing `ETH12`" from "paused halfway through `ETH120`", and pausing to
think is exactly when a timer fires.

This is survivable **only because a typed result does not navigate**. A premature
resolve costs one wasted request and shows a name the user can see is wrong. Had
typing navigated, the same misfire would have yanked the user into the editor
mid-keystroke — the failure the delay was meant to prevent, made worse.

**2500 ms — the abandonment timer.** Armed only when the field is non-empty and
does *not* parse. When it fires:

> Paste an xBloom share link, or a pod code like ETH120.

In `palette.dim`, in Inter — guidance, not a validation failure, and deliberately
not `danger`. Nobody has done anything wrong; they have stopped. It clears the
moment the value parses or the field empties, and it is a polite live region so a
screen reader picks it up without interrupting.

This message exists because the sheet is otherwise **silent while idle**. There
is no "look up" button to press — a parsing value resolves on its own — so a user
whose value never parses would sit in front of a sheet that simply does nothing,
with no way to learn why. The hint is the only thing that tells them.

It is also why nothing is said *before* the timer: telling someone their
half-typed code is invalid is scolding them for not having finished.

### Supersession, not debounce alone

A settled-typing timer is not enough on its own — two lookups can be in flight
when a resolved value is edited. The hook carries a request generation counter
and discards any result that is not from the newest request. The `AbortSignal` is
the belt to that braces.

The 600 ms and 2500 ms constants live in the hook, deliberately **not** in
`constants/motion.ts`. That module is the single source of truth for *motion*,
and a network delay is not motion.

### The hook does not navigate

It takes an `onOpenRecipe(recipe, isExisting)` callback, and calls it itself for
atomic input or when the sheet asks after a typed result. Navigation stays with
the screen; the atomic/deliberate rule stays with the timing logic that
implements it.

## 3. Failure

Errors appear **inline in the sheet**, under the field, in `palette.danger`.
Sub-project 3's vocabulary is toast, inline, sheet, with no native `Alert`
anywhere; the sheet is already open and holding the input that caused the
problem, so inline is where the reader is looking.

Four distinguishable reasons, because "something went wrong" is not worth
writing:

- **Does not parse** — silent until the abandonment timer, then the format hint
  above.
- **Network** — the fetch threw. "Couldn't reach xBloom. Check your connection."
- **Not found** — a 200 with no `recipeVo`, or `getRecipe()` returning `null`.
  "No recipe with that code." This is where a typo lands, so it names the input
  rather than the server.
- **Unusable** — it parsed, but `getData()` throws, so it cannot produce card
  bytes. Rare, and the one that must not be swallowed: `safeFingerprint` treats
  such a recipe as identity-less, so it would slip past de-duplication and into
  the library.

### The clipboard's silence is designed for

`getStringAsync()` returns `''` for both an empty clipboard and a denied prompt,
and iOS offers no way to tell them apart. An empty result is therefore treated as
*nothing happened*: no error, no state change, focus stays in the field.
Reporting "your clipboard is empty" to someone who has just denied permission
would be a lie the API forces on us, so the app says nothing instead.

### Already in the library

`resolveOnOpen` never creates a second copy — it returns the existing recipe.
This mirrors the card read path exactly:

- **Atomic**: the existing recipe opens, and `notify({tone: "info", message:
  "Already in your library"})` fires, as a card read already does.
- **Deliberate**: the panel says so where it would have said `FOUND`, and its
  button reads `OPEN` rather than `IMPORT`. When the stored copy carries a name
  the user gave it, the line names it — `Already in your library as "Custom
  Name"` — because that name is how they recognise which of their recipes this
  is, and it is the most useful thing the panel can add. Only a *custom* name
  qualifies: it reads `recipe.name` directly, not `displayName()`/`hasName()`,
  which fold in the XID and the xBloom title (every import carries an XID, and
  the title is already the panel's heading, so repeating it says nothing). With
  no custom name the bare line stands — no empty quotes. The name is drawn in
  straight quotes, matching the app's ASCII copy, but the spoken
  `accessibilityLabel` drops them so VoiceOver does not announce "quote … quote",
  and it is clipped to one line so a long name cannot blow up the layout.

One vocabulary for both ways a recipe can turn out to be already known.

## 4. The found panel

`components/ImportResult.tsx`. Shown only on the typed path, where it is the
entire defence against a typo — so it has to say enough for a wrong result to be
recognisable.

It carries the name, the subtitle, the pour profile, and dose, ratio and stage
count in Doto. Those values come back from both endpoints, so the panel is always
the same panel.

**The keyboard is dismissed when a typed lookup reaches it.** A typed value
resolves without navigating precisely so the panel can be *read* first — but the
keyboard is still up from typing and covers the panel it exists to be read. So on
the transition into `found`, on the typed path, the keyboard is dropped. This is
presentation, not a rule, so it lives in `ImportSheet` (which owns focus and
imports from React Native) rather than in `useRecipeImport` (which owns the
import rules and holds no React Native import). It is a side effect, so it runs
in an effect and not in the render-phase adjust-state block — that block's lint
rule forbids a `setState` in an effect, but a plain imperative call is fine and a
side effect must never run during render. It fires once per resolution, gated on
the field having been on screen *before* `found`: a share intent or the tile
shortcut resolves with the field hidden, so its keyboard was never up, and a
degrading shortcut restores the field at `found` and lets `autoFocus` raise the
keyboard on purpose — dismissing there would fight it. The `error` state is
excluded for free by keying on `found`, which is right: a mistyped code needs the
keyboard kept up to be corrected.

The pod photo from `podsVo.imagePath` appears as a **circular mark in the top
right**, and is simply absent otherwise. Two constraints follow:

- **The panel's height does not change** when the mark is missing. It is only as
  tall as the two lines of text beside it, so nothing below it moves and the
  layout does not lurch between a pod recipe and a shared one.
- **No placeholder and no spinner.** The image is fetched over the network and
  may arrive late or never. It fades in if it arrives. A failed load is
  indistinguishable from a recipe that never had a photo, and is never reported.

A photograph is not promoted beyond this. The roadmap investigated recipe images
and deferred them: `imagePath` exists only for pod recipes, is never written to
the card, and `Recipe` has no field for it.

## 5. Modules and wiring

| Unit | Job |
|---|---|
| `library/importInput.ts` | What counts as importable. Pure |
| `library/XBloomRecipe.ts` | Explicit endpoint kind, `AbortSignal` |
| `hooks/useRecipeImport.ts` | The state machine. Does not navigate |
| `components/ImportSheet.tsx` | An `XbrwSheet`. Layout only |
| `components/ImportResult.tsx` | The found panel. A picture of its props |
| `components/ImportTile.tsx` | The tile, and its iOS paste mode (§6) |

`app/index.tsx` gains very little, which is the point — the screen stays layout:

- The `IMPORT` `CtaTile` is replaced by `ImportTile`, which loses `disabled` and
  the "inert until sub-project 5" comment it carries today.
- `HomeHeader` gets `canImport={true}`. It already takes `onImport` and already
  has the `import` dot glyph, so nothing new is drawn.
- The share-intent effect stops parsing the URL itself and hands the raw URL to
  `parseImportInput`, so one module knows what an xBloom link is rather than two
  that have to agree.
- `onOpenRecipe` pushes `/editRecipe` with `recipeJSON` only. No `saveEnabled`.

### Two things fixed on the way past

`ImportRecipeComponent` constructs its own `RecipeDatabase` to de-duplicate
against — a second handle on a database the home screen already holds open
through `useRecipeLibrary`. The hook takes the recipe list as a parameter.

It also defers navigation through `setTimeout(..., 0)` to dodge an iOS modal
race. That was a workaround for the old `Dialog`; `XbrwSheet` does not need it.

### One state, not two

`importId` currently does double duty as "is the sheet open" and "what to
import", which is why `""` means open-with-nothing and `null` means closed. It is
replaced by the hook's state plus a plain `importOpen` boolean.

### Pre-warm

The sheet opts into `XbrwSheet`'s `prewarm`. `ImportResult` is a picture of its
props and the field holds no subscription, so the second render a pre-warm
performs is safe — which is the condition `XbrwSheet` documents for it.

### A share intent

It arrives with an id already, often into a cold start, and there is nothing to
type. It is the atomic case, so it resolves and navigates without asking. The
sheet still opens, showing only the fetching state, so that a share into a slow
network is acknowledged rather than appearing to do nothing. The field never
appears because there is nothing to put in it.

**Handled once per payload.** `expo-share-intent` can hand the same intent back
more than once: `useShareIntent` recreates `resetShareIntent` on every render and
re-runs its refresh whenever the `options` identity changes (so `_layout` passes
one hoisted, stable object, not a literal), and `resetOnBackground` re-delivers
across a foreground transition. Each redelivery is a *sequential* resolve — the
first completes and navigates before the second starts — so the hook's generation
counter, which only drops a superseded in-flight lookup, does not catch it, and
two editors would stack. The screen therefore remembers the `webUrl` it acted on
in a ref and ignores a repeat, clearing it once the intent goes away so the same
link can be shared again later on purpose. This is the one place idempotency can
live: the screen owns navigation, and the payload identity is the only thing that
distinguishes a redelivery from a genuine re-share.

Three doors, one sheet, one state machine. The only branch is whether the field
is shown — which is exactly the atomic/deliberate distinction that already
governs whether it navigates on its own (with the shortcut's degrade, §2, the one
place it does not).

## 6. The paste-through import tile

On **iOS 16+ only**, when the clipboard holds text, the `IMPORT` tile is a
disguised `UIPasteControl`: tapping it pastes, and if the pasted value parses,
the lookup starts immediately. One tap from the home screen to the editor, with
no prompt, because with `UIPasteControl` the tap *is* the consent.

`components/ImportTile.tsx` wraps `CtaTile` rather than changing it — `CtaTile`
is shared with `READ CARD` and should not learn about clipboards.

### Which mode the tile is in

Decided by `Clipboard.isPasteButtonAvailable && await hasStringAsync()` — the
presence check being the silent one on both platforms. Re-checked when the screen
regains focus and when the app foregrounds, because the clipboard changes behind
the app's back.

**Paste mode** — a `ClipboardPasteButton` fills the tile, with the dot icon and
`IMPORT` label laid over it at `pointerEvents="none"` so the tap reaches the
control. Its `onPress` hands over the text:

- it parses → the sheet opens straight into `resolving` on the **shortcut**
  intent, then the editor — *unless* the recipe is already in the library, in
  which case the shortcut degrades to the `found` panel with the field shown
  (§2), because the clipboard is sticky and re-opening the same recipe would make
  the tile a trap;
- it does not parse → the sheet opens idle with an **empty** field. The
  non-conforming value is not populated, and the user cannot tell this apart from
  a normal open.

**Plain mode** — Android, iOS 15, an empty clipboard, or `isPasteButtonAvailable`
false: an ordinary pressable that opens the sheet.

The fallback is what makes the shortcut safe. `hasStringAsync` reports that text
exists, not that it is an xBloom link, so most taps will paste something
irrelevant — a message, an address. Every one of those degrades to precisely the
behaviour the tile would have had anyway.

### Invisible by alpha, not by colour

The disguise rides on **view alpha**, not on the control's colours. iOS treats a
`UIPasteControl`'s `baseBackgroundColor` / `baseForegroundColor` as *requests*
and overrides them when the result would be illegible — an invisible glyph on an
identical background is exactly that, because it is a system privacy control
defending its own visibility. So colour-matching alone (the first attempt) could
not hide it.

Instead the React Native view carries `opacity: 0.02`. UIKit's contrast
enforcement applies to the control's own configuration, not to a parent view's
alpha, so this sidesteps it. `0.02` is below the threshold of visibility but
deliberately **above** UIKit's `alpha < 0.01` hit-testing cutoff, so the control
still receives the tap — going to `0` would make it untappable and silently
break the shortcut. The matched `backgroundColor` / `foregroundColor` =
`palette.raised` (`#161616`) stay as belt-and-braces should the alpha ever be
clamped. `displayMode` is `iconOnly` and `cornerStyle` is `medium`, a rounded
rect closer to the tile than a `capsule` for that same fallback case. (The
installed `expo-clipboard` exposes the colours as the unprefixed
`backgroundColor` / `foregroundColor`, not the `base…`-prefixed names of the
native `UIPasteControl` configuration.)

This alpha approach is the last attempt before giving up on the disguise. If it
too fails device review, the remedy is unchanged: force plain mode.

### Three mitigations, built in

1. **VoiceOver falls back to plain mode.** The native control announces itself as
   "Paste" regardless of what is drawn over it, so a screen reader user would
   hear a label contradicting the screen. When `isScreenReaderEnabled()` is true
   the tile is a plain button. The shortcut is a sighted convenience; what gets
   announced stays honest.
2. **A pressable stays underneath — for the case it can cover.** The wrapper
   around the disguised control carries the `onOpen` route, so if the control
   renders *nothing* (`isPasteButtonAvailable` flips false, iOS < 16) the tap
   still opens the sheet. This does **not** cover a control that renders but is
   *inactive* — an HTML-only clipboard (a Safari or Mail copy) makes
   `hasStringAsync` true while nothing conforms to `acceptedContentTypes`, and a
   `UIPasteControl` with no conformant content is disabled but, per standard
   UIKit hit-testing, most likely still swallows the tap rather than passing it
   to the wrapper. Whether it does is undocumented and not observable from JS, so
   it is a device-verification item (§8), not a guarantee.
3. **The header glyph does not do this.** Tile only. A 44 px disguised control is
   more fragile for less gain, and the glyph opens the sheet where the paste
   affordance lives anyway.

### Recorded risk, accepted knowingly

This is a disguised system privacy control, and Apple may reject it on review. It
was adopted with that understood. The remedy is one line — force plain mode
everywhere — because every other path already works without it.

### Inside the sheet

The paste affordance in the sheet is **not** disguised: on iOS 16+ it is a
visible `ClipboardPasteButton`, palette-coloured and `iconAndLabel`, promoted to
the primary action whenever the clipboard holds text. Android and iOS 15 get a
house-styled button calling `getStringAsync()`, where Android's system toast
fires on a tap the user just made, which is where it belongs.

## 7. Testing

**The card format is untouched.** No change to `Recipe.getData` / `parseData`, so
`library/__tests__/cardFixtures.ts` and the characterisation tests are not
modified. A diff to those files in this sub-project is a mistake.

- `library/__tests__/importInput.test.ts` — a parse table. Share links with and
  without `?id=`, non-URL junk, pod codes valid and invalid (`ETH12`, `ETH120`,
  `SIGT58`, `ET120`, `ETH1`, `ETH1234`), whitespace, empty, mixed case. Pure
  function, no mocks, exhaustive: this is the gate in front of the network and
  the cheapest place to be thorough.
- `hooks/__tests__/useRecipeImport.test.ts` — fake timers, mocked fetch. A paste
  navigates without waiting; typing does not navigate; the 600 ms debounce; the
  2500 ms hint appearing and clearing; a superseded result being discarded;
  `resolveOnOpen` returning the existing recipe; one case per error reason.
  `renderHook` is asynchronous in this repo — that has already caused silent
  false passes twice.
- `components/__tests__/ImportSheet.test.tsx` and `ImportResult.test.tsx` — via
  `renderWithProviders`, awaiting `render` and `fireEvent`. `ImportResult` covers
  the photo-absent case explicitly, because "silently hidden" is a behaviour and
  not merely an omission.
- `components/__tests__/ImportTile.test.tsx` — paste mode versus plain mode
  selection, including the screen-reader fallback.
- `expo-clipboard` is mocked in `jest.setup.js`, including
  `ClipboardPasteButton`, `isPasteButtonAvailable`, and the
  empty-string-on-denial case.

## 8. Delivery

`npx expo install expo-clipboard`. If npm rejects it with `EALLOWSCRIPTS`, read
the expected version off `npx expo-doctor` and write it into `package.json` by
hand, per this repository's convention. Then bump `expo.version` in `app.json`
and run `npx expo prebuild --clean`.

CI must stay green on all four gates — typecheck, lint, test, expo-doctor — with
expo-doctor a hard failure.

### Device verification

No NFC path changes, so this is the one sub-project where the genuine-card
constraint does not bind. What does need real hardware:

- The iOS paste prompt, which does not behave the same in a simulator: the
  in-sheet `ClipboardPasteButton` on first use, and the `getStringAsync` fallback
  path after a denial.
- That a `raised`-on-`raised` `UIPasteControl` genuinely renders invisibly, with
  no border or system material bleeding through, and that the overlay does not
  swallow the tap. Neither is checkable in Jest or a simulator.
- **The inactive-control fallback.** Copy rich text from Safari (HTML, no plain
  text) so `hasStringAsync` is true but nothing conforms to
  `acceptedContentTypes`, then tap `IMPORT`. Confirm the sheet still opens. If a
  disabled `UIPasteControl` swallows the tap, the tile does nothing — the exact
  regression the wrapper fallback exists to prevent, and one no Jest test can
  see. If it fails, force plain mode.
- Android's toast asymmetry: no prompt, a toast on read.

## Known risks

- The xBloom endpoints remain undocumented and unversioned. This sub-project does
  not change that; it only stops guessing which one to call.
- A denied iOS paste is permanently indistinguishable from an empty clipboard.
  Designed around, not fixed.
- A multi-character *native* text commit — an Android IME committing a composed
  word, a suggestion-bar tap, QuickType autocorrect replacing a token, or
  dictation — is indistinguishable from a paste and will navigate atomically
  mid-typing. The synchronous-ref fix closes only the same-tick batching hole,
  not this one; there is no signal in `onChangeText` that separates a native
  commit from a paste. **Accepted, device verification owed:** exercise a
  suggestion-bar tap and autocorrect of a `NLC001`-shaped token on a physical
  Android and iOS device and confirm the resulting jolt into the editor is
  tolerable before relying on the heuristic in the field. `NLC001` is a **real
  pod code the author owns** and resolves against the live API, so the jolt
  actually lands in the editor -- keep it, do not swap in a fictional code like
  `ETH120`, which the API rejects.
- The disguised tile may be rejected on review, as recorded in §6.
