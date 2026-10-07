# Release 2.1.0

Eleven ideas, grouped into packages that map to pull requests. This spec covers
everything buildable today. Pause/resume and custom overflow protection are
deliberately absent: they depend on machine behaviour nobody has measured, and
the measurement is written down here as Appendix A rather than guessed at.

## Packages

| # | Package | Ideas | Size | State |
|---|---------|-------|------|-------|
| 1 | Close out PR #191 | 4 review findings | XS | ready |
| 2 | Papercuts | a, b, g, i, GRIND defect | S | ready |
| 3 | Scroll affordance | j | S | ready |
| 4 | Beanconqueror GA | k | XS | ready, gated on their release |
| 5 | Drawer reveal | c1, c2 | M | ready |
| 6 | Quick edits | d | M/L | ready |
| 7 | Hardware spike | e, h research | XS | needs the machine |
| 8 | Pause/resume | e | M | second spec, after 7 |
| 9 | Custom overflow protection | f | M | second spec, after 8 |
| 10 | Easy Mode slots | h | L | issue only |

Order is 1, 2, 5, 6, with 3 slotting in anywhere and 7 pulled forward the
moment the machine is reachable, because 7 decides whether 8 and 9 exist at all.

Package 4 sits outside that order. It is ready at any time but must not merge
before Beanconqueror's own release, for the reason in its section: it is a
one-way door tied to somebody else's schedule.

Package 10 ships as a GitHub issue carrying the agreed shape and the four open
protocol questions. The reasoning is in its section.

## What is genuinely new

Most of this release edits files that already exist. Four units are new, and
each is drawn so it can be understood and tested without the others.

**`library/drawerHint.ts`** decides whether the home screen's reveal hint runs.
It is a pure function of five recorded values and the clock, with no React and
no settings access of its own, so the entire cadence policy is testable without
a renderer. `SwipeableRecipeRow` asks it; `Settings` stores what it reads.

**`library/quickEdit.ts`** holds a `QuickEdit` value and two functions over it:
`applyQuickEdit(recipe, edit)` returning an adjusted `Recipe`, and
`explainQuickEdit(recipe, edit)` returning the explainer line. Clamps come from
`cardLimits.ts` and the volume rescale from `autoFixPourVolumes()`, so quick
edits inherit the card's own limits rather than restating them.

**`components/QuickEditPanel.tsx`** is the surface that grows out of the editor
action bar.

**`components/ScrollFade.tsx`** is the gradient edge for package 3.

The boundary that matters most: **a quick edit is a pure transform that yields
an ordinary `Recipe`.** `useBrewRun`, `BrewRecorder` and the card writer never
learn quick edits exist. The only thing that records an adjustment is a flag on
the brew record, and that flag exists for honesty in history, not for
behaviour. Nothing branches on it.

---

## Package 1 — close out PR #191

Four review findings on the merged Beanconqueror export work.

The two mediums are one issue. `said` in `library/brew/handoff/handoffBean.ts`
omits only `undefined`, so an empty string wins over a meaningful value: a bean
carrying `origin: ""` and a real `country` hands off the empty string. The fix
is to treat blank as absent, which is what every caller already assumes. The low
asking to rename `said` lands with it; the name says "was stated" when the
function means "has something worth sending".

The remaining low is a grammar fix in
`docs/superpowers/specs/2026-09-20-beanconqueror-brew-export-design.md`.

## Package 2 — papercuts

### (a) The SEND button overflows

`app/brewHistory.tsx` passes `HANDOFF_TARGETS[0].buttonLabel`, which is "Send to
Beanconqueror". That is 170.6 pt of text on its own, in a row that has to hold a
count and a cancel as well, so it spills off the left.

This is not a layout bug and must not be fixed with layout.
`components/ExportButton.tsx` already carries the answer in its own doc comment:
the history batch button prints `SEND`, which is plain beside the rows it acts
on and bare when read aloud with no rows in earshot. The `accessibilityLabel`
one line above is already the full sentence that comment anticipates. Somebody
passed the long label past a component that had already decided against it.

Restore `SEND`. The row then measures about 329 pt of the 370 pt available even
at the 1.4 font cap.

### (b) The placeholder reads as input

Two parts, because dimming alone cannot fix it.

`palette.placeholder` is `#868686`. The darkest value still clearing WCAG AA on
the lightest surface it appears over is `#7F7F7F`: 4.52:1 on `raised`, 4.73 on
`surface`, 5.21 on `base`. That is seven steps out of 255 below today's value,
which nobody can see. Dimming has essentially no headroom left.

What actually reads as input is the copy. `PodSection` writes its placeholder as
an example, prefixed `e.g.`, and the token's own doc comment asks for that
convention. Five placeholders have drifted away from it and read as values:
`BeanNameSheet`, `RenameSheet`, `NameShelfSheet`, `NoteSection` and
`BrewJudgement`. Prefix those five.

