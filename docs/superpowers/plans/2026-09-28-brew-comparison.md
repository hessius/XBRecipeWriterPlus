# Brew Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user put two brews of one recipe side by side, overlaid on the real-seconds axis, and see where they diverged.

**Architecture:** A pure comparison module (`library/brew/compare.ts`) computes everything; a new `CompareTrace` draws the overlay while SEPARATE mode reuses `BrewTrace compact`; a shared `traceStyle.ts` holds the drawing grammar so the two charts cannot drift. Route `app/brewCompare.tsx` is layout only, reached from the brew history selection row and from a brew record.

**Tech Stack:** TypeScript, React Native, Expo Router, Tamagui, react-native-svg, Jest with jest-expo, @testing-library/react-native v14.

**Spec:** `docs/superpowers/specs/2026-09-28-brew-comparison-design.md`

---

## Rules that apply to every task

- Run commands from the worktree root.
- `@/` maps to the repo root. Import as `@/library/brew/compare`, never relatively.
- All colour comes from `constants/colors.ts`. No hex literals, no named CSS colours.
- No em dashes in user-facing copy, and avoid dashes generally. Code comments and docs may use them.
- Component tests **must** `await renderWithProviders(...)` from `@/test-utils/render`, and must `await fireEvent...`. RNTL v14 render and fireEvent are async; forget the await and the test passes for the wrong reason.
- RNTL v14 has no `UNSAFE_getAllByType` and no `root.findAllByType`. Assert on testIDs, text and accessible labels. Props of a **host** element found by testID (an SVG `Path`, for example) are readable via `getByTestId("x").props`.
- The React Compiler is on. Do not hand-write `useMemo` or `useCallback`. Do not read whole `props` inside a hook.
- Declare components at module scope, never inside another component body.

## File structure

**Create**

| File | Responsibility |
|---|---|
| `library/brew/traceStyle.ts` | The drawing grammar: stroke widths, dash patterns, colour resolvers, and the subject/reference role modifier. Appearance only; geometry stays in `brewShape.ts`. |
| `library/brew/compare.ts` | Pure comparison: pour verdict, plan drift grade, ledger rows, cup gap. No React. |
| `components/TraceLegend.tsx` | One legend item, promoted out of `BrewTrace` so both charts name channels identically. |
| `components/CompareTrace.tsx` | OVERLAY mode only. |
| `components/CompareTable.tsx` | The differences ledger. |
| `components/CompareWithSheet.tsx` | The picker on the brew record. |
| `app/brewCompare.tsx` | Layout only. |

**Modify**

| File | Change |
|---|---|
| `components/BrewTrace.tsx` | Read appearance from `traceStyle`, use `TraceLegend`, accept an optional `axis` override. |
| `constants/brewCopy.ts` | The four verdict readings and the degradation copy. |
| `app/brewHistory.tsx` | COMPARE in the selection row. |
| `app/brewRecord.tsx` | COMPARE WITH control. |

---

## Task 1: The drawing grammar module

`BrewTrace` hard-codes its stroke widths and dash patterns at each use. Extract them so a second chart cannot disagree. The values below are exactly what `BrewTrace` draws today, read off lines 300 to 560 of the current file, so this task changes no pixels.

Note one existing inconsistency that this task settles: the compact cup path sets `strokeLinecap="round"` and the full-size one does not. Both get `round`, which is what the compact path (the one a user sees at a glance in `BrewMiniBar`) already chose.

**Files:**
- Create: `library/brew/traceStyle.ts`
- Create: `library/brew/__tests__/traceStyle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/__tests__/traceStyle.test.ts
import {accents, cupLineFor, palette} from "@/constants/colors";
import {channelStyle, referenceCupColour, referenceWaterColour}
    from "@/library/brew/traceStyle";

const ACCENT = accents.coffee[1];

describe("traceStyle", () => {
    it("draws water solid, thick, in the accent", () => {
        expect(channelStyle("water", {accent: ACCENT})).toEqual({
            stroke:          ACCENT,
            strokeWidth:     2.5,
            strokeDasharray: undefined,
            strokeLinecap:   "round",
            strokeLinejoin:  "round"
        });
    });

    it("turns the water line amber while overflow protection holds it", () => {
        expect(channelStyle("water", {accent: ACCENT, holding: true}).stroke)
            .toBe(palette.warn);
    });

    it("draws cup dotted, in the accent's complement", () => {
        expect(channelStyle("cup", {accent: ACCENT})).toEqual({
            stroke:          cupLineFor(ACCENT),
            strokeWidth:     2,
            strokeDasharray: "1 3",
            strokeLinecap:   "round",
            strokeLinejoin:  undefined
        });
    });

    it("draws the plan grey and dashed", () => {
        expect(channelStyle("plan", {accent: ACCENT})).toEqual({
            stroke:          palette.muted,
            strokeWidth:     1.5,
            strokeDasharray: "4 4",
            strokeLinecap:   undefined,
            strokeLinejoin:  undefined
        });
    });

    it("keeps the plan's dashes but lets a caller fuse them", () => {
        expect(channelStyle("plan", {accent: ACCENT, dashed: false}).strokeDasharray)
            .toBeUndefined();
    });

    it("greys the reference brew without changing its line style", () => {
        const subject = channelStyle("cup", {accent: ACCENT});
        const reference = channelStyle("cup", {accent: ACCENT, role: "reference"});
        expect(reference.stroke).toBe(referenceCupColour);
        expect(reference.strokeWidth).toBe(subject.strokeWidth);
        expect(reference.strokeDasharray).toBe(subject.strokeDasharray);
    });

    it("gives the reference cup the brighter grey, because cup leads", () => {
        expect(referenceCupColour).toBe(palette.dim);
        expect(referenceWaterColour).toBe(palette.muted);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/brew/__tests__/traceStyle.test.ts`
Expected: FAIL, "Cannot find module '@/library/brew/traceStyle'".

- [ ] **Step 3: Write the module**

```ts
// library/brew/traceStyle.ts
import {cupLineFor, palette} from "@/constants/colors";

/**
 * What the lines on a brew chart look like.
 *
 * Companion to `brewShape.ts`, which says where they go. The split matters
 * because two components draw these channels now: `BrewTrace` for one brew and
 * `CompareTrace` for two. A dash pattern that lives at its use site can be
 * retuned in one of them and not the other, and the two screens then disagree
 * about what dotted means.
 *
 * Same rule as `constants/colors.ts` and `constants/motion.ts`: a value that is
 * not in the module cannot take part when the thing is retuned.
 *
 * KEEP IN STEP WITH: `components/BrewTrace.tsx`, `components/CompareTrace.tsx`.
 */

export type Channel = "water" | "cup" | "plan";

/** Which of the two brews a line belongs to. Only `CompareTrace` sets this. */
export type Role = "subject" | "reference";

/**
 * The greys the reference brew borrows.
 *
 * Two different greys, and not interchangeable: the comparison screen is about
 * the cup, so the cup keeps the brighter one. Both clear the 3:1 floor for a
 * non-text graphic on `base`.
 */
export const referenceCupColour = palette.dim;
export const referenceWaterColour = palette.muted;

export type ChannelStyle = {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string | undefined;
    strokeLinecap: "round" | undefined;
    strokeLinejoin: "round" | undefined;
};

export type ChannelInput = {
    accent: string;
    /** Overflow protection has stopped the water. Water only. */
    holding?: boolean;
    /** False once the recipe is in the machine and the plan's dashes fuse. */
    dashed?: boolean;
    role?: Role;
};

export function channelStyle(
    channel: Channel,
    {accent, holding = false, dashed = true, role = "subject"}: ChannelInput
): ChannelStyle {
    const reference = role === "reference";
    switch (channel) {
        case "water":
            return {
                stroke: reference ? referenceWaterColour
                    : holding ? palette.warn : accent,
                strokeWidth:     2.5,
                strokeDasharray: undefined,
                strokeLinecap:   "round",
                strokeLinejoin:  "round"
            };
        case "cup":
            return {
                stroke:          reference ? referenceCupColour : cupLineFor(accent),
                strokeWidth:     2,
                strokeDasharray: "1 3",
                strokeLinecap:   "round",
                strokeLinejoin:  undefined
            };
        case "plan":
            return {
                stroke:          palette.muted,
                strokeWidth:     1.5,
                strokeDasharray: dashed ? "4 4" : undefined,
                strokeLinecap:   undefined,
                strokeLinejoin:  undefined
            };
    }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/traceStyle.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/traceStyle.ts library/brew/__tests__/traceStyle.test.ts
git commit -m "Extract the brew chart's drawing grammar

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: BrewTrace reads the grammar

Refactor only. `BrewTrace`'s existing tests are the safety net and must stay green untouched.

**Files:**
- Modify: `components/BrewTrace.tsx`
- Test: `components/__tests__/BrewTrace.test.tsx` (unchanged, run as a regression check)

- [ ] **Step 1: Record the baseline**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS. Write the test count down; it must not change.

- [ ] **Step 2: Import the grammar**

Add to the imports in `components/BrewTrace.tsx`:

```tsx
import {channelStyle} from "@/library/brew/traceStyle";
```

- [ ] **Step 3: Derive the three styles once, beside `cupColour`**

`cupColour` is currently derived near the `cupPath` assignment, with a comment saying it is hoisted so the compact render, the full render and the legend cannot drift. Replace that single derivation with three:

```tsx
    // Derived here rather than at each use so the compact render, the full
    // render and the legend cannot drift apart. From `traceStyle` rather than
    // inline so that `CompareTrace` cannot drift from either.
    const waterStyle = channelStyle("water", {accent, holding});
    const cupStyle = channelStyle("cup", {accent});
    const planStyle = channelStyle("plan", {accent, dashed: planDashed});
    const cupColour = cupStyle.stroke;
