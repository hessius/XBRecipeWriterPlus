# XBRW++ overhaul — programme roadmap

**Date:** 2026-08-22
**Status:** agreed

## Why this is a programme, not a project

The overhaul covers a new visual language, new branding, a restructured
information architecture, several new features, and changes to how recipes are
stored. Those are independent subsystems. A single spec covering all of them
would be too vague to implement, so the work is decomposed into six
sub-projects, each with its own design spec, implementation plan and GitHub
milestone.

## Sub-projects

| # | Sub-project | Depends on | Ships |
|---|---|---|---|
| 1 | Design language and branding | — | New palette, type system, motion vocabulary, icon, splash, app name. No behaviour change. |
| 2 | Data model and persistence | — | Local name split from xBloom title, settings store, recipe equality and de-duplication, removal of the global title-uniqueness rule. |
| 3 | Navigation shell and feedback | 1 | Screen structure, empty state, CTA hierarchy, and the toast and NFC overlay redesign. |
| 4 | Recipe list and editor redesign | 1, 2, 3 | The two main screens rebuilt against the approved mockup. |
| 5 | Import overhaul | 2, 3 | URL paste field, clipboard detection, share intent, import sheet. |
| 6 | Settings and About | 1, 2, 3 | Settings screen, the toggles the other sub-projects accumulate, and attribution. |

Sub-projects 1 and 2 are independent of each other and can proceed in parallel.

## Constraints that apply throughout

- **Dark only.** Light mode is removed, not merely defaulted away.
- **No hidden functionality.** No bottom tab bar and no hamburger menu. Every
  destructive or non-obvious action has a visible affordance, even where a
  gesture shortcut also exists.
- **NFC cannot be tested in a simulator.** Any change to the card read or write
  path must be verified on a physical device against a genuine card.
- **A malformed write to a genuine card is not trivially recoverable.** The byte
  format and its characterisation tests are treated as load-bearing.
- **Native-affecting changes need a version bump.** `runtimeVersion.policy` is
  `appVersion`, so changes to `app.json` require raising `expo.version` and
  running `npx expo prebuild --clean`.

## Deferred

- **Recipe images.** Investigated and dropped. The image URL comes from
  `recipeVo.podsVo.imagePath` and exists only for pod recipes; it is never
  written to the card and `Recipe` has no field for it. Attaching user photos
  would be an entirely new local storage feature with no connection to the card
  format, so it earns its own decision later rather than riding along here.
- **Creating a recipe from scratch.** The `NEW` action was cut from the home
  screen. Whether the app should author a recipe with no card and no import to
  seed it is a genuine product question, tracked as its own issue.

## Artefacts

Each sub-project produces, in order: a design spec in `docs/superpowers/specs/`,
an implementation plan, and a GitHub milestone whose issues are the plan's
steps. Interactive mockups produced during design live in
`.superpowers/brainstorm/` and are not committed.
