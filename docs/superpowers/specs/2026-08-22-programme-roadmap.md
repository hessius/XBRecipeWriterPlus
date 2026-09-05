# XBRW++ — programme roadmap

**Date:** 2026-08-22. **Last revised:** 2026-09-03 (M4).
**Status:** live. Revised at the end of each milestone.

## Why this is a programme, not a project

XBRW++ began as an overhaul of an existing NFC card writer and became an app
about a coffee machine. Neither could be specified in one document: the work
covers a visual language, a data model, several new features, a Bluetooth
protocol reverse-engineered from four contradictory sources, and a cloud API
nobody documented. A single spec would be too vague to implement.

So the work is decomposed. Each piece gets its own design spec in
`docs/superpowers/specs/`, its own implementation plan, and a GitHub milestone
whose issues are the plan's steps.

## Phase one — the overhaul (complete)

Six sub-projects, shipped as v1.0.0 to the App Store.

| # | Sub-project | Shipped |
|---|---|---|
| 1 | Design language and branding | Palette, type system, motion vocabulary, icon, splash, app name |
| 2 | Data model and persistence | Local name split from the xBloom title, settings store, recipe equality and de-duplication |
| 3 | Navigation shell and feedback | Screen structure, empty state, CTA hierarchy, toast and NFC overlay |
| 4 | Recipe list and editor redesign | The two main screens, rebuilt |
| 5 | Import overhaul | URL paste, clipboard detection, share intent, import sheet |
| 6 | Settings and About | Settings screen, accumulated toggles, attribution |

## Phase two — the machine

Where the app stopped being a card writer.

| Milestone | Ships | Spec | Status |
|---|---|---|---|
| M1 · Sharper cards | Grind guidance | `2026-08-31-grind-guidance-design.md` | done |
| M2 · Share your recipe | Outbound share links | `2026-08-31-share-link-design.md` | done |
| M3 · Brew from the app | BLE connection, brewing, the machine console | `2026-08-31-ble-brew-design.md` | done |
| M4 · Watch it brew | Live telemetry, brew history, the machine as app-wide state | `2026-09-03-machine-ux-design.md` | **done** — hardware verification outstanding; see below |
| M5 · A library worth keeping | Tags, filtering, search; post-brew notes and rating | — | not started |
| M6 · Your xBloom library | Cloud library import and push, authentication, a "what leaves this device" screen | — | not started |

M4 grew during design. It was scoped as one issue about telemetry (#63) and
became the milestone in which the machine stops living inside Settings: a status
dot in the home header, a BREW action on every recipe, a brew you can watch and
then keep. That expansion was deliberate, and it took in the app-wide machine
state that #71 (Live Activity) would need.

**Deferred: the Live Activity itself (#71).** Showing a brew on the Lock Screen
and the Dynamic Island needs a separate native widget target and ActivityKit,
which is a build-system change rather than an app change, and it would have held
up everything else in the milestone. The issue stays open. The work is now
cheap: `LiveBrewProvider` already holds the phase, the elapsed time and the
active stage above the navigator, so the Live Activity has only to read what the
mini-bar reads.

**M4 hardware verification outstanding.** None of the brew path can be exercised
in a simulator. Before any EAS release build, verify all of the following on a
real J15:

- A clean brew: the trace tracks the plan, the figures move, the ladder
  auto-scrolls, the record lands in history.
- An overflow-protection hold: the lane re-scales, the fill and the live line
  turn amber, the card explains it, and the finished chart shows the gap with
  `+N s`.
- A refused brew for low water: amber, the plan untouched, the recipe's own
  volume in the sentence, TRY AGAIN offered, and no history row written.
- Dismissing the sheet mid-brew: the mini-bar appears, keeps drawing, and
  reopens the sheet.
- The BREW capsule against the swipe-to-delete tiles on the same edge — the
  one thing in this milestone judged acceptable on screen and unproven in the
  hand.
- The status dot's states, and the popover's water refresh.
- Export: a PNG that is legible when shared, and a JSON file that opens.

## Constraints that apply throughout

- **Dark only.** Light mode is removed, not merely defaulted away.
- **No hidden functionality.** No bottom tab bar and no hamburger menu. Every
  destructive or non-obvious action has a visible affordance, even where a
  gesture shortcut also exists. The machine console is the single exception,
  and it is a diagnostic tool rather than a feature.
- **All colour comes from `constants/colors.ts`.** No hex literals and no named
  CSS colours in `app/` or `components/`.
- **NFC cannot be tested in a simulator, and neither can BLE.** Any change to
  the card path must be verified against a genuine card; any change to the brew
  path must be verified against a real machine.
- **A malformed write to a genuine card is not trivially recoverable.** The byte
  format and its characterisation tests are load-bearing. A changed expectation
  is a regression until proven otherwise.
- **Native-affecting changes need a version bump.** `runtimeVersion.policy` is
  `appVersion`, so changes to `app.json` require raising `expo.version` and
  running `npx expo prebuild --clean`.
- **CI is the floor, not the ceiling.** Typecheck, lint, tests and expo-doctor
  must all be green; hardware verification is owed on top of them and is not
  something CI can do.

## Deferred, with reasons

- **Recipe images.** The image URL comes from `recipeVo.podsVo.imagePath` and
  exists only for pod recipes; it is never written to the card and `Recipe` has
  no field for it. User photos would be a new local storage feature unrelated to
  the card format, so it earns its own decision later.
- **Creating a recipe from scratch.** Cut from the home screen. Whether the app
  should author a recipe with nothing to seed it is a genuine product question,
  tracked as its own issue.
- **Easy Mode slots (#62).** Write-only, must be written three at a time or the
  machine hangs, and cannot be read back — so the app would model them blind.
- **Android (#5).** Never run. It carries the only Android-specific BLE code.

## Artefacts

Each milestone produces, in order: a design spec in `docs/superpowers/specs/`,
an implementation plan, and a GitHub milestone whose issues are the plan's
steps. Interactive mockups produced during design live in
`.superpowers/brainstorm/` and are not committed.
