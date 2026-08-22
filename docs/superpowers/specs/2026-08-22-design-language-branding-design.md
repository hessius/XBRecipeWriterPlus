# Sub-project 1 — Design language and branding

**Date:** 2026-08-22
**Status:** approved
**Part of:** [XBRW++ overhaul roadmap](./2026-08-22-ui-overhaul-roadmap.md)

## Goal

Replace the app's visual language wholesale and apply the new branding, without
changing any behaviour. This sub-project ships the tokens, primitives and assets
that sub-projects 3 to 6 consume.

## Non-goals

- No new features, no changed flows, no changed data.
- No redesign of the recipe list or editor. Those are sub-project 4; the home
  screen mockup produced during design is their reference, not this one's
  deliverable.
- No settings screen. The coffee-marker toggle this sub-project implies is
  recorded for sub-project 6.

## Design direction

The app is a companion to a machine with a dot-matrix display, and it is the only
app that reads and writes the physical cards. The visual language leans on both:
dot-matrix type for machine values, and recipes drawn as coloured cards carrying
their own brew profile.

The direction is deliberately not a copy of the xBloom app. Recipes are
identified by a pastel fill plus the silhouette of their pour schedule, the
chrome is a wordmark and a gear rather than a tab bar, and every machine-derived
number is set in dot matrix.

### Identity

- Pure black background throughout.
- Recipes are compact rounded cards, pastel fill, dark text.
- Each card renders its **pour profile** behind the numbers: cumulative water
  over time, stepped, derived from the real pour list. Flat runs are pauses.
- A small contactless mark and the beverage marker sit top-right of the card.
- Screen titles carry a **superscript dot-matrix count** (`Recipes⁴`).
- Home chrome is a single row: the screen title and its superscript count on the
  left, and on the right the `XBRW++` wordmark followed by the gear. The wordmark
  is set small enough to read as chrome rather than as a second title.
- Below the chrome, two equally weighted CTA tiles, `SCAN` and `IMPORT`, each an
  icon above a Doto label.
- Nothing is hidden behind a gesture alone. Swipe-to-delete and swipe-to-
  duplicate are retained as shortcuts, but an **edit toggle** reveals the same
  actions on every card as visible buttons.

### Typography

Two families and one rule that governs every call site:

> **Inter for anything a human typed or reads as prose. Doto for
> machine-derived values and system status.**

| Inter | Doto |
|---|---|
| Recipe names, field labels, body copy, buttons with prose labels, dialog text, errors | Ratio, water, dose, grind, RPM, temperature, pour counts, saved counts, write progress, reader state, `TEA` / `COFFEE`, CTA labels |

This rule is what stops the motif becoming decoration. A user-entered recipe name
is never rendered as dots.

**Doto is never set below 11 px, and always at weight 700 or heavier.** Below
that it degrades into a smudge; this was established by rendering a legibility
ladder at true device scale during design. The `DotMatrixText` primitive enforces
the floor rather than leaving it to call sites.

Doto is OFL-licensed. Bundle **static instances** per weight rather than the
variable font, because React Native's variable-font support is unreliable. Ship
the OFL licence text with the font files.

Inter is already available through `@tamagui/font-inter`.

### Colour

All colour continues to live in `constants/colors.ts`. The existing structure is
replaced rather than extended, and the light/dark splits in `screenBackground`,
`textColors` and `cardColors` are collapsed, since light mode is removed.

**Neutrals**

| Token | Value | Use |
|---|---|---|
| `base` | `#000000` | Screen background |
| `surface` | `#101010` | Sheets, elevated panels |
| `raised` | `#161616` | CTA tiles, inputs |
| `line` | `#262626` | Hairlines and borders |
| `muted` | `#6E6E6E` | Tertiary text, superscript counts |
| `dim` | `#A3A3A3` | Secondary text |
| `text` | `#FFFFFF` | Primary text |

**Semantic**

| Token | Value |
|---|---|
| `success` | `#5DDC8A` |
| `danger` | `#FF6B5E` |
| `warn` | `#F0C24A` |
| `info` | `#7FB4FF` |