Leave `RailSearch`, `ImportSheet` and `HubFilterSheet`. Those are labels for
what the field does, not examples of what to type, and `e.g.` would be a lie.

Then take the token to `#7F7F7F` anyway and update the ratios documented beside
it. On its own it is imperceptible; with the copy fix it is the last of the
available headroom, spent rather than left.

### (g) A brewer is not a cup

The recipe editor calls the dripper a cup, which collides with the cup the
coffee lands in. Rename to brewer in `constants/recipeHelp.ts`'s cup block and
`CUP_OPTIONS` in `app/editRecipe.tsx`.

Do not touch brew-result copy. `CompareWithSheet`, `app/brewCompare.tsx`,
`BrewJudgement`, `TeaBanner` and `constants/brewCopy.ts` all say "in the cup"
about grams of liquid, where cup is the right word and brewer would be wrong.
The collision is why the rename is confined to the editor.

### (i) The detail row clips

On the finished brew, the drawdown rate runs off the right edge. The cause is
arithmetic, not styling. At 402 pt with 16 pt padding and a 13 pt column gap,
three columns are 114.7 pt wide at scale 1.0. The inline drawdown time plus its
recipe badge measures exactly 114.7 pt. It overflows by a hair, which is why it
looks like a rendering glitch rather than a layout decision.

**The design is four columns with unequal shares.** `DRAWDOWN` is the only
eight-character label and takes 1.4 flex shares; the other three take one each.
The rate stops being a badge on the drawdown column and becomes a column of its
own.

At the 1.4 font cap, `DRAWDOWN` needs about 89.6 pt and its 1.4 shares give it
95.9 to 100.4 pt, so it clears. One string does not: the `RECIPE 58` badge needs
99.8 pt against the 71.7 pt its column gets. **At a text scale above 1.2, fall
back to three wide columns.** The threshold is exact and belongs beside the
other figure geometry in `library/brew/figureGeometry.ts`, not inline at the
call site. Four columns are a comfort that large type cannot
afford, and the fallback is the design rather than a failure of it.

A quiet third line carries the recipe badge and the rate's unit. When there is
no recipe badge to carry, the whole quiet line is dropped and the `RATE` label
absorbs the unit instead, reading `RATE G/S` over a bare `1.0`. When the quiet
line exists the label stays `RATE` and `G/S` sits below.

Test this through `dotoTextWidth` at both scales, asserting each column fits and
that the fallback engages above 1.2. A snapshot test would pass happily while
the text clipped, which is how this shipped in the first place.

### The GRIND defect

Found in the screenshot that reported (i), not in the original list. A plain
recipe showed no grind size at all.

`dialNote()` in `library/brew/dialAfterBrew.ts` stays silent when the grinder
ran but no post-brew dial reading arrived. That silence enforces a real rule: a
*dial reading* is a measurement and must be post-brew, because a pre-brew
reading is a guess dressed as an observation.

The rule is right and the silence is wrong, because it throws away something we
do know. The recipe's grind size is snapshotted on the record. **Show the
snapshotted recipe grind in the dashed outline style**, which already means
asked-for rather than confirmed, and which the record uses for exactly this
distinction elsewhere. This consciously overturns the silence while keeping the
rule that produced it.

## Package 3 — the summary does not look scrollable

On the finished brew the summary sits in a scroller and the judgement and export
actions are pinned below it, outside the scroller, so they are never scrolled
away. That is deliberate and stays.

The cost is that the summary ends at a hard border, and a long stage list
continues below with nothing saying so.

**Add a gradient fade at the scroller's bottom edge, clearing when the scroll
reaches the end.** It then says "there is more" rather than permanently
decorating an edge.

Glass was the original request: float the judgement over the content so stages
pass behind it. It works, and it is deferred rather than rejected. It needs a
native dependency the project does not have (`expo-blur`; `expo-glass-effect` is
in the lockfile only as an SDK transitive, is unused, and is iOS 26 only, so
Android needs a fallback regardless), which means a version bump and a prebuild
under `runtimeVersion.policy: appVersion`. And it reverses the pinning decision
above, reopening how much summary the panel is allowed to hide.

The complaint was that scrolling is not obvious. Glass was a means. The fade
addresses the end at a fraction of the cost. Revisit glass only if scrolling
still reads poorly once the fade ships.

## Package 4 — Beanconqueror goes GA

**Delete the `beanconquerorHandoff` setting outright** rather than flipping its
default.

Its stated rationale is that Beanconqueror did not yet recognise the URL, and
that expires with their release. A setting whose reason has expired is clutter
that every future reader has to evaluate.

