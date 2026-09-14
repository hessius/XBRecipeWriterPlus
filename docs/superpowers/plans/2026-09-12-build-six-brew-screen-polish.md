# Build 6 Brew-Screen Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the display awake during actionable brews, apply the revised agitation copy, replace the overhanging agitation marker with the approved contained wave, and make overflowing ladders reveal only the clipped part of the active rung.

**Architecture:** The brew route controls wake-lock lifetime by conditionally mounting a focused `BrewWakeLock` component during existing `RUNNING` phases. `BrewStageRung` owns the contained agitation wave, while a pure `minimalRevealOffset` helper owns scroll arithmetic and `BrewStageLadder` supplies native measurements and performs the scroll. Existing domain, machine, recorder, and export boundaries remain unchanged.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, Tamagui, `react-native-svg`, `expo-keep-awake`, Jest 29, React Native Testing Library 14.

**Design reference:** `docs/superpowers/specs/2026-09-12-build-six-brew-screen-polish-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | Declare `expo-keep-awake` as an application dependency. |
| `package-lock.json` | Lock the SDK-compatible keep-awake package. |
| `components/BrewWakeLock.tsx` | Own the unconditional `useKeepAwake` hook while mounted. |
| `app/brew.tsx` | Mount the wake lock only during existing `RUNNING` phases. |
| `app/__tests__/brew.test.tsx` | Prove the route activates and releases the wake lock for the approved phases. |
| `constants/brewCopy.ts` | Hold the revised before/after agitation sentences. |
| `constants/__tests__/brewCopy.test.ts` | Pin the exact approved agitation copy. |
| `docs/copy.md` | Preserve and commit the user's source copy edits. |
| `components/BrewStageRung.tsx` | Draw and position the compact wave without vertical overhang. |
| `components/__tests__/BrewStageRung.test.tsx` | Pin wave bounds, placement, colour, and both-marker behavior. |
| `library/brew/rungGeometry.ts` | Remove obsolete notch-clearance geometry. |
| `library/brew/bands.ts` | Restore the pre-overhang three-point minimum rung gap. |
| `library/brew/__tests__/bands.test.ts` | Pin the restored spacing budget and known allocations. |
| `library/brew/ladderScroll.ts` | Calculate the minimum scroll offset needed to reveal an active rung. |
| `library/brew/__tests__/ladderScroll.test.ts` | Exhaustively test reveal, no-op, and clamping arithmetic. |
| `components/BrewStageLadder.tsx` | Record viewport, content, offset, and rung bounds; perform minimal reveal scrolling. |
| `components/__tests__/BrewStageLadder.test.tsx` | Preserve measured-overflow behavior and assert the new measurement inputs are wired. |

---

### Task 1: Keep the screen awake during actionable brew phases

**Files:**
- Create: `components/BrewWakeLock.tsx`
- Modify: `app/brew.tsx`
- Modify: `app/__tests__/brew.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the failing route tests**

At the top of `app/__tests__/brew.test.tsx`, add a mock that records calls to
the Expo hook:

```tsx
const mockUseKeepAwake = jest.fn();

jest.mock("expo-keep-awake", () => ({
    useKeepAwake: (...args: unknown[]) => mockUseKeepAwake(...args)
}));
```

Clear it in `beforeEach`:

```tsx
mockUseKeepAwake.mockClear();
```

Add a phase helper and the two tests inside `describe("brew route", ...)`:

```tsx
function namedPhase(name: string): BrewPhase {
    if (name === "pouring") return {name: "pouring", pour: 1, pours: 1};
    if (name === "failed") return {name: "failed", reason: "blocked"};
    return {name} as BrewPhase;
}

it.each([
    "waking", "sending", "readyToStart", "armed", "pressPlay",
    "grinding", "pouring", "bypass", "settling"
])("keeps the display awake during %s", async (name) => {
    mockPhase = namedPhase(name);

    await renderWithProviders(<Brew />);

    expect(mockUseKeepAwake).toHaveBeenCalledWith("active-brew");
});

it.each(["idle", "done", "cancelled", "failed", "lostContact"])(
    "allows the display to sleep during %s",
    async (name) => {
        mockPhase = namedPhase(name);

        await renderWithProviders(<Brew />);

        expect(mockUseKeepAwake).not.toHaveBeenCalled();
    }
);
```

