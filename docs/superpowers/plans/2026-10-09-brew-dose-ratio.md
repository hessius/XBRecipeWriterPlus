# Brew Dose and Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use subagent-driven-development only if the user explicitly chooses delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show this run's recipe dose and ratio beneath its name on live, finished, history and Story Card views, with an independent remembered Story Card toggle.

**Architecture:** One presentational `BrewRecipeContext` component uses pure geometry shared with the Story Card fitter. The live provider exposes its existing quick-edit metadata; finished and history surfaces use recorded snapshots. Move dose/ratio comparison badges into the new line, leaving measured figures and temperature/grind adjustments where they are.

**Tech Stack:** Expo SDK 57, React Native, React Compiler, Tamagui, Doto metrics, TypeScript, Jest's iOS and Android projects, asynchronous RNTL v14.

---

## Working context

- Worktree: `/Users/jesperhessius/.config/superpowers/worktrees/XBRecipeWriterPlus/issue-199-dose-ratio`
- Branch: `spec/issue-199-dose-ratio`
- Approved spec: `docs/superpowers/specs/2026-10-09-brew-dose-ratio-design.md`
- Base: `main` at `9dbe819`; the concurrent session's connect-timeout spec is not part of this branch.
- No implementation or dependency installation has happened during design.
- Run every command from this worktree. Never change the concurrent session's checkout.
- Do not create a PR, request automated review, merge, or build for a device as part of this plan.

The spec is authoritative. In particular, ratio is a recipe input, never
water/dose or cup/dose. Old records do not borrow today's saved recipe.

## File map

| File | Responsibility |
| --- | --- |
| `library/brew/figureGeometry.ts` | New input/segment types, display guards, formatting and recipe-line wrapping/height arithmetic |
| `components/BrewRecipeContext.tsx` (new) | Render the shared recipe line and comparison badges |
| `components/BrewSummary.tsx` | Include the line inside both capture compositions |
| `hooks/useLiveBrew.tsx` | Expose existing owner quick-edit metadata in its read-only snapshot |
| `app/brew.tsx` | Active-run values and line placement; recorded values after completion |
| `components/BrewFigures.tsx` | Remove dose/ratio adjustment figures and their types/measures |
| `app/brewRecord.tsx` | Recorded inputs, remaining adjustment metadata and independent Story Card toggle |
| `library/brew/storyCard.ts` | Content vocabulary, actual line measurement, fit/decline decisions |
| Existing tests plus `components/__tests__/BrewRecipeContext.test.tsx` | Observable rendering, ownership, fitting and compatibility |

No dependency, schema, card, backup-version, recording or machine-command changes.

## Execution rules

Each task uses red/green tests before committing. Keep new components at module
scope, use `@/` imports, and do not introduce `useMemo`/`useCallback`.
Await `renderWithProviders`, `renderHook`, `fireEvent`, and hook cleanup.
Use the existing `openCard`/`pressStoryToggle` helpers for sheet interactions;
their retry loops include `SHEET_PRESS_TIMEOUT`.

For each commit command below, add this second message:

```bash
-m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 1: Define the input line's shared geometry

**Files:**
- Modify: `library/brew/figureGeometry.ts`
- Test: `library/brew/__tests__/figureGeometry.test.ts`

- [ ] **Step 1: Add failing formatting and wrapping tests.**

Add imports for the new functions and type defined below. Add:

```ts
describe("recipe context", () => {
    it("keeps missing and invalid inputs absent", () => {
        expect(brewRecipeUnits()).toEqual([]);
        expect(brewRecipeUnits({dose: 0, ratio: NaN})).toEqual([]);
        expect(brewRecipeUnits({dose: Infinity, ratio: -1})).toEqual([]);
    });

    it("formats each available input and its saved-value comparison", () => {
        const units = brewRecipeUnits({
            dose: 15.5, ratio: 17, adjustedFromDose: 15, adjustedFromRatio: 16
        });
        expect(units.map(({label, value, badge}) => ({label, value, badge})))
            .toEqual([
                {label: "DOSE", value: "15.5 G", badge: "RECIPE 15"},
                {label: "RATIO", value: "1:17", badge: "RECIPE 1:16"}
            ]);
        expect(brewRecipeUnits({ratio: 16})).toHaveLength(1);
        expect(brewRecipeUnits({dose: 15, adjustedFromDose: 15})[0].badge)
            .toBeNull();
    });

    it("wraps whole units and measures comparison badges", () => {
        const inputs = {
            dose: 31, ratio: 100, adjustedFromDose: 15, adjustedFromRatio: 16
        };
        const wide = brewRecipeContextLayout(inputs, 600, 1);
        const narrow = brewRecipeContextLayout(inputs, 190, 1.4);
        expect(wide.rows).toHaveLength(1);
        expect(narrow.rows).toHaveLength(2);
        expect(narrow.totalHeight).toBeGreaterThan(wide.totalHeight);
        expect(narrow.fits).toBe(true);
        expect(narrow.maxWidth + STORY_FIT_MARGIN)
            .toBeLessThanOrEqual(narrow.columnWidth);
        expect(brewRecipeContextLayout(undefined, 190, 1.4).totalHeight).toBe(0);
        expect(brewRecipeContextLayout(inputs, 20, 1.4).fits).toBe(false);
    });
});
```

- [ ] **Step 2: Run the geometry tests and confirm the new imports fail.**

```bash
npx jest --runTestsByPath library/brew/__tests__/figureGeometry.test.ts
```

Expected: failures for the missing recipe-context functions, not unrelated failures.

- [ ] **Step 3: Add these definitions to `figureGeometry.ts`.**

Extend its Doto import with `dotoRowHeight`. All functions below are pure.

```ts
export type BrewRecipeInputs = {
    dose?: number;
    ratio?: number;
    adjustedFromDose?: number;
    adjustedFromRatio?: number;
};

export type BrewRecipeUnit = {
    key: "dose" | "ratio";
    label: string;
    value: string;
    badge: string | null;
    accessibilityLabel: string;
};

export const BREW_RECIPE_SIZE = 12;
export const BREW_RECIPE_TRACKING = 1.2;
export const BREW_RECIPE_LABEL_GAP = 4;
export const BREW_RECIPE_UNIT_GAP = 16;
export const BREW_RECIPE_ROW_GAP = 6;
export const BREW_RECIPE_AFTER_GAP = 8;

function positiveInput(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value > 0;
}

