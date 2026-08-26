# Sub-project 6: Settings and About — design

Status: approved
Date: 2026-08-26
Depends on: sub-project 1 (design language), sub-project 2 (data model), sub-project 3 (navigation shell)

## What this ships

The settings screen the other sub-projects have been deferring to, the About
screen the app has never had, and three things the app cannot do today: choose
the unit it shows temperatures in, take its recipes out, and put them back.

This closes the UI overhaul programme.

## Corrections to the roadmap

The roadmap describes sub-project 6 as "settings screen, the toggles the other
sub-projects accumulate, and attribution". Two things have changed since it was
written.

### The settings screen already exists

Sub-project 3 shipped `app/settings.tsx` so the home screen's gear would not
open onto nothing. It has one section and two rows. This sub-project restructures
it rather than creating it.

### One accumulated toggle was never wired up

Sub-project 4 added `showHints` to `library/Settings.ts` and its own spec records
that it "adds one row" to the settings screen. The row was never added, so the
setting exists, has a default of `false`, and cannot be changed by any means the
app offers. Turning it on is part of this sub-project's work, not a nicety.

### This sub-project carries new capability

Backup, restore and units are not overhaul work; they are new product. They were
brought into this sub-project deliberately and with the size understood. The
areas below are sequenced so the sub-project can stop at any boundary with
something coherent shipped.

### This sub-project is native-affecting

Backup needs `expo-sharing`, `expo-file-system` and `expo-document-picker`.
`runtimeVersion.policy` is `appVersion`, so `expo.version` in `app.json` must be
bumped and the app rebuilt.

## Not in scope

- **Mass and volume units.** See "Why only temperature converts" below.
- **Defaults for new recipes**, and **diagnostics**. Considered and dropped.
- **#42** (drag the profile), **#25** (author from scratch), **#26** (recipe
  images).
- **The card byte format.** Untouched, as in every sub-project.

## Decisions

| Question | Decision |
|---|---|
| Where does About live? | Its own screen, pushed from the **top** row of settings |
| Which quantities convert? | Temperature only |
| How does Fahrenheit entry behave? | Entered in °F, snapped to a storable °C |
| Restoring into a non-empty library | Merge by default; replace is an explicit, separately confirmed choice |
| Settings in the backup file | Included, declinable on restore |
| Where does the backup file go? | The share sheet — the user chooses |
| Deleting the whole library | Offer to back up first, then confirm |
| About's personality | The mark comes alive; a ticker rewards lingering |
| Distribution | App Store, which sets the bar for licences and the disclaimer |

## Build order

Five areas, in this order. Each is independently reviewable and independently
shippable.

1. Settings restructure (including the orphaned `showHints` row)
2. Units
3. About
4. Backup and restore
5. Delete all recipes

Area 5 depends on area 4, because the confirmation offers a backup first. The
others are independent.

## 1. The settings screen

A sectioned list. Sections, in order:

| Section | Rows |
|---|---|
| *(identity)* | About XBRW++ → pushes `app/about.tsx` |
| Recipe list | Show the COFFEE marker; Dot matrix pour profile |
| Editor | Show field hints |
| Units | Temperature (°C / °F) |
| Library | Back up my recipes; Restore from a backup; Delete all recipes |

### About sits at the top

Not at the bottom, where an About row conventionally goes. The row carries the
app's name and version, so it reads as the screen's identity rather than as its
footnote — the shape iOS itself uses for the Apple ID row. It is also the row an
App Store reviewer is looking for, and the top of the screen is where they will
look.

### The screen becomes rows, not JSX

`app/settings.tsx` goes from two rows to eight. Four components at module
scope, all in `components/`, so the screen becomes a declaration:

| Component | Responsibility |
|---|---|
| `SettingsSection` | A heading and its rows, in the dot-matrix label style already used |
| `ToggleRow` | Label, description, switch. Moves out of `settings.tsx` unchanged |
| `ChoiceRow` | Label and a segmented control, over the existing `SegmentedRow` |
| `ActionRow` | Label, optional detail, chevron. A `tone="danger"` variant for destructive rows |

Module scope matters here for the reason it has mattered twice already in this
repository: a component declared inside another component's body is a new type
on every render, and React remounts it.

