# Brew Summary Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold the live ladder's rung height still from stage to stage, fit the finished-brew summary inside the screen, and give a completed summary the accented, well-proportioned ladder the live screen has.

**Architecture:** Three independent corrections, each at the place that owns the value. `BrewNowCard` reserves its tallest sentence so a growing card can no longer steal height from the measured band region. `app/brew.tsx` passes the summary the width it actually has. `BrewSummary` measures the height above its ladder and asks `bands.ts` for rungs that grow into whatever is left, and tells the ladder to paint a fully-completed brew in its accent.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, Tamagui, `react-native-svg`, `react-native-view-shot`, Jest 29, React Native Testing Library 14.

**Device evidence:** Reported from a physical iPhone on build 7 (v1.5.1). Diagnosis confirmed against the repository and `react-native-svg@15.15.4` iOS sources.

---

## Resolved values used throughout

These were measured, not assumed. Later tasks depend on them.

| Value | Resolves to | Source |
|---|---|---|
| Tamagui `$4` | `18` | `@tamagui/themes` `space.4.val` |
| `SCREEN_PADDING` | `18` | `constants/layout.ts` |
| `CAPTURE_MARGIN` | `12` | `components/BrewSummary.tsx` |
| `BAR_FLOOR` / `BAR_CAP` / `BAR_MAX` | `9` / `28` / `44` | `library/brew/bands.ts` |
| `GAP_FLOOR` / `GAP_CAP` / `GAP_MAX` | `3` / `20` / `34` | `library/brew/bands.ts` |
| `SUMMARY_BANDS` | `{barHeight: 28, rungGap: 20}` | `library/brew/bands.ts` |

---

## File map

| File | Responsibility |
|---|---|
| `constants/brewCopy.ts` | Own the longest sentence the now-card can ever show, derived from the sentence tables rather than restated. |
| `components/BrewNowCard.tsx` | Reserve that tallest sentence so the card's height cannot change between stages. |
| `components/__tests__/BrewNowCard.test.tsx` | Pin the reserve, and keep the live sentence unambiguous. |
| `components/BrewStageRung.tsx` | Accept and honour an accent-the-done-stages flag. |
| `components/__tests__/BrewStageRung.test.tsx` | Pin the accented colours. |
| `components/BrewStageLadder.tsx` | Pass the accent flag through to each rung. |
| `components/__tests__/BrewStageLadder.test.tsx` | Pin the pass-through and its default. |
| `app/brew.tsx` | Give `BrewSummary` the width it really has, and the height its ladder may grow into. |
| `app/__tests__/brew.test.tsx` | Pin the width arithmetic and the measured height. |
| `library/brew/bands.ts` | Grow summary rungs into a measured ladder height, never below today's bands. |
| `library/brew/__tests__/bands.test.ts` | Pin growth, the caps, and the unmeasured fallback. |
| `components/BrewSummary.tsx` | Measure its own non-ladder height, size the ladder from it, and accent a fully-completed brew. |
| `components/__tests__/BrewSummary.test.tsx` | Pin the measurement, the accent condition, and the unchanged capture padding. |
| `app/brewRecord.tsx` | Give the record screen the same measured height. Its width is already correct — do not change it. |
| `app/__tests__/brewRecord.test.tsx` | Pin the measured height on the record screen. |

---

### Task 1: Reserve the now-card's tallest sentence

The live ladder's rungs change height between stages. `BrewNowCard` sits below
`brew-band-region`, whose measured height feeds `allocateBands`. An agitated
stage's sentence is longer, wraps to more lines, and the card grows — so the
ladder shrinks for the duration of that stage and springs back on the next. On
a three-stage brew the swing is about 10 points of bar height.

The repository already solves exactly this in `BrewStageRung`: `widestReadout`
is rendered at `opacity: 0` in normal flow as `rung-readout-reserve`, with the
live value absolutely positioned over it, so a changing value cannot move
layout. Apply the same idiom here. The reserve is real text, so it wraps to the
true tallest height and scales with Dynamic Type, which a fixed `minHeight`
would not.

**Files:**
- Modify: `constants/brewCopy.ts`
- Modify: `components/BrewNowCard.tsx`
- Modify: `components/__tests__/BrewNowCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `components/__tests__/BrewNowCard.test.tsx`, add `LONGEST_NOW_SENTENCE` to
the existing import from `@/constants/brewCopy`, and add `PATTERN_SENTENCE` too:

```ts
import {StyleSheet} from "react-native";
import {AGITATION_SENTENCE, LONGEST_NOW_SENTENCE, PATTERN_SENTENCE}
    from "@/constants/brewCopy";