export function brewRecipeUnits(inputs: BrewRecipeInputs = {}): BrewRecipeUnit[] {
    const units: BrewRecipeUnit[] = [];
    const {dose, ratio, adjustedFromDose, adjustedFromRatio} = inputs;
    if (positiveInput(dose)) {
        const from = positiveInput(adjustedFromDose) && adjustedFromDose !== dose
            ? adjustedFromDose : undefined;
        units.push({
            key: "dose",
            label: "DOSE",
            value: `${dose} G`,
            badge: from === undefined ? null : `RECIPE ${from}`,
            accessibilityLabel: `Recipe dose, ${dose} grams${
                from === undefined ? "" : `, saved recipe ${from} grams`
            }`
        });
    }
    if (positiveInput(ratio)) {
        const from = positiveInput(adjustedFromRatio) && adjustedFromRatio !== ratio
            ? adjustedFromRatio : undefined;
        units.push({
            key: "ratio",
            label: "RATIO",
            value: `1:${ratio}`,
            badge: from === undefined ? null : `RECIPE 1:${from}`,
            accessibilityLabel: `Recipe ratio, 1 to ${ratio}${
                from === undefined ? "" : `, saved recipe 1 to ${from}`
            }`
        });
    }
    return units;
}

export type BrewRecipeMeasuredUnit = {
    unit: BrewRecipeUnit;
    badgeBelow: boolean;
    width: number;
    height: number;
};

export type BrewRecipeContextLayout = {
    rows: {units: BrewRecipeMeasuredUnit[]; height: number}[];
    columnWidth: number;
    maxWidth: number;
    totalHeight: number;
    fits: boolean;
};

export function brewRecipeContextLayout(
    inputs: BrewRecipeInputs | undefined,
    contentWidth: number,
    fontScale: number,
    scale = 1
): BrewRecipeContextLayout {
    const units = brewRecipeUnits(inputs);
    const badge = brewFigureBadgeGeometry(scale);
    const lineHeight = dotoRowHeight(BREW_RECIPE_SIZE * scale, fontScale);
    const badgeHeight = dotoRowHeight(
        badge.fontSize, fontScale, DOTO_MIN_FONT_SIZE * scale
    ) + (badge.paddingVertical + badge.borderWidth) * 2;
    const measured = units.map((unit) => {
        const width = dotoTextWidth(
            unit.label, BREW_RECIPE_SIZE * scale, fontScale,
            BREW_RECIPE_TRACKING * scale
        ) + BREW_RECIPE_LABEL_GAP * scale + dotoTextWidth(
            unit.value, BREW_RECIPE_SIZE * scale, fontScale,
            BREW_RECIPE_TRACKING * scale
        );
        const badgeWidth = unit.badge === null ? 0
            : brewFigureBadgeWidth(unit.badge, fontScale, scale);
        return {unit, width, badgeWidth, minimum: Math.max(width, badgeWidth)};
    });
    const twoWidth = Math.max(
        0, (contentWidth - BREW_RECIPE_UNIT_GAP * scale) / 2
    );
    const columns = measured.length === 2 && measured.every(
        ({minimum}) => minimum + STORY_FIT_MARGIN <= twoWidth
    ) ? 2 : 1;
    const columnWidth = columns === 2 ? twoWidth : Math.max(0, contentWidth);
    const laidOut: BrewRecipeMeasuredUnit[] = measured.map(
        ({unit, width, badgeWidth}) => {
            const badgeBelow = unit.badge !== null
                && width + badge.gap + badgeWidth + STORY_FIT_MARGIN > columnWidth;
            return {
                unit,
                badgeBelow,
                width: unit.badge === null ? width : badgeBelow
                    ? Math.max(width, badgeWidth) : width + badge.gap + badgeWidth,
                height: unit.badge === null ? lineHeight : badgeBelow
                    ? lineHeight + badge.gap + badgeHeight
                    : Math.max(lineHeight, badgeHeight)
            };
        }
    );
    const rows: BrewRecipeContextLayout["rows"] = [];
    for (let index = 0; index < laidOut.length; index += columns) {
        const row = laidOut.slice(index, index + columns);
        rows.push({units: row, height: Math.max(...row.map(({height}) => height))});
    }
    const maxWidth = Math.max(0, ...laidOut.map(({width}) => width));
    return {
        rows,
        columnWidth,
        maxWidth,
        totalHeight: rows.length === 0 ? 0
            : rows.reduce((sum, {height}) => sum + height, 0)
                + (rows.length - 1) * BREW_RECIPE_ROW_GAP * scale
                + BREW_RECIPE_AFTER_GAP * scale,
        fits: rows.length === 0 || maxWidth + STORY_FIT_MARGIN <= columnWidth
    };
}
```

- [ ] **Step 4: Run the same tests and confirm both platform projects pass.**
- [ ] **Step 5: Commit only the geometry and its tests.**

```bash
git add library/brew/figureGeometry.ts library/brew/__tests__/figureGeometry.test.ts
git commit -m "feat: measure brew recipe input context" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Render the shared compact line

**Files:**
- Create: `components/BrewRecipeContext.tsx`
- Create: `components/__tests__/BrewRecipeContext.test.tsx`

- [ ] **Step 1: Create these failing component tests.**