## 2. Units

### Why only temperature converts

Coffee is weighed in grams everywhere it is taken seriously, including in the
United States, so mass has nothing to gain. Volume is worse than neutral: the
dose is in grams and the ratio is dimensionless, so 12 g at 1:15 is 180 ml and
the ratio is legible on screen. Show that volume as 6.1 fl oz and the "15"
corresponds to nothing the user can see. Volume-in-fl-oz and ratio-by-mass do
not coexist, so volume stays metric.

### The card never sees a Fahrenheit

New setting `temperatureUnit: "C" | "F"`, default `"C"`.

`Recipe`, `Pour`, the byte format and every stored value stay canonical Celsius.
Conversion happens at the field boundary and nowhere else. A user who switches
units and switches back must get the identical card.

`library/units.ts`, pure, no React:

| Function | Contract |
|---|---|
| `toDisplay(celsius, unit)` | Canonical °C to the number shown |
| `fromDisplay(value, unit)` | A shown number to canonical °C, rounded and clamped |
| `snapToStorable(value, unit)` | The shown number the app will actually settle on |
| `displayRange(unit)` | The min and max to hand a stepper |
| `unitSuffix(unit)` | `"°C"` or `"°F"` |

### The blast radius is three files

Verified by search, not assumed. Temperature is rendered in exactly one place —
`components/StageTile.tsx` — and described in two: the hint in
`constants/recipeHelp.ts` and the out-of-range message in `library/cardLimits.ts`.
Nothing else in `app/`, `components/` or `hooks/` renders a temperature.

### A step always moves the stored value

One Celsius degree is 1.8 Fahrenheit degrees, so stepping ±1 °F and rounding
back sometimes lands on the same storable °C. A stepper that visibly does nothing
when tapped is a bug, and a user cannot tell it from a frozen screen.

So the contract is: **a step always advances to the next distinct storable
value.** In Fahrenheit the displayed number therefore climbs 194 → 196 → 198,
skipping values the card cannot hold. This is the honest behaviour — the card's
resolution is one Celsius degree and pretending otherwise would produce a
temperature the machine does not brew at.

Typing an arbitrary value is allowed and snaps on commit, so 195 °F is accepted
and settles at 196 °F.

The card's range, 39–99 °C, becomes 102–210 °F.

## 3. About

`app/about.tsx`, pushed from the settings identity row.

### Content

| Block | Why it is there |
|---|---|
| The living `++` mark | The one moment of personality. See below |
| Version and build | Bug reports are useless without it |
| Independence and trademark | This app is unofficial, uses xBloom's marks, reads their cards, and calls their undocumented API. It has never said so anywhere |
| What leaves your phone | Recipes are local; importing sends a share ID to xBloom; nothing else |
| Why only genuine cards work | The 32-byte signature the app cannot compute. Users hit this and have no explanation |
| Credit | Who made it |
| Repo and issue links | Somewhere to report a fault |
| Open-source licences | Expected for App Store distribution |

The independence disclaimer is not optional and does not hide behind a tap.

### The mark comes alive, and the ticker rewards lingering

The `++` is drawn as real dots that breathe, and scatter and re-form on tap. It
reuses the splash's dot machinery rather than inventing a second animation —
which is both the cheapest option and the only one that keeps the app's two
animated moments in one visual language.

If the screen is still open and untouched after several seconds — eight is the
starting value, to be tuned on a device — a dot-matrix ticker starts under the
mark, in the register of a 90s crack intro. It is an idle attract mode, which is
what the era actually did, and it means the flourish is a reward for curiosity
rather than a novelty that greets everyone.

Both respect Reduce Motion: the mark renders static, and the ticker does not
start. The screen must be entirely usable and complete without either.

### Licences are generated, not maintained

`scripts/generate-licences.sh` walks the installed dependency tree and writes a
committed `constants/licences.ts`. This follows `scripts/generate-icons.sh`,
which is the existing convention for generated-but-committed artefacts: the
build does not depend on the script having been run, but the script is the only
sanctioned way to change its output.

A hand-maintained list would be wrong within one dependency bump, and the
obligation here is legal rather than cosmetic.