**Recipe accents** — twelve, split by beverage.

Coffee (cool): `#9FC3F0` Sky, `#F0B98E` Peach, `#F0A0AB` Blossom, `#B4D6A8` Sage,
`#97D8C4` Mint, `#BDB2E8` Lilac, `#A6D6E8` Ice, `#E7A9C9` Rose.

Tea (warm): `#CFD6A3` Sencha, `#DCC194` Oolong, `#D9CF9A` Jasmine,
`#E0AEA6` Hibiscus.

**On-accent foregrounds** are fixed, not per-accent: `#0C0C0C` for values and
names, `rgba(0,0,0,0.45)` for micro-labels, `rgba(0,0,0,0.85)` stroke and
`rgba(0,0,0,0.30)` fill for the pour profile.

Beverage is signalled twice, deliberately: by which half of the palette the
accent comes from, **and** by a Doto `TEA` or `COFFEE` marker. Redundancy is
intentional — colour alone is not an accessible signal. A settings toggle to hide
the `COFFEE` marker (the common, therefore noisier, case) is deferred to
sub-project 6; until it exists the marker is always shown.

**Accent assignment.** An accent is assigned when a recipe is saved, from the
half of the palette matching its beverage. The rule is: take the least-used
accent in that half, and break ties by lowest index. While the library is
smaller than the half-palette this simply means "the first unused colour"; once
it outgrows it, colours repeat as evenly as possible rather than clustering. The
accent is persisted on the recipe, so it is stable across renames and edits.

Changing a recipe's cup type between coffee and tea moves it to the other half
of the palette and therefore reassigns its accent, by the same rule.

Persisting it requires a field on `Recipe`, which belongs to sub-project 2. To
keep this sub-project independently shippable, the accent resolver takes the
persisted value **if present** and otherwise falls back to a deterministic
function of `recipe.uuid`. The fallback is stable, so cards do not change colour
between launches, and sub-project 2 replaces it without a visual jump for
recipes saved afterwards.

### Motion

Four signature animations, all approved:

| Name | Where | What |
|---|---|---|
| **Dot bloom** | Card scanning | Concentric dot rings pulse outward while the reader hunts, collapsing into a tick on success. Replaces the spinner and the Android progress bar. |
| **Digit roll** | Any changing value | Doto numerals roll like a mechanical counter rather than swapping. |
| **Profile draw** | List arrival | Cards stagger in; each pour profile draws itself left to right. |
| **Write sweep** | Card writing | Light crosses the card block by block, tracking real write progress. |

**Vocabulary**

- `fast` 120 ms — taps, toggles, press states. Feedback, not decoration.
- `base` 240 ms — cards, sheets, screen transitions.
- `deliberate` 400 ms and up — the two ceremonies, scanning and writing.
- Springs for anything a finger drives; timing curves for anything the system
  drives.

**Non-negotiables**

- Every animation respects Reduce Motion by degrading to a cross-fade, never to
  nothing. A user who disables motion must still see that something happened.
- No animation delays a user action.
- Progress is always driven by real state. The write sweep and the bloom are fed
  by the existing progress callbacks; neither is ever advanced on a timer.

**Platform composition.** On iOS, `NFC.ts` calls
`requestTechnology(NfcTech.Iso15693IOS)`, which presents CoreNFC's system
scanning sheet. The app cannot draw over it, and the only content it controls is
`setAlertMessageIOS`. The sheet occupies roughly the lower half of the screen,
so the bloom and the sweep **stage in the upper half**, with textual progress
mirrored into the alert message as the code already does. Android presents no
system UI, so the same components fill the app's own overlay. One set of
components, two compositions. The compositions themselves are designed in
sub-project 3; this sub-project ships the components and the constraint.

### Branding

- **App name** is `XBRW++` — `expo.name` in `app.json`, and the label under the
  icon.
- **Icon** is generated from `AgentResources/Branding/xbrw-icon-new.svg`: the
  glowing `++` on a circular dot-matrix display, white on black. `AgentResources/`
  is gitignored, so the generated PNGs are committed to `assets/images/` and the
  source SVG is copied into the repository alongside them.