```

`DotMatrixText` composes its `style` into an array whose order is load-bearing
(`components/DotMatrixText.tsx:152`), so `props.style.opacity` reads `undefined`.
`StyleSheet.flatten` is the house idiom for this — see
`components/__tests__/BrewHistoryRow.test.tsx:38`. The file's own
`afterEach(cleanup)` owns teardown, so do not call `cleanup()` mid-test: racing
an async render triggers overlapping `act()` and empties the next test's screen.

Add these tests inside the existing `describe("BrewNowCard", ...)`:

```tsx
it("reserves the tallest sentence so the card cannot change height", async () => {
    const {getByTestId} = await renderWithProviders(
        <BrewNowCard pour={stage(POUR_PATTERN.CENTERED, 0)} accent={palette.brand}
                     resting={false} />
    );

    const reserve = getByTestId("brew-now-reserve", {includeHiddenElements: true});

    expect(reserve.props.children).toBe(LONGEST_NOW_SENTENCE);
    expect(StyleSheet.flatten(reserve.props.style).opacity).toBe(0);
});

it("reserves the same height for a stage that says the least", async () => {
    const short = await renderWithProviders(
        <BrewNowCard pour={stage(POUR_PATTERN.CENTERED, 0)} accent={palette.brand}
                     resting={false} />
    );
    const shortReserve = short.getByTestId("brew-now-reserve", {includeHiddenElements: true}).props.children;

    const talkative = new Pour(
        1, 70, 92, 40,
        AGITATION.BEFORE_ON_AFTER_ON, POUR_PATTERN.CIRCULAR, 20
    );
    const long = await renderWithProviders(
        <BrewNowCard pour={talkative} accent={palette.brand} resting={false} />
    );

    expect(long.getByTestId("brew-now-reserve", {includeHiddenElements: true}).props.children)
        .toBe(shortReserve);
});

it("draws the live sentence over the reserve, not beside it", async () => {
    const {getByTestId} = await renderWithProviders(
        <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                     resting={false} />
    );

    expect(getByTestId("brew-now-sentence").props.children)
        .toBe("Spiral pour, then it rests 20 s.");
});

it("says the longest sentence any stage could ask for", () => {
    expect(LONGEST_NOW_SENTENCE)
        .toContain(PATTERN_SENTENCE.circular);
    expect(LONGEST_NOW_SENTENCE)
        .toContain(AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_ON]);
    expect(LONGEST_NOW_SENTENCE).toContain("rests");
});
```

Now update the three existing sentence tests so they cannot match the reserve
as well as the live text. Replace the body assertions of
`"says the pattern in a sentence, and what happens after it"`,
`"does not promise a rest that the recipe does not ask for"` and
`"mentions the stirring, which the pour pattern never says"` so each reads the
live node by test ID instead of by text. For example, the third becomes:

```tsx
it("mentions the stirring, which the pour pattern never says", async () => {
    const stirred = new Pour(
        1, 70, 92, 40,
        AGITATION.BEFORE_ON_AFTER_ON, POUR_PATTERN.CIRCULAR, 0
    );
    const {getByTestId} = await renderWithProviders(
        <BrewNowCard pour={stirred} accent={palette.brand} resting={false} />
    );

    expect(getByTestId("brew-now-sentence").props.children)
        .toBe("Circular pour. Agitates the bed before and after pouring.");
});
```

Apply the same `getByTestId("brew-now-sentence")` change to the other two,
keeping their existing expected strings. Leave
`"names what the stage is doing, in the order the mockup had it"` and
`"shows nothing at all before a stage is live"` untouched: the heading is
unaffected, and the card still returns `null` before any reserve renders.

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
npx jest components/__tests__/BrewNowCard.test.tsx --runInBand
```

Expected: FAIL — `LONGEST_NOW_SENTENCE` is not exported, and neither
`brew-now-reserve` nor `brew-now-sentence` exists.

- [ ] **Step 3: Derive the longest sentence**

In `constants/brewCopy.ts`, directly below the `AGITATION_SENTENCE` table, add:

```ts
/**
 * The most a now-card can ever be asked to say.
 *
 * `BrewNowCard` renders this at `opacity: 0` to reserve its height, because
 * the card sits below the measured band region: a stage whose sentence wraps
 * to a third line steals that height from the ladder, and every rung in the
 * brew thins for the duration of that one stage.
 *
 * Derived from the tables rather than restated, so a longer sentence cannot be
 * added to one without the reserve growing with it. The rest is spelled with
 * three digits because that is the widest the byte format can carry.
 */
export const LONGEST_NOW_SENTENCE =
    `${PATTERN_SENTENCE.circular}, then it rests 000 s. `
    + AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_ON];
```