Deleting the key removes it from `DEFAULTS`, `BackupExcluded` and
`NOT_IN_BACKUP` together, and needs no `settingsSnapshot()` change, because the
snapshot's type derives from the key set.

**This package must not merge before Beanconqueror's release is out.** It is a
one-way door: if we ship first, every user gets a handoff URL their app does not
recognise and no setting with which to stop it. Ordering is the whole
mitigation.

## Package 5 — the drawer reveal

The home screen demonstrates its swipe trays by bouncing a row open on launch.
Two problems: it does this every single launch, and it reveals only one of the
two trays, so the other stays undiscovered.

### Cadence

Move the policy into `library/drawerHint.ts`, persisted to the settings table.
The hint runs at most **once every 3 days**. It **retires** after 3 manual
drawer opens or a lifetime cap of 6 appearances, whichever comes first, because
a user who opens drawers by hand has learned and a user who has seen it six
times is not going to.

It **re-arms** when the drawer's action signature changes, or after 60 days of
app dormancy. The first covers a tray whose contents changed, which is a genuinely
new thing to learn. The second covers coming back to an app you have forgotten.

The signature re-arm fires in this release, because package 6 changes the tray.
Every existing user therefore gets exactly one automatic reveal of the new tray
on 2.1.0, which is the behaviour we would have wanted to arrange deliberately.

### Two rows, staggered

Row one peeks the action tray; row two peeks the management tray 180 ms later.
The stagger applies to opening **and** closing, so each row is revealed for the
same span and neither looks like an afterthought.

Rejected: revealing both simultaneously, which reads as the list coming apart
rather than as two trays; and the one-card wobble, which the existing code
comment in `SwipeableRecipeRow` calls intolerable and which this design does not
disturb.

### Timing

`BOUNCE_CLOSE_DELAY` goes from 1000 ms to 800 ms; today's reveal reads slightly
slow. Row one runs 300 to 800 ms, row two 480 to 980 ms.

Move `BOUNCE_OPEN_DELAY` and `BOUNCE_CLOSE_DELAY` out of
`SwipeableRecipeRow.tsx`, where they are local literals, into
`constants/motion.ts`. The house rule is that a timing not in that file cannot
take part when the app's motion is retuned, and these two have been exempt by
accident.

### Reduced motion

The hint does not run at all. Those users never learn the trays exist from the
hint, which is accepted: a reduced-motion user has asked not to be shown
animated demonstrations, and the trays remain discoverable by swiping.

## Package 6 — quick edits

You come back to a recipe and change one thing for one brew. Today that means
editing the recipe, brewing, and editing it back, or keeping a near-duplicate.

### The knobs

Four. **Dose, ratio and grind are absolute**; you set the value. **Temperature
is an offset** applied to every stage, because a recipe's stage temperatures
are usually a shape (92, 90, 88) and you want the shape moved, not flattened.

Clamps come from `cardLimits.ts`: dose 1 to 31 g, 10 for tea; ratio 5 to 100;
grind 40 to 80; temperature 39 to 99 °C. The temperature offset saturates at
those bounds rather than overflowing, so a +5 on a recipe already at 97 raises
what it can and leaves the rest.

Changing dose or ratio reruns `autoFixPourVolumes()`, because the machine
rejects a recipe unless stage volumes sum to `dose × ratio`. An explainer line
then states the resulting total, for example "Stage volumes rescale to 320 ml to
match the new dose." Grind and temperature produce no line; nothing downstream
of them changes.

### The temperature baseline

The offset needs its baseline visible, inline, like the other knobs show their
current value. Up to three stages list them: "recipe 88, 88, 90". Four or more
collapse to a range: "recipe 80 to 90", using the word "to" rather than a dash,
per the copy rule. At the 1.4 font cap the list form drops the word "recipe",
taking it from 154 pt to 90 pt in a 148 pt slot.

### Getting there

**Split the editor's BREW button.** Tapping the word brews the recipe as saved;
tapping the chevron segment opens quick edits. Quick edit inherits BREW's accent,
because adjusting and then brewing is still running the recipe, not a lesser
act.

Rejected: a fourth button on the bar, which turns a three-button bar into a
toolbar and implies quick edit is the lesser way to brew; and long-press, which
nobody finds.

**Replace SHARE with quick edit in the home screen's action tray.** The tray
stays three tiles. Sharing remains reachable from the editor, and the tray is
for things you do often, which this is and sharing is not. Changing the tray is
also what re-arms the package 5 hint.

### The panel

It **grows upward out of the action bar**. The bar does not move, so the chevron
stays visible and the panel visibly belongs to the control that opened it. The
deck behind dims.

Rejected: faux-scrolling the deck to reveal a panel below, which scrolls away
the recipe you are adjusting against and overloads the deck's own scroll
gesture.