- [ ] **Step 2: Run the route tests and verify the new assertions fail**

Run:

```bash
npx jest app/__tests__/brew.test.tsx --runInBand
```

Expected: FAIL because `app/brew.tsx` never calls `useKeepAwake`.

- [ ] **Step 3: Install the SDK-compatible direct dependency**

Run:

```bash
npx expo install expo-keep-awake
```

Expected: `package.json` contains `"expo-keep-awake": "~57.0.2"` and the lockfile
records it as a direct root dependency.

- [ ] **Step 4: Create the focused wake-lock component**

Create `components/BrewWakeLock.tsx`:

```tsx
import {useKeepAwake} from "expo-keep-awake";

const ACTIVE_BREW_TAG = "active-brew";

export default function BrewWakeLock() {
    useKeepAwake(ACTIVE_BREW_TAG);
    return null;
}
```

Do not pass an `active` prop or call the hook conditionally inside this
component. Its mount lifetime is the wake-lock lifetime.

- [ ] **Step 5: Mount the component from the existing phase decision**

In `app/brew.tsx`, import the component:

```tsx
import BrewWakeLock from "@/components/BrewWakeLock";
```

Inside the root `YStack`, before the navigation row, add:

```tsx
{running && <BrewWakeLock />}
```

Use the existing `running = RUNNING.has(phase.name)` value. Do not introduce a
second phase list.

- [ ] **Step 6: Run the route tests and verify they pass**

Run:

```bash
npx jest app/__tests__/brew.test.tsx --runInBand
```

Expected: PASS, including all active and terminal phase cases.

- [ ] **Step 7: Commit the wake-lock slice**

```bash
git add package.json package-lock.json components/BrewWakeLock.tsx \
  app/brew.tsx app/__tests__/brew.test.tsx
git commit -m "Keep the screen awake during active brews" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Apply and pin the revised agitation copy

**Files:**
- Modify: `constants/__tests__/brewCopy.test.ts`
- Modify: `constants/brewCopy.ts`
- Modify: `docs/copy.md`

- [ ] **Step 1: Add the failing exact-copy test**

Import `AGITATION` in `constants/__tests__/brewCopy.test.ts`:

```ts
import {AGITATION} from "@/library/Pour";
```

Add:

```ts
it("describes agitation relative to the pour", () => {
    expect(AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_OFF])
        .toBe("Agitates the bed before pouring.");
    expect(AGITATION_SENTENCE[AGITATION.BEFORE_OFF_AFTER_ON])
        .toBe("Agitates the bed after pouring.");
    expect(AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_ON])
        .toBe("Agitates the bed before and after pouring.");
});
```

- [ ] **Step 2: Run the copy test and verify it fails**

Run:

```bash
npx jest constants/__tests__/brewCopy.test.ts --runInBand
```

Expected: FAIL showing the old “first” and “afterwards” strings.

- [ ] **Step 3: Apply the user's approved strings**

Replace `AGITATION_SENTENCE` in `constants/brewCopy.ts` with:

```ts
export const AGITATION_SENTENCE: Record<number, string> = {
    [AGITATION.BEFORE_ON_AFTER_OFF]: "Agitates the bed before pouring.",
    [AGITATION.BEFORE_OFF_AFTER_ON]: "Agitates the bed after pouring.",
    [AGITATION.BEFORE_ON_AFTER_ON]:  "Agitates the bed before and after pouring."
};
```

Do not alter the current user edits in `docs/copy.md`; they are the source for
these exact strings.

- [ ] **Step 4: Run the copy test and verify it passes**

Run:

```bash
npx jest constants/__tests__/brewCopy.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit source and copy document together**

```bash
git add constants/brewCopy.ts constants/__tests__/brewCopy.test.ts docs/copy.md
git commit -m "Clarify agitation timing copy" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Replace the overhanging agitation marker with the compact wave

**Files:**
- Modify: `components/BrewStageRung.tsx`
- Modify: `components/__tests__/BrewStageRung.test.tsx`

- [ ] **Step 1: Rewrite the marker tests for the approved geometry**

In `components/__tests__/BrewStageRung.test.tsx`, remove the assertions that
expect an absolute notch, `top: -14`, `bottom: -3`, and a two-point solid line.
Keep the existing before-only, after-only, both, none, colour-state, ordering,
and accessibility coverage.

Import `AGITATION_WIDTH` beside `SEGMENT_GAP`:

```tsx
import BrewStageRung, {AGITATION_WIDTH, SEGMENT_GAP}
    from "@/components/BrewStageRung";