`PATTERN_SENTENCE.agitation` is longer, but `glyphForPattern` can never return
`agitation` for a pour — the key exists only to keep the table total — so
`circular` is the longest reachable pattern. If `AGITATION` is not already
imported in this file, import it from `@/library/Pour`.

- [ ] **Step 4: Reserve it in the card**

In `components/BrewNowCard.tsx`, add `LONGEST_NOW_SENTENCE` to the existing
import from `@/constants/brewCopy`, and add `View` to the `react-native`
import (add the import if the file has none).

Replace the sentence `DotMatrixText` with:

```tsx
<View>
    {/* Reserves the height; never read. The card sits below the measured
        band region, so a sentence that wraps to a third line takes that
        height out of the ladder and thins every rung in the brew. Real
        text, not a minHeight: it wraps to the true tallest height and
        scales with Dynamic Type. */}
    <DotMatrixText testID="brew-now-reserve" fontSize={11} color={palette.dim}
                   style={{opacity: 0}}>
        {LONGEST_NOW_SENTENCE}
    </DotMatrixText>
    <View style={{position: "absolute", top: 0, left: 0, right: 0}}>
        <DotMatrixText testID="brew-now-sentence" fontSize={11}
                       color={palette.dim}>
            {sentence}
        </DotMatrixText>
    </View>
</View>
```

Leave the heading `DotMatrixText` and the surrounding `YStack` exactly as they
are.

- [ ] **Step 5: Run the tests**

Run:

```bash
npx jest components/__tests__/BrewNowCard.test.tsx --runInBand
```

Expected: PASS, including the three rewritten sentence tests.

- [ ] **Step 6: Commit**

```bash
git add constants/brewCopy.ts components/BrewNowCard.tsx \
  components/__tests__/BrewNowCard.test.tsx
git commit -m "Hold the now card at its tallest sentence" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Fit the done summary inside the screen padding

`app/brew.tsx` hands `BrewSummary` the full window width while rendering it
inside the root `YStack`'s `padding="$4"`. `BrewSummary` subtracts only its own
capture padding, so the trace is laid out `2 × 18 = 36` points wider than the
box it sits in. It overflows right, reads as off-centre, and pushes
`BrewTrace`'s right-aligned amber overrun label past the ScrollView's clip —
which is the half-cut `+14 s`.

The record screen is already correct: its ScrollView has no horizontal padding,
so there the full width is the true width. Do not change it.

The export is unaffected. `ViewShot` captures `brew-capture`, whose layout
width comes from its parent, not from this prop; the prop only feeds
`traceWidth`. After the fix the PNG is the same width it always was, with its
own 30-point border and a trace that now fits inside it.

**Files:**
- Modify: `app/brew.tsx`
- Modify: `app/__tests__/brew.test.tsx`

- [ ] **Step 1: Write the failing test**

`app/__tests__/brew.test.tsx` already mocks and inspects child props in the
patterns this repository uses. Add a capture for the summary near the other
mocks at the top of the file:

```tsx
let summaryProps: Record<string, unknown> = {};
jest.mock("@/components/BrewSummary", () => {
    const actual = jest.requireActual("@/components/BrewSummary");
    return {
        __esModule: true,
        ...actual,
        default: (props: Record<string, unknown>) => {
            summaryProps = props;
            return actual.default(props);
        }
    };
});
```

If the file already mocks `@/components/BrewSummary`, extend that mock to
record `summaryProps` rather than adding a second one.

Add the test, in the describe block that drives the screen to `done`:

```tsx
it("gives the summary the width it actually has, not the whole window", async () => {
    await drawDone();

    // The done summary renders inside the root YStack's padding="$4" (18),
    // and BrewSummary subtracts only its own capture padding. Handed the
    // full window width it laid the trace out 36 points too wide, which
    // overflowed right and clipped the trace's overrun label.
    expect(summaryProps.width).toBe(WINDOW_WIDTH - SCREEN_PADDING * 2);
});
```

Use whatever the file already calls its done-state helper and its window width
constant; if there is no window width constant, read it from the same
`useWindowDimensions` mock the file already installs and name the expectation
against that value.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx jest app/__tests__/brew.test.tsx --runInBand
```

Expected: FAIL — the summary receives the full window width.

- [ ] **Step 3: Pass the real width**

In `app/brew.tsx`, in the `phase.name === "done"` branch, change:

```tsx
                        width={width}
```

to:

```tsx
                        // The summary sits inside this screen's own padding,
                        // so the width it may draw in is not the window's.
                        // Handed the window width it laid its trace out 36
                        // points too wide: it overflowed right, read as
                        // off-centre, and clipped the trace's right-aligned
                        // overrun label. The export is unaffected — ViewShot
                        // takes the capture's width from its parent, and this
                        // prop only sizes the trace inside it.
                        width={width - SCREEN_PADDING * 2}
```

