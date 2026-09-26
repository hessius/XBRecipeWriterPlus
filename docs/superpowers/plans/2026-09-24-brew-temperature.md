# Temperature on the Brew Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw each stage's water temperature on `BrewTrace`, live and in history, as a grey rule spanning that stage's pour on a band that adapts to the recipe's own range.

**Architecture:** All the arithmetic goes in a new pure module, `library/brew/tempBand.ts`, which knows nothing about React and is tested on its own. `BrewTrace` reads it and draws. One small addition to `DotMatrixText` exports Doto's family and drawn size for SVG text, so the font floor stays enforced in one place. No schema change, no new props on `BrewTrace`, no new dependency.

**Tech Stack:** TypeScript, React Native, `react-native-svg`, Jest with `jest-expo`, `@testing-library/react-native` v14.

**Spec:** `docs/superpowers/specs/2026-09-24-brew-temperature-design.md`
**Issue:** #140

---

## Before you start

Read the spec. The two constraints in it are not negotiable and are easy to
violate by accident:

- **Temperature is never measured.** It is a setpoint per stage. Do not
  interpolate, do not smooth, do not read it from `BrewSample` (it is not
  there).
- **No hue.** Everything drawn here is `palette.dim`. Do not introduce a colour.

Three codebase rules that will bite in this file specifically:

- The **React Compiler is enabled**. Do not write `useMemo` or `useCallback`.
  `BrewTrace` computes everything inline on each render and that is correct.
- **RNTL v14 `render` and `fireEvent` are async.** Always `await`
  `renderWithProviders`. Forget it and `screen` is empty and the test passes for
  the wrong reason.
- `DotMatrixText` is the single enforcement point for Doto's 11 px floor.
  Do not write `fontFamily: "Doto-Bold"` anywhere. Task 3 exists for this.

## File structure

| File | Responsibility |
| --- | --- |
| `library/brew/tempBand.ts` (new) | The band, and the geometry of every mark. Pure. No React, no SVG. |
| `library/brew/__tests__/tempBand.test.ts` (new) | Characterisation of the above. |
| `components/DotMatrixText.tsx` (modify) | Gains `dotMatrixSvgProps`, the SVG-text sibling of `dotMatrixTextProps`. |
| `components/BrewTrace.tsx` (modify) | Draws the marks. |
| `components/__tests__/BrewTrace.test.tsx` (modify) | Rendering assertions. |

`tempBand.ts` sits beside `brewShape.ts` and follows the same rule: pure
functions over `Pour[]` and a `Box`, so the chart and the tests cannot disagree
about where a mark goes.

---

### Task 1: The band

The vertical scale, derived from the recipe's own temperatures. This is the
whole reason the feature is readable, so it is first and it is tested hard.

**Files:**
- Create: `library/brew/tempBand.ts`
- Test: `library/brew/__tests__/tempBand.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/tempBand.test.ts`:

```ts
import {temperatureBand, BAND_MIN, BAND_MAX, MIN_SPAN} from "@/library/brew/tempBand";

describe("temperatureBand", () => {
    it("has no band without temperatures", () => {
        expect(temperatureBand([])).toBeUndefined();
    });

    it("pads and rounds outwards to five", () => {
        // 90..94 pads to 88..96, which rounds out to 85..100.
        expect(temperatureBand([94, 92, 90])).toEqual({min: 85, max: 100});
    });

    it("gives a flat recipe a band it can be drawn in", () => {
        // 93 alone would be a band of nothing. The floor is a 15 degree span.
        const band = temperatureBand([93, 93, 93]);
        expect(band!.max - band!.min).toBeGreaterThanOrEqual(MIN_SPAN);
        expect(band).toEqual({min: 85, max: 100});
    });

    it("never widens beyond the card's own range", () => {
        const band = temperatureBand([40]);
        expect(band!.min).toBeGreaterThanOrEqual(BAND_MIN);
        expect(band!.max).toBeLessThanOrEqual(BAND_MAX);
    });

    it("keeps the span when a clamp bites, by shifting", () => {
        // 40 pads to 38, below the floor. The band shifts up rather than
        // shrinking, or a cool tea recipe would be drawn flatter than a hot one.
        const band = temperatureBand([40]);
        expect(band!.max - band!.min).toBe(MIN_SPAN);
        expect(band!.min).toBe(BAND_MIN);
    });

    it("contains every temperature it was given", () => {
        for (const temps of [[94, 92, 90], [93], [60, 95], [39, 99], [85, 86]]) {
            const band = temperatureBand(temps)!;
            for (const t of temps) {
                expect(t).toBeGreaterThanOrEqual(band.min);
                expect(t).toBeLessThanOrEqual(band.max);
            }
        }
    });

    it("spans a wide recipe without a minimum getting in the way", () => {
        expect(temperatureBand([60, 95])).toEqual({min: 55, max: 100});
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/brew/__tests__/tempBand.test.ts`
Expected: FAIL, `Cannot find module '@/library/brew/tempBand'`.