## 4. Backup and restore

### The file

`library/backup.ts`, pure and independently testable:

```
{
  "format": "xbrw-backup",
  "version": 1,
  "exportedAt": "2026-08-26T21:00:00.000Z",
  "appVersion": "2.6.0",
  "recipes": [ ... ],
  "settings": { ... }
}
```

| Function | Contract |
|---|---|
| `buildBackup(recipes, settings)` | The envelope above, as a string |
| `parseBackup(text)` | A validated payload **or a reason**. Never throws |
| `mergeRecipes(existing, incoming)` | What would be added, what already exists |

`parseBackup` returning a reason rather than throwing is deliberate: every
failure here is a message the user must be able to act on, and an exception
crossing a screen boundary becomes a generic apology.

Recipes are already whole JSON blobs keyed by UUID, so the envelope is a
container rather than a translation. `version` exists so a future format can be
recognised and refused rather than silently misread.

### Out through the share sheet

Export writes a dated file and opens the system share sheet, so the user chooses
Files, AirDrop, Mail or anything else. The app does not pick a location on the
user's behalf, and it does not need a storage permission to do it.

A quiet second feature falls out of this: backups are shareable, so one person's
library can be handed to another.

Import is the document picker.

### Merge, unless told otherwise

Restoring into a non-empty library **merges by UUID and skips what is already
there**. Nothing is overwritten and nothing is lost.

Replacing the whole library exists, but only as an explicit choice confirmed on
its own. Replace is a second way to destroy a library and it must not be the
quiet default.

Settings are in the file, and the restore offers to decline them, because
restoring someone else's backup should not silently change your preferences.

### Deleting the whole library

The confirmation **offers to back up first**, then confirms once. The backup is
the safety, not the wording of a dialog.

## 5. Failure

Every failure is a message with a reason. Silence is reserved for the one case
that means nothing went wrong.

| Case | Behaviour |
|---|---|
| Picker cancelled | Say nothing. The user withdrew |
| File unreadable | "That file could not be read." |
| Not a backup | Named as such, not as a parse error |
| `version` newer than this app | Refused by name: the app is too old for the file |
| No recipes in the file | Refused, rather than reporting a successful restore of nothing |
| Every recipe already present | Reported plainly, not as a failure |
| Share sheet unavailable | Reported rather than a dead button |

## 6. Testing

| Area | What is pinned |
|---|---|
| `units.ts` | A conversion table; both boundaries (39 °C, 99 °C); round-trip C→F→C identity; the step-always-moves property; clamping |
| `backup.ts` | Round-trip; truncated JSON; wrong `format`; a future `version`; missing fields; a recipe blob that will not parse; an empty array |
| `mergeRecipes` | All new, all duplicate, a mixture, and an empty library |
| Settings screen | Every row renders, reads its setting, and writes it. The `showHints` row exists |
| About | Every required content block is present. The disclaimer is not behind an interaction |
| Motion | The ticker starts only after its delay, and never under Reduce Motion |

Component tests render through `renderWithProviders` and await RNTL v14's async
`render` and `fireEvent`. The ticker uses fake timers.

Card-format tests must be untouched by this sub-project. If a change here alters
`library/__tests__/`, it is a regression until proven otherwise.

## 7. Risks

- **Three new native dependencies.** They force a version bump and a rebuild,
  and they widen the gap left by **#5**: Android has never been verified on SDK
  57 and is now further from verified. This sub-project does not close #5, but it
  makes it more expensive to leave open.
- **Destructive actions are new to this app.** Nothing in XBRW++ has ever
  deleted user data before. Delete-all and replace-on-restore are both
  irreversible against a library the user cannot otherwise export — which is why
  backup is built before either of them, and why delete offers one.
- **Restore accepts untrusted input.** A backup file is a document from
  anywhere. `parseBackup` is the only door and it validates rather than trusts.
- **Licence obligations are only as good as the generator.** A generator that
  misses a transitive dependency produces a confident, wrong list.
- **Units touch the editor.** Sub-project 4 rebuilt it and sub-project 5 has only
  just settled. The mitigation is that conversion is confined to the field
  boundary and that the card format tests are the tripwire.