```

Add these failing tests:

```tsx
it("contains the agitation wave within the pill height", async () => {
    const {getByTestId} = await draw({
        barHeight: 11,
        pour: new Pour(
            1, 70, 93, 40,
            AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
        )
    });

    const mark = StyleSheet.flatten(
        getByTestId("rung-agitation-after").props.style
    );
    const wave = getByTestId("rung-agitation-after-wave");

    expect(mark.height).toBe(11);
    expect(mark.width).toBe(AGITATION_WIDTH);
    expect(mark.position).toBeUndefined();
    expect(wave.props.height).toBe(11);
});

it("draws the approved smooth wave", async () => {
    const {getByTestId} = await draw({pour: new Pour(
        1, 70, 93, 40,
        AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
    )});

    expect(getByTestId("rung-agitation-after-path").props.d)
        .toBe("M5.5 0 C1 2 10 4.5 5.5 7 C1 9.5 10 12 5.5 14");
});

it("uses a wider wave slot without changing ordinary segment gaps", async () => {
    const {getByTestId} = await draw({pour: new Pour(
        1, 70, 93, 40,
        AGITATION.BEFORE_OFF_AFTER_ON, POUR_PATTERN.CENTERED, 20
    )});

    expect(AGITATION_WIDTH).toBe(11);
    expect(StyleSheet.flatten(
        getByTestId("rung-agitation-after").props.style
    ).width).toBe(11);
    expect(SEGMENT_GAP).toBe(3);
});
```

Update the existing “draws the two marks identically” assertion to compare the
contained mark styles and both SVG heights.

- [ ] **Step 2: Run the rung test and verify it fails**

Run:

```bash
npx jest components/__tests__/BrewStageRung.test.tsx --runInBand
```

Expected: FAIL because the marker still uses the glyph/notch overhang and
`AGITATION_WIDTH` does not exist.

- [ ] **Step 3: Implement the contained SVG wave**

In `components/BrewStageRung.tsx`, import SVG primitives:

```tsx
import Svg, {Path} from "react-native-svg";
```

Remove `NOTCH_OVERHANG` from the `rungGeometry` import. Delete
`NOTCH_WIDTH` and `NOTCH_GLYPH`. Add:

```tsx
export const AGITATION_WIDTH = 11;
const AGITATION_VIEWBOX_HEIGHT = 14;
const AGITATION_PATH =
    "M5.5 0 C1 2 10 4.5 5.5 7 C1 9.5 10 12 5.5 14";
```

Replace `AgitationMark` with:

```tsx
function AgitationMark({colour, barHeight, testID}:
                       {colour: string; barHeight: number; testID: string}) {
    return (
        <View
            testID={testID}
            pointerEvents="none"
            style={{
                width: AGITATION_WIDTH,
                height: barHeight,
                alignItems: "center",
                justifyContent: "center"
            }}
        >
            <Svg
                testID={`${testID}-wave`}
                width={AGITATION_WIDTH}
                height={barHeight}
                viewBox={`0 0 ${AGITATION_WIDTH} ${AGITATION_VIEWBOX_HEIGHT}`}
            >
                <Path
                    testID={`${testID}-path`}
                    d={AGITATION_PATH}
                    fill="none"
                    stroke={colour}
                    strokeWidth={2}
                    strokeLinecap="round"
                />
            </Svg>
        </View>
    );
}
```

Leave ordinary non-agitation seams at `SEGMENT_GAP = 3`. The agitation mark
replaces that seam with its own 11-point slot.

- [ ] **Step 4: Run the rung test and verify it passes**

Run:

```bash
npx jest components/__tests__/BrewStageRung.test.tsx --runInBand
```

Expected: PASS. Before-only and both-agitation tests must prove the first mark
is visible independently of the filled pour segment.

- [ ] **Step 5: Commit the marker slice**

```bash
git add components/BrewStageRung.tsx components/__tests__/BrewStageRung.test.tsx
git commit -m "Draw agitation within the brew rung" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Remove obsolete notch clearance from ladder sizing