```tsx
import React from "react";
import {Dimensions} from "react-native";
import {screen, within} from "@testing-library/react-native";
import BrewRecipeContext from "@/components/BrewRecipeContext";
import type {BrewRecipeInputs} from "@/library/brew/figureGeometry";
import {renderWithProviders} from "@/test-utils/render";

describe("BrewRecipeContext", () => {
    beforeEach(() => {
        const size = {width: 393, height: 852, scale: 3, fontScale: 1};
        Dimensions.set({screen: size, window: size});
    });

    it("renders recipe inputs and exposes their meaning", async () => {
        await renderWithProviders(
            <BrewRecipeContext inputs={{dose: 15.5, ratio: 16}} contentWidth={357}/>
        );
        expect(screen.getByText("15.5 G")).toBeTruthy();
        expect(screen.getByText("1:16")).toBeTruthy();
        expect(screen.getByLabelText("Recipe dose, 15.5 grams")).toBeTruthy();
        expect(screen.getByLabelText("Recipe ratio, 1 to 16")).toBeTruthy();
    });

    it.each<[BrewRecipeInputs, string, string]>([
        [{dose: 15}, "brew-recipe-dose", "brew-recipe-ratio"],
        [{ratio: 16}, "brew-recipe-ratio", "brew-recipe-dose"]
    ])("draws a lone available input", async (inputs, present, absent) => {
        await renderWithProviders(
            <BrewRecipeContext inputs={inputs} contentWidth={357}/>
        );
        expect(screen.getByTestId(present)).toBeTruthy();
        expect(screen.queryByTestId(absent)).toBeNull();
    });

    it("omits its whole container when neither input exists", async () => {
        await renderWithProviders(<BrewRecipeContext contentWidth={357}/>);
        expect(screen.queryByTestId("brew-recipe-context")).toBeNull();
    });

    it("places comparisons on their own inputs", async () => {
        await renderWithProviders(
            <BrewRecipeContext contentWidth={357} inputs={{
                dose: 16, ratio: 17, adjustedFromDose: 15, adjustedFromRatio: 16
            }}/>
        );
        expect(within(screen.getByTestId("brew-recipe-dose"))
            .getByText("RECIPE 15")).toBeTruthy();
        expect(within(screen.getByTestId("brew-recipe-ratio"))
            .getByText("RECIPE 1:16")).toBeTruthy();
    });

    it("wraps units at large text without dropping either value", async () => {
        const size = {width: 393, height: 852, scale: 3, fontScale: 1.4};
        Dimensions.set({screen: size, window: size});
        await renderWithProviders(
            <BrewRecipeContext contentWidth={190} inputs={{dose: 31, ratio: 100}}/>
        );
        expect(screen.getAllByTestId("brew-recipe-row")).toHaveLength(2);
        expect(screen.getByText("31 G")).toBeTruthy();
        expect(screen.getByText("1:100")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run and confirm the missing-component failure.**

```bash
npx jest --runTestsByPath components/__tests__/BrewRecipeContext.test.tsx
```

- [ ] **Step 3: Create the component with this implementation.**

```tsx
import React from "react";
import {useWindowDimensions} from "react-native";
import {XStack, YStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {
    BREW_RECIPE_AFTER_GAP, BREW_RECIPE_LABEL_GAP, BREW_RECIPE_ROW_GAP,
    BREW_RECIPE_SIZE, BREW_RECIPE_TRACKING, BREW_RECIPE_UNIT_GAP,
    brewFigureBadgeGeometry, brewRecipeContextLayout,
    type BrewRecipeInputs, type BrewRecipeMeasuredUnit
} from "@/library/brew/figureGeometry";
import {DOTO_MIN_FONT_SIZE} from "@/library/dotoMetrics";

function InputUnit({entry, width, textScale}: {
    entry: BrewRecipeMeasuredUnit;
    width: number;
    textScale: number;
}) {
    const {unit, badgeBelow} = entry;
    const badge = brewFigureBadgeGeometry(textScale);
    const text = (
        <XStack alignItems="center" gap={BREW_RECIPE_LABEL_GAP * textScale}>
            <DotMatrixText fontSize={BREW_RECIPE_SIZE * textScale}
                           letterSpacing={BREW_RECIPE_TRACKING * textScale}
                           color={palette.dim} numberOfLines={1}>
                {unit.label}
            </DotMatrixText>
            <DotMatrixText fontSize={BREW_RECIPE_SIZE * textScale}
                           letterSpacing={BREW_RECIPE_TRACKING * textScale}
                           color={palette.text} numberOfLines={1}>
                {unit.value}
            </DotMatrixText>
        </XStack>
    );
    const comparison = unit.badge === null ? null : (
        <XStack testID={`brew-recipe-${unit.key}-comparison`}
                paddingHorizontal={badge.paddingHorizontal}
                paddingVertical={badge.paddingVertical}
                borderRadius={badge.borderRadius} borderWidth={badge.borderWidth}
                borderStyle="dashed" borderColor={palette.line} alignSelf="flex-start">
            <DotMatrixText fontSize={badge.fontSize}
                           letterSpacing={badge.tracking}
                           minFontSize={DOTO_MIN_FONT_SIZE * textScale}
                           color={palette.dim} numberOfLines={1}>
                {unit.badge}
            </DotMatrixText>
        </XStack>
    );
    return (
        <YStack testID={`brew-recipe-${unit.key}`} width={width}
                minHeight={entry.height} accessible
                accessibilityLabel={unit.accessibilityLabel}>
            {badgeBelow ? (
                <YStack gap={badge.gap}>{text}{comparison}</YStack>
            ) : (
                <XStack gap={badge.gap} alignItems="center">{text}{comparison}</XStack>
            )}
        </YStack>
    );
}

export default function BrewRecipeContext({
    inputs, contentWidth, textScale = 1
}: {
    inputs?: BrewRecipeInputs;
    contentWidth: number;
    textScale?: number;
}) {
    const {fontScale} = useWindowDimensions();
    const layout = brewRecipeContextLayout(inputs, contentWidth, fontScale, textScale);
    if (layout.rows.length === 0) return null;
    return (
        <YStack testID="brew-recipe-context" gap={BREW_RECIPE_ROW_GAP * textScale}
                marginBottom={BREW_RECIPE_AFTER_GAP * textScale}>
            {layout.rows.map((row) => (
                <XStack key={row.units[0].unit.key} testID="brew-recipe-row"
                        gap={BREW_RECIPE_UNIT_GAP * textScale} minHeight={row.height}>
                    {row.units.map((entry) => (
                        <InputUnit key={entry.unit.key} entry={entry}
                                   width={layout.columnWidth} textScale={textScale}/>
                    ))}
                </XStack>
            ))}
        </YStack>
    );
}
```

The root does not return `null` on a width refusal: the Story Card budget
decides omission before rendering. Supported live widths must fit after wrapping.

- [ ] **Step 4: Run component and geometry tests together.**

```bash
npx jest --runTestsByPath components/__tests__/BrewRecipeContext.test.tsx library/brew/__tests__/figureGeometry.test.ts
```

Expected: both projects pass. Add a Story Card text-scale assertion for the
rendered context's spacing:

```tsx
it("scales artwork spacing separately from OS text size", async () => {
    await renderWithProviders(
        <BrewRecipeContext inputs={{dose: 15, ratio: 16}}
                           contentWidth={186} textScale={0.5}/>
    );
    expect(screen.getByTestId("brew-recipe-context"))
        .toHaveStyle({marginBottom: 4, gap: 3});
});
```

- [ ] **Step 5: Commit the component and tests.**

```bash
git add components/BrewRecipeContext.tsx components/__tests__/BrewRecipeContext.test.tsx
git commit -m "feat: render compact brew dose and ratio context" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Wire active and finished runs without changing ownership

**Files:**
- Modify: `hooks/useLiveBrew.tsx`
- Modify: `app/brew.tsx`
- Modify: `components/BrewSummary.tsx`
- Test: `hooks/__tests__/useLiveBrew.test.tsx`
- Test: `app/__tests__/brew.test.tsx`
- Test: `components/__tests__/BrewSummary.test.tsx`
- Test: `components/__tests__/BrewSummary.storyScale.test.tsx`

- [ ] **Step 1: Add failing provider, live and capture assertions.**

Inside the provider's existing describe block, using its `harness` and `recipe`:

```tsx
it("publishes the active owner's quick-edit comparisons", async () => {
    const h = harness();
    const {result} = await renderHook(() => useLiveBrew(), {
        wrapper: ({children}) => (
            <LiveBrewProvider store={h.store}>{children}</LiveBrewProvider>
        )
    });
    await act(async () => {
        result.current.start(recipe(), {adjustedFromDose: 15, adjustedFromRatio: 16});
    });
    expect(result.current.run?.quickEdit)
        .toEqual({adjustedFromDose: 15, adjustedFromRatio: 16});
    expect(global.__brewer.brew).toHaveBeenCalledTimes(1);
});
```

In `brew.test.tsx`, add a `mockRunQuickEdit` variable typed
`QuickEditRecordAdjustments | undefined`, reset it in `beforeEach`, and publish
`quickEdit: mockRunQuickEdit` from the existing live-hook mock. Add:

```tsx
it("shows the active recipe and comparisons when reopened without route data", async () => {
    mockView = "1";
    mockRecipeJSON = undefined;
    mockRecipe.dosage = 16;
    mockRecipe.ratio = 17;
    mockRunQuickEdit = {adjustedFromDose: 15, adjustedFromRatio: 16};
    await renderWithProviders(<Brew/>);
    expect(screen.getByText("16 G")).toBeTruthy();
    expect(screen.getByText("1:17")).toBeTruthy();
    expect(screen.getByText("RECIPE 15")).toBeTruthy();
    expect(mockStart).not.toHaveBeenCalled();
});

it("uses the finished record rather than a subsequently changed recipe", async () => {
    mockPhase = {name: "done"};
    mockRecord = {...record, dose: 15, ratio: 16};
    mockRecipe.dosage = 20;
    mockRecipe.ratio = 18;
    await renderWithProviders(<Brew/>);
    const capture = within(screen.getByTestId("brew-capture"));
    expect(capture.getByText("15 G")).toBeTruthy();
    expect(capture.getByText("1:16")).toBeTruthy();
    expect(capture.queryByText("20 G")).toBeNull();
});
```

Reset `mockRecipe.dosage` and `mockRecipe.ratio` in the existing `beforeEach`
to prevent these mutations leaking between tests.

In `BrewSummary.test.tsx`, use its existing `draw` helper:

```tsx
it("includes recipe context inside the exported subtree", async () => {
    await draw({recipeInputs: {dose: 15, ratio: 16}});
    const capture = within(screen.getByTestId("brew-capture"));
    expect(capture.getByLabelText("Recipe dose, 15 grams")).toBeTruthy();
    expect(capture.getByLabelText("Recipe ratio, 1 to 16")).toBeTruthy();
});
```

- [ ] **Step 2: Run the three affected test files and confirm failures.**

```bash
npx jest --runTestsByPath hooks/__tests__/useLiveBrew.test.tsx app/__tests__/brew.test.tsx components/__tests__/BrewSummary.test.tsx
```

- [ ] **Step 3: Publish metadata and pass the correct inputs.**

In `LiveBrewSnapshot`, add:

```ts
quickEdit?: QuickEditRecordAdjustments;
```

In `RunOwner`'s existing snapshot object, include `quickEdit` alongside
`record`; no changes to effects, `start`, retry or recorder ownership.

Import `BrewRecipeContext` in `BrewSummary` and add the geometry type import:

```ts
import type {BrewRecipeInputs} from "@/library/brew/figureGeometry";
```

Add `recipeInputs?: BrewRecipeInputs` to its props and destructure it in the
component. Immediately after the name's `MarqueeText`, render:

```tsx
<BrewRecipeContext inputs={recipeInputs}
                   contentWidth={traceWidth} textScale={textScale}/>
```

This must be inside `summary-chrome` so existing measured ladder allocation
includes the new line.

In `app/brew.tsx`, import the component and `BrewRecipeInputs`. After resolving
the active `recipe`, define:

```ts
const activeQuickEdit = run === null ? quickEditRecord : run.quickEdit;
const recipeInputs: BrewRecipeInputs = run?.record ?? {
    dose: recipe.dosage,
    ratio: recipe.ratio,
    adjustedFromDose: activeQuickEdit?.adjustedFromDose,
    adjustedFromRatio: activeQuickEdit?.adjustedFromRatio
};
```

Give the done-state `BrewSummary`:

```tsx
recipeInputs={recipeInputs}
```

In the non-done branch, wrap the existing chart/ladder region in a zero-gap
flex column. Keep its test ID and layout callback on the inner region:

```tsx
<YStack flex={1} gap={0}>
    <BrewRecipeContext inputs={recipeInputs}
                       contentWidth={width - SCREEN_PADDING * 2}/>
    <YStack testID="brew-band-region" flex={1} gap={BREW_BAND_GAP}
            onLayout={(e) => setFlexHeight(e.nativeEvent.layout.height)}>
        {/* Keep the existing BrewTrace and BrewStageLadder elements unchanged. */}
    </YStack>
</YStack>
```

The comment in this structural example stands for those two existing elements,
not a new comment to add. Their complete props are already in the file and
must be retained. Keep `BrewFigures` and `BrewNowCard` outside this wrapper.
This avoids double-counting the parent's gap as part of the context's 8 pt
chart spacing and leaves band allocation measuring the space actually left.

- [ ] **Step 4: Extend transition and semantic coverage, then run the affected tests.**

Add these concrete cases to the existing `brew.test.tsx` describe block:

```tsx
it.each(["pouring", "failed", "done"] as const)(
    "retains recipe ratio through the %s phase", async (name) => {
        mockPhase = namedPhase(name);
        mockRecord = undefined;
        mockRecipe.dosage = 15;
        mockRecipe.ratio = 16;
        mockSamples = [{at: 0, water: 120, cup: 90, pour: 1}];
        await renderWithProviders(<Brew/>);
        expect(screen.getByText("1:16")).toBeTruthy();
    }
);

it("does not fill a missing finished snapshot from the active recipe", async () => {
    mockPhase = {name: "done"};
    mockRecord = {...record, dose: 15, ratio: undefined};
    mockRecipe.ratio = 18;
    await renderWithProviders(<Brew/>);
    expect(screen.getByText("15 G")).toBeTruthy();
    expect(screen.queryByTestId("brew-recipe-ratio")).toBeNull();
});
```

Add this rerender assertion around an unchanged active run. `settling` is
the existing machine phase after pouring; there is no `drawdown` phase:

```tsx
it("keeps recipe context stable across the settling boundary", async () => {
    mockRecipe.dosage = 15;
    mockRecipe.ratio = 16;
    const view = await renderWithProviders(<Brew/>);
    const before = screen.getAllByTestId("brew-recipe-row").length;
    mockPhase = {name: "settling"};
    await view.rerender(<Brew/>);
    expect(screen.getAllByTestId("brew-recipe-row")).toHaveLength(before);
    expect(screen.getByTestId("brew-recipe-context"))
        .toHaveStyle({marginBottom: 8, gap: 6});
});
```

```bash
npx jest --runTestsByPath hooks/__tests__/useLiveBrew.test.tsx app/__tests__/brew.test.tsx components/__tests__/BrewSummary.test.tsx components/__tests__/BrewSummary.storyScale.test.tsx
npm run typecheck
```

Expected: pass, with no second brew call or changed figure values.

- [ ] **Step 5: Commit the live and shared-summary wiring.**

```bash
git add hooks/useLiveBrew.tsx app/brew.tsx components/BrewSummary.tsx \
  hooks/__tests__/useLiveBrew.test.tsx app/__tests__/brew.test.tsx \
  components/__tests__/BrewSummary.test.tsx components/__tests__/BrewSummary.storyScale.test.tsx
git commit -m "feat: show recipe inputs throughout the live brew" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Use record snapshots and relocate quick-edit figures

**Files:**
- Modify: `app/brewRecord.tsx`
- Modify: `components/BrewFigures.tsx`
- Test: `app/__tests__/brewRecord.test.tsx`
- Test: `components/__tests__/BrewFigures.test.tsx`

- [ ] **Step 1: Add failing record rendering assertions.**

Inside the main record describe block:

```tsx
it("shows snapshots even when the recipe has been deleted", async () => {
    mockOpened = {record: {...record, dose: 15, ratio: 16}, samples: []};
    await renderWithProviders(<BrewRecord recipeLookup={noRecipeLookup}/>);
    const capture = within(screen.getByTestId("brew-capture"));
    expect(capture.getByText("15 G")).toBeTruthy();
    expect(capture.getByText("1:16")).toBeTruthy();
});

it("keeps an old record's inputs unknown despite a recipe lookup", async () => {
    mockOpened = {record: {...record, dose: undefined, ratio: undefined}, samples: []};
    await renderWithProviders(<BrewRecord recipeLookup={mockLookup}/>);
    expect(screen.queryByTestId("brew-recipe-context")).toBeNull();
});

it("draws dose and ratio comparisons once, in the context line", async () => {
    mockOpened = {
        record: {...record, dose: 16, ratio: 17,
            adjustedFromDose: 15, adjustedFromRatio: 16},
        samples: []
    };
    await renderWithProviders(<BrewRecord recipeLookup={noRecipeLookup}/>);
    expect(screen.getAllByText("RECIPE 15")).toHaveLength(1);
    expect(screen.getAllByText("RECIPE 1:16")).toHaveLength(1);
    expect(screen.queryByTestId("figures-adjusted-dose")).toBeNull();
    expect(screen.queryByTestId("figures-adjusted-ratio")).toBeNull();
});
```

- [ ] **Step 2: Run the record tests and confirm missing context failures.**

```bash
npx jest --runTestsByPath app/__tests__/brewRecord.test.tsx
```

- [ ] **Step 3: Remove dose/ratio from the adjustment grid and source record inputs.**

Replace `BrewFigureAdjustments` with:

```ts
export type BrewFigureAdjustments = {
    grind?: {value: number; from: number; confirmed?: boolean};
    temperature?: {offset: number; temperatures: number[]};
};
```

Delete the two `if (adjustments.dose...)` / `if (adjustments.ratio...)` blocks
from `adjustmentFigures`. Leave temperature, grind, badge helpers and their
measurement unchanged.

In `app/brewRecord.tsx`, delete the dose/ratio blocks from `quickEditFigures`.
Its existing `Object.keys(adjustments).length` guard now correctly returns
`undefined` for a dose/ratio-only edit.

Add to the existing shared `summary` description:

```ts
recipeInputs: {
    dose: record.dose,
    ratio: record.ratio,
    adjustedFromDose: record.adjustedFromDose,
    adjustedFromRatio: record.adjustedFromRatio
},
```

The record screen's spread into `BrewSummary` now supplies the line.
Do not use `recipe`, `handoffCoffee`, backfill helpers, or delivered volumes
to construct this property. `hasStoryDetails` already reads
`summary.adjustments !== undefined`; with the relocated fields removed,
it will no longer offer DETAILS for them alone.

Replace the record test that asserts all four child adjustment props with
observable assertions for the new context and the remaining grind/temperature
readouts. Keep its four-key record fixture; assert:

```tsx
expect(screen.getByTestId("brew-recipe-dose")).toHaveTextContent(/20 G/);
expect(screen.getByTestId("brew-recipe-ratio")).toHaveTextContent(/1:18/);
expect(screen.getByTestId("figures-adjusted-grind")).toBeTruthy();
expect(screen.getByTestId("figures-adjusted-temperature")).toBeTruthy();
expect(screen.queryByTestId("figures-adjusted-dose")).toBeNull();
expect(screen.queryByTestId("figures-adjusted-ratio")).toBeNull();
```

Update `BrewFigures.test.tsx`'s two four-adjustment fixtures to retain only
`temperature` and `grind`. Replace their dose/ratio assertions with assertions
on `figures-adjusted-temperature` and `figures-adjusted-grind`, using the
existing grind/temperature fixture values and accessibility labels. Preserve
the column-width regression by asserting the rendered remaining figures'
width against `brewFigureAdjustmentColumnWidth`.

- [ ] **Step 4: Run record and figure tests together, then typecheck.**

```bash
npx jest --runTestsByPath app/__tests__/brewRecord.test.tsx components/__tests__/BrewFigures.test.tsx components/__tests__/BrewFigures.storyScale.test.tsx
npm run typecheck
```

Expected: snapshots render independently of recipe lookup; temperature/grind
and measured WATER/CUP/TIME behaviour remain unchanged.

- [ ] **Step 5: Commit the record and adjustment-grid changes.**

```bash
git add app/brewRecord.tsx components/BrewFigures.tsx \
  app/__tests__/brewRecord.test.tsx components/__tests__/BrewFigures.test.tsx
git commit -m "feat: keep recorded recipe context separate from measured figures" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 5: Add the independent Story Card toggle and fitting

**Files:**
- Modify: `library/brew/storyCard.ts`
- Modify: `app/brewRecord.tsx`
- Test: `library/brew/__tests__/storyCard.test.ts`
- Test: `app/__tests__/brewRecord.test.tsx`
- Test: `components/__tests__/BrewStoryCard.test.tsx`
- Test: `components/__tests__/BrewStoryCard.storyScale.test.tsx`

- [ ] **Step 1: Add failing content-key, budget and toggle tests.**

In `storyCard.test.ts`, import the new geometry functions and add:

```ts
import {
    brewRecipeUnits,
    type BrewRecipeInputs
} from "@/library/brew/figureGeometry";
```

Merge this into its existing geometry import rather than creating a duplicate.

```ts
it("offers recipe context independently of details and defaults it on", () => {
    const facts = storyContentFacts({
        hasRateChart: false, hasCoffee: false, hasRating: false,
        recipeInputs: {dose: 15, ratio: 16}
    });
    expect(offeredStoryContent(facts)).toEqual(["recipe"]);
    expect(storyHiddenFromSetting('["details"]')).not.toContain("recipe");
    expect(storyHiddenToSetting(new Set(["recipe"]))).toBe('["recipe"]');
});

it("accounts for actual wrapped recipe inputs in the story height", () => {
    const input = {
        width: 375, stages: 3, fontScale: 1.4,
        hasRateChart: false, hasCoffee: false, hasRating: false,
        recipeInputs: {dose: 31, ratio: 100,
            adjustedFromDose: 15, adjustedFromRatio: 16}
    };
    const budget = storySummaryBudget(input);
    expect(budget.showRecipeInputs).toBe(true);
    expect(budget.declinedContent.recipe).toBe(false);
    expect(budget.requiredHeight).toBeLessThanOrEqual(budget.contentHeight);
    expect(storyHorizontalFit(input, budget).fits).toBe(true);
});

it("declines unfit recipe text without changing the stored preference", () => {
    const input = {
        width: 120, stages: 3, fontScale: 1.4,
        hasRateChart: false, hasCoffee: false, hasRating: false,
        recipeInputs: {dose: 31, ratio: 100}
    };
    const budget = storySummaryBudget(input);
    expect(budget.showRecipeInputs).toBe(false);
    expect(budget.declinedContent.recipe).toBe(true);
    expect(storyHiddenFromSetting("")).toHaveProperty("size", 0);
});
```

Inside `brewRecord.test.tsx`'s existing Story Card describe block, using
its `lookup`, `openCard` and `pressStoryToggle`:

```tsx
it("keeps recipe context independent of the DETAILS toggle", async () => {
    mockOpened = {
        record: {...record, dose: 16, ratio: 17,
            adjustedFromDose: 15, adjustedFromGrind: 50, grindSize: 60},
        samples: []
    };
    await renderWithProviders(<BrewRecord recipeLookup={lookup}/>);
    await openCard(600);
    await pressStoryToggle("DETAILS");
    let card = within(screen.getByTestId("brew-story-card"));
    expect(card.getByText("16 G")).toBeTruthy();
    expect(card.getByText("RECIPE 15")).toBeTruthy();
    await pressStoryToggle("DOSE & RATIO");
    card = within(screen.getByTestId("brew-story-card"));
    expect(card.queryByTestId("brew-recipe-context")).toBeNull();
    expect(sharedSettings().get("storyCardHidden")).toContain("recipe");
    await pressStoryToggle("DOSE & RATIO");
    expect(within(screen.getByTestId("brew-story-card"))
        .getByTestId("brew-recipe-context")).toBeTruthy();
});

it("offers recipe context but not DETAILS for a dose-only quick edit", async () => {
    mockOpened = {
        record: {...record, dose: 16, ratio: 16, adjustedFromDose: 15},
        samples: []
    };
    await renderWithProviders(<BrewRecord recipeLookup={lookup}/>);
    await openCard(600);
    expect(screen.getByLabelText("DOSE & RATIO")).toBeTruthy();
    expect(screen.queryByLabelText("DETAILS")).toBeNull();
});
```

- [ ] **Step 2: Run the pure story and record tests and confirm failures.**

```bash
npx jest --runTestsByPath library/brew/__tests__/storyCard.test.ts app/__tests__/brewRecord.test.tsx
```

- [ ] **Step 3: Extend content vocabulary, budget measurement and decline attempts.**

Import `brewRecipeUnits`, `brewRecipeContextLayout` and `BrewRecipeInputs`
from `figureGeometry`.

Add to `StorySummaryBudgetInput`:

```ts
recipeInputs?: BrewRecipeInputs;
```

Append `"recipe"` to `STORY_CONTENT_KEYS`. Add `showRecipeInputs: boolean`
to `StorySummaryBudget`; its `declinedContent` type already follows the keys.
In `storyContentFacts`, include `recipeInputs` in its picked fields and
destructured parameter, and add:

```ts
recipe: brewRecipeUnits(recipeInputs).length > 0,
```

In `storySummaryBudget`, destructure `recipeInputs` from its input and compute
once before `build`:

```ts
const recipeLayout = brewRecipeContextLayout(
    recipeInputs, storyTextContentWidth(width), fontScale, storyTextScale(width)
);
```

Add `recipe` to `requested` with the same availability expression.
Append `showRecipe: boolean` to `build`'s parameters. In the summary height,
insert this term after `rows.name`:

```ts
+ (showRecipe ? recipeLayout.totalHeight : 0)
```

Add to `budgetForFit`:

```ts
showRecipeInputs: showRecipe,
```

Pass `recipeInputs` in `build`'s `storyHorizontalFit` input. Add
`recipe: boolean` to `Attempt`; set `baseAttempt.recipe = requested.recipe`.
Add `"recipe"` to the decline-key type and append it to `declineOrder`:

```ts
const declineOrder: (keyof Pick<
    Attempt, "tags" | "rating" | "coffee" | "note" | "details" | "rate" | "recipe"
>)[] = ["tags", "rating", "coffee", "note", "details", "rate", "recipe"];
```

Pass `chosen.recipe` / `attempt.recipe` as the last argument at both `build`
call sites. In the returned budget:

```ts
showRecipeInputs: chosen.recipe,
```

and in `declinedContent`:

```ts
recipe: requested.recipe && !chosen.recipe,
```

Extend `storyHorizontalFit`'s budget parameter with optional
`showRecipeInputs?: boolean`, retaining backward compatibility for existing
callers that pass only figure decisions. Before its `fitResult` return, add:

```ts
const recipeLayout = brewRecipeContextLayout(
    input.recipeInputs, storyTextContentWidth(width), fontScale, storyTextScale(width)
);
const showRecipe = budget.showRecipeInputs
    ?? (brewRecipeUnits(input.recipeInputs).length > 0);
```

Append to the `fitResult` array:

```ts
...(showRecipe ? [{
    id: "recipe inputs",
    width: recipeLayout.maxWidth,
    limit: recipeLayout.columnWidth
}] : []),
```

No additions to `Settings.DEFAULTS` or backup snapshots: the existing string
setting stores the new content key.

- [ ] **Step 4: Wire unmasked availability and masked rendering in the record route.**

Add `recipe: "DOSE & RATIO"` to `STORY_TOGGLE_LABELS`.
Give `storyContentFacts` the unmasked recorded input object:

```ts
recipeInputs: summary.recipeInputs,
```

Beside `storyHasDetails`, add:

```ts
const storyRecipeInputs = storyContentRequested("recipe")
    ? summary.recipeInputs : undefined;
```

In the sheet's budget input, add:

```ts
recipeInputs: storyRecipeInputs,
```

In the Story Card's `BrewSummary`, override the spread's input property:

```tsx
recipeInputs={budget.showRecipeInputs ? storyRecipeInputs : undefined}
```

Keep that override independent of `storyHasDetails` and
`budget.showFigureDetails`. `BrewStoryCard` itself needs no new value props:
it still receives the shared summary.

- [ ] **Step 5: Extend the independent drawn-height sweep.**

In `trueDrawnHeight`, account for the new line without using
`brewRecipeContextLayout(...).totalHeight` as the expected height:

```ts
const recipeUnits = budget.showRecipeInputs
    ? brewRecipeUnits(input.recipeInputs) : [];
const recipeLineHeight = dotoRowHeight(12 * textScale, fontScale);
const recipeBadge = brewFigureBadgeGeometry(textScale);
const recipeBadgeHeight = dotoRowHeight(
    recipeBadge.fontSize, fontScale, DOTO_MIN_FONT_SIZE * textScale
) + 2 * (recipeBadge.paddingVertical + recipeBadge.borderWidth);
const recipeWidths = recipeUnits.map((unit) => {
    const base = dotoTextWidth(unit.label, 12 * textScale, fontScale, 1.2 * textScale)
        + 4 * textScale
        + dotoTextWidth(unit.value, 12 * textScale, fontScale, 1.2 * textScale);
    const badge = unit.badge === null ? 0
        : brewFigureBadgeWidth(unit.badge, fontScale, textScale);
    return {base, badge, hasBadge: unit.badge !== null};
});
const recipeAvailable = storyTextContentWidth(input.width);
const recipeHalf = (recipeAvailable - 16 * textScale) / 2;
const recipeColumns = recipeWidths.length === 2 && recipeWidths.every(
    ({base, badge}) => Math.max(base, badge) + STORY_FIT_MARGIN <= recipeHalf
) ? 2 : 1;
const recipeColumn = recipeColumns === 2 ? recipeHalf : recipeAvailable;
const recipeHeights = recipeWidths.map(({base, badge, hasBadge}) =>
    !hasBadge ? recipeLineHeight
        : base + recipeBadge.gap + badge + STORY_FIT_MARGIN <= recipeColumn
            ? Math.max(recipeLineHeight, recipeBadgeHeight)
            : recipeLineHeight + recipeBadge.gap + recipeBadgeHeight
);
const recipeHeight = recipeHeights.length === 0 ? 0
    : recipeColumns === 2
        ? Math.max(...recipeHeights) + 8 * textScale
        : recipeHeights.reduce((sum, height) => sum + height, 0)
            + (recipeHeights.length - 1) * 6 * textScale + 8 * textScale;
```

Add `recipeHeight` beside `nameHeight` in the returned drawn height.
Import `DOTO_MIN_FONT_SIZE` and `brewFigureBadgeWidth` where needed.
These literal sizes intentionally characterize the rendered contract rather
than simply echoing the budget's own total.

Replace the existing `storyMaskInputs` implementation with:

```ts
function storyMaskInputs(width: number, stages: number, fontScale: number): SweepInput[] {
    const contexts: (BrewRecipeInputs | undefined)[] = [
        undefined,
        {dose: 31},
        {ratio: 100},
        {dose: 31, ratio: 100},
        {dose: 15.5, ratio: 17, adjustedFromDose: 31, adjustedFromRatio: 100}
    ];
    return contexts.flatMap((recipeInputs) =>
        Array.from({length: 128}, (_, mask) => ({
            width, stages, fontScale, recipeInputs,
            hasCoffee: (mask & 1) !== 0,
            hasRating: (mask & 2) !== 0,
            tags: (mask & 4) !== 0
                ? ["Ethiopia", "washed", "late drawdown", "long tag wraps"] : [],
            hasSummaryNote: (mask & 8) !== 0,
            figureExtraRows: (mask & 16) !== 0 ? 1 : 0,
            hasRateChart: (mask & 32) !== 0,
            hasBypass: (mask & 64) !== 0,
            hasGrindRecipeBadge: (mask & 16) !== 0,
            drawdownRate: (mask & 16) !== 0 ? 2.1 : null
        }))
    );
}
```

Keep the existing complete width/font-scale/stage-count loops. If a test pins
the number of visited cells, multiply its mask factor by five rather than
removing the count assertion. Update exact `STORY_CONTENT_KEYS` or
`declinedContent` expectations to include `recipe`, false for old fixtures
without inputs.

Add a priority assertion over the same sweep cells:

```ts
if (budget.declinedContent.recipe) {
    expect(budget.showStages).toBe(false);
    expect(budget.showRateChart).toBe(false);
    expect(budget.showFigureDetails).toBe(false);
    expect(budget.showCoffee).toBe(false);
    expect(budget.showRating).toBe(false);
    expect(budget.shownTagCount).toBe(0);
    expect(budget.showSummaryNote).toBe(false);
}
```

Do not weaken fit limits or widen the safe bands to make the sweep pass.

- [ ] **Step 6: Run affected story tests and typecheck.**

```bash
npx jest --runTestsByPath library/brew/__tests__/storyCard.test.ts app/__tests__/brewRecord.test.tsx components/__tests__/BrewStoryCard.test.tsx components/__tests__/BrewStoryCard.storyScale.test.tsx components/__tests__/BrewSummary.storyScale.test.tsx
npm run typecheck
```

Expected: independent toggles, fitting and old setting strings pass on both
platforms. If the expanded sweep exceeds its current per-test timeout, first
reuse each computed budget across related assertions within the existing
sweep; do not change the repository's global Jest timeouts or worker cap.

- [ ] **Step 7: Commit Story Card fitting and toggle changes.**

```bash
git add library/brew/storyCard.ts app/brewRecord.tsx \
  library/brew/__tests__/storyCard.test.ts app/__tests__/brewRecord.test.tsx \
  components/__tests__/BrewStoryCard.test.tsx components/__tests__/BrewStoryCard.storyScale.test.tsx
git commit -m "feat: add independent story recipe context toggle and fitting" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 6: Close coverage gaps and verify the whole presentation change

**Files:**
- Test: `app/__tests__/brew.test.tsx`
- Test: `app/__tests__/brewRecord.test.tsx`
- Test: `components/__tests__/BrewRecipeContext.test.tsx`
- Test: `library/brew/__tests__/storyCard.test.ts`

- [ ] **Step 1: Add explicit immutable snapshot, tea, bypass and preference cases.**

Use the existing brew mock and extend its recipe import to
`import Recipe, {CUP_TYPE} from "@/library/Recipe";`:

```tsx
it("shows tea's recipe ratio rather than a measured ratio", async () => {
    mockRecipe.cupType = CUP_TYPE.TEA;
    mockRecipe.dosage = 5;
    mockRecipe.ratio = 18;
    mockSamples = [{at: 0, water: 45, cup: 40, pour: 1}];
    await renderWithProviders(<Brew/>);
    expect(screen.getByText("5 G")).toBeTruthy();
    expect(screen.getByText("1:18")).toBeTruthy();
});
```

Reset `mockRecipe.cupType` in `beforeEach` alongside the other mutated fields.
Use its original/default value, captured before mutation, not a guessed cup
type constant.

For bypass, extend an existing test with a valid `mockBypass` fixture and
`mockRecipe.ratio = 16`; assert `1:16` remains while the existing WATER/bypass
assertions continue to pass. Do not build a second bypass arithmetic path.

In the Story Card describe block add:

```tsx
it("remembers hiding recipe context and retains old hidden choices", async () => {
    mockOpened = {record: {...record, dose: 15, ratio: 16}, samples: []};
    sharedSettings().set("storyCardHidden", '["coffee","recipe"]');
    await renderWithProviders(<BrewRecord recipeLookup={lookup}/>);
    await openCard(600);
    const card = within(screen.getByTestId("brew-story-card"));
    expect(card.queryByTestId("brew-recipe-context")).toBeNull();
    expect(screen.getByLabelText("DOSE & RATIO").props.accessibilityState)
        .toEqual(expect.objectContaining({selected: false}));
    await pressStoryToggle("DOSE & RATIO");
    const hidden = JSON.parse(sharedSettings().get("storyCardHidden") as string);
    expect(hidden).toContain("coffee");
    expect(hidden).not.toContain("recipe");
});
```

Add this unavailable-state case in the same Story Card describe block.
The enlarged OS text is significant: a 120 pt card at the default font scale
may still fit the compact line.

```tsx
it("does not remember a fitting refusal as a hidden preference", async () => {
    mockWindowFontScale(1.4);
    mockOpened = {record: {...record, dose: 31, ratio: 100}, samples: []};
    await renderWithProviders(<BrewRecord recipeLookup={lookup}/>);
    await openCard(120);
    expect(screen.getByLabelText("DOSE & RATIO unavailable, this will not fit"))
        .toBeTruthy();
    expect(sharedSettings().get("storyCardHidden")).not.toContain("recipe");
});
```

Change the record test's `import type Recipe` to a default `Recipe` import,
then add this snapshot mutation case to its main describe block:

```tsx
it("does not rewrite recorded inputs when the saved recipe changes", async () => {
    const saved = new Recipe();
    saved.dosage = 20;
    saved.ratio = 18;
    const changedLookup: RecipeLookup = {getRecipe: () => saved};
    mockOpened = {record: {...record, dose: 15, ratio: 16}, samples: []};
    const view = await renderWithProviders(
        <BrewRecord recipeLookup={changedLookup}/>
    );
    let capture = within(screen.getByTestId("brew-capture"));
    expect(capture.getByText("15 G")).toBeTruthy();
    expect(capture.getByText("1:16")).toBeTruthy();
    expect(capture.queryByText("20 G")).toBeNull();
    await view.rerender(<BrewRecord recipeLookup={noRecipeLookup}/>);
    capture = within(screen.getByTestId("brew-capture"));
    expect(capture.getByText("15 G")).toBeTruthy();
    expect(capture.getByText("1:16")).toBeTruthy();
});
```

- [ ] **Step 2: Run the combined targeted suites.**

```bash
npx jest --runTestsByPath \
  library/brew/__tests__/figureGeometry.test.ts \
  library/brew/__tests__/storyCard.test.ts \
  components/__tests__/BrewRecipeContext.test.tsx \
  components/__tests__/BrewFigures.test.tsx \
  components/__tests__/BrewFigures.storyScale.test.tsx \
  components/__tests__/BrewSummary.test.tsx \
  components/__tests__/BrewSummary.storyScale.test.tsx \
  components/__tests__/BrewStoryCard.test.tsx \
  components/__tests__/BrewStoryCard.storyScale.test.tsx \
  hooks/__tests__/useLiveBrew.test.tsx \
  app/__tests__/brew.test.tsx \
  app/__tests__/brewRecord.test.tsx
npm run typecheck
npx eslint components/BrewRecipeContext.tsx components/BrewFigures.tsx \
  components/BrewSummary.tsx app/brew.tsx app/brewRecord.tsx \
  hooks/useLiveBrew.tsx library/brew/figureGeometry.ts library/brew/storyCard.ts \
  components/__tests__/BrewRecipeContext.test.tsx \
  components/__tests__/BrewFigures.test.tsx components/__tests__/BrewSummary.test.tsx \
  hooks/__tests__/useLiveBrew.test.tsx app/__tests__/brew.test.tsx \
  app/__tests__/brewRecord.test.tsx library/brew/__tests__/figureGeometry.test.ts \
  library/brew/__tests__/storyCard.test.ts
git diff --check
```

Expected: both Jest projects pass, TypeScript and ESLint have no errors.
Run `npm run lint` and the full `npm test` only if targeted results reveal
cross-suite regressions or the user requests a full pre-PR check. Do not install
packages unless validation first fails because dependencies are missing.

- [ ] **Step 3: Review the real rendered composition if a usable local dev client is available.**

Check narrow and common phone widths, 1.4x OS text, quick-edited comparisons,
and a seventeen-stage Story Card. Confirm the line stays above the chart,
its badges do not clip, the live ladder consumes only remaining space,
and the exported Story Card matches its preview. Do not substitute browser
mockups for this review. Do not rebuild native projects or target a physical
device without the user's approval; if runtime review is unavailable, record
that limitation explicitly in the handoff.

- [ ] **Step 4: Commit only remaining test changes and stop before PR creation.**

```bash
git add app/__tests__/brew.test.tsx app/__tests__/brewRecord.test.tsx \
  components/__tests__/BrewRecipeContext.test.tsx library/brew/__tests__/storyCard.test.ts
git commit -m "test: cover brew recipe context snapshots and story preferences" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git status --short
```

Expected: clean worktree. Skip the commit if Step 1's coverage was already
completed and committed in earlier tasks; never manufacture an empty commit.

## Plan review and handoff

All approved requirements map to tasks: presentation/wrapping to 1–2,
live ownership and completion to 3, immutable snapshots and non-duplicated
comparisons to 4, independent remembered toggles and budget priority to 5,
and semantic/accessibility/fit regressions to 6.

Execution has not begun. Select inline execution or explicitly request
subagent-driven execution before modifying application code.