- **Splash** is animated: dots light up into the `++`, then hand off to the app.
  Static logo on black is the Reduce Motion fallback and the pre-hydration
  frame, so `expo-splash-screen` still shows a still image; the animation is an
  app-rendered layer that covers the handoff.
- **Wordmark** appears in the home header beside the gear, as well as on the
  splash, the icon and the About screen.

## Components

New primitives, all at module scope, all in `components/`:

| Component | Responsibility |
|---|---|
| `DotMatrixText` | Doto text. Enforces the 11 px / 700 floor. The only place the font family is named. |
| `PourProfile` | Stepped cumulative-water SVG path from a `Pour[]`. Takes stroke and fill colours; knows nothing about cards. |
| `RecipeCard` | Accent fill, name, Doto stats, beverage marker, contactless mark, `PourProfile` behind. |
| `CtaTile` | Icon over Doto label. Equal-weight action tile. |
| `ScreenTitle` | Inter title with superscript Doto count. |
| `DotBloom` | The scanning animation. Driven by a progress value, not a timer. |
| `DigitRoll` | Rolling Doto numerals. Wraps a numeric value. |
| `WriteSweep` | The write animation. Driven by block progress. |

`constants/motion.ts` is added for durations, easing curves and the Reduce Motion
helper, mirroring how `constants/colors.ts` centralises colour.

## Architecture

The existing three-layer separation is preserved. This sub-project touches only
`components/`, `constants/`, `app/_layout.tsx`, `tamagui.config.ts`, `app.json`
and `assets/`, and adds one new file to `library/` for the accent resolver, which
is domain logic and not React. **No existing file in `library/` is modified**, so
the card format and its characterisation tests are untouched.

Colour stays in the plain `constants/colors.ts` module rather than moving into
Tamagui theme tokens, for the reason already recorded in the repository: roughly
half the colour call sites are plain React Native, expo-router or SVG props that
cannot accept a `$token`, and Tamagui's theme proxy has no parent-theme fallback,
so a custom key on `light` would not resolve inside a sub-theme.

## Testing

- Component tests for every new primitive, using `renderWithProviders` from
  `test-utils/render.tsx`. `render` and `fireEvent` are asynchronous; every call
  is awaited.
- `PourProfile` gets a unit test over its path generation, including the
  degenerate cases: a single pour, a zero-volume bloom, and pours summing to
  zero.
- `DotMatrixText` gets a test asserting the size floor is enforced rather than
  merely documented.
- The accent resolver gets a test asserting stability: the same uuid yields the
  same accent across calls, and tea recipes only ever draw from the tea half.
- Existing tests must continue to pass unchanged. Any component test that breaks
  because of a colour or copy change is updated; any that breaks because
  behaviour changed is a bug in this sub-project.
- `npm run typecheck`, `npm run lint`, `npm test` and `npx expo-doctor` all green,
  as CI requires.

## Risks

- **Doto legibility.** Mitigated by the enforced floor, but it should be checked
  on a physical device in sunlight before sub-project 4 builds on it.
- **Contrast on pastels.** Dark text on the twelve accents needs a contrast pass;
  the warm tea set is the lightest and therefore the most at risk.
- **Native-affecting changes.** Font, icon, splash, name and colour scheme all
  land in `app.json`, so this requires an `expo.version` bump and
  `npx expo prebuild --clean`. `ios/` and `android/` are generated and
  gitignored, so they must not be edited directly.
- **Palette drift.** The current `colors.ts` accumulated several near-duplicate
  oranges. An ESLint rule forbidding hex literals and named CSS colours in `app/`
  and `components/` would stop the same drift recurring, and is cheap to add
  while the palette is already being replaced.

## Follow-on issues this sub-project creates

- Settings toggle to hide the `COFFEE` marker — sub-project 6.
- Persisted accent field on `Recipe`, replacing the uuid fallback — sub-project 2.
- iOS and Android compositions of the bloom and sweep against the system sheet —
  sub-project 3.
- Contrast audit of the twelve accents on a physical device.