**Files:**
- Modify: `library/brew/rungGeometry.ts`
- Modify: `library/brew/bands.ts`
- Modify: `library/brew/__tests__/bands.test.ts`

- [ ] **Step 1: Change the band expectations first**

In `library/brew/__tests__/bands.test.ts`:

1. Rename the known-table test to
   `allocates a known table with contained rung decorations`.
2. Change the first two expected allocations:

```ts
expect(allocateBands(600, 12)).toEqual({
    traceHeight: 204, barHeight: 28, rungGap: 5, scrolls: false
});
expect(allocateBands(500, 9)).toEqual({
    traceHeight: 203, barHeight: 28, rungGap: 5, scrolls: false
});
```

3. Replace the notch-clearance test with:

```ts
it("restores the three-point gap floor now that markers do not overhang", () => {
    expect(GAP_FLOOR).toBe(3);
    expect(allocateBands(300, 12)).toEqual({
        traceHeight: 156, barHeight: 9, rungGap: 3, scrolls: false
    });
});
```

4. Update comments that refer to notch clearance.

- [ ] **Step 2: Run the bands test and verify it fails**

Run:

```bash
npx jest library/brew/__tests__/bands.test.ts --runInBand
```

Expected: FAIL because `GAP_FLOOR` is still six and the old allocation table
is still produced.

- [ ] **Step 3: Remove the obsolete shared constant**

Delete `NOTCH_OVERHANG` and its comment from
`library/brew/rungGeometry.ts`.

In `library/brew/bands.ts`, remove the `NOTCH_OVERHANG` import and replace the
gap-floor comment and value with:

```ts
/**
 * Then the rungs spread out.
 *
 * Decorations are contained within `barHeight`, so this floor is visual
 * separation only. Three points is the original pre-notch floor.
 */
export const GAP_FLOOR = 3;
```

- [ ] **Step 4: Run geometry and band tests**

Run:

```bash
npx jest library/brew/__tests__/bands.test.ts \
  library/brew/__tests__/rungGeometry.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the sizing slice**

```bash
git add library/brew/rungGeometry.ts library/brew/bands.ts \
  library/brew/__tests__/bands.test.ts
git commit -m "Restore compact brew ladder spacing" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Calculate minimal active-rung reveal offsets

**Files:**
- Create: `library/brew/ladderScroll.ts`
- Create: `library/brew/__tests__/ladderScroll.test.ts`

- [ ] **Step 1: Write the failing pure-function tests**

Create `library/brew/__tests__/ladderScroll.test.ts`:

```ts
import {minimalRevealOffset} from "@/library/brew/ladderScroll";

describe("minimalRevealOffset", () => {
    const base = {
        viewportHeight: 300,
        contentHeight: 600,
        offset: 100,
        rowHeight: 40,
        inset: 8
    };

    it("does nothing when all content fits", () => {
        expect(minimalRevealOffset({
            ...base, viewportHeight: 600, contentHeight: 600, rowTop: 100
        })).toBeNull();
    });

    it("does nothing when the active rung is fully visible", () => {
        expect(minimalRevealOffset({...base, rowTop: 120})).toBeNull();
    });

    it("moves up only enough to reveal a clipped top", () => {
        expect(minimalRevealOffset({...base, rowTop: 90})).toBe(82);
    });

    it("moves down only enough to reveal a clipped bottom", () => {
        expect(minimalRevealOffset({...base, rowTop: 380})).toBe(128);
    });

    it("clamps the first rung to the start", () => {
        expect(minimalRevealOffset({...base, offset: 20, rowTop: 0})).toBe(0);
    });

    it("clamps the last rung to the maximum offset", () => {
        expect(minimalRevealOffset({
            ...base, offset: 250, rowTop: 560
        })).toBe(300);
    });

    it("does nothing before valid measurements exist", () => {
        expect(minimalRevealOffset({
            ...base, viewportHeight: 0, rowTop: 90
        })).toBeNull();
    });
});
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run:

```bash
npx jest library/brew/__tests__/ladderScroll.test.ts --runInBand
```

Expected: FAIL because `library/brew/ladderScroll.ts` does not exist.

- [ ] **Step 3: Implement the pure reveal calculation**

Create `library/brew/ladderScroll.ts`:

```ts
export type RevealInput = {
    viewportHeight: number;
    contentHeight: number;
    offset: number;
    rowTop: number;
    rowHeight: number;
    inset?: number;
};