Because this is a bespoke surface rather than an `XbrwSheet`, it must restate
three behaviours that `XbrwSheet` would otherwise have supplied: **focus
trapping**, **backdrop dismissal**, and the **Android `screenCovered` guard**.
`XbrwSheet` exists precisely because this pattern was being re-derived and got
subtly wrong each time, and the `screenCovered` guard is a lesson this repo has
already learned once. The panel cannot inherit it, so it must repeat it
knowingly.

### Persistence

**None.** The panel opens at the saved recipe every time. A deviation lives for
one brew and is stored nowhere.

The alternative, remembering the last adjustment per recipe, was rejected for
this release: it creates a recipe you believe is one thing and which quietly
brews as another, which is the exact problem the "your saved recipe stays
unchanged" promise exists to prevent. If repeated adjustment turns out to be
common, the better answer is to offer saving it to the recipe, and the brew
history will say whether that is worth building.

### The record

A brew from an adjusted recipe writes an explicit **`adjusted` flag**, following
the `watched` precedent **including serialising only when true**, so every
existing record stays byte-for-byte what it was and a 2.0 backup restores
unchanged.

The record shows changed figures with dashed badges, matching how GRIND already
shows a recipe-sourced value. The brew **still counts** toward the recipe's
evidence and rating average: you brewed that recipe, and a rating of a
two-degree variation is a rating of the recipe.

## Package 10 — Easy Mode slots, as an issue

Issue #62 asks to write the machine's three Easy Mode slots. The shape is
agreed: a dedicated screen is canonical, because the protocol forces the app to
own a model of all three slots at once; a recipe context menu opens that screen
pre-filled; and a recipe carrying a slot shows a marker.

It stops at issue level for 2.1.0, because the protocol has an unresolved edge
with a bad failure mode. **All three slots must be written in one batch**;
writing one or two leaves the machine hung at state `0x43` showing RETRY. A BLE
drop mid-batch therefore hangs the machine, and we do not know whether
re-sending recovers it. The slots are also **write-only**, so the app's belief
about what is in them can go stale with no way to check, and sources disagree on
the grinder flag nibble.

Four questions decide whether this is safe to build, and they fold into
Appendix A. The issue records the shape and the questions so the work is not
re-derived.

---

## Appendix A — the hardware spike

Packages 8 and 9 are not designed here because they rest on machine behaviour
nobody has measured. Every question below is answerable from the existing
machine console (`app/machine.tsx` can already dispatch arbitrary frames), so
this costs a brew and not a build.

### Pause and resume

There is no trustworthy way to pause a recipe brew.

`40518` is literally the same opcode as Start and is tiered `unresolved`. One
contributor verified it **aborts back to armed**; another saw it bounce to
`recipe_loaded`. The app's brew path never sends it and a regression test
asserts its absence.

`8019` and `8021` are confirmed to be **FreeSolo standalone dispense** pause and
resume, not recipe brews. `40524`, "Coffee resume", is single-sourced with no
trusted pause to resume from.

To answer:

1. Mid-brew, does `40518` abort the brew or pause it? Which state does the
   machine report afterwards?
2. Do `8019` and `8021` do anything at all during a recipe brew, or only in
   FreeSolo?
3. If something does pause, does the recipe resume from where it stopped, or
   restart the stage?

If nothing pauses safely, packages 8 and 9 leave the release and (f) needs a
different mechanism, because custom overflow protection is pause plus a
threshold and has no meaning without it.

### Easy Mode slots

4. Does a deliberately partial batch (one or two slots) really hang the machine
   at `0x43`?
5. Does re-sending all three recover it, or does it need a power cycle?
6. Which grinder nibble is correct: `0x04` for off, or the `0x02` pairing used
   elsewhere?
7. After writing slots, does the machine stay in PRO mode, or fall back?

## Appendix B — testing

The three new library modules are plain TypeScript and test directly.

`drawerHint` gets a table of recorded states and clock positions against
expected show or skip, including both re-arm paths and both retirement
conditions.

`quickEdit` gets the clamp boundaries from `cardLimits`, including the tea dose
ceiling; the invariant that `dose × ratio = Σ stage volumes` still holds after a
dose or ratio change, which is the machine's own rejection rule; and the
temperature offset saturating rather than overflowing. The explainer line is
asserted against the computed total, never a hardcoded string.

The detail row is tested through `dotoTextWidth` as described in (i), not by
snapshot.

The `adjusted` flag gets the test the `watched` flag has: a record without it
serialises byte-identically to one written before the field existed.

Component tests follow the house rules: `renderWithProviders`, awaited render
and `fireEvent`, no platform assumed, and assertions on text, test IDs and
accessible labels rather than on the tree.