- [ ] **Step 3: Write the module**

Create `library/brew/tempBand.ts`:

```ts
/**
 * The temperature band, and where each stage's mark sits inside it.
 *
 * Pure, and deliberately beside `brewShape.ts` rather than inside `BrewTrace`:
 * the chart and its tests must agree about where a mark goes, and a number
 * computed in a render body cannot be checked without rendering.
 *
 * A stage temperature is a **setpoint**, not a measurement. The machine never
 * reports temperature during a recipe brew, so nothing here interpolates and
 * nothing here varies between two brews of the same unedited recipe.
 */

/** The coolest and hottest a card can carry. Mirrors `cardLimits.TEMPERATURE`. */
export const BAND_MIN = 39;
export const BAND_MAX = 100;

/**
 * The narrowest band that may be drawn.
 *
 * A recipe that holds one temperature throughout would otherwise produce a band
 * of nothing, in which every mark sits at the same arbitrary height and the
 * rounding noise of a single degree fills the plot. Fifteen degrees is the
 * span a 94/92/90 recipe needs to read clearly, so a flat recipe gets the same
 * scale a stepped one would and the two look comparable.
 */
export const MIN_SPAN = 15;

/** Breathing room either side of the recipe's own extremes. */
const PAD = 2;

/** Bands land on fives, so the printed edge labels are numbers a person uses. */
const STEP = 5;

export type TempBand = {min: number; max: number};

/**
 * The band a set of stage temperatures should be drawn against.
 *
 * Adaptive rather than fixed because an honest axis over 39..99 draws every
 * coffee recipe as a flat line: a 94/92/90 spread lands under three pixels
 * apart. The cost of adapting is that heights are not comparable between two
 * recipes, which is why the caller must always print both edges.
 */
export function temperatureBand(temps: number[]): TempBand | undefined {
    if (temps.length === 0) return undefined;

    let min = Math.floor((Math.min(...temps) - PAD) / STEP) * STEP;
    let max = Math.ceil((Math.max(...temps) + PAD) / STEP) * STEP;

    if (max - min < MIN_SPAN) {
        const middle = (min + max) / 2;
        min = Math.floor((middle - MIN_SPAN / 2) / STEP) * STEP;
        max = min + MIN_SPAN;
    }

    // Shift rather than shrink. A band that gave up span at the edges would
    // draw a cool recipe flatter than a hot one for no reason but its position.
    if (min < BAND_MIN) {
        max += BAND_MIN - min;
        min = BAND_MIN;
    }
    if (max > BAND_MAX) {
        min = Math.max(min - (max - BAND_MAX), BAND_MIN);
        max = BAND_MAX;
    }

    return {min, max};
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest library/brew/__tests__/tempBand.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/tempBand.ts library/brew/__tests__/tempBand.test.ts
git commit -m "$(cat <<'EOF'
The temperature band

Adaptive, because an honest axis over the card's whole range draws every
coffee recipe as a flat line. A fifteen degree floor so a recipe that holds
one temperature still gets a scale.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

---

### Task 2: Where the marks go

The band converted into pixels, and one mark per stage clipped to its pour.

**Files:**
- Modify: `library/brew/tempBand.ts`
- Test: `library/brew/__tests__/tempBand.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/tempBand.test.ts`:

```ts
import {bandY, temperatureMarks, BAND_TOP, BAND_FLOOR, MIN_MARK_WIDTH}
    from "@/library/brew/tempBand";
import {stageSpans} from "@/library/brew/brewShape";
import Pour from "@/library/Pour";
import type {Box} from "@/library/brew/brewShape";

// 40 ml at 4.0 ml/s is a 10 s pour, then a 30 s pause; then 100 ml, 25 s, no
// pause. Planned 65 s.
const stepped = [
    new Pour(1, 40, 94, 40, 0, 0, 30),
    new Pour(2, 100, 90, 40, 0, 0, 0)
];
const box: Box = {width: 400, height: 200, maxT: 65, maxV: 140};

describe("bandY", () => {
    it("puts the band's top at the top of its region and its floor at the bottom", () => {
        const band = {min: 85, max: 100};
        expect(bandY(100, band, 200)).toBeCloseTo(200 * BAND_TOP);
        expect(bandY(85, band, 200)).toBeCloseTo(200 * BAND_FLOOR);
    });

    it("runs downward, because screen coordinates do", () => {
        const band = {min: 85, max: 100};
        expect(bandY(90, band, 200)).toBeGreaterThan(bandY(94, band, 200));
    });
});