`SCREEN_PADDING` is already imported and already used for the live trace two
lines below.

- [ ] **Step 4: Run the brew screen tests**

Run:

```bash
npx jest app/__tests__/brew.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/brew.tsx app/__tests__/brew.test.tsx
git commit -m "Fit the done summary inside the screen padding" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Grow summary rungs into the height they have

The summary's ladder is frozen at the two bands' soft caps — 28 and 20 — because
it renders inside a `ViewShot` with no measured height, where `flex: 1`
collapses. The live screen reaches 44 on a real phone, so the same brew reads
thinner once it is finished than it did while it ran.

Measure the height above the ladder inside the summary itself, subtract it from
the scroll viewport the screen measures, and offer the remainder to the rungs.
Growth only: the summary never goes below today's bands, so a tall brew simply
scrolls as it does now.

**Files:**
- Modify: `library/brew/bands.ts`
- Modify: `library/brew/__tests__/bands.test.ts`

- [ ] **Step 1: Write the failing tests**

In `library/brew/__tests__/bands.test.ts`, add `summaryBands` and the cap
constants to the existing import from `@/library/brew/bands`, then add:

```ts
describe("summaryBands", () => {
    it("keeps today's bands when nothing has been measured", () => {
        expect(summaryBands(0, 4)).toEqual(SUMMARY_BANDS);
    });

    it("keeps today's bands when there is no room to grow", () => {
        // Exactly the height today's bands already need.
        expect(summaryBands(4 * (BAR_CAP + GAP_CAP), 4)).toEqual(SUMMARY_BANDS);
    });

    it("never shrinks below today's bands, however little room there is", () => {
        expect(summaryBands(10, 9)).toEqual(SUMMARY_BANDS);
    });

    it("thickens the bars before it spreads the rungs", () => {
        // Room for eight more points per stage: the bars take it first.
        const bands = summaryBands(4 * (BAR_CAP + GAP_CAP) + 4 * 8, 4);

        expect(bands.barHeight).toBe(BAR_CAP + 8);
        expect(bands.rungGap).toBe(GAP_CAP);
    });

    it("spreads the rungs once the bars are at their ceiling", () => {
        // Far more room than the bars can absorb.
        const bands = summaryBands(4 * (BAR_CAP + GAP_CAP) + 4 * 40, 4);

        expect(bands.barHeight).toBe(BAR_MAX);
        expect(bands.rungGap).toBe(GAP_MAX);
    });

    it("never exceeds the ceilings the live screen obeys", () => {
        const bands = summaryBands(10000, 3);

        expect(bands.barHeight).toBe(BAR_MAX);
        expect(bands.rungGap).toBe(GAP_MAX);
    });

    it("keeps today's bands for a ladder with no stages", () => {
        expect(summaryBands(800, 0)).toEqual(SUMMARY_BANDS);
    });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
npx jest library/brew/__tests__/bands.test.ts --runInBand
```

Expected: FAIL — `summaryBands` is not exported.

- [ ] **Step 3: Implement the growth**

In `library/brew/bands.ts`, below `SUMMARY_BANDS`, add:

```ts
/**
 * The summary ladder's bands, grown into whatever height it has been given.
 *
 * `SUMMARY_BANDS` is the floor, not the answer: a summary that has room should
 * look like the live screen, which reaches `BAR_MAX` on a real phone, rather
 * than staying frozen at the soft caps and reading thinner once the brew is
 * over than it did while it ran.
 *
 * Growth only, in the same order `allocateBands` uses — bars before gaps. A
 * ladder with no room keeps today's bands and scrolls, which is what it
 * already does; nothing here can make a summary thinner than it is today.
 *
 * @param ladderHeight the height left for the rungs after everything above
 *                     them, or 0 when nothing has been measured yet
 * @param stages       how many rungs the ladder will draw
 */
export function summaryBands(
    ladderHeight: number, stages: number
): {barHeight: number; rungGap: number} {
    if (stages <= 0 || ladderHeight <= 0) return {...SUMMARY_BANDS};

    let slack = ladderHeight - stages * (BAR_CAP + GAP_CAP);
    if (slack <= 0) return {...SUMMARY_BANDS};

    const barMore = Math.min(BAR_MAX - BAR_CAP, Math.floor(slack / stages));
    slack -= barMore * stages;

    const gapMore = Math.min(GAP_MAX - GAP_CAP, Math.floor(slack / stages));

    return {barHeight: BAR_CAP + barMore, rungGap: GAP_CAP + gapMore};
}
```

- [ ] **Step 4: Run the bands tests**

Run:

```bash
npx jest library/brew/__tests__/bands.test.ts --runInBand
```

Expected: PASS, with every existing `allocateBands` test still green —
`summaryBands` adds a function and changes none.

- [ ] **Step 5: Commit**

```bash
git add library/brew/bands.ts library/brew/__tests__/bands.test.ts
git commit -m "Grow summary rungs into the height they have" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Accent a completed brew's ladder

Every rung on a finished summary is `state: "done"`, and `fillColour`,
`hatchColours` and `markColour` all return `palette.muted` when done — so the
whole ladder paints flat grey. On the live screen that grey is load-bearing: it
is what separates a finished stage from the one running. On a summary of a brew
that ran to the end there is nothing left to separate, so the grey buys nothing
and costs the recipe its colour.

Accent only a brew that completed in full. On an aborted summary the stage it
stopped on is still `active` and the ones after it still `pending`, and muting
the done stages is what makes that stopping point readable — so those keep
exactly today's appearance.

Stalls are unaffected: `fillColour` returns `palette.warn` before it ever
consults `done`, so an amber stall stays visible against accented rungs.

**Files:**
- Modify: `components/BrewStageRung.tsx`
- Modify: `components/__tests__/BrewStageRung.test.tsx`
- Modify: `components/BrewStageLadder.tsx`
- Modify: `components/__tests__/BrewStageLadder.test.tsx`

- [ ] **Step 1: Write the failing rung tests**

In `components/__tests__/BrewStageRung.test.tsx`, add:

```tsx
it("paints a done stage in the accent when the brew finished", async () => {
    const {getByTestId} = await draw({
        state: "done",
        delivered: 70,
        accentDone: true,
        pour: new Pour(
            1, 70, 93, 40,
            AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )
    });

    expect(StyleSheet.flatten(getByTestId("segment-fill-0").props.style)
        .backgroundColor).toBe(palette.brand);
    expect(getByTestId("rung-agitation-after-path").props.stroke).toEqual(
        expect.objectContaining({payload: processColor(palette.brand)})
    );
});

it("leaves a done stage grey by default, which is the live ladder", async () => {
    const {getByTestId} = await draw({state: "done", delivered: 70});

    expect(StyleSheet.flatten(getByTestId("segment-fill-0").props.style)
        .backgroundColor).toBe(palette.muted);
});

it("keeps a stall amber even on an accented ladder", async () => {
    const {getByTestId} = await draw({
        state: "done",
        delivered: 70,
        accentDone: true,
        stalls: [{atMl: 30, seconds: 8}]
    });

    expect(StyleSheet.flatten(getByTestId("segment-1").props.style)
        .backgroundColor).toBe(palette.warn);
});
```

The test file's `draw` helper must pass `accentDone` through to
`BrewStageRung`; add it to that helper's options with a default of `undefined`.
Use the file's existing accent — if `draw` already supplies one other than
`palette.brand`, expect that colour instead. Add `StyleSheet` to the
`react-native` import if it is missing.

- [ ] **Step 2: Run the rung tests and verify they fail**

Run:

```bash
npx jest components/__tests__/BrewStageRung.test.tsx --runInBand
```

Expected: FAIL — `BrewStageRung` has no `accentDone` prop, so a done stage is
grey in all three tests.

- [ ] **Step 3: Honour the flag in the rung**

In `components/BrewStageRung.tsx`, add to `Props`:

```ts
    /**
     * Paint a finished stage in the accent instead of grey.
     *
     * Off on the live ladder, where grey is what separates a stage that is
     * over from the one running. A summary of a brew that reached the end has
     * no such distinction left to draw, so the grey only costs the recipe its
     * colour.
     */
    accentDone?: boolean;
```

Add `accentDone = false` to the destructured parameter list.

Change `fillColour` and `hatchColours` to take the resolved colour rather than
the `done` flag, so the decision is made once:

```ts
/** The colour a segment's filled part takes. */
function fillColour(kind: Segment["kind"], stageColour: string): string {
    if (kind === "stall") return palette.warn;
    return stageColour;
}

/**
 * The two stripe colours for a wait.
 *
 * Faint across the whole wait from the moment the ladder is drawn, so the rests
 * in a recipe are visible before it runs and the ladder reads as a plan and not
 * only as a progress bar; accent over the part that has elapsed.
 */
function hatchColours(stageColour: string): {dim: string; bright: string} {
    return {dim: mix(stageColour, palette.base, HATCH_DIM), bright: stageColour};
}
```

In the component body, replace the `markColour` line with:

```ts
    // One decision, used by the bar, the hatch and the mark alike. A done
    // stage is grey on the live ladder and accented on a finished summary.
    const stageColour = done && !accentDone ? palette.muted : accent;
    const markColour = stageColour;
```

Update the three call sites: `hatchColours(accent, done)` becomes
`hatchColours(stageColour)`, and `fillColour(segment.kind, accent, done)`
becomes `fillColour(segment.kind, stageColour)`.

Leave `done` itself in place — it is still used by `markColour`'s definition
above and by nothing else after this change; if the linter reports it unused,
inline it into the `stageColour` expression rather than keeping a dead
binding.

- [ ] **Step 4: Run the rung tests**

Run:

```bash
npx jest components/__tests__/BrewStageRung.test.tsx --runInBand
```

Expected: PASS, with every existing colour test still green — the default
leaves the live ladder exactly as it was.

- [ ] **Step 5: Write the failing ladder test**

In `components/__tests__/BrewStageLadder.test.tsx`, add:

```tsx
it("passes the accent-done choice to every rung", async () => {
    const {getByTestId} = await drawLadder({
        activeIndex: 3,
        accentDone: true
    });

    expect(StyleSheet.flatten(
        within(getByTestId("rung-0")).getByTestId("segment-fill-0").props.style
    ).backgroundColor).toBe(palette.brand);
});

it("leaves the live ladder grey when nobody asks otherwise", async () => {
    const {getByTestId} = await drawLadder({activeIndex: 3});

    expect(StyleSheet.flatten(
        within(getByTestId("rung-0")).getByTestId("segment-fill-0").props.style
    ).backgroundColor).toBe(palette.muted);
});
```

Use the file's existing render helper and its existing three-or-more-stage
fixture, giving `activeIndex` a value past rung 0 so that rung is `done`. Add
`within`, `StyleSheet` and `palette` to the imports if missing, and make the
helper accept `accentDone`.

- [ ] **Step 6: Run the ladder test and verify it fails**

Run:

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx --runInBand
```

Expected: FAIL — the first test is grey, because the ladder drops the prop.

- [ ] **Step 7: Pass it through the ladder**

In `components/BrewStageLadder.tsx`, add to `Props`:

```ts
    /**
     * Paint finished stages in the accent rather than grey.
     *
     * The summary of a brew that ran to the end sets this: with no stage still
     * running there is no distinction for the grey to draw. Off everywhere
     * else, including every live ladder and every aborted summary.
     */
    accentDone?: boolean;
```

Add `accentDone = false` to the destructured parameters and pass
`accentDone={accentDone}` to `BrewStageRung` inside the `rows` map. The bypass
rung is not a stage and takes no such flag — leave `BrewBypassRung` alone.

- [ ] **Step 8: Run both component suites**

Run:

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx \
  components/__tests__/BrewStageRung.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/BrewStageRung.tsx components/BrewStageLadder.tsx \
  components/__tests__/BrewStageRung.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx
git commit -m "Let a finished ladder carry its accent" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Give the summary its measured ladder and its accent

Wire Tasks 3 and 4 into `BrewSummary`: measure the height above the ladder,
take the viewport height from the screen, and accent a brew that finished.

The measurement cannot loop. The viewport height is fixed by the screen, and
the measured chrome excludes the ladder, so growing the rungs cannot change
either input.

State is set from an `onLayout` event, not from an effect — `react-hooks/set-state-in-effect`
is an error in this repository.

**Files:**
- Modify: `components/BrewSummary.tsx`
- Modify: `components/__tests__/BrewSummary.test.tsx`
- Modify: `app/brew.tsx`
- Modify: `app/__tests__/brew.test.tsx`
- Modify: `app/brewRecord.tsx`
- Modify: `app/__tests__/brewRecord.test.tsx`

- [ ] **Step 1: Write the failing summary tests**

In `components/__tests__/BrewSummary.test.tsx`, extend the existing
`ladderProps` capture to record `accentDone` as well — it already spreads every
prop, so only the type annotation needs widening:

```ts
let ladderProps: {
    barHeight?: unknown; rungGap?: unknown; accentDone?: unknown;
} = {};
```

Add:

```tsx
it("keeps today's bands until anything has been measured", async () => {
    await draw({stagesUnavailable: false});

    expect(ladderProps.barHeight).toBe(28);
    expect(ladderProps.rungGap).toBe(20);
});

it("grows the rungs into the height the screen measured", async () => {
    const {getByTestId} = await draw({
        stagesUnavailable: false,
        availableHeight: 900
    });

    // The chrome above the ladder reports 300, leaving 600 - 2*30 of capture
    // padding for three stages: room for both bands to reach their ceilings.
    await act(async () => {
        fireEvent(getByTestId("summary-chrome"), "layout", {
            nativeEvent: {layout: {height: 300, width: 330, x: 0, y: 0}}
        });
    });

    expect(ladderProps.barHeight).toBe(44);
    expect(ladderProps.rungGap).toBe(34);
});

it("accents the ladder of a brew that reached its last stage", async () => {
    await draw({stagesUnavailable: false, activeIndex: 3});

    expect(ladderProps.accentDone).toBe(true);
});

it("leaves an aborted brew's ladder grey, so the stop still shows", async () => {
    await draw({stagesUnavailable: false, activeIndex: 1});

    expect(ladderProps.accentDone).toBe(false);
});
```

The file's `draw` helper must accept `availableHeight` and `activeIndex` and
forward them; give `activeIndex` the same default the helper uses today. The
fixture must have exactly three stages for the arithmetic above — if it does
not, use its real stage count and recompute: with `n` stages and a ladder
height of `h`, `barHeight` reaches 44 once `h >= n * (28 + 20) + n * 16`.
Add `act` and `fireEvent` to the `@testing-library/react-native` import.

- [ ] **Step 2: Run the summary tests and verify they fail**

Run:

```bash
npx jest components/__tests__/BrewSummary.test.tsx --runInBand
```

Expected: FAIL — `BrewSummary` takes no `availableHeight`, renders no
`summary-chrome`, and passes no `accentDone`.

- [ ] **Step 3: Measure and size in the summary**

In `components/BrewSummary.tsx`:

Add `useState` to the React import, `View` is already imported, and add
`summaryBands` to the import from `@/library/brew/bands` (keeping
`SUMMARY_BANDS` if it is still referenced; if it is not, drop it from the
import).

Add to `Props`:

```ts
    /**
     * The height the summary may draw in, from the screen's scroll viewport.
     *
     * Absent — or zero — keeps the frozen bands, which is what a caller that
     * has measured nothing gets. The ladder never grows past the ceilings the
     * live screen obeys, and never shrinks below the bands it has today.
     */
    availableHeight?: number;
```

Add `availableHeight = 0` to the destructured parameters.

Add this state and derivation immediately below the `traceWidth` line:

```tsx
    // Measured from an onLayout event, never an effect. Everything above the
    // ladder is one subtree, so its height is one reading; the ladder's own
    // height is excluded, which is what stops this feeding back on itself.
    const [chromeHeight, setChromeHeight] = useState(0);
    const ladderHeight = availableHeight === 0 || chromeHeight === 0
        ? 0
        : availableHeight - chromeHeight - (SCREEN_PADDING + CAPTURE_MARGIN) * 2;
    const bands = summaryBands(ladderHeight, stages.length);
```

Wrap everything from the `MarqueeText` down to and including `BrewFigures` in:

```tsx
            <View
                testID="summary-chrome"
                onLayout={(e) => setChromeHeight(e.nativeEvent.layout.height)}
            >
```

closing it after the `BrewFigures` element and before the
`<YStack marginTop="$3">` that holds the ladder.

Change the ladder's band props and add the accent:

```tsx
                    barHeight={bands.barHeight}
                    rungGap={bands.rungGap}
                    // A brew that reached its last stage has nothing left for
                    // grey to distinguish, so it wears the recipe's colour. An
                    // aborted one keeps grey: that is what makes the stage it
                    // stopped on readable.
                    accentDone={activeIndex === stages.length}
```

Keep the comment above those props that explains why the summary cannot call
`allocateBands`, updating its last sentence to say that the soft caps are now
the floor rather than the whole answer.

- [ ] **Step 4: Run the summary tests**

Run:

```bash
npx jest components/__tests__/BrewSummary.test.tsx --runInBand
```

Expected: PASS, including the existing capture-padding test, which is
untouched.

- [ ] **Step 5: Write the failing screen tests**

In `app/__tests__/brew.test.tsx`, add:

```tsx
it("gives the summary the height its scroller measured", async () => {
    const {getByTestId} = await drawDone();

    await act(async () => {
        fireEvent(getByTestId("done-scroll"), "layout", {
            nativeEvent: {layout: {height: 720, width: 354, x: 0, y: 0}}
        });
    });

    expect(summaryProps.availableHeight).toBe(720);
});
```

In `app/__tests__/brewRecord.test.tsx`, add the equivalent, using that file's
own render helper, its summary-prop capture (add one in the same shape as
`app/__tests__/brew.test.tsx`'s if it has none), and the record scroller's test
ID — read it from `app/brewRecord.tsx` rather than assuming `record-scroll`,
and give it that ID if it has none.

- [ ] **Step 6: Run the screen tests and verify they fail**

Run:

```bash
npx jest app/__tests__/brew.test.tsx app/__tests__/brewRecord.test.tsx --runInBand
```

Expected: FAIL — neither screen measures or passes a height.

- [ ] **Step 7: Measure the viewport on both screens**

In `app/brew.tsx`, add a height beside the existing `flexHeight` state:

```tsx
    const [doneHeight, setDoneHeight] = useState(0);
```

Use the file's existing `useState` import. On the done branch's `ScrollView`,
add the measurement and pass it on:

```tsx
                <ScrollView testID="done-scroll" style={{flex: 1}}
                            onLayout={(e) => setDoneHeight(e.nativeEvent.layout.height)}
                            contentContainerStyle={{flexGrow: 1}}>
```

and add to `BrewSummary`:

```tsx
                        availableHeight={doneHeight}
```

Make the same two changes in `app/brewRecord.tsx`, against its own scroller and
its own `BrewSummary`. Do **not** change the `width` it passes: that screen's
scroller has no horizontal padding, so the window width is already its true
width.

- [ ] **Step 8: Run both screen suites**

Run:

```bash
npx jest app/__tests__/brew.test.tsx app/__tests__/brewRecord.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/BrewSummary.tsx components/__tests__/BrewSummary.test.tsx \
  app/brew.tsx app/__tests__/brew.test.tsx \
  app/brewRecord.tsx app/__tests__/brewRecord.test.tsx
git commit -m "Size and colour the summary from what it was given" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Correct the stale bar-height documentation

`BrewStageRung`'s `barHeight` prop says "Between 9 and 15". That ceiling was
raised to 44 when the caps were thickened, and a reader sizing anything against
the comment would get it wrong — as this round's summary work nearly did.

**Files:**
- Modify: `components/BrewStageRung.tsx`

- [ ] **Step 1: Correct the comment**

In `components/BrewStageRung.tsx`, change:

```ts
    /** The elastic bar height. Between 9 and 15; the ladder decides. */
```

to:

```ts
    /** The elastic bar height. Between `BAR_FLOOR` and `BAR_MAX`; the ladder decides. */
```

- [ ] **Step 2: Commit**

```bash
git add components/BrewStageRung.tsx
git commit -m "Correct the stale bar height range" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Run repository validation

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the focused regression set**

Run:

```bash
npx jest components/__tests__/BrewNowCard.test.tsx \
  components/__tests__/BrewStageRung.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx \
  components/__tests__/BrewSummary.test.tsx \
  components/__tests__/BrewTrace.test.tsx \
  library/brew/__tests__/bands.test.ts \
  app/__tests__/brew.test.tsx \
  app/__tests__/brewRecord.test.tsx \
  constants/__tests__/brewCopy.test.ts --runInBand
```

Expected: PASS with no snapshots written.

- [ ] **Step 2: Run the complete CI-equivalent checks**

Run:

```bash
npm run typecheck && npm run lint && npm test -- --runInBand && npx expo-doctor
```

Expected: TypeScript exits 0; ESLint exits 0 with only the repository's
pre-existing `require()`-style warnings in test files; the complete Jest suite
passes; Expo Doctor reports every check passed.

There must be no worktree under the repository root while these run: ESLint and
Jest both scan it, which doubles the suite and exhausts the heap.

- [ ] **Step 3: Inspect the diff**

Run:

```bash
git diff --check
git status --short
git --no-pager diff --stat HEAD~6..HEAD
```

Expected: no whitespace errors, a clean tree, and changes confined to the file
map above.

---

### Task 8: Validate on a physical iPhone

**Files:**
- No committed source changes expected.

- [ ] **Step 1: Install the build**

Run:

```bash
npx expo run:ios --device iPhone14
```

The device must be unlocked. Expected: XBRW++ installs and launches.

- [ ] **Step 2: Confirm the ladder holds still**

Start a brew whose stages differ in agitation — at least one stage with
`agitates before and after` and one with none.

Expected: every rung keeps the same bar height from the first stage to the
last. Nothing thins or thickens as the stage changes.

- [ ] **Step 3: Confirm the finished summary fits and is accented**

Let a brew reach ENJOY.

Expected: the trace sits inside the screen with equal margins on both sides;
the amber overrun reading is fully legible, including its `s`; the ladder is
drawn in the recipe's accent colour, not grey; and its rungs are visibly
thicker than they were, without the summary needing to scroll on a short brew.

- [ ] **Step 4: Confirm an aborted brew still reads**

Cancel a brew part-way, then open it from history.

Expected: the completed stages are grey and the stage it stopped on still
stands out, exactly as before this change.

- [ ] **Step 5: Confirm the export**

Tap SAVE AS IMAGE on a finished brew.

Expected: the PNG has its border on every side, the trace fits inside it, and
the ladder matches what is on screen.

If any check fails, do not proceed: add a regression test for the observed
failure, fix it, and rerun Tasks 7 and 8.