function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), high);
}

export function minimalRevealOffset({
    viewportHeight,
    contentHeight,
    offset,
    rowTop,
    rowHeight,
    inset = 8
}: RevealInput): number | null {
    if (viewportHeight <= 0 || contentHeight <= viewportHeight) return null;

    const rowBottom = rowTop + rowHeight;
    const visibleBottom = offset + viewportHeight;
    if (rowTop >= offset && rowBottom <= visibleBottom) return null;

    const maxOffset = Math.max(0, contentHeight - viewportHeight);
    const target = rowTop < offset
        ? rowTop - inset
        : rowBottom + inset - viewportHeight;

    return clamp(target, 0, maxOffset);
}
```

- [ ] **Step 4: Run the helper test and verify it passes**

Run:

```bash
npx jest library/brew/__tests__/ladderScroll.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the scroll arithmetic**

```bash
git add library/brew/ladderScroll.ts library/brew/__tests__/ladderScroll.test.ts
git commit -m "Calculate minimal brew ladder scrolling" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Wire measured minimal scrolling into the live ladder

**Files:**
- Modify: `components/BrewStageLadder.tsx`
- Modify: `components/__tests__/BrewStageLadder.test.tsx`

- [ ] **Step 1: Add failing measurement-wiring assertions**

In `components/__tests__/BrewStageLadder.test.tsx`, add:

```tsx
it("lets measurements override an initial overflow prediction", async () => {
    const {getByTestId} = await draw({scrolls: true});
    const view = getByTestId("ladder-scroll");

    await act(async () => {
        fireEvent(view, "layout", {nativeEvent: {layout: {height: 300}}});
        fireEvent(view, "contentSizeChange", 320, 280);
    });

    expect(getByTestId("ladder-scroll").props.scrollEnabled).toBe(false);
    expect(contentStyle(getByTestId("ladder-scroll")).justifyContent).toBe("center");
});

it("records scroll offsets so active-stage movement can be minimal", async () => {
    const {getByTestId} = await draw();
    expect(getByTestId("ladder-scroll").props.onScroll).toEqual(expect.any(Function));
    expect(getByTestId("ladder-scroll").props.scrollEventThrottle).toBe(16);
});

it("records both the top and height of every rung", async () => {
    const {getByTestId} = await draw();
    const row = getByTestId("row-1");

    expect(row.props.onLayout).toEqual(expect.any(Function));

    await act(async () => {
        fireEvent(row, "layout", {
            nativeEvent: {layout: {x: 0, y: 48, width: 300, height: 32}}
        });
    });
});
```

The second test is a crash guard for the native layout shape; the pure helper
tests own the exact offset arithmetic.

- [ ] **Step 2: Run the ladder tests and verify the wiring test fails**

Run:

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx --runInBand
```

Expected: FAIL because the initial `scrolls` prediction still wins after valid
measurements, and because `onScroll` and `scrollEventThrottle` are absent.

- [ ] **Step 3: Make valid measurements override the opening prediction**

In `components/BrewStageLadder.tsx`, replace:

```tsx
const overflows = scrolls || (boxHeight > 0 && contentHeight > boxHeight + 1);
```

with:

```tsx
const measured = boxHeight > 0 && contentHeight > 0;
const overflows = measured ? contentHeight > boxHeight + 1 : scrolls;
```

The stage-count prediction now controls only the pre-measurement render. Once
both native measurements exist, they are authoritative.

- [ ] **Step 4: Record full rung geometry and current offset**

In `components/BrewStageLadder.tsx`, import the helper:

```tsx
import {minimalRevealOffset} from "@/library/brew/ladderScroll";
```

Replace the y-only ref with:

```tsx
type RungLayout = {y: number; height: number};

const rungLayouts = useRef<Record<number, RungLayout>>({});
const scrollOffset = useRef(0);
```