describe("temperatureMarks", () => {
    it("draws one mark per stage", () => {
        expect(temperatureMarks(stepped, {min: 85, max: 100}, box)).toHaveLength(2);
    });

    it("stops each mark at the end of its pour, not the end of its stage", () => {
        const marks = temperatureMarks(stepped, {min: 85, max: 100}, box);
        const spans = stageSpans(stepped);
        // The first stage pours for 10 s of its 40 s. A mark that ran to the
        // stage boundary would claim a water temperature during the pause.
        expect(marks[0].x + marks[0].width)
            .toBeCloseTo((spans[0].pourEnd / box.maxT) * box.width, 1);
        expect(marks[0].x + marks[0].width)
            .toBeLessThan((spans[0].end / box.maxT) * box.width);
    });

    it("carries the temperature so the caller can print it", () => {
        const marks = temperatureMarks(stepped, {min: 85, max: 100}, box);
        expect(marks.map((m) => m.temperature)).toEqual([94, 90]);
    });

    it("keeps a tiny pour visible", () => {
        const rinse = [new Pour(1, 2, 94, 40, 0, 0, 300)];
        const wide: Box = {width: 400, height: 200, maxT: 300, maxV: 2};
        expect(temperatureMarks(rinse, {min: 85, max: 100}, wide)[0].width)
            .toBeGreaterThanOrEqual(MIN_MARK_WIDTH);
    });

    it("draws nothing without an axis", () => {
        expect(temperatureMarks(stepped, {min: 85, max: 100},
                                {...box, maxT: 0})).toEqual([]);
    });

    it("draws nothing without stages", () => {
        expect(temperatureMarks([], {min: 85, max: 100}, box)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/brew/__tests__/tempBand.test.ts`
Expected: FAIL, `bandY is not a function`.

- [ ] **Step 3: Implement**

Append to `library/brew/tempBand.ts`, and add the import at the top of the file:

```ts
import {stageSpans, type Box} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";
```

```ts
/**
 * The vertical region the band occupies, as fractions of the plot height.
 *
 * Fixed even though the degrees it spans are not, so the marks never wander
 * into the busy lower half where the water fill and the cup line live, and so
 * the 16 px fades have somewhere to finish.
 */
export const BAND_TOP = 0.05;
export const BAND_FLOOR = 0.45;

/**
 * The narrowest a mark may be drawn.
 *
 * A 5 ml rinse on a five minute recipe is a fraction of a pixel wide. Same
 * floor the bypass box already uses, for the same reason.
 */
export const MIN_MARK_WIDTH = 2;

export type TempMark = {
    x: number;
    width: number;
    y: number;
    temperature: number;
};

/** Where a temperature sits in the plot. Screen coordinates, so downward. */
export function bandY(temp: number, band: TempBand, height: number): number {
    const top = height * BAND_TOP;
    const floor = height * BAND_FLOOR;
    const span = band.max - band.min;
    if (span <= 0) return top;
    return top + ((band.max - temp) / span) * (floor - top);
}

/**
 * One mark per stage, spanning that stage's **pour only**.
 *
 * Not the whole stage: a stage is mostly waiting, and a mark drawn across the
 * wait asserts a water temperature at a moment when no water is moving. The
 * gaps between marks are therefore the pauses, which is the recipe's rhythm
 * drawn for free.
 */
export function temperatureMarks(
    stages: Pour[], band: TempBand, box: Box
): TempMark[] {
    if (stages.length === 0 || box.maxT <= 0) return [];
    return stageSpans(stages).map((span, i) => {
        const x = (span.start / box.maxT) * box.width;
        const end = (span.pourEnd / box.maxT) * box.width;
        return {
            x,
            width: Math.max(end - x, MIN_MARK_WIDTH),
            y: bandY(stages[i].temperature, band, box.height),
            temperature: stages[i].temperature
        };
    });
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest library/brew/__tests__/tempBand.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add library/brew/tempBand.ts library/brew/__tests__/tempBand.test.ts
git commit -m "$(cat <<'EOF'
Where a temperature mark goes

Clipped to the pour rather than the stage, so the chart never claims a water
temperature at a moment when no water is moving, and the gaps read as the
pauses.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

---

### Task 3: Doto inside an SVG

`BrewTrace` has no SVG text today, and the labels need some. Doto's floor is
enforced by `DotMatrixText`, which renders a React Native `<Text>` and cannot be
used inside an `<Svg>`. Rather than naming the font by hand at the call site,
extend the module that already owns this.

Note that `react-native-svg` text does **not** receive the OS font scale, so the
helper must apply the bounded scale itself. `drawnFontSize` already does exactly
that and is already exported for the same reason.

**Files:**
- Modify: `components/DotMatrixText.tsx`
- Test: `components/__tests__/DotMatrixText.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/DotMatrixText.test.tsx` (create the file with
the import block below if it does not exist):

```ts
import {dotMatrixSvgProps, drawnFontSize, DOTO_FAMILIES, DOTO_MIN_FONT_SIZE}
    from "@/components/DotMatrixText";

describe("dotMatrixSvgProps", () => {
    it("names a real Doto instance", () => {
        expect(dotMatrixSvgProps().fontFamily).toBe(DOTO_FAMILIES.bold);
    });

    it("honours the floor, since SVG text has no component to clamp it", () => {
        expect(dotMatrixSvgProps({fontSize: 6}).fontSize)
            .toBeGreaterThanOrEqual(DOTO_MIN_FONT_SIZE);
    });

    it("reports the drawn size, because SVG text is not scaled by the OS", () => {
        expect(dotMatrixSvgProps({fontSize: 11}).fontSize).toBe(drawnFontSize(11));
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/DotMatrixText.test.tsx -t dotMatrixSvgProps`
Expected: FAIL, `dotMatrixSvgProps is not a function`.

- [ ] **Step 3: Implement**

Add to `components/DotMatrixText.tsx`, directly below `dotMatrixTextProps`:

```ts
/**
 * Doto's style for the other thing that cannot be a `DotMatrixText`: text
 * inside an `<Svg>`.
 *
 * `react-native-svg` renders its own text node, so a chart label could not be
 * wrapped in this component and would otherwise name the family and the size by
 * hand — the moment the floor stops being enforced anywhere. Ask here instead.
 *
 * The size returned is the **drawn** size rather than the requested one.
 * Unlike a React Native `<Text>`, SVG text is not multiplied by the OS font
 * scale afterwards, so the bounded scale has to be baked in here or accessibility
 * sizing would pass the chart by.
 */
export function dotMatrixSvgProps(
    {fontSize = 14, weight = "bold"}: {fontSize?: number; weight?: DotoWeight} = {}
) {
    return {
        fontFamily: DOTO_FAMILIES[weight],
        fontSize: drawnFontSize(fontSize)
    };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest components/__tests__/DotMatrixText.test.tsx -t dotMatrixSvgProps`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/DotMatrixText.tsx components/__tests__/DotMatrixText.test.tsx
git commit -m "$(cat <<'EOF'
Doto inside an SVG

The chart needs labels and SVG text cannot be a DotMatrixText, so the module
that owns the font floor hands out the family and the drawn size rather than
letting a call site name them.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

---

### Task 4: The rules and their fades

The mark itself, drawn behind everything. Labels come in Task 5, so this task
ends with an unlabelled chart, which is correct and testable on its own.

**Files:**
- Modify: `components/BrewTrace.tsx`
- Test: `components/__tests__/BrewTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("BrewTrace", ...)` block in
`components/__tests__/BrewTrace.test.tsx`:

```ts
    it("draws a rule per stage, descending with the temperature", async () => {
        const descending = [
            new Pour(1, 40, 94, 40, 0, 0, 30),
            new Pour(2, 100, 92, 40, 0, 0, 20),
            new Pour(3, 100, 90, 40, 0, 0, 0)
        ];
        const {getByTestId} = await draw({pours: descending, plannedSeconds: 110});
        const y = (i: number) => getByTestId(`trace-temp-${i}`).props.y1;
        // Screen coordinates run downward, so a cooler stage sits lower.
        expect(y(1)).toBeGreaterThan(y(0));
        expect(y(2)).toBeGreaterThan(y(1));
    });

    it("draws a flat recipe as one height", async () => {
        const flat = [
            new Pour(1, 40, 93, 40, 0, 0, 30),
            new Pour(2, 100, 93, 40, 0, 0, 0)
        ];
        const {getByTestId} = await draw({pours: flat, plannedSeconds: 65});
        expect(getByTestId("trace-temp-1").props.y1)
            .toBeCloseTo(getByTestId("trace-temp-0").props.y1);
    });

    it("stops a rule at the end of its pour", async () => {
        // Stage 1 pours 40 ml at 4 ml/s, so 10 s of a 40 s stage. A rule that
        // ran to the stage boundary would cover the 30 s pause.
        const {getByTestId} = await draw({
            pours: [new Pour(1, 40, 94, 40, 0, 0, 30), new Pour(2, 100, 90, 40, 0, 0, 0)],
            plannedSeconds: 65,
            width: 260
        });
        const rule = getByTestId("trace-temp-0");
        // 10 s of 65 s across 260 px is 40 px. The stage ends at 40 s, 160 px.
        expect(rule.props.x2).toBeCloseTo(40, 0);
    });

    it("keeps a rinse pour visible", async () => {
        const {getByTestId} = await draw({
            pours: [new Pour(1, 2, 94, 40, 0, 0, 290), new Pour(2, 100, 90, 40, 0, 0, 0)],
            plannedSeconds: 315,
            width: 260
        });
        const rule = getByTestId("trace-temp-0");
        expect(rule.props.x2 - rule.props.x1).toBeGreaterThanOrEqual(2);
    });

    it("draws the rules in the label grey and nothing else", async () => {
        const {getByTestId} = await draw();
        expect(getByTestId("trace-temp-0").props.stroke).toEqual(
            expect.objectContaining({payload: processColor(palette.dim)})
        );
    });

    it("draws every rule before any water has moved", async () => {
        // Live, the whole temperature plan is known the moment the recipe is
        // sent, and is drawn from t=0 exactly as the plan line is. Nobody reads
        // the plan line as having happened, so a grey mark ahead of the water
        // already means intent in this chart.
        const {getByTestId} = await draw({
            pours: [
                new Pour(1, 40, 94, 40, 0, 0, 30),
                new Pour(2, 100, 90, 40, 0, 0, 0)
            ],
            samples: [],
            plannedSeconds: 65
        });
        expect(getByTestId("trace-temp-1")).toBeTruthy();
    });

    it("draws no rules for a record with no stages", async () => {
        // A brew written before `plan` existed. It draws as it always did.
        const {queryByTestId} = await draw({pours: [], plannedSeconds: 0});
        expect(queryByTestId("trace-temp-0")).toBeNull();
    });

    it("compact draws no temperature at all", async () => {
        const {queryByTestId} = await draw({compact: true});
        expect(queryByTestId("trace-temp-0")).toBeNull();
    });

    it("reads the temperature from the stages when there is no plan", async () => {
        // A summary hides the plan line by passing `pours={[]}` and supplies
        // `stages` separately. Reading `pours` alone would silently draw
        // nothing in history, which is the main place this is for.
        const {getByTestId} = await draw({
            pours: [],
            stages: [new Pour(1, 40, 94, 40, 0, 0, 0)],
            samples: samples([0, 0, 0], [10_000, 40, 20]),
            plannedSeconds: 0
        });
        expect(getByTestId("trace-temp-0")).toBeTruthy();
    });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/BrewTrace.test.tsx -t "rule per stage"`
Expected: FAIL, `Unable to find an element with testID: trace-temp-1`.

- [ ] **Step 3: Implement**

In `components/BrewTrace.tsx`, add to the imports:

```ts
import {temperatureBand, temperatureMarks} from "@/library/brew/tempBand";
```

Then, immediately after the `bypassBox` block and **before** `if (compact)`,
add:

```ts
    // The stages a temperature belongs to. `stages ?? pours` is the same
    // fallback the tap bounds use: a summary passes `pours={[]}` and supplies
    // `stages`, so reading `pours` alone would draw nothing in history.
    const tempStages = stages ?? pours;
    // Computed from the brew stages only. Never widened for the bypass: a 55
    // degree bypass would stretch the band far enough to put the brew's own
    // rules about five pixels apart, which is the whole readability of the
    // chart spent on one number that is not part of its thermal shape.
    const band = temperatureBand(tempStages.map((pour) => pour.temperature));
    const marks = band === undefined ? [] : temperatureMarks(tempStages, band, box);
```

Then, inside the `chart` SVG, between the gridlines block and the
`waterFill` block, add:

```tsx
                {!compact && marks.map((mark, i) => (
                    <React.Fragment key={`temp-${i}`}>
                        <Rect
                            testID={`trace-temp-fade-${i}`}
                            x={mark.x} y={mark.y}
                            width={mark.width} height={TEMP_FADE}
                            fill={`url(#tempFade-${i})`}
                        />
                        <Line
                            testID={`trace-temp-${i}`}
                            x1={mark.x} y1={mark.y}
                            x2={mark.x + mark.width} y2={mark.y}
                            stroke={palette.dim}
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                    </React.Fragment>
                ))}
```

Each fade needs its own gradient, because `react-native-svg` gradients in
`userSpaceOnUse` are positioned absolutely. Add these inside the existing
`<Defs>`, after the `waterFill` gradient:

```tsx
                    {!compact && marks.map((mark, i) => (
                        <LinearGradient
                            key={`tempFade-${i}`}
                            id={`tempFade-${i}`}
                            gradientUnits="userSpaceOnUse"
                            x1="0" y1={mark.y} x2="0" y2={mark.y + TEMP_FADE}
                        >
                            <Stop offset="0" stopColor={palette.dim}
                                  stopOpacity={TEMP_FADE_TOP} />
                            <Stop offset="1" stopColor={palette.dim} stopOpacity={0} />
                        </LinearGradient>
                    ))}
```

And add the two constants beside `FILL_TOP`:

```ts
/**
 * The fade beneath a temperature rule, and its opacity at the rule.
 *
 * A bare rule reads as a boundary; a rule with a little weight under it reads
 * as a body of water at a temperature. Short enough never to reach the water
 * fill, so the grey and the accent never mix.
 *
 * Not a filled column: a column encodes temperature twice, as a height and as
 * an area, and area is the louder of the two while meaning nothing at all. A
 * hot stage is not a bigger stage.
 */
const TEMP_FADE = 16;
const TEMP_FADE_TOP = 0.38;
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Mutation-check the pour clipping**

Temporarily change `span.pourEnd` to `span.end` in
`library/brew/temperatureMarks`. Run
`npx jest components/__tests__/BrewTrace.test.tsx -t "stops a rule"`.
Expected: FAIL. Revert the change and confirm it passes again. A test that
cannot fail is not a test.

- [ ] **Step 6: Commit**

```bash
git add components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx
git commit -m "$(cat <<'EOF'
Draw the temperature rules

One grey rule per stage, spanning the pour, behind every line. No hue: the
palette has none to spare and the one free blue collides with two accents.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

---

### Task 5: The readings and the band's edges

- [ ] **Step 1: Write the failing test**

Append inside `describe("BrewTrace", ...)`:

```ts
    it("prints every stage's temperature, repeating a flat one", async () => {
        const flat = [
            new Pour(1, 40, 93, 40, 0, 0, 30),
            new Pour(2, 100, 93, 40, 0, 0, 0)
        ];
        const {getAllByText} = await draw({pours: flat, plannedSeconds: 65});
        // Two stages at one temperature print two labels. The repetition is
        // honest and reads as "flat" instantly.
        expect(getAllByText("93°")).toHaveLength(2);
    });

    it("prints both ends of the band, since heights are not comparable between recipes", async () => {
        const {getByText} = await draw({
            pours: [new Pour(1, 40, 94, 40, 0, 0, 0), new Pour(2, 100, 90, 40, 0, 0, 0)],
            plannedSeconds: 35
        });
        expect(getByText("100")).toBeTruthy();
        expect(getByText("85")).toBeTruthy();
    });

    it("prints no band edges when there is nothing to scale", async () => {
        const {queryByText} = await draw({pours: [], plannedSeconds: 0});
        expect(queryByText("100")).toBeNull();
    });

    it("compact prints no readings", async () => {
        const {queryByText} = await draw({compact: true});
        expect(queryByText("93°")).toBeNull();
    });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/BrewTrace.test.tsx -t "prints every stage"`
Expected: FAIL, `Unable to find an element with text: 93°`.

- [ ] **Step 3: Implement**

Add to the `react-native-svg` import in `components/BrewTrace.tsx`:

```ts
import Svg, {Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText}
    from "react-native-svg";
```

And:

```ts
import {dotMatrixSvgProps, drawnFontSize} from "@/components/DotMatrixText";
```

Add the constants beside `TEMP_FADE`:

```ts
/**
 * The reading above each rule, and the band's own edge labels.
 *
 * Eleven is Doto's floor, which is also the smallest this reads at arm's length
 * on a phone. The label is allowed to overhang a very short rule: the space
 * beside it is a pause and is empty by construction, so there is nothing to
 * collide with, and trading the degree sign for width would cost more than it
 * saves.
 *
 * The edge labels are the same size, and not by choice: `DotMatrixText` will
 * not draw Doto below eleven points however small a size a call site asks for,
 * which is why the nine-point legend is really eleven too. Hierarchy here comes
 * from position rather than size, and that is the right answer anyway — a bar
 * whose scale is unstated is a lie, so the scale is not a footnote.
 *
 * Both are `palette.dim`. `palette.muted` is 4.12:1 on `base`, under AA, and
 * the palette documents it as not a text colour.
 */
const TEMP_LABEL = 11;
const TEMP_EDGE_LABEL = 11;
/** Clearance between a reading's baseline and the rule it labels. */
const TEMP_LABEL_GAP = 4;
```

Inside the chart, immediately after the rules block:

```tsx
                {!compact && marks.map((mark, i) => (
                    <SvgText
                        key={`temp-label-${i}`}
                        x={mark.x + mark.width / 2}
                        y={mark.y - TEMP_LABEL_GAP}
                        textAnchor="middle"
                        fill={palette.dim}
                        {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                    >
                        {`${mark.temperature}°`}
                    </SvgText>
                ))}
                {!compact && band !== undefined && (
                    <React.Fragment>
                        <SvgText
                            testID="trace-band-max"
                            x={width - 2}
                            y={svgHeight * BAND_TOP - TEMP_LABEL_GAP}
                            textAnchor="end"
                            fill={palette.dim}
                            {...dotMatrixSvgProps({fontSize: TEMP_EDGE_LABEL})}
                        >
                            {`${band.max}`}
                        </SvgText>
                        <SvgText
                            testID="trace-band-min"
                            x={width - 2}
                            y={svgHeight * BAND_FLOOR + drawnFontSize(TEMP_EDGE_LABEL)}
                            textAnchor="end"
                            fill={palette.dim}
                            {...dotMatrixSvgProps({fontSize: TEMP_EDGE_LABEL})}
                        >
                            {`${band.min}`}
                        </SvgText>
                    </React.Fragment>
                )}
```

Extend the `tempBand` import:

```ts
import {BAND_FLOOR, BAND_TOP, temperatureBand, temperatureMarks}
    from "@/library/brew/tempBand";
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx
git commit -m "$(cat <<'EOF'
Print the readings and the band's edges

Both edges always, because an adaptive band makes heights incomparable between
recipes and only the printed numbers stay true across them.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

---

### Task 6: The bypass

**Files:**
- Modify: `components/BrewTrace.tsx`
- Test: `components/__tests__/BrewTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe("BrewTrace", ...)`:

```ts
    const brewing = [
        new Pour(1, 40, 94, 40, 0, 0, 30),
        new Pour(2, 100, 90, 40, 0, 0, 0)
    ];

    it("gives a bypass inside the band the same mark as a stage", async () => {
        const {getByTestId} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 88, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(getByTestId("trace-temp-bypass")).toBeTruthy();
    });

    it("draws no rule for a bypass the band cannot hold", async () => {
        // 55 degrees against an 85..100 band. Widening to fit it would put the
        // brew's own rules about five pixels apart.
        const {queryByTestId, getByText} = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 55, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(queryByTestId("trace-temp-bypass")).toBeNull();
        // It still says how hot it was, in the box it already owns.
        expect(getByText("55°")).toBeTruthy();
    });

    it("never widens the band to admit a bypass", async () => {
        const cold = await draw({
            pours: brewing,
            plannedSeconds: 65,
            bypass: {volume: 60, temperature: 55, delivered: 60,
                     startedAt: 65, state: "done"}
        });
        expect(cold.getByTestId("trace-band-min").props.children).toBe("85");
    });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/BrewTrace.test.tsx -t bypass`
Expected: FAIL, `Unable to find an element with testID: trace-temp-bypass`.

- [ ] **Step 3: Implement**

In `components/BrewTrace.tsx`, after the `marks` line, add:

```ts
    /**
     * The bypass's own mark, when the band can hold it.
     *
     * The band is never widened to admit it: bypass water is usually far cooler
     * than brew water, and a 55 degree bypass would stretch the band enough to
     * put the brew's rules about five pixels apart. A rule whose whole meaning
     * is its height cannot be drawn off the scale, so when it does not fit it is
     * not drawn and the temperature is printed in the box instead.
     */
    const bypassMark = band === undefined || bypass === undefined
                       || bypassBox === undefined
                       || bypass.temperature < band.min
                       || bypass.temperature > band.max
        ? undefined
        : {
            x: bypassBox.x,
            width: bypassBox.width,
            y: bandY(bypass.temperature, band, svgHeight),
            temperature: bypass.temperature
        };
```

Extend the import again:

```ts
import {bandY, BAND_FLOOR, BAND_TOP, temperatureBand, temperatureMarks}
    from "@/library/brew/tempBand";
```

Add the gradient to `<Defs>`, after the per-mark gradients:

```tsx
                    {!compact && bypassMark && (
                        <LinearGradient
                            id="tempFade-bypass"
                            gradientUnits="userSpaceOnUse"
                            x1="0" y1={bypassMark.y} x2="0" y2={bypassMark.y + TEMP_FADE}
                        >
                            <Stop offset="0" stopColor={palette.dim}
                                  stopOpacity={TEMP_FADE_TOP} />
                            <Stop offset="1" stopColor={palette.dim} stopOpacity={0} />
                        </LinearGradient>
                    )}
```

And to the chart, immediately after the stage labels block:

```tsx
                {!compact && bypassMark && (
                    <React.Fragment>
                        <Rect
                            x={bypassMark.x} y={bypassMark.y}
                            width={bypassMark.width} height={TEMP_FADE}
                            fill="url(#tempFade-bypass)"
                        />
                        <Line
                            testID="trace-temp-bypass"
                            x1={bypassMark.x} y1={bypassMark.y}
                            x2={bypassMark.x + bypassMark.width} y2={bypassMark.y}
                            stroke={palette.dim}
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                        <SvgText
                            x={bypassMark.x + bypassMark.width / 2}
                            y={bypassMark.y - TEMP_LABEL_GAP}
                            textAnchor="middle"
                            fill={palette.dim}
                            {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                        >
                            {`${bypassMark.temperature}°`}
                        </SvgText>
                    </React.Fragment>
                )}
                {!compact && bypassBox && bypass && bypassMark === undefined
                 && band !== undefined && (
                    <SvgText
                        testID="trace-bypass-temp"
                        x={bypassBox.x + bypassBox.width / 2}
                        y={bypassBox.y + bypassBox.height / 2
                           + drawnFontSize(TEMP_LABEL) / 3}
                        textAnchor="middle"
                        fill={palette.dim}
                        {...dotMatrixSvgProps({fontSize: TEMP_LABEL})}
                    >
                        {`${bypass.temperature}°`}
                    </SvgText>
                )}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mutation-check the band guard**

Temporarily include the bypass temperature in the `temperatureBand` argument:
`[...tempStages.map((p) => p.temperature), bypass?.temperature ?? 90]`. Run
`npx jest components/__tests__/BrewTrace.test.tsx -t "never widens"`.
Expected: FAIL. Revert and confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx
git commit -m "$(cat <<'EOF'
The bypass gets a mark when the band can hold it

Inside the band it is a stage like any other. Outside it, it keeps its number
and loses its rule, because widening the band for a cool bypass would spend the
chart's whole readability on a number that is not part of its thermal shape.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

---

### Task 7: Saying it out loud

The shape is the point of this feature, and a screen reader cannot see a shape.

**Files:**
- Modify: `components/BrewTrace.tsx`
- Test: `components/__tests__/BrewTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe("BrewTrace", ...)`:

```ts
    it("says the temperature run out loud", async () => {
        const {getByLabelText} = await draw({
            pours: [
                new Pour(1, 40, 94, 40, 0, 0, 30),
                new Pour(2, 100, 90, 40, 0, 0, 0)
            ],
            plannedSeconds: 65
        });
        expect(getByLabelText("Brew trace, 94 then 90 degrees")).toBeTruthy();
    });

    it("says only what it is when there is no temperature to say", async () => {
        const {getByLabelText} = await draw({pours: [], plannedSeconds: 0});
        expect(getByLabelText("Brew trace")).toBeTruthy();
    });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/BrewTrace.test.tsx -t "out loud"`
Expected: FAIL, no element with that label.

- [ ] **Step 3: Implement**

In `components/BrewTrace.tsx`, after the `bypassMark` block:

```ts
    // The marks exist so the thermal shape can be read without tapping
    // anything, which a screen reader cannot do at all. The bypass is left out:
    // it is not part of the brew's shape and it is named in the breakdown.
    const spoken = marks.length === 0
        ? "Brew trace"
        : `Brew trace, ${marks.map((m) => m.temperature).join(" then ")} degrees`;
```

Replace both `accessibilityLabel="Brew trace"` on the `<Svg>` elements (the
compact one and the full one) with `accessibilityLabel={spoken}`, and the
`Pressable`'s `accessibilityLabel="Brew trace, tap a stage"` with:

```tsx
                    accessibilityLabel={`${spoken}. Tap a stage`}
```

Note that `marks` is empty in compact mode only if there are no stages, so
compact keeps the spoken temperatures even though it draws none. That is
deliberate: the thumbnail is still a chart of the same brew, and a reader that
cannot see either version should hear the same thing.

Implementation note from review: the snippet above cannot sit after the compact
early return, because compact would return before `spoken` exists. Compute the
brew-stage band and marks before that return, derive `spoken` from those drawn
marks, and still leave the bypass out of the spoken temperature run.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Fix the existing label assertions**

Run: `npx jest components/__tests__/BrewTrace.test.tsx app/__tests__/brew.test.tsx components/__tests__/BrewSummary.test.tsx`
Any test that queried `getByLabelText("Brew trace")` on a chart that now has
stages will fail. Update those queries to the new label. Do **not** weaken the
new label to make an old test pass.

- [ ] **Step 6: Commit**

```bash
git add components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx
git commit -m "$(cat <<'EOF'
Say the temperature run out loud

The marks exist so the shape can be read without tapping anything, which is
exactly what a screen reader cannot do.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

---

### Task 8: The whole thing, green

- [ ] **Step 1: Full test run**

Run: `npm test`
Expected: PASS. Anything red is yours; fix it rather than skipping it.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors. There are 17 pre-existing warnings; do not add an
eighteenth. In particular check that no `useMemo` or `useCallback` crept in, and
that `react-hooks/purity` is clean.

- [ ] **Step 4: Doctor**

Run: `npx expo-doctor`
Expected: 21/21. This is a hard failure in CI.

- [ ] **Step 5: Look at it on a device**

NFC is not involved here, so a simulator is enough for the chart itself, but the
font floor and the label overhang are both real-device questions.

Run: `npm run ios` and open a recipe with a stepped temperature, brew it or open
a stored brew, and check three things.

1. The readings are legible at arm's length.
2. A label that overhangs a short pour does not look like a bug.
3. The water line crossing a late label in the last third of a brew is
   tolerable. The spec accepts this; if it is not tolerable, the fix is to nudge
   the affected label to the other side of its rule, not to move the band.

- [ ] **Step 6: Commit anything the device pass changed**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Device pass on the temperature marks

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
)"
```

- [ ] **Step 7: Open the pull request**

```bash
gh pr create -R hessius/XBRecipeWriterPlus \
  --title "Temperature on the brew graph" \
  --body "Closes #140. Design: \`docs/superpowers/specs/2026-09-24-brew-temperature-design.md\`."
```

---

## Notes for whoever picks this up

**Do not reconcile `PourProfile` with this.** That component divides time evenly
between pours on purpose, because the card's silhouette is an identifying mark
rather than a chart. Both files carry a comment saying so. Temperature does not
go on it.

**Do not add a setting to hide the marks.** Every toggle is a branch to test
forever, and these are quiet enough not to need one.

**If a test needs to inspect a child component's props, it is the wrong test.**
RNTL v14 removed `UNSAFE_getAllByType` and `root.findAllByType`. Assert on what
the renderer produced: text, test IDs, accessible labels.