```

Keep `cupColour`: the legend and the temperature code already read it.

- [ ] **Step 4: Spread the styles at all four path sites**

There are two `trace-cup` paths (compact and full), two `trace-water` paths, and two `trace-plan` paths. Replace the hard-coded attributes with a spread, keeping `testID`, `d`, `fill` and, on the plan, `strokeOpacity`:

```tsx
                {planPath !== "" && (
                    <Path
                        testID="trace-plan"
                        d={planPath}
                        strokeOpacity={planOpacity}
                        fill="none"
                        {...planStyle}
                    />
                )}
                {cupPath !== "" && (
                    <Path testID="trace-cup" d={cupPath} fill="none" {...cupStyle} />
                )}
                {waterPath !== "" && (
                    <Path testID="trace-water" d={waterPath} fill="none" {...waterStyle} />
                )}
```

Leave `trace-head` and `trace-bypass` alone: the travelling head and the bypass box are not channels and `CompareTrace` does not draw them.

- [ ] **Step 5: Run the regression check**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS, the same test count as Step 1, zero test files changed.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add components/BrewTrace.tsx
git commit -m "Draw BrewTrace's channels from the grammar module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: A shared legend, and a shared axis

Two small additions to `BrewTrace` that the comparison screen needs. `TraceLegend` is `LegendItem` lifted out verbatim. `axis` lets two lanes share a scale, which is the difference between a comparison and two unrelated charts.

**Files:**
- Create: `components/TraceLegend.tsx`
- Modify: `components/BrewTrace.tsx`
- Test: `components/__tests__/BrewTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/BrewTrace.test.tsx`:

```tsx
describe("a shared axis", () => {
    it("sizes itself to its own run when no axis is given", async () => {
        const {getByTestId} = await draw({
            compact: true,
            samples: samples([0, 0, 0], [35, 200, 180])
        });
        const path = getByTestId("trace-water").props.d as string;
        // The run reaches the right-hand edge, because the axis was sized to it.
        expect(path.endsWith("300 0")).toBe(true);
    });

    it("draws short when handed a wider axis", async () => {
        const {getByTestId} = await draw({
            compact: true,
            samples: samples([0, 0, 0], [35, 200, 180]),
            axis: {maxT: 70, maxV: 400}
        });
        const path = getByTestId("trace-water").props.d as string;
        // Half the time and half the water, so half the box in each direction.
        expect(path.endsWith("150 70")).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/BrewTrace.test.tsx -t "a shared axis"`
Expected: FAIL. The first case passes, the second does not, because `axis` is ignored.

- [ ] **Step 3: Add the prop**

In the `Props` type in `components/BrewTrace.tsx`:

```tsx
    /**
     * An axis imposed from outside, overriding the self-sizing below.
     *
     * Only the comparison screen sets it. Two lanes stacked one above the
     * other are not a comparison unless they share a scale: the same 30 second
     * mark has to be at the same x in both, and the same 200 ml at the same y.
     * Absent, the box is sized to the longer of the plan and the run, which is
     * what every other caller wants.
     */
    axis?: {maxT: number; maxV: number};
```

Add `axis` to the destructured parameter list.

- [ ] **Step 4: Honour it**

Replace the `box` assignment:

```tsx
    const box: Box = {
        width,
        height: svgHeight,
        maxT: axis?.maxT ?? Math.max(plannedSeconds, ranTo, bypassFrom + bypassWide),
        maxV: axis?.maxV ?? Math.max(
            planTop,
            water.length > 0 ? water[water.length - 1].v : 0,
            planTop + bypassMl
        )
    };
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest components/__tests__/BrewTrace.test.tsx`
Expected: PASS, two more tests than before.

- [ ] **Step 6: Promote the legend item**

Create `components/TraceLegend.tsx` with the body of `LegendItem` moved out of `BrewTrace.tsx` unchanged, plus the constant it reads:

```tsx
import React from "react";
import Svg, {Line} from "react-native-svg";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

/** Point size of a legend label. */
export const LEGEND_SIZE = 9;

/**
 * One entry in a brew chart's legend.
 *
 * Beneath the graph rather than over it. Top-left is clear at the end of a
 * brew but sits on the plan dashes at the start, so overlaying it trades one
 * legibility problem for another; a dedicated row costs 14 pt and never
 * collides with anything.
 *
 * Shared by `BrewTrace` and `CompareTrace` so that the two charts cannot name
 * the same channel differently.
 */
export default function TraceLegend({colour, label, dashed = false, dotted = false}: {
    colour: string; label: string; dashed?: boolean; dotted?: boolean;
}) {
    return (
        <XStack alignItems="center" gap="$1.5">
            <Svg width={14} height={6}>
                <Line
                    x1={0} y1={3} x2={14} y2={3}
                    stroke={colour}
                    strokeWidth={2}
                    strokeDasharray={dashed ? "3 3" : dotted ? "1 3" : undefined}
                />
            </Svg>
            <DotMatrixText fontSize={LEGEND_SIZE} weight="bold" letterSpacing={1.2}
                           color={palette.dim}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}
```

In `BrewTrace.tsx`: delete the local `LegendItem` function and the local `const LEGEND_SIZE = 9;`, import `TraceLegend, {LEGEND_SIZE}` from `@/components/TraceLegend`, and rename the three `<LegendItem .../>` uses to `<TraceLegend .../>`.

- [ ] **Step 7: Run the regression check, typecheck, commit**

```bash
npx jest components/__tests__/BrewTrace.test.tsx
npm run typecheck
git add components/TraceLegend.tsx components/BrewTrace.tsx components/__tests__/BrewTrace.test.tsx
git commit -m "Let a brew trace take an axis, and share its legend

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: The pour verdict

The first half of `library/brew/compare.ts`. Measured on events and totals rather than on curve divergence: the scale carries a 0.5 ml noise floor, a brew that stalled and recovered can still finish inside a curve envelope, and "neither brew was interrupted and both delivered the same water" is a sentence a user can argue with.

**Files:**
- Create: `library/brew/compare.ts`
- Create: `library/brew/__tests__/compare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// library/brew/__tests__/compare.test.ts
import type {StoredBrew} from "@/library/BrewDatabase";
import {COMPARE_TIME_TOLERANCE_SECONDS, COMPARE_WATER_TOLERANCE_ML, pourVerdict}
    from "@/library/brew/compare";

function brew(over: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "a", recipeUuid: "r", recipeName: "Ethiopia Guji", accent: "#C86A3B",
        startedAt: 0, pouringAt: 10_000, endedAt: 150_000, outcome: "done",
        failure: null, pours: 2, waterTotal: 250, cupTotal: 244, heldSeconds: 0,
        hasStream: true, ...over
    };
}

describe("pourVerdict", () => {
    it("calls two undisturbed brews with matching figures the same", () => {
        expect(pourVerdict(brew(), brew({id: "b"})).verdict).toBe("same");
    });

    it("tolerates water inside the tolerance", () => {
        const b = brew({id: "b", waterTotal: 250 + COMPARE_WATER_TOLERANCE_ML});
        expect(pourVerdict(brew(), b).verdict).toBe("same");
    });

    it("calls water outside the tolerance a difference", () => {
        const b = brew({id: "b", waterTotal: 250 + COMPARE_WATER_TOLERANCE_ML + 1});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("differed");
        expect(why).toContain("4 ml");
    });

    it("tolerates a duration inside the tolerance", () => {
        const b = brew({id: "b", endedAt: 150_000 + COMPARE_TIME_TOLERANCE_SECONDS * 1000});
        expect(pourVerdict(brew(), b).verdict).toBe("same");
    });

    it("calls a duration outside the tolerance a difference", () => {
        const late = (COMPARE_TIME_TOLERANCE_SECONDS + 3) * 1000;
        const b = brew({id: "b", endedAt: 150_000 + late});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("differed");
        expect(why).toContain("8 seconds");
    });

    it("measures duration from the first drop, not from waking", () => {
        // Same pouring duration, very different total: one brew ground for a
        // minute longer. The verdict is about the pour.
        const a = brew({startedAt: 0, pouringAt: 10_000, endedAt: 150_000});
        const b = brew({id: "b", startedAt: 0, pouringAt: 70_000, endedAt: 210_000});
        expect(pourVerdict(a, b).verdict).toBe("same");
    });

    it("names a stall rather than calling it a difference", () => {
        const b = brew({id: "b", stalls: [[], [{atMl: 180, seconds: 12}]]});
        const {verdict, why} = pourVerdict(brew(), b);
        expect(verdict).toBe("stalled");
        expect(why).toContain("stalled");
    });

    it("puts an unfinished brew ahead of a stall", () => {
        const b = brew({
            id: "b", outcome: "cancelled", stalls: [[{atMl: 40, seconds: 9}]]
        });
        expect(pourVerdict(brew(), b).verdict).toBe("incomplete");
    });

    it("counts a brew ended on the machine as a finished one", () => {
        expect(pourVerdict(brew(), brew({id: "b", outcome: "endedOnMachine"})).verdict)
            .toBe("same");
    });

    it("falls back to startedAt on a row written before pouringAt existed", () => {
        const a = brew({pouringAt: undefined, startedAt: 10_000, endedAt: 150_000});
        expect(pourVerdict(a, brew({id: "b"})).verdict).toBe("same");
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/brew/__tests__/compare.test.ts`
Expected: FAIL, "Cannot find module '@/library/brew/compare'".

- [ ] **Step 3: Write the module**

```ts
// library/brew/compare.ts
import type {StoredBrew} from "@/library/BrewDatabase";

import {countsAsBrewed} from "./brewPopulation";

/**
 * Two brews of one recipe, held against each other.
 *
 * Pure, and pointedly so: everything on this screen that can be got wrong can
 * be got wrong here, where a test can catch it without a machine. The drawing
 * is the part that needs real brews, so as little as possible of the thinking
 * happens there.
 *
 * `StoredBrew` is imported as a type only. `BrewDatabase` pulls in expo-sqlite,
 * and this module must stay importable by a plain node test.
 */

/**
 * How far two brews' water may differ and still count as the same pour.
 *
 * Six times the scale's 0.5 ml noise floor. Whether it is the right number is
 * a hardware question rather than an arithmetic one, exactly as
 * `TARGET_TOLERANCE_ML` in `stalls.ts` says of its own figure. It wants
 * checking against two real brews of one recipe.
 */
export const COMPARE_WATER_TOLERANCE_ML = 3;

/** The same disclaimer, for the clock. */
export const COMPARE_TIME_TOLERANCE_SECONDS = 5;

export type PourVerdict = "same" | "stalled" | "differed" | "incomplete";

/**
 * How long the pour took.
 *
 * From the first drop, not from waking: grinding is not pouring, and a brew
 * that ground for a minute longer poured no differently. The same fallback the
 * record screen uses, for rows written before `pouringAt` existed.
 */
export function pourDurationSeconds(record: StoredBrew): number {
    const zero = (record.pouringAt ?? 0) > 0 ? record.pouringAt! : record.startedAt;
    return Math.max(0, (record.endedAt - zero) / 1000);
}

function stalled(record: StoredBrew): boolean {
    return (record.stalls ?? []).some((stage) => stage.length > 0);
}

/**
 * Whether the two brews poured alike, and what to say about it.
 *
 * The order of the tests is the point. A brew that stopped is not a brew that
 * differed, and saying "these differed by 90 ml" about a cancelled brew is
 * true and useless. A stall is likewise its own answer rather than a cause of
 * a difference in the totals.
 */
export function pourVerdict(
    subject: StoredBrew, reference: StoredBrew
): {verdict: PourVerdict; why: string} {
    const unfinished = [subject, reference].filter((r) => !countsAsBrewed(r));
    if (unfinished.length > 0) {
        return {
            verdict: "incomplete",
            why: unfinished.length === 2
                ? "Neither brew finished, so there is no pour to compare."
                : "One brew did not finish, so the pours cannot be compared."
        };
    }

    const stalls = [subject, reference].filter(stalled);
    if (stalls.length > 0) {
        return {
            verdict: "stalled",
            why: stalls.length === 2
                ? "Both brews stalled, so neither poured to plan."
                : "One brew stalled, so it did not pour to plan."
        };
    }

    const water = Math.abs(subject.waterTotal - reference.waterTotal);
    if (water > COMPARE_WATER_TOLERANCE_ML) {
        return {
            verdict: "differed",
            why: `The brews delivered ${Math.round(water)} ml of water apart.`
        };
    }

    const seconds = Math.abs(
        pourDurationSeconds(subject) - pourDurationSeconds(reference)
    );
    if (seconds > COMPARE_TIME_TOLERANCE_SECONDS) {
        return {
            verdict: "differed",
            why: `One brew poured for ${Math.round(seconds)} seconds longer.`
        };
    }

    return {
        verdict: "same",
        why: "Both brews poured the same water on the same schedule."
    };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/compare.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/compare.ts library/brew/__tests__/compare.test.ts
git commit -m "Decide whether two brews poured alike

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Plan drift

Recipes are mutable, so two brews "of the same recipe" may have run different plans. `brews.plan` records what each actually ran. Grade the difference by whether it moves the drawn line.

**Files:**
- Modify: `library/brew/compare.ts`
- Test: `library/brew/__tests__/compare.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/compare.test.ts`:

```ts
import type {PlanStage} from "@/library/brew/BrewRecord";
import {planDrift} from "@/library/brew/compare";

function stage(over: Partial<PlanStage> = {}): PlanStage {
    return {
        pourNumber: 1, volume: 40, temperature: 93, flowRate: 40,
        agitation: 0, pourPattern: 0, pauseTime: 20, ...over
    };
}

describe("planDrift", () => {
    it("grades two identical plans as no drift", () => {
        expect(planDrift([stage()], [stage()])).toEqual({grade: "none", fields: []});
    });

    it.each([
        ["volume", {volume: 60}],
        ["flowRate", {flowRate: 32}],
        ["pauseTime", {pauseTime: 5}]
    ] as [string, Partial<PlanStage>][])(
        "grades a change of %s as shape drift, because it moves the line",
        (field, over) => {
            const drift = planDrift([stage()], [stage(over)]);
            expect(drift.grade).toBe("shape");
            expect(drift.fields).toContain(field);
        }
    );

    it.each([
        ["temperature", {temperature: 88}],
        ["pourPattern", {pourPattern: 1}],
        ["agitation", {agitation: 3}]
    ] as [string, Partial<PlanStage>][])(
        "grades a change of %s as detail drift, because the line is unmoved",
        (field, over) => {
            const drift = planDrift([stage()], [stage(over)]);
            expect(drift.grade).toBe("detail");
            expect(drift.fields).toContain(field);
        }
    );

    it("grades a different stage count as shape drift", () => {
        const drift = planDrift([stage()], [stage(), stage({pourNumber: 2})]);
        expect(drift.grade).toBe("shape");
        expect(drift.fields).toContain("stages");
    });

    it("lets shape outrank detail when both changed", () => {
        expect(planDrift([stage()], [stage({volume: 60, temperature: 88})]).grade)
            .toBe("shape");
    });

    it("reports no drift when a brew carries no plan at all", () => {
        // Rows written before `plan` existed. Nothing to compare is not a
        // difference, and claiming one would put a banner on every old brew.
        expect(planDrift(undefined, [stage()])).toEqual({grade: "none", fields: []});
        expect(planDrift([stage()], undefined)).toEqual({grade: "none", fields: []});
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/brew/__tests__/compare.test.ts -t planDrift`
Expected: FAIL, "planDrift is not a function".

- [ ] **Step 3: Implement it**

Append to `library/brew/compare.ts`:

```ts
import type {PlanStage} from "./BrewRecord";

export type PlanDrift = "none" | "detail" | "shape";

/**
 * The plan fields that move the drawn staircase.
 *
 * Exactly the fields `planPoints` in `brewShape.ts` reads: `volume` sets each
 * step's rise, `flowRate` its run through `pourSeconds`, and `pauseTime` the
 * plateau after it. A difference in one of these makes two plans genuinely
 * incomparable on one line.
 *
 * ADDING A FIELD TO `PlanStage`? Decide which list it belongs in. A field in
 * neither is silently ignored by the drift grade, which is how a real
 * difference comes to be presented as none.
 */
const SHAPE_FIELDS = ["volume", "flowRate", "pauseTime"] as const;

/** Changes the coffee without moving the line. */
const DETAIL_FIELDS = ["temperature", "pourPattern", "agitation"] as const;

export function planDrift(
    subject: PlanStage[] | undefined, reference: PlanStage[] | undefined
): {grade: PlanDrift; fields: string[]} {
    // A row written before `plan` existed has nothing to disagree with. That is
    // an absence, not a difference, and flagging it would banner every old brew.
    if (subject === undefined || reference === undefined) {
        return {grade: "none", fields: []};
    }
    if (subject.length !== reference.length) {
        return {grade: "shape", fields: ["stages"]};
    }

    const fields: string[] = [];
    for (const field of [...SHAPE_FIELDS, ...DETAIL_FIELDS]) {
        const differs = subject.some((stage, i) => stage[field] !== reference[i][field]);
        if (differs) fields.push(field);
    }

    const shape = fields.some(
        (field) => (SHAPE_FIELDS as readonly string[]).includes(field)
    );
    const grade: PlanDrift = shape ? "shape" : fields.length > 0 ? "detail" : "none";
    return {grade, fields};
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/compare.test.ts`
Expected: PASS, 10 verdict tests plus 11 drift tests.

- [ ] **Step 5: Commit**

```bash
git add library/brew/compare.ts library/brew/__tests__/compare.test.ts
git commit -m "Grade a plan difference by whether it moves the line

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: The ledger and the cup gap

The rest of `compare.ts`: the side-by-side rows, the interpolated cup gap, and the one entry point the screen calls.

**Files:**
- Modify: `library/brew/compare.ts`
- Test: `library/brew/__tests__/compare.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/brew/__tests__/compare.test.ts`:

```ts
import type {BrewSample} from "@/library/brew/BrewRecord";
import {compareBrews, cupGap} from "@/library/brew/compare";

function stream(...rows: [number, number][]): BrewSample[] {
    return rows.map(([at, cup]) => ({at: at * 1000, water: 0, cup, pour: 1}));
}

describe("cupGap", () => {
    it("is empty when either stream is missing", () => {
        expect(cupGap(stream([0, 0], [10, 50]), [])).toEqual([]);
        expect(cupGap([], stream([0, 0], [10, 50]))).toEqual([]);
    });

    it("subtracts the reference from the subject, second by second", () => {
        const gap = cupGap(stream([0, 0], [10, 100]), stream([0, 0], [10, 50]));
        expect(gap[0]).toEqual({t: 0, v: 0});
        expect(gap[5]).toEqual({t: 5, v: 25});
        expect(gap[10]).toEqual({t: 10, v: 50});
    });

    it("interpolates across different sample rates", () => {
        // One stream samples every two seconds, the other every four. Both
        // describe the same straight climb, so the gap is flat zero.
        const gap = cupGap(
            stream([0, 0], [2, 20], [4, 40], [6, 60]),
            stream([0, 0], [6, 60])
        );
        expect(gap.every((point) => point.v === 0)).toBe(true);
    });

    it("stops where the shorter stream stops", () => {
        const gap = cupGap(stream([0, 0], [20, 200]), stream([0, 0], [8, 80]));
        expect(gap[gap.length - 1].t).toBe(8);
    });
});

describe("compareBrews", () => {
    it("keeps a shared value once and marks it", () => {
        const c = compareBrews(
            {record: brew({grindSize: 58, dose: 18}), samples: []},
            {record: brew({id: "b", grindSize: 62, dose: 18}), samples: []}
        );
        const dose = c.rows.find((row) => row.label === "DOSE");
        const grind = c.rows.find((row) => row.label === "GRIND");
        expect(dose).toEqual({label: "DOSE", a: "18 g", b: "18 g", shared: true});
        expect(grind).toEqual({label: "GRIND", a: "58", b: "62", shared: false});
    });

    it("omits a row neither brew recorded", () => {
        const c = compareBrews(
            {record: brew(), samples: []},
            {record: brew({id: "b"}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "GRIND")).toBeUndefined();
    });

    it("keeps a row only one brew recorded, and says the other is unknown", () => {
        const c = compareBrews(
            {record: brew({grindSize: 58}), samples: []},
            {record: brew({id: "b"}), samples: []}
        );
        expect(c.rows.find((row) => row.label === "GRIND"))
            .toEqual({label: "GRIND", a: "58", b: "not recorded", shared: false});
    });

    it("carries the verdict, the drift and the gap", () => {
        const c = compareBrews(
            {record: brew(), samples: stream([0, 0], [10, 100])},
            {record: brew({id: "b"}), samples: stream([0, 0], [10, 50])}
        );
        expect(c.pour.verdict).toBe("same");
        expect(c.drift.grade).toBe("none");
        expect(c.cupGap.length).toBeGreaterThan(0);
        expect(c.subject.id).toBe("a");
        expect(c.reference.id).toBe("b");
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/brew/__tests__/compare.test.ts -t compareBrews`
Expected: FAIL, "compareBrews is not a function".

- [ ] **Step 3: Implement it**

Append to `library/brew/compare.ts`:

```ts
import type {BrewSample} from "./BrewRecord";
import {livePoints, type Point} from "./brewShape";

/** One line of the ledger. `shared` means the two brews agree. */
export type CompareRow = {label: string; a: string; b: string; shared: boolean};

export type BrewUnderComparison = {record: StoredBrew; samples: BrewSample[]};

export type Comparison = {
    subject: StoredBrew;
    reference: StoredBrew;
    pour: {verdict: PourVerdict; why: string};
    drift: {grade: PlanDrift; fields: string[]};
    rows: CompareRow[];
    cupGap: Point[];
};

/** What a row says where a brew never recorded the figure. */
export const NOT_RECORDED = "not recorded";

/** The value of a curve at a whole second, linearly between its samples. */
function valueAt(points: Point[], t: number): number | null {
    if (points.length === 0) return null;
    if (t < points[0].t || t > points[points.length - 1].t) return null;
    for (let i = 1; i < points.length; i++) {
        if (points[i].t < t) continue;
        const from = points[i - 1];
        const to = points[i];
        const span = to.t - from.t;
        if (span <= 0) return to.v;
        return from.v + ((t - from.t) / span) * (to.v - from.v);
    }
    return points[points.length - 1].v;
}

/**
 * Subject minus reference, on a one second grid.
 *
 * Both streams are already zeroed on the first drop: `livePoints` reads
 * `sample.at` straight, and the recorder writes it relative to `pouringAt`. So
 * there is no alignment to invent, only a common grid to interpolate onto,
 * because two brews do not sample at the same instants.
 *
 * It stops where the shorter stream stops. Extrapolating past the end of a
 * brew would draw a gap that grew after one of the brews was over.
 */
export function cupGap(subject: BrewSample[], reference: BrewSample[]): Point[] {
    const a = livePoints(subject, "cup");
    const b = livePoints(reference, "cup");
    if (a.length < 2 || b.length < 2) return [];
    const end = Math.floor(Math.min(a[a.length - 1].t, b[b.length - 1].t));
    const gap: Point[] = [];
    for (let t = 0; t <= end; t++) {
        const here = valueAt(a, t);
        const there = valueAt(b, t);
        if (here === null || there === null) continue;
        gap.push({t, v: Math.round((here - there) * 10) / 10});
    }
    return gap;
}

/** `2:06`. Floored, as everywhere else: 2:07 at 2:06.6 is wrong. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

type Field = {label: string; read: (record: StoredBrew) => string | null};

/**
 * The ledger, in the order it is read.
 *
 * What the brew did first, then what it was made with, then what the user
 * thought of it. A row neither brew recorded is dropped; a row one of them
 * recorded is kept, because "this one has a grind and that one does not" is
 * itself a difference worth seeing.
 */
const FIELDS: Field[] = [
    {label: "OUTCOME", read: (r) => r.outcome},
    {label: "TIME",    read: (r) => clock(pourDurationSeconds(r))},
    {label: "WATER",   read: (r) => `${Math.round(r.waterTotal)} ml`},
    {label: "CUP",     read: (r) => `${Math.round(r.cupTotal)} ml`},
    {label: "BYPASS",  read: (r) => r.bypass === undefined
        ? null : `${Math.round(r.bypass.delivered)} ml`},
    {label: "DOSE",    read: (r) => r.dose === undefined ? null : `${r.dose} g`},
    {label: "RATIO",   read: (r) => r.ratio === undefined ? null : `1:${r.ratio}`},
    {label: "GRIND",   read: (r) => r.grindSize === undefined
        ? null : String(r.grindSize)},
    {label: "RPM",     read: (r) => r.grinderRpm === undefined
        ? null : String(r.grinderRpm)},
    {label: "RATING",  read: (r) => !r.rating ? null : `${r.rating} of 5`},
    {label: "ORIGIN",  read: (r) => r.origin ?? null},
    {label: "ROAST",   read: (r) => r.roast ?? null},
    {label: "PROCESS", read: (r) => r.process ?? null},
    {label: "TAGS",    read: (r) => (r.tags ?? []).length === 0
        ? null : (r.tags ?? []).join(", ")}
];

function ledger(subject: StoredBrew, reference: StoredBrew): CompareRow[] {
    const rows: CompareRow[] = [];
    for (const {label, read} of FIELDS) {
        const a = read(subject);
        const b = read(reference);
        if (a === null && b === null) continue;
        rows.push({
            label,
            a:      a ?? NOT_RECORDED,
            b:      b ?? NOT_RECORDED,
            shared: a !== null && a === b
        });
    }
    return rows;
}

/** The whole comparison, computed once, for the screen to lay out. */
export function compareBrews(
    subject: BrewUnderComparison, reference: BrewUnderComparison
): Comparison {
    return {
        subject:   subject.record,
        reference: reference.record,
        pour:      pourVerdict(subject.record, reference.record),
        drift:     planDrift(subject.record.plan, reference.record.plan),
        rows:      ledger(subject.record, reference.record),
        cupGap:    cupGap(subject.samples, reference.samples)
    };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/compare.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add library/brew/compare.ts library/brew/__tests__/compare.test.ts
git commit -m "Build the comparison ledger and the cup gap

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---


## Task 7: The verdict copy

Four readings and the degradation lines, in `constants/brewCopy.ts` with the rest of the brew's words. No dashes in any of it.

**Files:**
- Modify: `constants/brewCopy.ts`
- Create: `constants/__tests__/compareCopy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// constants/__tests__/compareCopy.test.ts
import {COMPARE_COPY, COMPARE_DEGRADED} from "@/constants/brewCopy";
import type {PourVerdict} from "@/library/brew/compare";

describe("compare copy", () => {
    const verdicts: PourVerdict[] = ["same", "stalled", "differed", "incomplete"];

    it("has a reading for every verdict", () => {
        for (const verdict of verdicts) {
            expect(COMPARE_COPY[verdict].chip.length).toBeGreaterThan(0);
        }
    });

    it("shouts the chip, as every other status chip does", () => {
        for (const verdict of verdicts) {
            const {chip} = COMPARE_COPY[verdict];
            expect(chip).toBe(chip.toUpperCase());
        }
    });

    it("uses no dashes anywhere, because they read as machine written", () => {
        const all = [
            ...verdicts.flatMap((v) => [COMPARE_COPY[v].chip, COMPARE_COPY[v].tone]),
            ...Object.values(COMPARE_DEGRADED)
        ];
        for (const line of all) {
            expect(line).not.toMatch(/[-\u2013\u2014]/);
        }
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest constants/__tests__/compareCopy.test.ts`
Expected: FAIL, `COMPARE_COPY` is undefined.

- [ ] **Step 3: Add the copy**

Append to `constants/brewCopy.ts`:

```ts
/**
 * What the comparison screen says about the two pours.
 *
 * `tone` names a palette entry rather than holding a colour, because colour
 * lives in `constants/colors.ts` and a hex here would be outside it.
 *
 * Only `same` is a success. The other three are amber rather than red: none of
 * them is a fault, they are all just reasons the water channel cannot carry
 * the comparison, and a red chip on a perfectly good pair of brews would send
 * somebody looking for a problem that is not there.
 */
export const COMPARE_COPY: Record<
    "same" | "stalled" | "differed" | "incomplete",
    {chip: string; tone: "success" | "warn"}
> = {
    same:       {chip: "POURED THE SAME", tone: "success"},
    stalled:    {chip: "ONE STALLED",     tone: "warn"},
    differed:   {chip: "THEY DIFFERED",   tone: "warn"},
    incomplete: {chip: "ONE DID NOT FINISH", tone: "warn"}
};

/** What the screen says when it cannot draw one or both traces. */
export const COMPARE_DEGRADED = {
    /** One stream survived the retention sweep and the other did not. */
    one: "One of these brews has lost its trace to the retention sweep, so the"
        + " chart shows the other alone. Pin a brew to keep its trace.",
    /** Neither did. The chart is not drawn at all. */
    both: "Both of these brews have lost their traces to the retention sweep."
        + " The figures below are all that remain."
};
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest constants/__tests__/compareCopy.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add constants/brewCopy.ts constants/__tests__/compareCopy.test.ts
git commit -m "Say what a comparison found

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: CompareTrace

The overlay. Deliberately smaller than `BrewTrace`: no bypass box, no temperature band, no stage tapping, no travelling head. Two brews' worth of lines is already a busy picture, and every one of those devices is about a single brew.

The success state is the interesting part. When the pour verdict is `same`, the water is drawn **once**, because drawing a second line 1 ml away from the first would be inventing a difference the screen has just said is not there.

**Files:**
- Create: `components/CompareTrace.tsx`
- Create: `components/__tests__/CompareTrace.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/CompareTrace.test.tsx
import React from "react";

import CompareTrace from "@/components/CompareTrace";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {referenceCupColour} from "@/library/brew/traceStyle";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = "#C86A3B";

function stream(...rows: [number, number, number][]): BrewSample[] {
    return rows.map(([at, water, cup]) => ({at: at * 1000, water, cup, pour: 1}));
}

const A = stream([0, 0, 0], [15, 120, 90], [30, 250, 235]);
const B = stream([0, 0, 0], [15, 120, 60], [30, 250, 228]);

async function draw(over: Partial<React.ComponentProps<typeof CompareTrace>> = {}) {
    return renderWithProviders(
        <CompareTrace
            subject={A} reference={B} accent={ACCENT}
            verdict="same" width={300} height={160} maxT={30} maxV={260}
            {...over}
        />
    );
}

describe("CompareTrace", () => {
    it("draws the water once when both brews poured the same", async () => {
        const {getByTestId, queryByTestId} = await draw({verdict: "same"});
        expect(getByTestId("trace-water-subject")).toBeTruthy();
        expect(queryByTestId("trace-water-reference")).toBeNull();
    });

    it("says BOTH of the one water line, so it is not read as one brew's", async () => {
        const {getByText} = await draw({verdict: "same"});
        expect(getByText("WATER, BOTH")).toBeTruthy();
    });

    it("draws both water lines once the pours differed", async () => {
        const {getByTestId} = await draw({verdict: "differed"});
        expect(getByTestId("trace-water-subject")).toBeTruthy();
        expect(getByTestId("trace-water-reference")).toBeTruthy();
    });

    it("always draws both cups, because the cup is the comparison", async () => {
        const {getByTestId} = await draw({verdict: "same"});
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(getByTestId("trace-cup-reference")).toBeTruthy();
    });

    it("greys the reference and colours the subject", async () => {
        const {getByTestId} = await draw();
        expect(getByTestId("trace-cup-reference").props.stroke).toBe(referenceCupColour);
        expect(getByTestId("trace-cup-subject").props.stroke).not.toBe(referenceCupColour);
    });

    it("shades the gap between the two cups", async () => {
        const {getByTestId} = await draw();
        const band = getByTestId("trace-cup-gap").props.d as string;
        expect(band.startsWith("M")).toBe(true);
        expect(band.endsWith("Z")).toBe(true);
    });

    it("draws nothing where a brew has no stream", async () => {
        const {queryByTestId} = await draw({reference: []});
        expect(queryByTestId("trace-cup-reference")).toBeNull();
        expect(queryByTestId("trace-cup-gap")).toBeNull();
        expect(queryByTestId("trace-cup-subject")).toBeTruthy();
    });

    it("draws one faint plan, or two when the plans differ in shape", async () => {
        const plan = "M0 100 L300 0";
        const one = await draw({subjectPlan: plan});
        expect(one.getByTestId("trace-plan-subject").props.strokeOpacity)
            .toBeLessThan(1);
        expect(one.queryByTestId("trace-plan-reference")).toBeNull();

        const two = await draw({subjectPlan: plan, referencePlan: "M0 100 L300 20"});
        expect(two.getByTestId("trace-plan-reference")).toBeTruthy();
    });

    it("keeps the amber of a held brew out of it", async () => {
        // `holding` is a live-brew idea. A finished record never holds, and a
        // comparison is always of finished records.
        const {getByTestId} = await draw({verdict: "differed"});
        expect(getByTestId("trace-water-subject").props.stroke).toBe(ACCENT);
        expect(getByTestId("trace-water-subject").props.stroke).not.toBe(palette.warn);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/CompareTrace.test.tsx`
Expected: FAIL, "Cannot find module '@/components/CompareTrace'".

- [ ] **Step 3: Write the component**

```tsx
// components/CompareTrace.tsx
import React from "react";
import Svg, {Path} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import TraceLegend from "@/components/TraceLegend";
import {palette} from "@/constants/colors";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {type Box, livePoints, type Point, toPath} from "@/library/brew/brewShape";
import {channelStyle, referenceCupColour, referenceWaterColour}
    from "@/library/brew/traceStyle";
import type {PourVerdict} from "@/library/brew/compare";

/**
 * Two brews on one axis.
 *
 * KEEP IN STEP WITH: `components/BrewTrace.tsx`. The two share their
 * appearance through `library/brew/traceStyle.ts` and their geometry through
 * `library/brew/brewShape.ts`; nothing in this file should set a stroke width
 * or a dash pattern of its own.
 *
 * Deliberately the smaller of the two. No bypass box, no temperature band, no
 * stage tapping, no travelling head: each of those says something about one
 * brew, and doubling them would double the ink on a picture that already has
 * twice the lines. A user who wants them has the single record a tap away.
 *
 * The grammar is spent before this component starts. Hue already means recipe,
 * dotted already means cup, grey dashes already mean plan, amber already means
 * the machine stopped. So "which brew" is the one thing left: the subject
 * keeps its colour and the reference goes grey, with the brighter grey given
 * to the cup because the cup is what a user came here to compare.
 */

/** How much of the band's fill shows. Enough to read as a region, not a line. */
const GAP_OPACITY = 0.14;

/** The plan is context here, not the subject. Fainter than `BrewTrace` draws it. */
const PLAN_OPACITY = 0.25;

const LEGEND_HEIGHT = 16;

type Props = {
    subject: BrewSample[];
    reference: BrewSample[];
    accent: string;
    verdict: PourVerdict;
    width: number;
    height: number;
    /** The axis both brews are drawn on. Computed by the screen, not here. */
    maxT: number;
    maxV: number;
    /** Pre-built plan paths. Absent draws no plan. */
    subjectPlan?: string;
    /** Only when the plans differ in shape; otherwise one plan stands for both. */
    referencePlan?: string;
};

/**
 * The region between the two cup curves.
 *
 * Out along the subject and back along the reference, which closes into a
 * polygon that is above the axis where the subject led and below where it
 * lagged. `toPath` already emits `M` then a run of `L`, so the return leg is
 * the same call with its opening `M` turned into an `L`.
 */
function gapBand(subject: Point[], reference: Point[], box: Box): string {
    if (subject.length < 2 || reference.length < 2) return "";
    const out = toPath(subject, box);
    const back = toPath([...reference].reverse(), box);
    if (out === "" || back === "") return "";
    return `${out} ${back.replace(/^M/, "L")} Z`;
}

export default function CompareTrace({
    subject, reference, accent, verdict, width, height, maxT, maxV,
    subjectPlan, referencePlan
}: Props) {
    const svgHeight = Math.max(0, height - LEGEND_HEIGHT);
    const box: Box = {width, height: svgHeight, maxT, maxV};

    const subjectCup = livePoints(subject, "cup");
    const referenceCup = livePoints(reference, "cup");
    const subjectWater = livePoints(subject, "water");
    const referenceWater = livePoints(reference, "water");

    // The success state. Saying the pours matched and then drawing two water
    // lines a millilitre apart would contradict the sentence above the chart,
    // and the millimetre between them is scale noise rather than a finding.
    const oneWater = verdict === "same";

    const cupSubject = channelStyle("cup", {accent});
    const cupReference = channelStyle("cup", {accent, role: "reference"});
    const waterSubject = channelStyle("water", {accent});
    const waterReference = channelStyle("water", {accent, role: "reference"});
    const planStyle = channelStyle("plan", {accent});

    const band = gapBand(subjectCup, referenceCup, box);
    const paths = {
        cupSubject:      toPath(subjectCup, box),
        cupReference:    toPath(referenceCup, box),
        waterSubject:    toPath(subjectWater, box),
        waterReference:  toPath(referenceWater, box)
    };

    return (
        <YStack width={width}>
            <Svg width={width} height={svgHeight}>
                {subjectPlan !== undefined && subjectPlan !== "" && (
                    <Path testID="trace-plan-subject" d={subjectPlan} fill="none"
                          strokeOpacity={PLAN_OPACITY} {...planStyle} />
                )}
                {referencePlan !== undefined && referencePlan !== "" && (
                    <Path testID="trace-plan-reference" d={referencePlan} fill="none"
                          strokeOpacity={PLAN_OPACITY} {...planStyle} />
                )}
                {band !== "" && (
                    <Path testID="trace-cup-gap" d={band} stroke="none"
                          fill={accent} fillOpacity={GAP_OPACITY} />
                )}
                {paths.waterReference !== "" && !oneWater && (
                    <Path testID="trace-water-reference" d={paths.waterReference}
                          fill="none" {...waterReference} />
                )}
                {paths.waterSubject !== "" && (
                    <Path testID="trace-water-subject" d={paths.waterSubject}
                          fill="none" {...waterSubject} />
                )}
                {paths.cupReference !== "" && (
                    <Path testID="trace-cup-reference" d={paths.cupReference}
                          fill="none" {...cupReference} />
                )}
                {paths.cupSubject !== "" && (
                    <Path testID="trace-cup-subject" d={paths.cupSubject}
                          fill="none" {...cupSubject} />
                )}
            </Svg>
            <XStack testID="compare-legend-row" gap="$3" paddingTop="$1" flexWrap="wrap">
                {oneWater
                    ? <TraceLegend colour={accent} label="WATER, BOTH" />
                    : <>
                        <TraceLegend colour={accent} label="WATER, THIS" />
                        <TraceLegend colour={referenceWaterColour} label="WATER, THAT" />
                    </>}
                <TraceLegend colour={cupSubject.stroke} label="CUP, THIS" dotted />
                <TraceLegend colour={referenceCupColour} label="CUP, THAT" dotted />
                {(subjectPlan ?? "") !== "" && (
                    <TraceLegend colour={palette.muted} label="PLAN" dashed />
                )}
            </XStack>
        </YStack>
    );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/CompareTrace.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npm run typecheck && npx eslint components/CompareTrace.tsx
git add components/CompareTrace.tsx components/__tests__/CompareTrace.test.tsx
git commit -m "Draw two brews on one axis

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: The drift guard

The test that makes the two-component decision safe. It renders both charts and asserts that the channels they share are drawn identically. Without it the sharing is a convention, and a convention is what drift is made of.

**Files:**
- Create: `components/__tests__/traceGrammar.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
// components/__tests__/traceGrammar.test.tsx
import React from "react";

import BrewTrace from "@/components/BrewTrace";
import CompareTrace from "@/components/CompareTrace";
import type {BrewSample} from "@/library/brew/BrewRecord";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

/**
 * The two charts must agree about what a channel looks like.
 *
 * `BrewTrace` and `CompareTrace` are separate components on purpose: one draws
 * a brew and the other draws a difference, and folding the second into the
 * first would have put a second brew's worth of branching through every path
 * in a 600 line file. The cost of that decision is drift, and this is the
 * thing that stops it. Both read `library/brew/traceStyle.ts`; this asserts
 * that they really do.
 *
 * If this fails, do not fix it by copying a value from one file to the other.
 * Find the hard-coded stroke that was added and move it into `traceStyle`.
 */

const ACCENT = "#C86A3B";
const SAMPLES: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 1},
    {at: 15_000, water: 120, cup: 90, pour: 1},
    {at: 30_000, water: 250, cup: 235, pour: 1}
];

/** The attributes that make a channel recognisable. */
const GRAMMAR = ["stroke", "strokeWidth", "strokeDasharray"] as const;

function styleOf(node: {props: Record<string, unknown>}) {
    return Object.fromEntries(GRAMMAR.map((key) => [key, node.props[key]]));
}

describe("the two charts draw the same channels the same way", () => {
    it.each([
        ["water", "trace-water", "trace-water-subject"],
        ["cup", "trace-cup", "trace-cup-subject"]
    ])("agrees about %s", async (_channel, single, paired) => {
        const one = await renderWithProviders(
            <BrewTrace pours={[new Pour(1)]} samples={SAMPLES} accent={ACCENT}
                       width={300} height={160} plannedSeconds={30} compact />
        );
        const two = await renderWithProviders(
            <CompareTrace subject={SAMPLES} reference={SAMPLES} accent={ACCENT}
                          verdict="differed" width={300} height={160}
                          maxT={30} maxV={260} />
        );
        expect(styleOf(two.getByTestId(paired)))
            .toEqual(styleOf(one.getByTestId(single)));
    });
});
```

- [ ] **Step 2: Run it**

Run: `npx jest components/__tests__/traceGrammar.test.tsx`
Expected: PASS, 2 tests. If it fails on `stroke` for water, check that `CompareTrace` passes no `holding`; if it fails on `strokeLinecap`, Task 2 Step 4 missed a path.

- [ ] **Step 3: Prove the guard works**

Temporarily change `strokeWidth` for `cup` in `library/brew/traceStyle.ts` from 2 to 3 **in the reference branch only**, by adding `strokeWidth: reference ? 3 : 2`. Re-run the test.
Expected: still PASS, because the guard compares subjects. Now change it unconditionally to 3.
Expected: the `traceStyle` test fails, which is the first line of defence. Revert both edits and confirm green.

- [ ] **Step 4: Cross-reference the two components**

Confirm both `components/BrewTrace.tsx` and `components/CompareTrace.tsx` carry a `KEEP IN STEP WITH:` line naming the other and this test. Add the line to `BrewTrace`'s header comment if Task 2 did not.

- [ ] **Step 5: Commit**

```bash
git add components/__tests__/traceGrammar.test.tsx components/BrewTrace.tsx
git commit -m "Pin the two charts to one drawing grammar

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: The ledger

The table under the chart. The user asked for shared values in the **middle**, not in the left column: a row where both brews agree collapses to one centred value spanning both columns, so the eye runs down the centre line and every excursion out to the sides is a difference. Nothing is hidden.

**Files:**
- Create: `components/CompareTable.tsx`
- Create: `components/__tests__/CompareTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/CompareTable.test.tsx
import React from "react";

import CompareTable from "@/components/CompareTable";
import type {CompareRow} from "@/library/brew/compare";
import {renderWithProviders} from "@/test-utils/render";

const ROWS: CompareRow[] = [
    {label: "DOSE", a: "18 g", b: "18 g", shared: true},
    {label: "GRIND", a: "58", b: "62", shared: false},
    {label: "RATING", a: "4 of 5", b: "not recorded", shared: false}
];

async function draw(rows = ROWS) {
    return renderWithProviders(<CompareTable rows={rows} accent="#C86A3B" />);
}

describe("CompareTable", () => {
    it("writes a shared value once, down the middle", async () => {
        const {getByTestId, queryByTestId} = await draw();
        expect(getByTestId("compare-shared-DOSE").props.children).toBe("18 g");
        expect(queryByTestId("compare-a-DOSE")).toBeNull();
        expect(queryByTestId("compare-b-DOSE")).toBeNull();
    });

    it("writes a difference out to both sides", async () => {
        const {getByTestId, queryByTestId} = await draw();
        expect(getByTestId("compare-a-GRIND").props.children).toBe("58");
        expect(getByTestId("compare-b-GRIND").props.children).toBe("62");
        expect(queryByTestId("compare-shared-GRIND")).toBeNull();
    });

    it("shows every row it is given, hiding nothing", async () => {
        const {getByText} = await draw();
        for (const row of ROWS) expect(getByText(row.label)).toBeTruthy();
    });

    it("says nothing at all when there is nothing to say", async () => {
        const {getByTestId} = await draw([]);
        expect(getByTestId("compare-table-empty")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/CompareTable.test.tsx`
Expected: FAIL, "Cannot find module '@/components/CompareTable'".

- [ ] **Step 3: Write the component**

```tsx
// components/CompareTable.tsx
import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {CompareRow} from "@/library/brew/compare";

/**
 * Every figure both brews carry, agreements included.
 *
 * Nothing is hidden, and that is the design rather than an omission waiting to
 * be made: a table that showed only the differences would be a table whose
 * silence the user has to interpret, and "the grind is not listed" and "the
 * grind was the same" look identical.
 *
 * So agreement is drawn instead of dropped. A shared value sits centred,
 * spanning both columns, and a difference splays out to the two sides. The
 * centre line is then a spine the eye runs down, and every excursion off it is
 * a candidate explanation for the two cups tasting different.
 */
export default function CompareTable({rows, accent}: {
    rows: CompareRow[];
    accent: string;
}) {
    if (rows.length === 0) {
        return (
            <Text testID="compare-table-empty" color={palette.dim} fontSize={13}>
                These two brews recorded nothing that can be set side by side.
            </Text>
        );
    }

    return (
        <YStack testID="compare-table">
            {rows.map((row) => (
                <XStack key={row.label} alignItems="center" paddingVertical="$2"
                        borderBottomWidth={1} borderColor={palette.line}>
                    <YStack width={84} flexShrink={0}>
                        <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.2}
                                       color={palette.muted}>
                            {row.label}
                        </DotMatrixText>
                    </YStack>
                    {row.shared ? (
                        <YStack flex={1} alignItems="center">
                            <Text testID={`compare-shared-${row.label}`}
                                  color={palette.dim} fontSize={14}>
                                {row.a}
                            </Text>
                        </YStack>
                    ) : (
                        <XStack flex={1} alignItems="center">
                            <YStack flex={1} alignItems="flex-start">
                                <Text testID={`compare-a-${row.label}`}
                                      color={accent} fontSize={14}>
                                    {row.a}
                                </Text>
                            </YStack>
                            <YStack flex={1} alignItems="flex-end">
                                <Text testID={`compare-b-${row.label}`}
                                      color={palette.text} fontSize={14}>
                                    {row.b}
                                </Text>
                            </YStack>
                        </XStack>
                    )}
                </XStack>
            ))}
        </YStack>
    );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/CompareTable.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/CompareTable.tsx components/__tests__/CompareTable.test.tsx
git commit -m "Put the agreements down the middle

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: The comparison screen

Layout only. Everything it shows comes from `compareBrews`; everything it draws comes from `CompareTrace` or two `BrewTrace compact` lanes.

SEPARATE mode is literally two `BrewTrace compact`, handed the same `axis`. That is the whole point of Task 3: the alternative view costs no new drawing code, and a change to how a brew is drawn reaches it for free.

**Files:**
- Create: `app/brewCompare.tsx`
- Create: `app/__tests__/brewCompare.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// app/__tests__/brewCompare.test.tsx
import React from "react";

import BrewCompareScreen from "@/app/brewCompare";
import {COMPARE_COPY, COMPARE_DEGRADED} from "@/constants/brewCopy";
import {brewRecordFixture, brewRecordSamples, createBrewHistoryMock,
    createExpoRouterMock} from "@/test-utils/brewRecordMocks";
import {renderWithProviders} from "@/test-utils/render";

const {setParams} = createExpoRouterMock();
const {setRecords} = createBrewHistoryMock();

function pair(over: Parameters<typeof brewRecordFixture>[0] = {}) {
    const a = brewRecordFixture({id: "a"});
    const b = brewRecordFixture({id: "b", ...over});
    setRecords({
        a: {record: a, samples: brewRecordSamples(), frames: ""},
        b: {record: b, samples: brewRecordSamples(), frames: ""}
    });
    setParams({a: "a", b: "b"});
    return {a, b};
}

describe("the comparison screen", () => {
    it("says the pours matched", async () => {
        pair();
        const {getByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_COPY.same.chip)).toBeTruthy();
    });

    it("says they differed when they did", async () => {
        pair({waterTotal: 400});
        const {getByText} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_COPY.differed.chip)).toBeTruthy();
    });

    it("opens overlaid", async () => {
        pair();
        const {getByTestId, queryByTestId} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(queryByTestId("compare-lane-a")).toBeNull();
    });

    it("splits into two lanes on the same axis", async () => {
        pair();
        const {getByTestId, getByLabelText} = await renderWithProviders(<BrewCompareScreen />);
        await fireEvent.press(getByLabelText("Show the brews separately"));
        const a = getByTestId("compare-lane-a");
        const b = getByTestId("compare-lane-b");
        expect(a).toBeTruthy();
        expect(b).toBeTruthy();
    });

    it("swaps which brew leads", async () => {
        pair({waterTotal: 400});
        const {getByLabelText, getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        const before = getByTestId("compare-a-WATER").props.children;
        await fireEvent.press(getByLabelText("Swap the two brews"));
        expect(getByTestId("compare-a-WATER").props.children).not.toBe(before);
    });

    it("draws the survivor alone when one trace has been swept", async () => {
        const a = brewRecordFixture({id: "a"});
        const b = brewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: brewRecordSamples(), frames: ""},
            b: {record: b, samples: [], frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.one)).toBeTruthy();
        expect(getByTestId("trace-cup-subject")).toBeTruthy();
        expect(queryByTestId("trace-cup-reference")).toBeNull();
    });

    it("falls back to the table when neither trace survived", async () => {
        const a = brewRecordFixture({id: "a", hasStream: false});
        const b = brewRecordFixture({id: "b", hasStream: false});
        setRecords({
            a: {record: a, samples: [], frames: ""},
            b: {record: b, samples: [], frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByText, getByTestId, queryByTestId} =
            await renderWithProviders(<BrewCompareScreen />);
        expect(getByText(COMPARE_DEGRADED.both)).toBeTruthy();
        expect(queryByTestId("compare-chart")).toBeNull();
        expect(getByTestId("compare-table")).toBeTruthy();
    });

    it("says so rather than crashing when a brew has been deleted", async () => {
        setRecords({a: {record: brewRecordFixture({id: "a"}),
            samples: brewRecordSamples(), frames: ""}});
        setParams({a: "a", b: "gone"});
        const {getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-missing")).toBeTruthy();
    });

    it("warns when the two brews ran different plans", async () => {
        const a = brewRecordFixture({id: "a"});
        const b = brewRecordFixture({
            id: "b",
            plan: (a.plan ?? []).map((stage) => ({...stage, volume: stage.volume + 40}))
        });
        setRecords({
            a: {record: a, samples: brewRecordSamples(), frames: ""},
            b: {record: b, samples: brewRecordSamples(), frames: ""}
        });
        setParams({a: "a", b: "b"});
        const {getByTestId} = await renderWithProviders(<BrewCompareScreen />);
        expect(getByTestId("compare-drift")).toBeTruthy();
    });
});
```

Import `fireEvent` from `@testing-library/react-native` at the top with the other imports. Extend `test-utils/brewRecordMocks.ts` with `setRecords` and `setParams` helpers if they are not already exported in that shape; keep the existing exports working.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest app/__tests__/brewCompare.test.tsx`
Expected: FAIL, "Cannot find module '@/app/brewCompare'".

- [ ] **Step 3: Write the screen**

Build `app/brewCompare.tsx` to this shape. Layout only; no arithmetic that `compare.ts` could have done.

- Read `a` and `b` from `useLocalSearchParams<{a?: string; b?: string}>()`.
- Open both through `useBrewHistory().open`. Either missing renders a `testID="compare-missing"` notice with a back control and nothing else.
- Local state, no new setting: `const [mode, setMode] = useState<"overlay" | "separate">("overlay")` and `const [swapped, setSwapped] = useState(false)`.
- Subject and reference are `swapped ? [b, a] : [a, b]`. Everything downstream reads those two, so the swap is one boolean and cannot half apply.
- `const comparison = compareBrews(subject, reference)`.
- Header: `ScreenHeader title="Compare"` with `onBack={() => router.back()}`.
- Under it, the verdict chip: `COMPARE_COPY[comparison.pour.verdict].chip` in `palette.success` or `palette.warn` by its `tone`, with `comparison.pour.why` beneath in `palette.dim`.
- The axis, computed once and shared by every drawing path:
  `const maxT = Math.max(lastSecond(subject), lastSecond(reference), plannedSeconds(subjectPours), plannedSeconds(referencePours))` and likewise `maxV` over both water totals and both plan tops. Two lanes that do not share a scale are not a comparison.
- Chart region, `testID="compare-chart"`, only when at least one stream survived:
  - `mode === "overlay"`: one `CompareTrace`, handed `subject.samples`, `reference.samples`, `comparison.pour.verdict`, the shared `maxT`/`maxV`, and plan paths built with `planPoints` plus `toPath`. Pass `referencePlan` only when `comparison.drift.grade === "shape"`.
  - `mode === "separate"`: two `BrewTrace compact` in a column, `testID="compare-lane-a"` and `compare-lane-b`, each handed `pours={poursFromPlan(record.plan)}`, its own samples, its own accent, and the **same** `axis={{maxT, maxV}}`.
- The mode switch is two buttons with `accessibilityLabel` "Show the brews overlaid" and "Show the brews separately". The swap control is one button labelled "Swap the two brews".
- Degradation, above the chart: exactly one stream surviving renders `COMPARE_DEGRADED.one` in `palette.warn` and the chart draws the survivor alone, which needs nothing special because `CompareTrace` already skips an empty stream. Neither surviving renders `COMPARE_DEGRADED.both` and no chart at all.
- Plan drift, `testID="compare-drift"`, rendered when `comparison.drift.grade !== "none"`. A `shape` grade says the shapes cannot be compared directly and names the fields; a `detail` grade says the plans differ in the fields it names but poured the same shape.
- Finally `<CompareTable rows={comparison.rows} accent={subject.record.accent} />`.
- Wrap the scrolling body in the same `ScrollView` and `SafeAreaView` shape `app/brewRecord.tsx` uses, so the screen sits like its neighbour.

Copy check before moving on: no dashes anywhere in a user-facing string on this screen.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest app/__tests__/brewCompare.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npm run typecheck && npx eslint app/brewCompare.tsx
git add app/brewCompare.tsx app/__tests__/brewCompare.test.tsx test-utils/brewRecordMocks.ts
git commit -m "A screen for two brews of one recipe

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Door one, the history selection

COMPARE joins DELETE and the handoff in `SelectionActionRow`. It is live on exactly two ticked brews that share a `recipeUuid`, and says why when it is not.

Two, not a range: a comparison of three brews is a different screen, and the honest thing is to say the door takes two rather than to silently use the first two.

**Files:**
- Modify: `app/brewHistory.tsx`
- Test: `app/__tests__/brewHistorySelection.test.tsx` (the selection row's own test file, not `brewHistory.test.tsx`)

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("brew history batch selection", ...)` block in `app/__tests__/brewHistorySelection.test.tsx`, which already mocks the router, the history hook and Swipeable, and already ticks a row by pressing its accessible label:

```tsx
    /** Two brews of one recipe, for the cases that need a comparable pair. */
    function sameRecipe(): StoredBrew[] {
        return [
            {id: "newer", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
             accent: "#C86A3B", startedAt: 900, endedAt: 1_000, outcome: "done",
             failure: null, pours: 5, waterTotal: 250, cupTotal: 244,
             heldSeconds: 0, hasStream: true},
            {id: "older", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
             accent: "#C86A3B", startedAt: 100, endedAt: 200, outcome: "done",
             failure: null, pours: 5, waterTotal: 248, cupTotal: 240,
             heldSeconds: 0, hasStream: true}
        ];
    }

    it("keeps compare inert until two brews are ticked", async () => {
        mockBrews = sameRecipe();
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        expect(screen.getByLabelText("Compare the selected brews")).toBeDisabled();

        await fireEvent.press(screen.getAllByLabelText(/^Ethiopia Guji,/)[0]);
        expect(screen.getByLabelText("Compare the selected brews")).toBeDisabled();
    });

    it("compares two brews of one recipe", async () => {
        mockBrews = sameRecipe();
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        const rows = screen.getAllByLabelText(/^Ethiopia Guji,/);
        await fireEvent.press(rows[0]);
        await fireEvent.press(rows[1]);

        expect(screen.getByLabelText("Compare the selected brews")).not.toBeDisabled();
        expect(screen.queryByTestId("selection-not-comparable")).toBeNull();
    });

    it("says why two brews of different recipes cannot be compared", async () => {
        // The default fixture is one brew of each of two recipes.
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));
        await fireEvent.press(screen.getByLabelText(/^Kenya Nyeri,/));

        expect(screen.getByTestId("selection-not-comparable")).toBeTruthy();
        expect(screen.getByLabelText("Compare the selected brews")).toBeDisabled();
    });

    it("opens the comparison with the older brew on the left", async () => {
        mockBrews = sameRecipe();
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        const rows = screen.getAllByLabelText(/^Ethiopia Guji,/);
        // Ticked newest first, so this also pins that the push is sorted rather
        // than merely taking the selection in the order it was made.
        await fireEvent.press(rows[0]);
        await fireEvent.press(rows[1]);
        await fireEvent.press(screen.getByLabelText("Compare the selected brews"));

        expect(mockPush).toHaveBeenCalledWith({
            pathname: "/brewCompare",
            params: {a: "older", b: "newer"}
        });
    });

    it("leaves selection mode behind it", async () => {
        mockBrews = sameRecipe();
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        const rows = screen.getAllByLabelText(/^Ethiopia Guji,/);
        await fireEvent.press(rows[0]);
        await fireEvent.press(rows[1]);
        await fireEvent.press(screen.getByLabelText("Compare the selected brews"));

        // Coming back from the comparison to a still-ticked history would
        // present a finished action as unfinished.
        expect(screen.getByLabelText("Select brews")).toBeTruthy();
    });
```

Oldest on the left is deliberate: the ledger then reads as a change over time rather than as an arbitrary pair, and both doors must agree about it.

Note the fixture rows are listed newest first, which is the order `brewsFor` and `all` return. `screen.getAllByLabelText` returns them in tree order, so `rows[0]` is the newer brew.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest app/__tests__/brewHistorySelection.test.tsx -t compar`
Expected: FAIL, unable to find an element with label "Compare the selected brews".

- [ ] **Step 3: Implement**

In `app/brewHistory.tsx`:

- Derive the gate beside `blockedCount`:

```tsx
    // Exactly two, of one recipe. Three brews is a different screen, and
    // quietly comparing the first two of a larger selection would be a
    // different answer than the one the user asked for.
    const selectedBrews = selectedIds
        .map((id) => brews.find((brew) => brew.id === id))
        .filter((brew): brew is StoredBrew => brew !== undefined);
    const comparable = selectedBrews.length === 2
        && selectedBrews[0].recipeUuid === selectedBrews[1].recipeUuid;
```

- Pass `comparable` and an `onCompare` into `SelectionActionRow`, and add the button beside DELETE, disabled when `!comparable`, label `COMPARE`, colour `palette.dim` disabled and `palette.text` live, `accessibilityLabel="Compare the selected brews"`.
- Add the reason line, in the same shape as `selection-blocked`:

```tsx
            {selectedIds.length === 2 && !comparable && (
                <Text testID="selection-not-comparable" color={palette.warn} fontSize={12}>
                    These brews are of different recipes, so there is nothing to compare.
                </Text>
            )}
```

- `onCompare` sorts the two by `startedAt` ascending and pushes:

```tsx
    function compareSelected(): void {
        if (!comparable) return;
        const [older, newer] = [...selectedBrews]
            .sort((one, two) => one.startedAt - two.startedAt);
        setSelecting(false);
        setSelectedIds([]);
        router.push({pathname: "/brewCompare", params: {a: older.id, b: newer.id}});
    }
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest app/__tests__/brewHistorySelection.test.tsx app/__tests__/brewHistory.test.tsx`
Expected: PASS, both files' existing tests plus the five new ones.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npm run typecheck && npx eslint app/brewHistory.tsx
git add app/brewHistory.tsx app/__tests__/brewHistorySelection.test.tsx
git commit -m "Compare two ticked brews from the history

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Door two, from a brew record

The door a user finds without knowing the feature exists. COMPARE WITH on a record opens a sheet of that recipe's other brews, newest first.

**Files:**
- Create: `components/CompareWithSheet.tsx`
- Create: `components/__tests__/CompareWithSheet.test.tsx`
- Modify: `app/brewRecord.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/__tests__/CompareWithSheet.test.tsx
import {fireEvent, waitFor} from "@testing-library/react-native";
import React from "react";

import CompareWithSheet from "@/components/CompareWithSheet";
import {brewRecordFixture} from "@/test-utils/brewRecordMocks";
import {renderWithProviders} from "@/test-utils/render";

const OTHERS = [
    brewRecordFixture({id: "older", startedAt: 1_000}),
    brewRecordFixture({id: "newer", startedAt: 9_000})
];

describe("CompareWithSheet", () => {
    it("lists the recipe's other brews, newest first", async () => {
        const {getAllByTestId} = await renderWithProviders(
            <CompareWithSheet open candidates={OTHERS} onPick={jest.fn()}
                              onClose={jest.fn()} />
        );
        const ids = getAllByTestId(/^compare-candidate-/)
            .map((node) => node.props.testID);
        expect(ids).toEqual(["compare-candidate-newer", "compare-candidate-older"]);
    });

    it("hands back the brew that was tapped", async () => {
        const onPick = jest.fn();
        const {getByTestId} = await renderWithProviders(
            <CompareWithSheet open candidates={OTHERS} onPick={onPick}
                              onClose={jest.fn()} />
        );
        // The sheet's entrance swallows a press made too early.
        await waitFor(async () => {
            await fireEvent.press(getByTestId("compare-candidate-older"));
            expect(onPick).toHaveBeenCalledWith("older");
        });
    });

    it("says so when this is the only brew of its recipe", async () => {
        const {getByTestId} = await renderWithProviders(
            <CompareWithSheet open candidates={[]} onPick={jest.fn()}
                              onClose={jest.fn()} />
        );
        expect(getByTestId("compare-no-candidates")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/CompareWithSheet.test.tsx`
Expected: FAIL, "Cannot find module '@/components/CompareWithSheet'".

- [ ] **Step 3: Write the sheet**

`components/CompareWithSheet.tsx`, built on `XbrwSheet` exactly as `ImportSheet.tsx` is, never on `Dialog` or `Sheet` directly. Props `{open, candidates, onPick, onClose}` where `candidates: StoredBrew[]`.

- Sort a copy by `startedAt` descending. Newest first, because the brew a user most wants to compare against is usually the last one.
- Each row is a pressable with `testID={`compare-candidate-${brew.id}`}` and an `accessibilityLabel` naming the date, showing the date, the water and cup figures, and its stars where it has any. Reuse `BrewStars`, and draw nothing where `rating` is 0 or absent.
- A record whose stream was swept is still offered, with a quiet line saying its trace has gone. It is still worth comparing: the figures and the verdict survive, only the chart does not.
- Empty `candidates` renders `testID="compare-no-candidates"`: "This is the only brew of this recipe so far."

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/CompareWithSheet.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it to the record**

In `app/brewRecord.tsx`:

- `const [picking, setPicking] = useState(false)`.
- Candidates come from `sharedBrewDatabase().brewsFor(record.recipeUuid)` filtered to exclude `record.id`. Read them in the handler that opens the sheet, not during render: reading SQLite in render is the purity problem `react-hooks/purity` exists to catch, and `hooks/useBrewHistory.ts` spells out the house answer.
- Add a COMPARE WITH control beside the existing export buttons, `accessibilityLabel="Compare with another brew"`, hidden entirely when the recipe has no other brews so the screen does not offer a door that opens on nothing.
- `onPick` closes the sheet and pushes `{pathname: "/brewCompare", params: {a: older, b: newer}}`, again oldest first, so both doors land on the same arrangement.

- [ ] **Step 6: Run the record's tests, typecheck, lint and commit**

```bash
npx jest app/__tests__/brewRecord.test.tsx
npm run typecheck && npx eslint app/brewRecord.tsx components/CompareWithSheet.tsx
git add components/CompareWithSheet.tsx components/__tests__/CompareWithSheet.test.tsx app/brewRecord.tsx
git commit -m "Compare this brew with another from the record

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: The gate

Everything CI runs, green, before this branch is offered to anybody.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 2: Lint the whole repo**

Run: `npm run lint`
Expected: no errors. Warnings from `react-hooks/exhaustive-deps` are allowed; nothing new from `react-hooks/purity` or `react-hooks/set-state-in-effect` is.

- [ ] **Step 3: The full suite**

Run: `npm test`
Expected: green apart from the known pre-existing flakiness in `app/__tests__/index.test.tsx` under full-suite load, which passes 119 of 119 when run alone. If anything else fails, it belongs to this branch. Confirm the count grew by roughly the 40 tests this plan adds.

- [ ] **Step 4: Dependency and config health**

Run: `npx expo-doctor`
Expected: all checks pass. CI treats a failure here as fatal.

- [ ] **Step 5: Confirm what was not done**

No `expo.version` bump: nothing here touches native code, so the runtime version is unchanged. No schema migration: `brewsFor` and `samples` already existed. No new settings key: the overlay and separate modes are local state. Check `git diff main --stat` and confirm `app.json`, `library/BrewDatabase.ts` and `library/Settings.ts` are absent from it.

- [ ] **Step 6: Commit anything outstanding, then hand over**

```bash
git status --short
git log --oneline main..HEAD
```

The chart itself still wants a real device and two real brews of one recipe. The tolerances in `compare.ts` are the specific thing to check: 3 ml and 5 seconds are reasoned rather than measured, and the first pair of genuinely identical brews will say whether they are right.

---

## What this deliberately does not do

- **No n way comparison.** Two is the number the drawing grammar can carry, and a third line would need a device the chart has already spent.
- **No export.** Sharing a comparison is #105's, which owns share compositions.
- **No cross recipe comparison.** Two different recipes share no plan and no axis worth sharing, and the answer would always be "they are different recipes".
- **No temperature band on the overlay.** One brew's band is context; two overlapping bands are wallpaper.