Update each stage row's `onLayout`:

```tsx
onLayout={(e) => {
    const {y, height} = e.nativeEvent.layout;
    rungLayouts.current[index] = {y, height};
}}
```

- [ ] **Step 5: Replace top-pinning with minimal reveal**

Replace the existing active-index effect with:

```tsx
useEffect(() => {
    if (!overflows) return;
    if (activeIndex === null || activeIndex < 0 || activeIndex >= pours.length) return;

    const row = rungLayouts.current[activeIndex];
    if (row === undefined) return;

    const target = minimalRevealOffset({
        viewportHeight: boxHeight,
        contentHeight,
        offset: scrollOffset.current,
        rowTop: row.y,
        rowHeight: row.height
    });
    if (target === null) return;

    scroller.current?.scrollTo({y: target, animated: true});
}, [activeIndex, boxHeight, contentHeight, overflows, pours.length]);
```

This must not call `scrollTo` merely to add the inset when the rung is already
fully visible.

- [ ] **Step 6: Track the native scroll offset**

Add these props to the `ScrollView`:

```tsx
onScroll={(e) => {
    scrollOffset.current = e.nativeEvent.contentOffset.y;
}}
scrollEventThrottle={16}
```

Keep `scrollEnabled={overflows}` and the measured centring/top-alignment logic
unchanged.

- [ ] **Step 7: Run ladder and helper tests**

Run:

```bash
npx jest components/__tests__/BrewStageLadder.test.tsx \
  library/brew/__tests__/ladderScroll.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit the ladder integration**

```bash
git add components/BrewStageLadder.tsx \
  components/__tests__/BrewStageLadder.test.tsx
git commit -m "Reveal active brew stages with minimal scrolling" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Run release validation and device checks

**Files:**
- No planned source changes.

- [ ] **Step 1: Run the complete targeted regression set**

Run:

```bash
npx jest app/__tests__/brew.test.tsx \
  constants/__tests__/brewCopy.test.ts \
  components/__tests__/BrewStageRung.test.tsx \
  components/__tests__/BrewStageLadder.test.tsx \
  library/brew/__tests__/bands.test.ts \
  library/brew/__tests__/rungGeometry.test.ts \
  library/brew/__tests__/ladderScroll.test.ts --runInBand
```

Expected: all suites and tests PASS.

- [ ] **Step 2: Run the repository release gates**

Run:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npx expo-doctor
```

Expected:

- TypeScript exits 0.
- ESLint exits 0, allowing only the repository's known warnings.
- The full Jest suite passes.
- Expo Doctor reports all checks passed.

- [ ] **Step 3: Verify the dependency diff**

Run:

```bash
npx expo install --check
git --no-pager diff 9775a92 -- package.json package-lock.json
```

Expected: Expo reports dependencies aligned; the manifest diff adds only the
SDK-compatible `expo-keep-awake` direct dependency.

- [ ] **Step 4: Inspect the live layout on a device**

Use a development build, not Expo Go. Verify:

1. one-stage and three-stage recipes remain fully visible and do not move when
   the active stage advances;
2. before-only agitation shows a compact wave before the pour pill;
3. after-only agitation shows it between pour and wait;
4. both agitation settings show both waves;
5. the wave never exceeds the top or bottom of any pill at short, medium, or
   tall band heights;
6. a genuinely overflowing recipe scrolls only when the active rung becomes
   clipped, and moves only enough to reveal it;
7. the display stays awake from waking/sending through settling;
8. the wake lock releases on completion, cancellation, failure, lost contact,
   and leaving the brew screen.

Expected: all eight observations match the approved design. NFC is not needed
for these checks, but wake behavior and native layout cannot be signed off from
Jest alone.

- [ ] **Step 5: Confirm the release version source**

Run:

```bash
node -e 'const a=require("./app.json").expo; const e=require("./eas.json"); console.log(a.version, e.cli.appVersionSource, e.build.production.autoIncrement)'
```

Expected:

```text
1.5.0 remote true
```

This confirms the production profile will request remote iOS build 6 without
adding a local `buildNumber` to generated configuration. Building and
submitting to TestFlight is a separate release operation after this plan is
implemented and approved.
