# Navigation Shell and Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the finished home screen — dot-matrix icons, a collapsing header, CTA tiles, the recipe list on `RecipeCard`, an empty state — plus one feedback vocabulary that replaces every native `Alert`, and one NFC overlay for both platforms.

**Architecture:** Pure data and pure functions first (icon bitmaps, the collapse threshold, the notice mapping), then the components that render them, then the screens that compose those, then the removal of what they replace. Sub-project 1 already built `CtaTile`, `RecipeCard`, `DotBloom`, `ScreenTitle`, `DigitRoll` and `DotMatrixText` but wired none of them into a screen; this plan is where they arrive.

**Tech Stack:** Expo SDK 57, React Native, expo-router, Tamagui, Reanimated 4, `@backpackapp-io/react-native-toast`, jest-expo + `@testing-library/react-native` v14.

---

## Conventions for every task

**Reading the source.** Files are at the repo root and imported with the `@/`
alias (`@/library/Recipe`, `@/constants/colors`). Never use a relative import.

**Colour.** No hex literals and no named CSS colours anywhere in `app/` or
`components/`. Import `palette` / `onAccent` from `@/constants/colors`. If you
need a colour that is not there, add a semantically named entry to that file.

**Motion.** No literal durations or easing curves. Import `DURATION`, `EASING`,
`SPRING` and `useReducedMotion` from `@/constants/motion`. Every animation must
degrade to a cross-fade under Reduced Motion — never to nothing.

**Tests.** Component tests use `renderWithProviders` from
`@/test-utils/render`, which supplies the Tamagui provider. **`render` and
`fireEvent` are asynchronous in RNTL v14 — a missing `await` leaves the screen
empty and the test passes for the wrong reason.** Always `await` them.

Two RNTL behaviours cost time in this plan's first tasks; both are load-bearing:

- **The default queries exclude anything hidden from the accessibility tree** —
  the element itself, not only its descendants. `DotIcon` and the empty state's
  bloom are deliberately hidden, so asserting on them needs
  `{includeHiddenElements: true}` as the query's second argument.
- **`screen` tracks only the most recently rendered tree.** A test that renders
  twice to compare two states must keep each render's own returned query
  utilities (`const a = await renderWithProviders(...); a.getByText(...)`) rather
  than indexing into `screen.getAllBy*`.
- **`renderHook` returns a Promise too**, not only `render`. Its declaration is
  `renderHook(...): Promise<RenderHookResult<...>>`. Destructuring `{result}`
  without awaiting silently gives `undefined`.

**The React Compiler is enabled.** Do not hand-write `useMemo` or `useCallback`
in new code, and do not read a whole `props` object inside a hook — destructure
first, or the compiler bails out of optimising the entire component.

**Never touch** `library/Recipe.ts`'s `parseData` / `getData`, `library/Pour.ts`,
`library/NFC.ts`'s byte protocol, `library/__tests__/Recipe.card.test.ts`, or
`library/__tests__/cardFixtures.ts`. A malformed write to a genuine card is not
trivially recoverable.

**Commits.** The bash tool mangles `git commit -m` with escaped quotes. Use the
heredoc form every time:

```bash
git commit -F - <<'EOF'
<subject line from the task>

<body from the task>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
EOF
```

**Running a single test file:** `npx jest path/to/file.test.ts`
**Running one test:** `npx jest path/to/file.test.ts -t "name of the test"`

---

## File structure

| Path | Responsibility |
|---|---|
| `constants/dotIcons.ts` | The 9×9 bitmaps as data, plus the pure `litCells` reader. No React. |
| `components/DotIcon.tsx` | Draws one bitmap at a given size. Knows nothing about which icons exist. |
| `hooks/useCollapsibleHeader.ts` | Scroll offset → collapsed, with hysteresis. Exports the pure decision separately. |
| `library/notify.ts` | Pure. Tone → glyph, duration, and the toast library's type string. No React, no library import. |
| `components/XbrwToast.tsx` | The skinned toast body, and the one `notify()` dispatcher that shows it. |
| `hooks/useSetting.ts` | One settings key, read and written through `library/Settings.ts`. |
| `app/settings.tsx` | The settings route. One section. |
| `components/HomeHeader.tsx` | Title, count, and the action glyphs — expanded and collapsed. |
| `components/EmptyLibrary.tsx` | The empty state for the list only. |
| `hooks/useRecipeLibrary.ts` | Loading, deleting and duplicating recipes. Lifted out of `app/index.tsx`. |
| `components/NfcOverlay.tsx` | Both platform compositions of the scanning ceremony. |
| `app/index.tsx` | Layout only: header, tiles, list, empty state, overlays. |

---

### Task 1: The dot icon bitmaps

Pure data and one pure function. No React, so this is tested directly.

**Files:**
- Create: `constants/dotIcons.ts`
- Test: `constants/__tests__/dotIcons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `constants/__tests__/dotIcons.test.ts`:

```ts
import {DOT_ICON_GRID, DOT_ICONS, litCells, type DotIconName} from "@/constants/dotIcons";

const names = Object.keys(DOT_ICONS) as DotIconName[];

describe("DOT_ICONS", () => {
    it("has every icon the app needs", () => {
        expect(names.sort()).toEqual(
            ["edit", "error", "import", "info", "scan", "settings", "success"]
        );
    });

    it.each(names)("%s is a square grid of the declared size", (name) => {
        const rows = DOT_ICONS[name];
        expect(rows).toHaveLength(DOT_ICON_GRID);
        for (const row of rows) {
            expect(row).toHaveLength(DOT_ICON_GRID);
        }
    });

    it.each(names)("%s contains only lit and unlit marks", (name) => {
        for (const row of DOT_ICONS[name]) {
            expect(row).toMatch(/^[#.]+$/);
        }
    });

    it.each(names)("%s lights at least one dot", (name) => {
        expect(litCells(DOT_ICONS[name]).length).toBeGreaterThan(0);
    });
});

describe("litCells", () => {
    it("returns the coordinates of the lit dots, and nothing else", () => {
        expect(litCells(["#.", ".#"])).toEqual([
            {x: 0, y: 0},
            {x: 1, y: 1}
        ]);
    });

    it("reads x as the column and y as the row", () => {
        // A single dot on the top row, last column. If x and y were swapped
        // every icon would render transposed, which is invisible on the
        // symmetric ones and wrong on the pencil.
        expect(litCells([".#", ".."])).toEqual([{x: 1, y: 0}]);
    });

    it("returns nothing for an entirely unlit grid", () => {
        expect(litCells(["..", ".."])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest constants/__tests__/dotIcons.test.ts`
Expected: FAIL — "Cannot find module '@/constants/dotIcons'".

- [ ] **Step 3: Write the implementation**

Create `constants/dotIcons.ts`:

```ts
/**
 * The app's icons, as dot-matrix bitmaps.
 *
 * These are hand-authored, not generated. Signed-distance rasterisation was
 * tried first and produces blobs at this resolution: at 9x9 a stroke is one dot
 * wide, so anything that is not axis-aligned or a pure diagonal aliases into
 * noise. Only two shape classes survive, and every icon here is one of them.
 *
 * 9x9 is the working size. A finer grid holds more shape in the abstract, but at
 * the 20px header size each dot falls under 2px and the icon greys into a smudge.
 *
 * Settings is two faders rather than a gear on purpose. A gear is radially
 * symmetric with fine teeth, which is the single worst shape for this grid; four
 * candidates were drawn and compared at 16/20/26/44px before the metaphor was
 * abandoned. The meaning is "settings", not "gear".
 *
 * Adding an icon means drawing one. Keep the set small.
 */

/** Both dimensions of every bitmap. */
export const DOT_ICON_GRID = 9;

/** A lit dot. Any other character is unlit; `.` is the convention used here. */
const LIT = "#";

export const DOT_ICONS = {
    /** Three concentric rings: signal radiating outward, which is what a scan does. */
    scan: [
        "#########",
        "#.......#",
        "#.#####.#",
        "#.#...#.#",
        "#.#.#.#.#",
        "#.#...#.#",
        "#.#####.#",
        "#.......#",
        "#########"
    ],
    /** An arrow into a tray. */
    import: [
        ".........",
        "....#....",
        "....#....",
        "....#....",
        "..#.#.#..",
        "...###...",
        "....#....",
        ".#######.",
        "........."
    ],
    /** Two faders. See the note above on why this is not a gear. */
    settings: [
        ".........",
        "...#.....",
        "#########",
        "...#.....",
        ".........",
        "......#..",
        "#########",
        "......#..",
        "........."
    ],
    /** A pencil on a baseline. The bare diagonal read as a stroke, not a tool. */
    edit: [
        ".......##",
        "......##.",
        ".....##..",
        "....##...",
        "...##....",
        "..##.....",
        ".##......",
        ".........",
        "#########"
    ],
    success: [
        ".........",
        ".........",
        ".......#.",
        "......#..",
        ".#...#...",
        "..#.#....",
        "...#.....",
        ".........",
        "........."
    ],
    error: [
        ".........",
        ".#.....#.",
        "..#...#..",
        "...#.#...",
        "....#....",
        "...#.#...",
        "..#...#..",
        ".#.....#.",
        "........."
    ],
    info: [
        ".........",
        "....#....",
        ".........",
        "...##....",
        "....#....",
        "....#....",
        "...###...",
        ".........",
        "........."
    ]
} as const satisfies Record<string, readonly string[]>;

export type DotIconName = keyof typeof DOT_ICONS;

/** One lit dot's position on the grid. */
export type DotCell = {x: number; y: number};

/**
 * The lit dots of a bitmap, in reading order.
 *
 * Kept out of the component so the sequenced entry animation can index into a
 * stable order, and so the bitmaps can be checked without a renderer.
 */
export function litCells(rows: readonly string[]): DotCell[] {
    const cells: DotCell[] = [];
    for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            if (rows[y][x] === LIT) {
                cells.push({x, y});
            }
        }
    }
    return cells;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest constants/__tests__/dotIcons.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 5: Sabotage-check the tests**

Transpose one row of `DOT_ICONS.edit` (change `".......##"` to `".......#"`),
re-run, and confirm the square-grid test goes **red**. Restore the file and
confirm green again. A test that does not bite is worse than no test.

- [ ] **Step 6: Commit**

```bash
git add constants/dotIcons.ts constants/__tests__/dotIcons.test.ts
```

Subject: `feat: add the dot-matrix icon bitmaps`
Body:
```
Seven hand-authored 9x9 bitmaps: scan, import, settings, edit,
success, error, info. Authored rather than rasterised because at
this resolution a stroke is one dot wide, so only axis-aligned
shapes and pure diagonals survive.
```

---

### Task 2: The DotIcon component

**Files:**
- Create: `components/DotIcon.tsx`
- Test: `components/__tests__/DotIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/DotIcon.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import DotIcon from "@/components/DotIcon";
import {DOT_ICONS, litCells} from "@/constants/dotIcons";
import {renderWithProviders} from "@/test-utils/render";

describe("DotIcon", () => {
    it("draws exactly the lit dots of its bitmap", async () => {
        await renderWithProviders(<DotIcon name="scan" size={44}/>);
        expect(screen.getAllByTestId("dot-icon-dot"))
            .toHaveLength(litCells(DOT_ICONS.scan).length);
    });

    it("scales the whole drawing with size, so two sizes are the same icon", async () => {
        await renderWithProviders(<DotIcon name="settings" size={18}/>);
        const small = screen.getByTestId("dot-icon");

        await renderWithProviders(<DotIcon name="settings" size={36}/>);
        const large = screen.getAllByTestId("dot-icon")[1];

        expect(small.props.style.width).toBe(18);
        expect(large.props.style.width).toBe(36);
    });

    it("is hidden from the accessibility tree by default", async () => {
        await renderWithProviders(<DotIcon name="error" size={20}/>);
        expect(screen.getByTestId("dot-icon").props.accessibilityElementsHidden)
            .toBe(true);
    });

    it("announces itself when given a label, for use as a bare control", async () => {
        await renderWithProviders(
            <DotIcon name="edit" size={20} accessibilityLabel="Edit recipes"/>
        );
        expect(screen.getByLabelText("Edit recipes")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/DotIcon.test.tsx`
Expected: FAIL — "Cannot find module '@/components/DotIcon'".

- [ ] **Step 3: Write the implementation**

Create `components/DotIcon.tsx`:

```tsx
import React from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming
} from "react-native-reanimated";

import {DOT_ICONS, DOT_ICON_GRID, litCells, type DotIconName} from "@/constants/dotIcons";
import {palette} from "@/constants/colors";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";

/**
 * Dot diameter as a fraction of a cell. Below about a third the icon reads as a
 * scatter of specks; above it the dots touch and the grid closes into a solid
 * shape, which is the thing the dot matrix exists not to be.
 */
const DOT_RATIO = 0.36;

/** Stagger between consecutive dots when the icon animates in. */
const STAGGER_MS = 12;

type Props = {
    name: DotIconName;
    /** Edge length of the whole icon in points. Dot size is derived from it. */
    size?: number;
    color?: string;
    /**
     * Illuminate the dots in sequence on mount. For the feedback surfaces; a
     * navigation glyph should not perform.
     */
    animated?: boolean;
    /**
     * Only set this when the icon is the entire control. When it sits inside a
     * labelled pressable — which is the usual case — leave it undefined so the
     * parent is the single accessibility element.
     */
    accessibilityLabel?: string;
    testID?: string;
};

type DotProps = {
    x: number;
    y: number;
    cell: number;
    dot: number;
    color: string;
    /** 0 when static; otherwise this dot's place in the entry sequence. */
    delay: number;
};

function IconDot({x, y, cell, dot, color, delay}: DotProps) {
    const opacity = useSharedValue(delay > 0 ? 0 : 1);

    React.useEffect(() => {
        if (delay > 0) {
            opacity.value = withDelay(
                delay,
                withTiming(1, {duration: DURATION.fast, easing: EASING.out})
            );
        } else {
            opacity.value = 1;
        }
    }, [delay, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({opacity: opacity.value}));

    return (
        <Animated.View
            testID="dot-icon-dot"
            style={[
                {
                    position:        "absolute",
                    width:           dot,
                    height:          dot,
                    borderRadius:    dot / 2,
                    backgroundColor: color,
                    // Centred in the cell, then pulled back by its own radius,
                    // so the drawing occupies exactly `size` and a clipping
                    // ancestor cannot shave the outer dots.
                    left:            (x + 0.5) * cell - dot / 2,
                    top:             (y + 0.5) * cell - dot / 2
                },
                animatedStyle
            ]}
        />
    );
}

/**
 * One icon, drawn as dots.
 *
 * Geometry is derived from `size` alone, so the same glyph at 16 and at 44 is
 * the same drawing rather than two that drifted apart. The bitmaps live in
 * `constants/dotIcons.ts`; this component knows nothing about which icons exist.
 */
export default function DotIcon({
    name,
    size = 20,
    color = palette.text,
    animated = false,
    accessibilityLabel,
    testID = "dot-icon"
}: Props) {
    const reduced = useReducedMotion();
    const cell = size / DOT_ICON_GRID;
    const dot = cell * DOT_RATIO;
    const cells = litCells(DOT_ICONS[name]);

    // Reduced Motion still gets a change of state -- every dot fades in at once
    // rather than in sequence -- because degrading to nothing would leave a user
    // who disabled motion with no signal that the toast had arrived.
    const staggered = animated && !reduced;

    const labelled = accessibilityLabel !== undefined;

    return (
        <View
            testID={testID}
            accessible={labelled}
            accessibilityRole={labelled ? "image" : undefined}
            accessibilityLabel={accessibilityLabel}
            accessibilityElementsHidden={!labelled}
            importantForAccessibility={labelled ? "yes" : "no-hide-descendants"}
            style={{width: size, height: size}}>
            {cells.map((point, index) => (
                <IconDot
                    key={`${point.x}-${point.y}`}
                    x={point.x}
                    y={point.y}
                    cell={cell}
                    dot={dot}
                    color={color}
                    delay={staggered ? index * STAGGER_MS : animated ? 1 : 0}
                />
            ))}
        </View>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/DotIcon.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Sabotage-check the tests**

Change `DOT_RATIO` usage so `left` ignores `x` (use `0.5 * cell` for every dot).
The dot-count test still passes — that is expected, it counts rather than
positions. Now change `width: size` to `width: 20` and confirm the scaling test
goes **red**. Restore both.

- [ ] **Step 6: Commit**

```bash
git add components/DotIcon.tsx components/__tests__/DotIcon.test.tsx
```

Subject: `feat: add the DotIcon component`
Body:
```
Renders a bitmap from constants/dotIcons.ts. All geometry derives
from the size prop, so a glyph at 16px and at 44px are the same
drawing. Hidden from the accessibility tree unless it is the whole
control. Under Reduced Motion the sequenced entry becomes a single
fade rather than nothing.
```

---

### Task 3: Move CtaTile onto DotIcon

`CtaTile` was built in sub-project 1 against `@expo/vector-icons` and has never
been rendered by a screen. Switching it now, before it is mounted, avoids
touching it twice.

**Files:**
- Modify: `components/CtaTile.tsx`
- Modify: `components/__tests__/CtaTile.test.tsx`

- [ ] **Step 1: Update the test to demand a dot icon**

Open `components/__tests__/CtaTile.test.tsx`. Replace every use of the
`cta-tile-icon` AntDesign testID and the `icon="..."` AntDesign glyph names with
the dot-icon equivalents, and add this test:

```tsx
it("renders its glyph as dots, not as a vector icon", async () => {
    await renderWithProviders(
        <CtaTile icon="scan" label="READ CARD" onPress={() => {}}/>
    );
    expect(screen.getByTestId("cta-tile-icon")).toBeTruthy();
    expect(screen.getAllByTestId("dot-icon-dot").length).toBeGreaterThan(0);
});
```

Existing tests in that file pass `icon="scan-outline"` or similar AntDesign
names; change them all to `icon="scan"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/CtaTile.test.tsx`
Expected: FAIL — no elements with testID `dot-icon-dot`.

- [ ] **Step 3: Change the implementation**

In `components/CtaTile.tsx`, replace the `AntDesign` import and its `Props.icon`
type and usage:

```tsx
import React from "react";
import {YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import type {DotIconName} from "@/constants/dotIcons";
import {palette} from "@/constants/colors";

/** The icon size inside a tile: large enough that the dot grid still reads. */
const TILE_ICON_SIZE = 26;

type Props = {
    icon: DotIconName;
    /** Shown in Doto, so keep it short and upper-case. */
    label: string;
    onPress: () => void;
    /** Spell the action out here when the label is an abbreviation. */
    accessibilityLabel?: string;
    disabled?: boolean;
};
```

and inside the returned `YStack`, replace the `<AntDesign .../>` element with:

```tsx
            <DotIcon testID="cta-tile-icon" name={icon} size={TILE_ICON_SIZE}
                     color={disabled ? palette.muted : palette.text}/>
```

Leave the rest of the component — the accessibility wiring, the equal-weight
doc comment, the press style — exactly as it is.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/CtaTile.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/CtaTile.tsx components/__tests__/CtaTile.test.tsx
```

Subject: `refactor: draw CtaTile's glyph with DotIcon`
Body:
```
CtaTile was built against @expo/vector-icons and has never been
mounted by a screen, so switching it before it ships avoids
changing it twice.
```

---

### Task 4: The collapse threshold

The decision is a pure function so it can be tested without a scroll view, and
so the dead band that stops the header flapping is verifiable rather than
felt.

**Files:**
- Create: `hooks/useCollapsibleHeader.ts`
- Test: `hooks/__tests__/useCollapsibleHeader.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useCollapsibleHeader.test.ts`:

```ts
import {COLLAPSE_AT, EXPAND_AT, nextCollapsed} from "@/hooks/useCollapsibleHeader";

describe("nextCollapsed", () => {
    it("stays expanded at rest", () => {
        expect(nextCollapsed(0, false)).toBe(false);
    });

    it("collapses once the list is scrolled past the threshold", () => {
        expect(nextCollapsed(COLLAPSE_AT + 1, false)).toBe(true);
    });

    it("does not collapse inside the dead band", () => {
        expect(nextCollapsed(EXPAND_AT + 1, false)).toBe(false);
    });

    it("stays collapsed inside the dead band", () => {
        expect(nextCollapsed(EXPAND_AT + 1, true)).toBe(true);
    });

    it("expands again only when the list returns near the top", () => {
        expect(nextCollapsed(EXPAND_AT - 1, true)).toBe(false);
    });

    it("cannot flap: no single offset produces a different state each call", () => {
        // The bug the dead band exists to prevent. With one threshold, an offset
        // sitting exactly on it alternates on every scroll event and the header
        // strobes. Applying the function to its own output must reach a fixed
        // point immediately, at every offset.
        for (let offset = 0; offset <= COLLAPSE_AT + 20; offset++) {
            for (const state of [true, false]) {
                const once = nextCollapsed(offset, state);
                expect(nextCollapsed(offset, once)).toBe(once);
            }
        }
    });

    it("treats rubber-band overscroll as the top of the list", () => {
        // iOS reports negative offsets when the list is pulled past its top.
        expect(nextCollapsed(-80, true)).toBe(false);
    });

    it("has a dead band at all", () => {
        expect(EXPAND_AT).toBeLessThan(COLLAPSE_AT);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest hooks/__tests__/useCollapsibleHeader.test.ts`
Expected: FAIL — "Cannot find module '@/hooks/useCollapsibleHeader'".

- [ ] **Step 3: Write the implementation**

Create `hooks/useCollapsibleHeader.ts`:

```ts
import {useState} from "react";
import type {NativeScrollEvent, NativeSyntheticEvent} from "react-native";

/**
 * How far the list must scroll before the header collapses. Roughly the height
 * of one CTA tile: the tiles should be gone by the time the first card would
 * otherwise be hidden behind them.
 */
export const COLLAPSE_AT = 72;

/**
 * How far back up the list must come before the header expands again.
 *
 * Lower than `COLLAPSE_AT` on purpose. With a single threshold, a list resting a
 * few pixels either side of it alternates state on every scroll event and the
 * header strobes; the gap between these two numbers is what makes that
 * impossible rather than unlikely.
 */
export const EXPAND_AT = 24;

/**
 * The next collapsed state, given where the list is and where the header is now.
 *
 * Pure, and the whole of the decision. Two discrete states rather than an
 * interpolation: interpolating leaves the tiles resting at an arbitrary
 * half-size whenever the list stops mid-threshold, which is a state nobody
 * designed.
 */
export function nextCollapsed(offset: number, collapsed: boolean): boolean {
    return collapsed ? offset > EXPAND_AT : offset > COLLAPSE_AT;
}

type CollapsibleHeader = {
    collapsed: boolean;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * Drives the home screen header from the list's scroll position.
 *
 * The state lives in React rather than on the UI thread because it switches
 * which components are mounted, not just how they are styled.
 */
export function useCollapsibleHeader(): CollapsibleHeader {
    const [collapsed, setCollapsed] = useState(false);

    function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        const offset = event.nativeEvent.contentOffset.y;
        setCollapsed((current) => nextCollapsed(offset, current));
    }

    return {collapsed, onScroll};
}

export default useCollapsibleHeader;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest hooks/__tests__/useCollapsibleHeader.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Sabotage-check the tests**

Change `EXPAND_AT` to `72` so the dead band vanishes. Confirm the "does not
collapse inside the dead band" test goes **red**. Then change `nextCollapsed` to
`return offset > COLLAPSE_AT` (ignoring the current state) and confirm "stays
collapsed inside the dead band" goes **red**. Restore.

- [ ] **Step 6: Commit**

```bash
git add hooks/useCollapsibleHeader.ts hooks/__tests__/useCollapsibleHeader.test.ts
```

Subject: `feat: add the collapsible header threshold`
Body:
```
Two discrete states with hysteresis rather than a continuous
interpolation, so the tiles cannot rest half-sized and a list parked
near the threshold cannot flap. The decision is a pure function and
is tested without a renderer, including a fixed-point check across
every offset.
```

---

### Task 5: The notice mapping

Pure. Lives in `library/` and must import neither React nor the toast library.

**Files:**
- Create: `library/notify.ts`
- Test: `library/__tests__/notify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/notify.test.ts`:

```ts
import {
    TONES,
    libTypeToTone,
    resolveNotice,
    toneToLibType,
    type NoticeTone
} from "@/library/notify";

describe("resolveNotice", () => {
    it("gives each tone its own glyph", () => {
        const glyphs = TONES.map((tone) => resolveNotice({tone, message: "x"}).glyph);
        expect(new Set(glyphs).size).toBe(TONES.length);
    });

    it("passes the message through untouched", () => {
        expect(resolveNotice({tone: "info", message: "Already in your library"}).message)
            .toBe("Already in your library");
    });

    it("leaves an error on screen longer than a success", () => {
        // A success confirms something the user just did and they already know
        // it happened. An error may need reading twice.
        expect(resolveNotice({tone: "error", message: "x"}).duration)
            .toBeGreaterThan(resolveNotice({tone: "success", message: "x"}).duration);
    });

    it.each(TONES)("gives %s a positive duration", (tone: NoticeTone) => {
        expect(resolveNotice({tone, message: "x"}).duration).toBeGreaterThan(0);
    });
});

describe("the toast library's type strings", () => {
    it.each(TONES)("round-trips %s", (tone: NoticeTone) => {
        expect(libTypeToTone(toneToLibType(tone))).toBe(tone);
    });

    it("falls back to info for a type the library produced on its own", () => {
        // toast.loading() and friends are never dispatched by notify(), but the
        // renderer sees every toast in the queue and must not crash on one.
        expect(libTypeToTone("loading")).toBe("info");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/notify.test.ts`
Expected: FAIL — "Cannot find module '@/library/notify'".

- [ ] **Step 3: Write the implementation**

Create `library/notify.ts`:

```ts
import type {DotIconName} from "@/constants/dotIcons";

/**
 * What a message asks of the reader.
 *
 * Only three, and deliberately not one per event: a tone is how loudly the app
 * speaks, and every message in the app is one of these three volumes.
 */
export const TONES = ["success", "error", "info"] as const;

export type NoticeTone = (typeof TONES)[number];

/** What a call site passes: meaning, never styling. */
export type Notice = {
    tone: NoticeTone;
    message: string;
};

/** What the renderer needs. */
export type ResolvedNotice = Notice & {
    glyph: DotIconName;
    /** Milliseconds on screen. */
    duration: number;
};

const GLYPHS: Record<NoticeTone, DotIconName> = {
    success: "success",
    error:   "error",
    info:    "info"
};

/**
 * A success confirms something the reader just asked for, so it can be brief. An
 * error may need reading twice and sometimes carries a reason from the card or
 * the network, so it stays longer.
 */
const DURATIONS: Record<NoticeTone, number> = {
    success: 2500,
    info:    3000,
    error:   4500
};

/**
 * Everything the toast body needs to draw itself.
 *
 * Pure, and kept in `library/` away from React, so the routing can be tested as
 * a function rather than by rendering and squinting.
 */
export function resolveNotice(notice: Notice): ResolvedNotice {
    return {
        ...notice,
        glyph:    GLYPHS[notice.tone],
        duration: DURATIONS[notice.tone]
    };
}

/**
 * The toast library's own type strings.
 *
 * The library tags each queued toast with one of these, and it is the only
 * channel through which a dispatcher can tell the single shared renderer what
 * kind of message this is. `info` maps to the library's default, `blank`.
 */
export type LibToastType = "success" | "error" | "blank" | "loading";

export function toneToLibType(tone: NoticeTone): LibToastType {
    return tone === "info" ? "blank" : tone;
}

export function libTypeToTone(type: string): NoticeTone {
    return type === "success" || type === "error" ? type : "info";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/notify.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add library/notify.ts library/__tests__/notify.test.ts
```

Subject: `feat: add the notice tone mapping`
Body:
```
Pure mapping from a message's tone to its glyph and duration, plus
the round trip through the toast library's type strings. Lives in
library/ with no React and no toast-library import, so the routing
is tested as a function.
```

---

### Task 6: The skinned toast

**Files:**
- Create: `components/XbrwToast.tsx`
- Modify: `app/_layout.tsx`
- Test: `components/__tests__/XbrwToast.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/XbrwToast.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import {XbrwToast} from "@/components/XbrwToast";
import {renderWithProviders} from "@/test-utils/render";

describe("XbrwToast", () => {
    it("shows the message as prose", async () => {
        await renderWithProviders(
            <XbrwToast type="error" message="Could not read card"/>
        );
        expect(screen.getByText("Could not read card")).toBeTruthy();
    });

    it("draws the glyph for the tone the library tagged the toast with", async () => {
        await renderWithProviders(<XbrwToast type="success" message="Saved"/>);
        expect(screen.getAllByTestId("dot-icon-dot").length).toBeGreaterThan(0);
    });

    it("announces itself, since a toast is not reachable by touch", async () => {
        await renderWithProviders(<XbrwToast type="blank" message="Already in your library"/>);
        expect(screen.getByLabelText("Already in your library")).toBeTruthy();
    });

    it("renders a library type it did not dispatch without crashing", async () => {
        await renderWithProviders(<XbrwToast type="loading" message="Working"/>);
        expect(screen.getByText("Working")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/XbrwToast.test.tsx`
Expected: FAIL — "Cannot find module '@/components/XbrwToast'".

- [ ] **Step 3: Write the implementation**

Create `components/XbrwToast.tsx`:

```tsx
import React from "react";
import {toast as libToast} from "@backpackapp-io/react-native-toast";
import {Text, XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";
import {libTypeToTone, resolveNotice, type Notice, type NoticeTone} from "@/library/notify";

const GLYPH_SIZE = 20;

/** Per-tone accent, used for the glyph and the leading rule only. */
const TONE_COLOUR: Record<NoticeTone, string> = {
    success: palette.success,
    error:   palette.danger,
    info:    palette.info
};

type Props = {
    /** The toast library's own type tag. Translated back into a tone here. */
    type: string;
    message: string;
};

/**
 * The body of every toast in the app.
 *
 * Supplied by `notify()` as the library's `customToast`, so there is exactly
 * one place where a toast is styled and a caller cannot invent a variant.
 *
 * The message is prose and stays in Inter — the typography rule is that Doto is
 * for machine-derived values, and an error sentence is not one.
 */
export function XbrwToast({type, message}: Props) {
    const tone = libTypeToTone(type);
    const notice = resolveNotice({tone, message});
    const colour = TONE_COLOUR[tone];

    return (
        <XStack
            // A toast cannot be focused or tapped, so without an explicit
            // element and label a screen reader user gets nothing at all.
            accessible
            accessibilityRole="alert"
            accessibilityLabel={message}
            alignItems="center"
            gap="$3"
            paddingVertical="$3"
            paddingHorizontal="$3.5"
            borderRadius="$6"
            borderWidth={1}
            borderColor={palette.line}
            borderLeftWidth={3}
            borderLeftColor={colour}
            backgroundColor={palette.raised}
            maxWidth={420}>
            <DotIcon name={notice.glyph} size={GLYPH_SIZE} color={colour} animated/>
            <Text flex={1} fontSize={14} color={palette.text}>
                {message}
            </Text>
        </XStack>
    );
}

/**
 * Show a notice.
 *
 * The one way the app says anything transient. Callers pass a tone and a
 * message; everything else — glyph, colour, duration, position — is decided
 * here and in `library/notify.ts`.
 *
 * Native `Alert` must not be used anywhere in the app: it is the one surface the
 * design language cannot reach, and reaching for it means the app changes voice
 * at exactly the moment the user is most frustrated.
 */
export function notify(notice: Notice): void {
    const {duration} = resolveNotice(notice);
    const options = {duration};

    if (notice.tone === "success") {
        libToast.success(notice.message, options);
    } else if (notice.tone === "error") {
        libToast.error(notice.message, options);
    } else {
        libToast(notice.message, options);
    }
}

export default XbrwToast;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/XbrwToast.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Supply the body on every dispatch**

**Corrected during implementation.** This step originally wired a `children`
render prop on `<Toasts>` in `app/_layout.tsx`. **That prop does not exist** —
`Toasts` in the installed 0.15.1 takes configuration only. The real mechanism is
`customToast?: (toast: Toast) => JSX.Element` in `ToastOptions`, supplied per
call. `app/_layout.tsx` therefore needs **no change at all**.

`notify()` above becomes:

```tsx
export function notify(notice: Notice): void {
    const {duration} = resolveNotice(notice);
    const type = toneToLibType(notice.tone);
    const options = {
        duration,
        customToast: () => <XbrwToast type={type} message={notice.message}/>
    };

    if (notice.tone === "success") {
        libToast.success(notice.message, options);
    } else if (notice.tone === "error") {
        libToast.error(notice.message, options);
    } else {
        libToast(notice.message, options);
    }
}
```

with `toneToLibType` added to the `@/library/notify` import.

The "skinned in one place" guarantee is now structural: `notify()` is the only
dispatcher, and it is what supplies `customToast`. **A bare `toast()` call
anywhere else renders the library's default body and breaks the app's voice** —
Task 17 removes the six that exist today, and Task 18 greps to prove it.

- [ ] **Step 6: Verify the app still typechecks**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add components/XbrwToast.tsx components/__tests__/XbrwToast.test.tsx app/_layout.tsx
```

Subject: `feat: skin every toast in one place`
Body:
```
The toast library takes a customToast option on every call that
accepts arbitrary JSX, so the app's toasts can carry dot-matrix
glyphs and the palette without replacing the library and losing its
queueing, swipe-to-dismiss, safe-area handling and promise API.

notify() is the single dispatcher. Callers pass a tone and a
message; glyph, colour and duration are decided centrally.
```

---

### Task 7: Reading a setting

**Files:**
- Create: `hooks/useSetting.ts`
- Test: `hooks/__tests__/useSetting.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useSetting.test.ts`:

```ts
import {act, renderHook} from "@testing-library/react-native";

import {useSetting} from "@/hooks/useSetting";
import {Settings, type SettingsStorage} from "@/library/Settings";

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

describe("useSetting", () => {
    it("starts at the stored default", async () => {
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));
        expect(result.current[0]).toBe(true);
    });

    it("reports a value written before the hook mounted", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("showCoffeeMarker", false);
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));
        expect(result.current[0]).toBe(false);
    });

    it("re-renders with the new value when set", async () => {
        const settings = new Settings(memoryStorage());
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));

        await act(async () => result.current[1](false));

        expect(result.current[0]).toBe(false);
    });

    it("persists the new value, not just the React state", async () => {
        const storage = memoryStorage();
        const settings = new Settings(storage);
        const {result} = await renderHook(() => useSetting("showCoffeeMarker", settings));

        await act(async () => result.current[1](false));

        // A fresh Settings over the same storage: this is what the next launch
        // sees, and it is the half that a state-only implementation loses.
        expect(new Settings(storage).get("showCoffeeMarker")).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest hooks/__tests__/useSetting.test.ts`
Expected: FAIL — "Cannot find module '@/hooks/useSetting'".

- [ ] **Step 3: Write the implementation**

Create `hooks/useSetting.ts`:

```ts
import {useState} from "react";

import {Settings, type SettingKey, type SettingValue} from "@/library/Settings";

/**
 * The app's settings store.
 *
 * Created on first use rather than at import time: constructing it opens the
 * SQLite database, which must not happen merely because a module was imported —
 * not least in tests, which pass their own store instead.
 */
let shared: Settings | undefined;

export function sharedSettings(): Settings {
    shared ??= new Settings();
    return shared;
}

/**
 * Read and write one setting, as React state.
 *
 * Reads are synchronous, so there is no loading state and no flash of the
 * default: `Settings` is backed by expo-sqlite's synchronous API.
 *
 * @param settings Injected by tests. Production call sites omit it.
 */
export function useSetting<K extends SettingKey>(
    key: K,
    settings: Settings = sharedSettings()
): [SettingValue<K>, (value: SettingValue<K>) => void] {
    const [value, setValue] = useState<SettingValue<K>>(() => settings.get(key));

    function update(next: SettingValue<K>) {
        // Written before the state changes. If the write throws, the UI must not
        // be left showing a value that was never stored.
        settings.set(key, next);
        setValue(next);
    }

    return [value, update];
}

export default useSetting;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest hooks/__tests__/useSetting.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Sabotage-check the tests**

Delete the `settings.set(key, next);` line from `update`. Confirm the
"persists the new value" test goes **red** while the other three stay green —
which is the whole reason that test exists. Restore.

- [ ] **Step 6: Commit**

```bash
git add hooks/useSetting.ts hooks/__tests__/useSetting.test.ts
```

Subject: `feat: add the useSetting hook`
Body:
```
A React binding over library/Settings.ts. Reads are synchronous, so
there is no loading state and no flash of the default. The store is
created lazily rather than at import time, because constructing it
opens the database.
```

---

### Task 8: The settings screen

The gear must not open onto nothing, and sub-project 2's `showCoffeeMarker` has
been dead code since it was written.

**Files:**
- Create: `app/settings.tsx`
- Modify: `app/_layout.tsx`
- Test: `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/settings.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import SettingsScreen from "@/app/settings";
import {Settings, type SettingsStorage} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

describe("SettingsScreen", () => {
    it("shows the coffee marker toggle in its stored state", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("showCoffeeMarker", false);

        await renderWithProviders(<SettingsScreen settings={settings}/>);

        expect(screen.getByLabelText("Show the COFFEE marker").props.accessibilityState.checked)
            .toBe(false);
    });

    it("persists a change to the toggle", async () => {
        const storage = memoryStorage();
        const settings = new Settings(storage);

        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent(screen.getByLabelText("Show the COFFEE marker"), "checkedChange", false);

        expect(new Settings(storage).get("showCoffeeMarker")).toBe(false);
    });

    it("explains what the toggle does, rather than only naming it", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText(/TEA marker is always shown/i)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest app/__tests__/settings.test.tsx`
Expected: FAIL — "Cannot find module '@/app/settings'".

- [ ] **Step 3: Write the implementation**

Create `app/settings.tsx`:

```tsx
import React from "react";
import {ScrollView, Switch, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useSetting} from "@/hooks/useSetting";
import type {Settings} from "@/library/Settings";

type Props = {
    /** Injected by tests. The route renders with the shared store. */
    settings?: Settings;
};

type RowProps = {
    label: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
};

function ToggleRow({label, description, value, onChange}: RowProps) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                paddingVertical="$3">
            <YStack flex={1} gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            <Switch accessibilityLabel={label} accessibilityRole="switch"
                    accessibilityState={{checked: value}} checked={value}
                    onCheckedChange={onChange} size="$3"
                    backgroundColor={value ? palette.success : palette.line}>
                <Switch.Thumb backgroundColor={palette.text}/>
            </Switch>
        </XStack>
    );
}

/**
 * The settings screen.
 *
 * One section, deliberately. Sub-projects 4, 5 and 6 add rows to a screen that
 * already exists rather than each inventing one; this ships now because the
 * home screen's settings glyph must not open onto nothing.
 */
export default function SettingsScreen({settings}: Props) {
    const [showCoffeeMarker, setShowCoffeeMarker] =
        useSetting("showCoffeeMarker", settings);

    return (
        <ScrollView backgroundColor={palette.base} contentContainerStyle={{padding: 16}}>
            <YStack gap="$2">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    RECIPE LIST
                </DotMatrixText>
                <ToggleRow
                    label="Show the COFFEE marker"
                    description="The TEA marker is always shown. COFFEE is redundant in a mostly-coffee library."
                    value={showCoffeeMarker}
                    onChange={setShowCoffeeMarker}/>
            </YStack>
        </ScrollView>
    );
}
```

Note: `useSetting`'s second parameter has a default, so passing `undefined` from
the route falls through to the shared store — the route needs no special case.

- [ ] **Step 4: Register the route**

In `app/_layout.tsx`, inside the `<Stack>`, after the `editRecipe` screen:

```tsx
                                            <Stack.Screen name="settings" options={{title: "Settings"}}/>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest app/__tests__/settings.test.tsx`
Expected: PASS, 3 tests.

If `fireEvent(..., "checkedChange", false)` does not reach Tamagui's `Switch`,
use `fireEvent.press(screen.getByLabelText("Show the COFFEE marker"))` and assert
the toggled value instead. Do not change the component to suit the test.

- [ ] **Step 6: Commit**

```bash
git add app/settings.tsx app/__tests__/settings.test.tsx app/_layout.tsx
```

Subject: `feat: add a minimal settings screen`
Body:
```
One section with the showCoffeeMarker toggle, wired end to end
through useSetting to library/Settings.ts. Sub-project 2 shipped
that store with nothing reading it; this is where it starts
mattering, and it means the home screen's settings glyph does not
open onto an empty screen.
```

---

### Task 9: Wire showCoffeeMarker into the card

`RecipeCard` already accepts the prop and defaults it to `true`. Nothing feeds
it.

**Files:**
- Modify: `components/__tests__/RecipeCard.test.tsx`

- [ ] **Step 1: Confirm the card already honours the prop**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`
Expected: PASS. Read the file and check there is a test asserting the COFFEE
marker is hidden when `showCoffeeMarker={false}` and that the TEA marker is
shown regardless. If either is missing, add it now:

```tsx
it("hides the COFFEE marker when the setting is off", async () => {
    await renderWithProviders(
        <RecipeCard recipe={coffeeRecipe()} onPress={() => {}} showCoffeeMarker={false}/>
    );
    expect(screen.queryByText("COFFEE")).toBeNull();
});

it("shows the TEA marker even when the coffee marker is off", async () => {
    // Tea is the exception the setting is not allowed to hide: it is the only
    // cue that this recipe behaves differently, and colour alone is not a signal.
    await renderWithProviders(
        <RecipeCard recipe={teaRecipe()} onPress={() => {}} showCoffeeMarker={false}/>
    );
    expect(screen.getByText("TEA")).toBeTruthy();
});
```

Use whatever recipe factory the existing tests in that file already use; do not
introduce a second one.

- [ ] **Step 2: Run the tests**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit (skip if nothing changed)**

```bash
git add components/__tests__/RecipeCard.test.tsx
```

Subject: `test: cover the coffee marker setting on RecipeCard`
Body:
```
The setting is about to be wired to a real toggle, so the rule that
TEA is never hidden needs to be a test rather than a comment.
```

---

### Task 10: A resizable ScreenTitle

The collapsed header needs a smaller title. `ScreenTitle` hard-codes 28 and
derives the superscript lift from it, which is the invariant to preserve.

**Files:**
- Modify: `components/ScreenTitle.tsx`
- Modify: `components/__tests__/ScreenTitle.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `components/__tests__/ScreenTitle.test.tsx`:

```tsx
it("renders at the size it is given", async () => {
    await renderWithProviders(<ScreenTitle title="Recipes" count={7} fontSize={18}/>);
    expect(screen.getByText("Recipes").props.style.fontSize).toBe(18);
});

it("keeps the superscript tied to the title size", async () => {
    // The lift is derived, not a literal, so the count cannot drift away from
    // the word it belongs to when the header collapses.
    await renderWithProviders(<ScreenTitle title="Recipes" count={7} fontSize={18}/>);
    const small = screen.getByTestId("screen-title-count").props.style;

    await renderWithProviders(<ScreenTitle title="Recipes" count={7} fontSize={36}/>);
    const large = screen.getAllByTestId("screen-title-count")[1].props.style;

    const lift = (style: Record<string, unknown> | Record<string, unknown>[]) =>
        [style].flat().reduce<number>((found, part) =>
            typeof part?.marginTop === "number" ? part.marginTop : found, 0);

    expect(lift(large)).toBeGreaterThan(lift(small));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/ScreenTitle.test.tsx`
Expected: FAIL — `fontSize` is 28, not 18.

- [ ] **Step 3: Change the implementation**

In `components/ScreenTitle.tsx`, replace the module constants and the `Props`
type and make the two derived values functions of the prop:

```tsx
/** The size a screen title uses when the header is at rest. */
export const TITLE_FONT_SIZE = 28;

/** The size it shrinks to once the header collapses. */
export const TITLE_FONT_SIZE_COMPACT = 18;

/**
 * How far the superscript sits below the top of the title's line. Derived from
 * the title size rather than written as a literal so the two cannot drift apart
 * — including when the header collapses and the title changes size.
 */
function countLift(fontSize: number): number {
    return Math.round(fontSize * 0.14);
}

type Props = {
    /** Prose, so this is Inter — never rendered in Doto. */
    title: string;
    /** Rendered as a small superscript. Hidden when absent or zero. */
    count?: number;
    fontSize?: number;
};
```

and in the component body:

```tsx
export default function ScreenTitle({title, count, fontSize = TITLE_FONT_SIZE}: Props) {
    const showCount = typeof count === "number" && count > 0;
```

with the `<Text>` using `fontSize={fontSize}` and the `DotMatrixText` using
`style={{marginTop: countLift(fontSize)}}`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/ScreenTitle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ScreenTitle.tsx components/__tests__/ScreenTitle.test.tsx
```

Subject: `feat: let ScreenTitle take a size`
Body:
```
The collapsed home header needs a smaller title. The superscript
lift stays derived from the title size rather than becoming a second
literal, so the two cannot drift apart across the two states.
```

---

### Task 11: The home header

**Files:**
- Create: `components/HomeHeader.tsx`
- Test: `components/__tests__/HomeHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/HomeHeader.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import HomeHeader from "@/components/HomeHeader";
import {renderWithProviders} from "@/test-utils/render";

function props(overrides = {}) {
    return {
        count:        7,
        collapsed:    false,
        editing:      false,
        showEdit:     true,
        onToggleEdit: jest.fn(),
        onScan:       jest.fn(),
        onImport:     jest.fn(),
        onSettings:   jest.fn(),
        ...overrides
    };
}

describe("HomeHeader", () => {
    it("shows the title and the recipe count", async () => {
        await renderWithProviders(<HomeHeader {...props()}/>);
        expect(screen.getByText("Recipes")).toBeTruthy();
        expect(screen.getByText("7")).toBeTruthy();
    });

    it("leaves scan and import to the tiles while expanded", async () => {
        // Expanded, the two primary actions are the CTA tiles below. Repeating
        // them in the header would be two affordances for one job.
        await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        expect(screen.queryByLabelText("Read a card")).toBeNull();
        expect(screen.queryByLabelText("Import a recipe")).toBeNull();
    });

    it("takes scan and import in once the tiles are gone", async () => {
        await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        expect(screen.getByLabelText("Read a card")).toBeTruthy();
        expect(screen.getByLabelText("Import a recipe")).toBeTruthy();
    });

    it("keeps settings reachable in both states", async () => {
        const expanded = await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        expect(expanded.getByLabelText("Settings")).toBeTruthy();

        const collapsed = await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        expect(collapsed.getByLabelText("Settings")).toBeTruthy();
    });

    it("shrinks the title when collapsed", async () => {
        // Each render is queried through its own utilities rather than the
        // shared `screen` binding. `screen` tracks only the most recently
        // rendered tree, so re-querying it after a second render finds one tree,
        // not two.
        const expanded = await renderWithProviders(<HomeHeader {...props({collapsed: false})}/>);
        const big = expanded.getByText("Recipes").props.style.fontSize;

        const collapsed = await renderWithProviders(<HomeHeader {...props({collapsed: true})}/>);
        const small = collapsed.getByText("Recipes").props.style.fontSize;

        expect(small).toBeLessThan(big);
    });

    it("hides the edit toggle when there is nothing to edit", async () => {
        await renderWithProviders(<HomeHeader {...props({showEdit: false, count: 0})}/>);
        expect(screen.queryByLabelText("Edit recipes")).toBeNull();
    });

    it("says which way the edit toggle will go", async () => {
        await renderWithProviders(<HomeHeader {...props({editing: true})}/>);
        expect(screen.getByLabelText("Done editing")).toBeTruthy();
    });

    it("reports each action", async () => {
        const handlers = props({collapsed: true});
        await renderWithProviders(<HomeHeader {...handlers}/>);

        await fireEvent.press(screen.getByLabelText("Read a card"));
        await fireEvent.press(screen.getByLabelText("Import a recipe"));
        await fireEvent.press(screen.getByLabelText("Settings"));
        await fireEvent.press(screen.getByLabelText("Edit recipes"));

        expect(handlers.onScan).toHaveBeenCalledTimes(1);
        expect(handlers.onImport).toHaveBeenCalledTimes(1);
        expect(handlers.onSettings).toHaveBeenCalledTimes(1);
        expect(handlers.onToggleEdit).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/HomeHeader.test.tsx`
Expected: FAIL — "Cannot find module '@/components/HomeHeader'".

- [ ] **Step 3: Write the implementation**

Create `components/HomeHeader.tsx`:

```tsx
import React from "react";
import Animated, {FadeIn, FadeOut} from "react-native-reanimated";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import ScreenTitle, {TITLE_FONT_SIZE, TITLE_FONT_SIZE_COMPACT} from "@/components/ScreenTitle";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import {DURATION, useReducedMotion} from "@/constants/motion";

const ACTION_ICON_SIZE = 20;

/**
 * The smallest comfortable touch target, per the HIG. The glyphs are padded out
 * to this rather than given `hitSlop`, because hit slop on adjacent controls
 * overlaps into the gap between them and the later sibling wins — which here
 * would put "settings" under a tap aimed at "import".
 */
const TOUCH_TARGET = 44;
const ACTION_PADDING = (TOUCH_TARGET - ACTION_ICON_SIZE) / 2;

type ActionProps = {
    icon: DotIconName;
    label: string;
    onPress: () => void;
    active?: boolean;
};

function Action({icon, label, onPress, active = false}: ActionProps) {
    return (
        <XStack
            accessible
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            padding={ACTION_PADDING}
            pressStyle={{opacity: 0.6}}>
            <DotIcon name={icon} size={ACTION_ICON_SIZE}
                     color={active ? palette.success : palette.dim}/>
        </XStack>
    );
}

type Props = {
    count: number;
    /** Whether the list has scrolled far enough for the tiles to have gone. */
    collapsed: boolean;
    /** Whether the cards are currently showing their destructive actions. */
    editing: boolean;
    /** False when the library is empty: there is nothing to edit. */
    showEdit: boolean;
    onToggleEdit: () => void;
    onScan: () => void;
    onImport: () => void;
    onSettings: () => void;
};

/**
 * The home screen's header, in both of its two states.
 *
 * Collapsed, it takes in the two primary actions that were CTA tiles a moment
 * ago and shrinks the title to make room. Expanded, it deliberately does not
 * show them: the tiles below are those actions, and showing both would be two
 * affordances for one job.
 *
 * Settings and the edit toggle are present in both states. No action is ever
 * only reachable in one of them — that is what allows the collapse to be this
 * aggressive.
 */
export default function HomeHeader({
    count,
    collapsed,
    editing,
    showEdit,
    onToggleEdit,
    onScan,
    onImport,
    onSettings
}: Props) {
    const reduced = useReducedMotion();

    // Under Reduced Motion the two glyphs appear and disappear without the
    // travel, but they still fade — a user who disabled motion must still see
    // that the header changed rather than find two new controls with no
    // explanation.
    const entering = reduced ? FadeIn.duration(DURATION.fast) : FadeIn.duration(DURATION.base);
    const exiting = reduced ? FadeOut.duration(DURATION.fast) : FadeOut.duration(DURATION.fast);

    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$2"
                paddingHorizontal="$3" paddingVertical="$2">
            <ScreenTitle title="Recipes" count={count}
                         fontSize={collapsed ? TITLE_FONT_SIZE_COMPACT : TITLE_FONT_SIZE}/>

            <XStack alignItems="center">
                {showEdit && (
                    <Action icon="edit" active={editing}
                            label={editing ? "Done editing" : "Edit recipes"}
                            onPress={onToggleEdit}/>
                )}
                {collapsed && (
                    <Animated.View entering={entering} exiting={exiting}>
                        <XStack alignItems="center">
                            <Action icon="scan" label="Read a card" onPress={onScan}/>
                            <Action icon="import" label="Import a recipe" onPress={onImport}/>
                        </XStack>
                    </Animated.View>
                )}
                <Action icon="settings" label="Settings" onPress={onSettings}/>
            </XStack>
        </XStack>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/HomeHeader.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Sabotage-check the tests**

Render the scan and import actions unconditionally (drop the `collapsed &&`).
Confirm "leaves scan and import to the tiles while expanded" goes **red**.
Restore.

- [ ] **Step 6: Commit**

```bash
git add components/HomeHeader.tsx components/__tests__/HomeHeader.test.tsx
```

Subject: `feat: add the home screen header`
Body:
```
Title, count and the action glyphs, in both collapse states.
Collapsed it takes in scan and import and shrinks the title;
expanded it leaves those two to the CTA tiles rather than showing
each action twice. Settings and edit are present in both states, so
the collapse never removes a way to do something.
```

---

### Task 12: The empty state

**Files:**
- Create: `components/EmptyLibrary.tsx`
- Test: `components/__tests__/EmptyLibrary.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/EmptyLibrary.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import EmptyLibrary from "@/components/EmptyLibrary";
import {renderWithProviders} from "@/test-utils/render";

describe("EmptyLibrary", () => {
    it("says the library is empty", async () => {
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.getByText("No recipes yet")).toBeTruthy();
    });

    it("points at the tiles rather than repeating them", async () => {
        // The two CTA tiles stay on screen above this, so a third call to
        // action here would be a second affordance for the same job.
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("hides its decoration from screen readers", async () => {
        // DotBloom announces itself as a progressbar, which is true when it is
        // reporting a scan and a lie when it is a mark on an empty screen.
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.queryByRole("progressbar")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/EmptyLibrary.test.tsx`
Expected: FAIL — "Cannot find module '@/components/EmptyLibrary'".

- [ ] **Step 3: Write the implementation**

Create `components/EmptyLibrary.tsx`:

```tsx
import React from "react";
import {View} from "react-native";
import {Text, YStack} from "tamagui";

import DotBloom from "@/components/DotBloom";
import {palette} from "@/constants/colors";

const MARK_SIZE = 96;
const MARK_DOT_SIZE = 5;

/**
 * What the list area shows when there are no recipes.
 *
 * It replaces the list only. The header and both CTA tiles stay exactly where
 * they are, so the first thing a new user sees is the two things they can do —
 * which is also why there is no button in here.
 */
export default function EmptyLibrary() {
    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$4" paddingHorizontal="$6" paddingVertical="$8">
            {/* The bloom is the app's mark here, not a progress report. */}
            <View accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                <DotBloom progress={0} size={MARK_SIZE} dotSize={MARK_DOT_SIZE}/>
            </View>

            <YStack alignItems="center" gap="$2">
                <Text fontSize={18} fontWeight="700" color={palette.text}>
                    No recipes yet
                </Text>
                <Text fontSize={14} textAlign="center" color={palette.dim}>
                    Read a card or import a recipe using the buttons above.
                </Text>
            </YStack>
        </YStack>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/EmptyLibrary.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/EmptyLibrary.tsx components/__tests__/EmptyLibrary.test.tsx
```

Subject: `feat: add the empty library state`
Body:
```
Replaces the list only -- the header and both CTA tiles stay put, so
a new user's first sight is the two things they can do. That is also
why there is no button in here: it would be a second affordance for
a job the tiles already have.
```

---

### Task 13: Put RecipeCard in the list

`SwipeableRecipeRow` currently renders `RecipeItem`, the old row.
`RecipeCard` has existed since sub-project 1 and has never been on screen.

**Files:**
- Modify: `components/SwipeableRecipeRow.tsx`
- Test: `components/__tests__/SwipeableRecipeRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/SwipeableRecipeRow.test.tsx` (or extend it if it
exists):

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipe(): Recipe {
    const r = new Recipe();
    r.name = "Ethiopia Guji";
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 62;
    return r;
}

function props(overrides = {}) {
    return {
        recipe:      recipe(),
        onPress:     jest.fn(),
        onDelete:    jest.fn(),
        onDuplicate: jest.fn(),
        ...overrides
    };
}

describe("SwipeableRecipeRow", () => {
    it("renders the recipe as a card", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props()}/>);
        expect(screen.getByTestId("recipe-card")).toBeTruthy();
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("keeps the destructive actions hidden until asked", async () => {
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: false})}/>);
        expect(screen.queryByTestId("recipe-card-delete")).toBeNull();
    });

    it("reveals them inline while editing", async () => {
        // The swipe gesture is a shortcut. It may not be the only route to a
        // destructive action, and it is not available to a screen reader at all.
        await renderWithProviders(<SwipeableRecipeRow {...props({editing: true})}/>);
        expect(screen.getByTestId("recipe-card-delete")).toBeTruthy();
        expect(screen.getByTestId("recipe-card-duplicate")).toBeTruthy();
    });

    it("deletes from the inline action", async () => {
        const handlers = props({editing: true});
        await renderWithProviders(<SwipeableRecipeRow {...handlers}/>);
        await fireEvent.press(screen.getByTestId("recipe-card-delete"));
        expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });

    it("passes the coffee marker setting through to the card", async () => {
        await renderWithProviders(
            <SwipeableRecipeRow {...props({showCoffeeMarker: false})}/>
        );
        expect(screen.queryByText("COFFEE")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/SwipeableRecipeRow.test.tsx`
Expected: FAIL — no element with testID `recipe-card`.

- [ ] **Step 3: Change the implementation**

In `components/SwipeableRecipeRow.tsx`:

Replace the `RecipeItem` import with:

```tsx
import RecipeCard from "@/components/RecipeCard";
```

Extend `Props`:

```tsx
type Props = {
    recipe: Recipe;
    onPress: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    /** Nudges the row open briefly on mount so the swipe actions are discoverable. */
    bounceOnMount?: boolean;
    /** When true, the card shows its destructive actions instead of hiding them behind a swipe. */
    editing?: boolean;
    /** Forwarded to the card. Owned by the settings screen. */
    showCoffeeMarker?: boolean;
};
```

Add the two new parameters to the destructured signature
(`editing = false, showCoffeeMarker = true`), and replace the `<RecipeItem/>`
child of `<Swipeable>` with:

```tsx
                <RecipeCard recipe={recipe} onPress={onPress} editing={editing}
                            showCoffeeMarker={showCoffeeMarker}
                            onDelete={onDelete} onDuplicate={onDuplicate}/>
```

Finally, wrap the card in the row's own spacing so consecutive cards do not
touch — change the outer `<View style={{maxWidth: 600}}>` to
`<View style={{maxWidth: 600, paddingHorizontal: 12, paddingVertical: 6}}>`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/SwipeableRecipeRow.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Check whether RecipeItem is now dead**

Run: `grep -rn "RecipeItem" app components hooks library`
If the only hits are `components/RecipeItem.tsx` itself and its own test, delete
both files — leaving two row components in the tree invites the next change to
be made to the wrong one.

- [ ] **Step 6: Commit**

```bash
git add components/SwipeableRecipeRow.tsx components/__tests__/SwipeableRecipeRow.test.tsx
git rm components/RecipeItem.tsx   # only if step 5 found it dead
```

Subject: `feat: render the recipe list on RecipeCard`
Body:
```
RecipeCard was built in sub-project 1 and has never been on screen.
The row now also takes an editing flag, so the delete and duplicate
actions have a route that is not a swipe -- a gesture may be a
shortcut but may not be the only way to reach a destructive action,
and it is not available to a screen reader at all.
```

---

### Task 14: Lift the library out of the screen

`app/index.tsx` currently loads, deletes, duplicates and sorts recipes as well as
laying the screen out. The route should stay close to layout.

**Files:**
- Create: `hooks/useRecipeLibrary.ts`
- Test: `hooks/__tests__/useRecipeLibrary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useRecipeLibrary.test.ts`:

```ts
import {act, renderHook} from "@testing-library/react-native";

import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import Recipe from "@/library/Recipe";

jest.mock("@/library/RecipeDatabase");

function stubDb(recipes: Recipe[]) {
    return {
        retrieveAllRecipes: jest.fn(() => recipes),
        deleteRecipe:       jest.fn(),
        cloneRecipe:        jest.fn()
    };
}

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

describe("useRecipeLibrary", () => {
    it("sorts by display name so the list order does not depend on insertion order", async () => {
        const db = stubDb([named("Zambia"), named("Ethiopia"), named("Kenya")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));
        expect(result.current.recipes.map((r) => r.displayName()))
            .toEqual(["Ethiopia", "Kenya", "Zambia"]);
    });

    it("reports an empty library as an empty list, not as null", async () => {
        // retrieveAllRecipes returns null when the table is empty. Every caller
        // leaking that null is how the old screen ended up with `recipesJSON ? ... : ""`.
        const db = {...stubDb([]), retrieveAllRecipes: jest.fn(() => null)};
        const {result} = await renderHook(() => useRecipeLibrary(db));
        expect(result.current.recipes).toEqual([]);
    });

    it("deletes through the database and re-reads", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.deleteRecipe(result.current.recipes[0]));

        expect(db.deleteRecipe).toHaveBeenCalledTimes(1);
        expect(db.retrieveAllRecipes).toHaveBeenCalledTimes(2);
    });

    it("duplicates through the database and re-reads", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.duplicateRecipe(result.current.recipes[0]));

        expect(db.cloneRecipe).toHaveBeenCalledTimes(1);
        expect(db.retrieveAllRecipes).toHaveBeenCalledTimes(2);
    });

    it("re-reads on refresh", async () => {
        const db = stubDb([named("Ethiopia")]);
        const {result} = await renderHook(() => useRecipeLibrary(db));

        await act(async () => result.current.refresh());

        expect(db.retrieveAllRecipes).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest hooks/__tests__/useRecipeLibrary.test.ts`
Expected: FAIL — "Cannot find module '@/hooks/useRecipeLibrary'".

- [ ] **Step 3: Write the implementation**

Create `hooks/useRecipeLibrary.ts`:

```ts
import {useState} from "react";

import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";

/**
 * The part of `RecipeDatabase` this hook uses.
 *
 * Narrow on purpose: it is the whole contract, so a test can supply three
 * functions instead of a database, and a reader can see at a glance that the
 * home screen neither writes recipes nor reads settings.
 */
export type RecipeStore = {
    retrieveAllRecipes: () => Recipe[] | null;
    deleteRecipe: (uuid: string) => void;
    cloneRecipe: (uuid: string) => void;
};

export type RecipeLibrary = {
    recipes: Recipe[];
    refresh: () => void;
    deleteRecipe: (recipe: Recipe) => void;
    duplicateRecipe: (recipe: Recipe) => void;
};

/**
 * The saved recipes, and the two things the list can do to one.
 *
 * Lifted out of `app/index.tsx`, which was loading, sorting, deleting and
 * duplicating as well as laying the screen out. A route file should stay close
 * to layout — the same reasoning that produced `useRecipeEditor`.
 *
 * @param db Injected by tests. Production call sites omit it.
 */
export function useRecipeLibrary(db: RecipeStore = new RecipeDatabase()): RecipeLibrary {
    const [recipes, setRecipes] = useState<Recipe[]>(() => read(db));

    function reload() {
        setRecipes(read(db));
    }

    function deleteRecipe(recipe: Recipe) {
        db.deleteRecipe(recipe.uuid);
        reload();
    }

    function duplicateRecipe(recipe: Recipe) {
        db.cloneRecipe(recipe.uuid);
        reload();
    }

    return {recipes, refresh: reload, deleteRecipe, duplicateRecipe};
}

/**
 * `retrieveAllRecipes` answers `null` for an empty table. Absorbed here rather
 * than leaked to callers: the old screen checked for it at every use, and one
 * of those checks conflated "no recipes" with "not loaded yet".
 */
function read(db: RecipeStore): Recipe[] {
    const stored = db.retrieveAllRecipes() ?? [];
    return [...stored].sort((a, b) => a.displayName().localeCompare(b.displayName()));
}

export default useRecipeLibrary;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest hooks/__tests__/useRecipeLibrary.test.ts`
Expected: PASS, 5 tests.

If `jest.mock("@/library/RecipeDatabase")` is not enough because the module
opens SQLite at import time, add a manual mock at
`library/__mocks__/RecipeDatabase.ts` exporting a class whose methods are
`jest.fn()`. Check whether one already exists before writing it.

- [ ] **Step 5: Sabotage-check the tests**

Remove the `.sort(...)` from `read`. Confirm the sorting test goes **red**. Then
change `?? []` to `as Recipe[]` and confirm the null test goes **red**. Restore.

- [ ] **Step 6: Commit**

```bash
git add hooks/useRecipeLibrary.ts hooks/__tests__/useRecipeLibrary.test.ts
```

Subject: `feat: lift the recipe library out of the home screen`
Body:
```
Loading, sorting, deleting and duplicating move into a hook, the way
useRecipeEditor did for the editor. The null that retrieveAllRecipes
returns for an empty table is absorbed here rather than checked at
every call site.
```

---

### Task 15: Rebuild the home screen

This is the task where every piece built so far arrives on screen.

**Files:**
- Modify: `app/index.tsx`
- Test: `app/__tests__/index.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/index.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import HomeScreen from "@/app/index";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

const push = jest.fn();

jest.mock("expo-router", () => ({
    useRouter:      () => ({push}),
    useNavigation:  () => ({setOptions: jest.fn()}),
    useFocusEffect: jest.fn()
}));

jest.mock("expo-share-intent", () => ({
    useShareIntentContext: () => ({
        hasShareIntent:   false,
        shareIntent:      {},
        resetShareIntent: jest.fn()
    })
}));

jest.mock("@/library/RecipeDatabase");

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

function store(recipes: Recipe[]) {
    return {
        retrieveAllRecipes: jest.fn(() => (recipes.length > 0 ? recipes : null)),
        deleteRecipe:       jest.fn(),
        cloneRecipe:        jest.fn()
    };
}

beforeEach(() => push.mockClear());

describe("HomeScreen", () => {
    it("lists the saved recipes as cards", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia"), named("Kenya")])}/>);
        expect(screen.getAllByTestId("recipe-card")).toHaveLength(2);
    });

    it("counts them in the title", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia"), named("Kenya")])}/>);
        expect(screen.getByText("2")).toBeTruthy();
    });

    it("shows the empty state instead of the list when there is nothing saved", async () => {
        await renderWithProviders(<HomeScreen db={store([])}/>);
        expect(screen.getByText("No recipes yet")).toBeTruthy();
        expect(screen.queryByTestId("recipe-card")).toBeNull();
    });

    it("keeps both actions available when the library is empty", async () => {
        // The empty state replaces the list only. If the tiles vanished with it,
        // a new user would see an app with nothing to do.
        await renderWithProviders(<HomeScreen db={store([])}/>);
        expect(screen.getByLabelText("Read a card")).toBeTruthy();
        expect(screen.getByLabelText("Import a recipe")).toBeTruthy();
    });

    it("opens a recipe when its card is pressed", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia")])}/>);
        await fireEvent.press(screen.getByTestId("recipe-card"));
        expect(push).toHaveBeenCalledWith(
            expect.objectContaining({pathname: "/editRecipe"})
        );
    });

    it("opens settings from the header", async () => {
        await renderWithProviders(<HomeScreen db={store([])}/>);
        await fireEvent.press(screen.getByLabelText("Settings"));
        expect(push).toHaveBeenCalledWith("/settings");
    });

    it("reveals the row actions when editing is turned on", async () => {
        await renderWithProviders(<HomeScreen db={store([named("Ethiopia")])}/>);
        expect(screen.queryByTestId("recipe-card-delete")).toBeNull();

        await fireEvent.press(screen.getByLabelText("Edit recipes"));

        expect(screen.getByTestId("recipe-card-delete")).toBeTruthy();
    });

    it("offers no edit toggle with an empty library", async () => {
        await renderWithProviders(<HomeScreen db={store([])}/>);
        expect(screen.queryByLabelText("Edit recipes")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest app/__tests__/index.test.tsx`
Expected: FAIL — the screen renders `RecipeItem` rows and has no header actions.

- [ ] **Step 3: Rewrite the screen**

Replace the whole of `app/index.tsx` with:

```tsx
import React, {useEffect, useState} from "react";
import {Platform} from "react-native";
// gesture-handler's FlatList, not React Native's: it keeps the list scroll
// gesture and each row's swipe gesture from fighting each other on Android.
import {FlatList} from "react-native-gesture-handler";
import {useFocusEffect, useNavigation, useRouter} from "expo-router";
import {useShareIntentContext} from "expo-share-intent";
import {XStack, YStack} from "tamagui";

import CtaTile from "@/components/CtaTile";
import EmptyLibrary from "@/components/EmptyLibrary";
import HomeHeader from "@/components/HomeHeader";
import ImportRecipeComponent from "@/components/ImportRecipeComponent";
import NfcOverlay from "@/components/NfcOverlay";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useCollapsibleHeader} from "@/hooks/useCollapsibleHeader";
import {useRecipeLibrary, type RecipeStore} from "@/hooks/useRecipeLibrary";
import {useSetting} from "@/hooks/useSetting";
import NFC, {setNfcAlertIOS} from "@/library/NFC";
import Recipe from "@/library/Recipe";
import {resolveOnOpen} from "@/library/duplicates";
import type {Settings} from "@/library/Settings";

type Props = {
    /** Injected by tests. The route renders against the real database. */
    db?: RecipeStore;
    /** Injected by tests. */
    settings?: Settings;
};

/**
 * The recipe library.
 *
 * Layout only. Loading and mutating recipes belong to `useRecipeLibrary`, the
 * scroll collapse to `useCollapsibleHeader`, and every message to `notify`.
 */
export default function HomeScreen({db, settings}: Props) {
    const router = useRouter();
    const navigation = useNavigation();

    const library = useRecipeLibrary(db);
    const {collapsed, onScroll} = useCollapsibleHeader();
    const [showCoffeeMarker] = useSetting("showCoffeeMarker", settings);

    const [editing, setEditing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [readProgress, setReadProgress] = useState(0);
    const [importId, setImportId] = useState<string | null>(null);
    const [bounceFirstRow, setBounceFirstRow] = useState(true);

    const {hasShareIntent, shareIntent, resetShareIntent} = useShareIntentContext();
    const nfc = new NFC();

    const isEmpty = library.recipes.length === 0;

    // The header owns the whole strip, so the navigator's own bar would be a
    // second title above ours.
    useEffect(() => {
        navigation.setOptions({headerShown: false});
    }, [navigation]);

    useFocusEffect(
        React.useCallback(() => {
            library.refresh();
            // Refreshing on focus is how a recipe saved in the editor appears
            // here. `library` is rebuilt every render, so depending on it would
            // re-run this on every render instead of on every focus.
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
    );

    useEffect(() => {
        if (!hasShareIntent || shareIntent.type !== "weburl" || !shareIntent.webUrl) {
            return;
        }
        const id = new URL(shareIntent.webUrl).searchParams.get("id");
        if (id) {
            // Reacting to an inbound share intent — an external system pushing
            // into React, which is what effects are for.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setImportId(id);
            resetShareIntent();
        }
    }, [hasShareIntent, shareIntent, resetShareIntent]);

    async function progressCallback(progress: number): Promise<string | undefined> {
        if (Platform.OS === "ios") {
            setNfcAlertIOS(progress >= 100
                ? "Recipe read from card"
                : `Reading recipe from card: ${Math.round(progress)}%`);
        }
        setReadProgress(progress);
        return undefined;
    }

    async function readCard() {
        setScanning(true);
        setReadProgress(0);
        try {
            const recipe = new Recipe();
            const success = await recipe.readCard(nfc, progressCallback);
            setScanning(false);
            if (!success) {
                return;
            }

            // Stamped before serialising: the editor rebuilds the recipe from
            // this JSON, so anything set afterwards would be lost.
            recipe.source = "read";
            const {recipe: toOpen, isExisting} = resolveOnOpen(library.recipes, recipe);

            notify(isExisting
                ? {tone: "info", message: "Already in your library"}
                : {tone: "success", message: "Recipe read from card"});

            router.push({
                pathname: "/editRecipe",
                params:   {
                    recipeJSON: JSON.stringify(toOpen),
                    // An already-saved recipe opens with Save disabled, as it
                    // would from the list; only a genuinely new read arrives
                    // needing to be saved.
                    saveEnabled: isExisting ? "false" : "true"
                }
            });
        } catch (error) {
            setScanning(false);
            // A cancelled Android scan throws. That is the user getting what
            // they asked for, not a failure to report.
            if (!nfc.getIsClosed()) {
                notify({tone: "error", message: "Could not read the card. Please try again."});
            }
        }
    }

    async function cancelScan() {
        await nfc.close();
        setScanning(false);
    }

    function openRecipe(recipe: Recipe) {
        router.push({pathname: "/editRecipe", params: {recipeJSON: JSON.stringify(recipe)}});
    }

    return (
        <>
            <YStack flex={1} backgroundColor={palette.base}>
                <HomeHeader
                    count={library.recipes.length}
                    collapsed={collapsed}
                    editing={editing}
                    showEdit={!isEmpty}
                    onToggleEdit={() => setEditing((current) => !current)}
                    onScan={readCard}
                    onImport={() => setImportId("")}
                    onSettings={() => router.push("/settings")}/>

                {!collapsed && (
                    <XStack gap="$3" paddingHorizontal="$3" paddingBottom="$3">
                        <CtaTile icon="scan" label="READ CARD"
                                 accessibilityLabel="Read a card" onPress={readCard}/>
                        <CtaTile icon="import" label="IMPORT"
                                 accessibilityLabel="Import a recipe"
                                 onPress={() => setImportId("")}/>
                    </XStack>
                )}

                {isEmpty ? (
                    <EmptyLibrary/>
                ) : (
                    <FlatList
                        data={library.recipes}
                        keyExtractor={(item: Recipe) => item.key}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        showsVerticalScrollIndicator={false}
                        renderItem={({item, index}: {item: Recipe; index: number}) => (
                            <SwipeableRecipeRow
                                recipe={item}
                                editing={editing}
                                showCoffeeMarker={showCoffeeMarker}
                                bounceOnMount={index === 0 && bounceFirstRow}
                                onPress={() => openRecipe(item)}
                                onDelete={() => {
                                    setBounceFirstRow(false);
                                    library.deleteRecipe(item);
                                }}
                                onDuplicate={() => {
                                    setBounceFirstRow(false);
                                    library.duplicateRecipe(item);
                                }}/>
                        )}/>
                )}
            </YStack>

            {importId !== null && (
                <ImportRecipeComponent
                    key={`import-${importId}`}
                    recipeId={importId}
                    onClose={() => {
                        setImportId(null);
                        library.refresh();
                    }}/>
            )}

            <NfcOverlay visible={scanning} mode="read" progress={readProgress}
                        onCancel={cancelScan}/>
        </>
    );
}
```

Note that the development seeder and the `EXPO_PUBLIC_DEBUG_RECIPE_VIEW`
shortcut from the old screen are deliberately dropped: both predate the seeded
database and neither is referenced by any documentation. If `.env.local` in this
checkout sets either variable, stop and ask before removing them.

- [ ] **Step 4: Run the test**

Run: `npx jest app/__tests__/index.test.tsx`
Expected: FAIL — `NfcOverlay` does not exist yet. That is expected; Task 16
builds it. Comment out the `<NfcOverlay .../>` element and its import, re-run,
and confirm all 8 tests PASS. Then restore both lines before committing and
leave this task's tests failing only on that missing import.

If you prefer not to leave a red test, do Task 16 before this step and then run
them in order — the plan's order is by dependency, not by obligation.

- [ ] **Step 5: Commit**

```bash
git add app/index.tsx app/__tests__/index.test.tsx
```

Subject: `feat: rebuild the home screen`
Body:
```
Header with the collapse, two CTA tiles at equal weight, the recipe
list on RecipeCard, and the empty state. Data access moves to
useRecipeLibrary and every message goes through notify, so the route
is layout and event wiring.

The duplicate detection added in sub-project 2 finally gets a voice
here: opening a card that is already saved says so.
```

---

### Task 16: The NFC overlay

**Files:**
- Create: `components/NfcOverlay.tsx`
- Delete: `components/AndroidNFCDialog.tsx`
- Test: `components/__tests__/NfcOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/NfcOverlay.test.tsx`:

```tsx
import React from "react";
import {Platform} from "react-native";
import {screen, fireEvent} from "@testing-library/react-native";

import NfcOverlay from "@/components/NfcOverlay";
import {renderWithProviders} from "@/test-utils/render";

function props(overrides = {}) {
    return {
        visible:  true,
        mode:     "read" as const,
        progress: 0,
        onCancel: jest.fn(),
        ...overrides
    };
}

describe("NfcOverlay", () => {
    it("renders nothing when it is not visible", async () => {
        await renderWithProviders(<NfcOverlay {...props({visible: false})}/>);
        expect(screen.queryByTestId("nfc-overlay")).toBeNull();
    });

    it("teaches placement without drawing an antenna position", async () => {
        // The antenna is not in the same place on every device, so a drawing
        // would be wrong on some of them. The copy is right everywhere.
        await renderWithProviders(<NfcOverlay {...props()}/>);
        expect(screen.getByText(/hold the card to the top of the phone/i)).toBeTruthy();
    });

    it("says which way the data is going", async () => {
        await renderWithProviders(<NfcOverlay {...props({mode: "read"})}/>);
        expect(screen.getByText(/reading/i)).toBeTruthy();

        await renderWithProviders(<NfcOverlay {...props({mode: "write"})}/>);
        expect(screen.getByText(/writing/i)).toBeTruthy();
    });

    it("reports progress to a screen reader, not only in dots", async () => {
        await renderWithProviders(<NfcOverlay {...props({progress: 50})}/>);
        expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(50);
    });

    it("can be cancelled", async () => {
        const handlers = props();
        await renderWithProviders(<NfcOverlay {...handlers}/>);
        await fireEvent.press(screen.getByLabelText("Cancel"));
        expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    });

    it("leaves the lower half of the screen alone on iOS", async () => {
        // CoreNFC's own sheet covers roughly the bottom 47% and cannot be drawn
        // over, so our content is staged above it rather than centred.
        Platform.OS = "ios";
        await renderWithProviders(<NfcOverlay {...props()}/>);
        expect(screen.getByTestId("nfc-overlay-stage").props.style.justifyContent)
            .toBe("flex-start");
        Platform.OS = "android";
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/NfcOverlay.test.tsx`
Expected: FAIL — "Cannot find module '@/components/NfcOverlay'".

- [ ] **Step 3: Write the implementation**

Create `components/NfcOverlay.tsx`:

```tsx
import React from "react";
import {Dimensions, Platform, View} from "react-native";
import Animated, {FadeIn, FadeOut} from "react-native-reanimated";
import {Text, YStack} from "tamagui";

import DotBloom from "@/components/DotBloom";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {DURATION, useReducedMotion} from "@/constants/motion";

/**
 * How much of the screen CoreNFC's own scanning sheet occupies on iOS.
 *
 * Measured, not guessed. The app cannot draw over it and the only element of it
 * we control is one line of text, via `setNfcAlertIOS`. Everything this
 * component shows on iOS has to fit above this.
 */
const IOS_SYSTEM_SHEET_FRACTION = 0.47;

const BLOOM_SIZE = 140;

type Props = {
    visible: boolean;
    /** Which ceremony this is. Reading and writing look the same and read differently. */
    mode: "read" | "write";
    /** 0–100. */
    progress: number;
    onCancel: () => void;
};

/**
 * The card ceremony, in the only two compositions the platforms allow.
 *
 * On iOS the system sheet owns the lower half of the screen, so the app dims
 * itself and stages the bloom in the strip above it — the dimming is what makes
 * our half and the system's half read as one event rather than two overlapping
 * UIs. On Android there is no system sheet at all, so this is the entire
 * experience and it centres.
 *
 * Replaces `AndroidNFCDialog`, which was Android-only and spoke in a different
 * visual language from everything around it.
 */
export default function NfcOverlay({visible, mode, progress, onCancel}: Props) {
    const reduced = useReducedMotion();

    if (!visible) {
        return null;
    }

    const isIOS = Platform.OS === "ios";
    const stageHeight = isIOS
        ? Dimensions.get("window").height * (1 - IOS_SYSTEM_SHEET_FRACTION)
        : undefined;

    const verb = mode === "read" ? "Reading" : "Writing";

    return (
        <Animated.View
            testID="nfc-overlay"
            entering={FadeIn.duration(reduced ? DURATION.fast : DURATION.base)}
            exiting={FadeOut.duration(DURATION.fast)}
            style={{
                position:        "absolute",
                top:             0,
                left:            0,
                right:           0,
                bottom:          0,
                backgroundColor: palette.base,
                opacity:         0.96
            }}>
            <View
                testID="nfc-overlay-stage"
                style={{
                    flex:           1,
                    height:         stageHeight,
                    alignItems:     "center",
                    // iOS stages the content in the strip above the system
                    // sheet; Android owns the whole screen and centres.
                    justifyContent: isIOS ? "flex-start" : "center",
                    paddingTop:     isIOS ? 64 : 0
                }}>
                <YStack alignItems="center" gap="$5" paddingHorizontal="$6">
                    <DotBloom progress={progress / 100} size={BLOOM_SIZE}/>

                    <YStack alignItems="center" gap="$2">
                        <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                                       color={palette.text}>
                            {`${verb.toUpperCase()} ${Math.round(progress)}%`}
                        </DotMatrixText>
                        <Text fontSize={14} textAlign="center" color={palette.dim}>
                            Hold the card to the top of the phone.
                        </Text>
                    </YStack>

                    <Text
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                        onPress={onCancel}
                        fontSize={16}
                        paddingVertical="$3"
                        paddingHorizontal="$6"
                        color={palette.dim}>
                        Cancel
                    </Text>
                </YStack>
            </View>
        </Animated.View>
    );
}
```

`DotBloom` already carries `accessibilityRole="progressbar"` and reports the
rounded percentage, which is what the progress test asserts — do not add a
second progressbar here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/NfcOverlay.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Restore the NfcOverlay usage in the home screen**

Uncomment the `<NfcOverlay .../>` element and its import in `app/index.tsx` if
Task 15 left them commented.

Run: `npx jest app/__tests__/index.test.tsx components/__tests__/NfcOverlay.test.tsx`
Expected: PASS.

- [ ] **Step 6: Move the write path onto the overlay too**

`app/editRecipe.tsx` renders `AndroidNFCDialog` for writing, and
`hooks/useCardWriter.ts` gates its flag behind `Platform.OS !== "ios"` — so on
iOS the write ceremony is currently the bare CoreNFC sheet with no app-side
staging at all. The overlay handles both platforms itself, so the gate goes.

In `hooks/useCardWriter.ts`, rename `showAndroidNFCDialog` to `showNfcOverlay`
throughout (the type, the state, the four assignments and the return object),
and delete the two `if (Platform.OS !== "ios")` wrappers around
`setShowNfcOverlay(true)` and `setShowNfcOverlay(false)` in `writeCard` — keep
`setWriteProgress(0)`, which those wrappers also contained. If `Platform` is
then unused in that file, remove its import.

In `app/editRecipe.tsx`, change the destructure on line ~45 to
`showNfcOverlay`, replace the `AndroidNFCDialog` import with
`import NfcOverlay from "@/components/NfcOverlay";`, and replace the whole
`{Platform.OS !== "ios" && showAndroidNFCDialog ? ... : ""}` expression with:

```tsx
                    <NfcOverlay visible={showNfcOverlay} mode="write"
                                progress={writeProgress}
                                onCancel={onNFCDialogClose}/>
```

Change nothing else in that screen — it is sub-project 4's work.

- [ ] **Step 7: Delete the old dialog**

Run: `grep -rn "AndroidNFCDialog" app components hooks`
Expected: the only hit is `components/AndroidNFCDialog.tsx` itself.

```bash
git rm components/AndroidNFCDialog.tsx
```

Run: `npm run typecheck`
Expected: 0 errors — this is what catches a missed rename.

- [ ] **Step 8: Commit**

```bash
git add components/NfcOverlay.tsx components/__tests__/NfcOverlay.test.tsx \
        app/index.tsx app/editRecipe.tsx hooks/useCardWriter.ts
```

Subject: `feat: one NFC overlay for both platforms`
Body:
```
Replaces AndroidNFCDialog, and reaches the write path as well as the
read path: the old dialog was gated behind `Platform.OS !== "ios"`,
so writing on iOS had no app-side staging at all.

iOS dims the app and stages the bloom in the strip above CoreNFC's
system sheet, which covers roughly the bottom 47% of the screen and
cannot be drawn over; Android has no system sheet, so this is the
whole experience and it centres.

The copy teaches placement rather than drawing an antenna position,
because the antenna is not in the same place on every device.
```

---

### Task 17: Remove the last native Alerts

Seven `Alert.alert` call sites. Six become notices; one becomes an inline
validation message, because it is a state of the recipe rather than an event.

**Files:**
- Modify: `components/TooltipComponent.tsx`
- Modify: `hooks/useCardWriter.ts`
- Modify: `hooks/useRecipeEditor.ts`
- Modify: `components/RestoreDialog.tsx`
- Test: `components/__tests__/TooltipComponent.test.tsx`
- Test: `hooks/__tests__/useCardWriter.test.ts`

- [ ] **Step 1: Write the failing test for the tooltip**

Create `components/__tests__/TooltipComponent.test.tsx`:

```tsx
import React from "react";
import {Alert} from "react-native";
import {screen, fireEvent} from "@testing-library/react-native";

import TooltipComponent from "@/components/TooltipComponent";
import {renderWithProviders} from "@/test-utils/render";

describe("TooltipComponent", () => {
    it("shows its content in the app rather than in a system modal", async () => {
        const alert = jest.spyOn(Alert, "alert");

        await renderWithProviders(<TooltipComponent content="Grind size is 0 to 100."/>);
        await fireEvent.press(screen.getByLabelText("What is this?"));

        expect(screen.getByText("Grind size is 0 to 100.")).toBeTruthy();
        expect(alert).not.toHaveBeenCalled();

        alert.mockRestore();
    });
});
```

- [ ] **Step 2: Write the failing test for the write path**

Create `hooks/__tests__/useCardWriter.test.ts`:

```ts
import {act, renderHook} from "@testing-library/react-native";
import {Alert} from "react-native";

import {useCardWriter} from "@/hooks/useCardWriter";
import Recipe from "@/library/Recipe";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/library/NFC");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {notify} = require("@/components/XbrwToast");

function invalidRecipe(): Recipe {
    const r = new Recipe();
    // Pour volumes that do not add up to dosage x ratio. The machine rejects
    // this, which is why it must be reported before a card is touched.
    r.dosage = 18;
    r.ratio = 16;
    return r;
}

describe("useCardWriter", () => {
    beforeEach(() => (notify as jest.Mock).mockClear());

    it("does not use a native Alert for the volume mismatch", async () => {
        const alert = jest.spyOn(Alert, "alert");
        const {result} = await renderHook(() => useCardWriter());

        await act(async () => result.current.writeCard(invalidRecipe()));

        expect(alert).not.toHaveBeenCalled();
        alert.mockRestore();
    });

    it("reports the volume mismatch as a persistent state, not a toast", async () => {
        // A validation error you dismiss and then have to remember is the bug
        // this replaces. It belongs beside the save button until it is fixed.
        const {result} = await renderHook(() => useCardWriter());

        await act(async () => result.current.writeCard(invalidRecipe()));

        expect(result.current.volumeError).toBeTruthy();
        expect(notify).not.toHaveBeenCalled();
    });

    it("clears the mismatch once a valid recipe is written", async () => {
        const {result} = await renderHook(() => useCardWriter());
        await act(async () => result.current.writeCard(invalidRecipe()));

        const valid = invalidRecipe();
        jest.spyOn(valid, "isPourVolumeValid").mockReturnValue(true);
        jest.spyOn(valid, "writeCard").mockResolvedValue(true);

        await act(async () => result.current.writeCard(valid));

        expect(result.current.volumeError).toBeNull();
    });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx jest components/__tests__/TooltipComponent.test.tsx hooks/__tests__/useCardWriter.test.ts`
Expected: FAIL — `Alert.alert` is called, and `volumeError` does not exist.

- [ ] **Step 4: Rewrite the tooltip as a sheet**

Replace the whole of `components/TooltipComponent.tsx`:

```tsx
import React, {useState} from "react";
import {AntDesign} from "@expo/vector-icons";
import {Sheet, Text, YStack} from "tamagui";

import {palette} from "@/constants/colors";

type Props = {
    content: string;
    paddingLeft?: string;
};

/**
 * The "what is this?" affordance.
 *
 * A sheet rather than a native `Alert`: this is a paragraph of explanation, and
 * a modal you must dismiss before you can look at the thing being explained is
 * the wrong shape for it — as well as the one surface the app cannot style.
 */
export default function TooltipComponent({content, paddingLeft}: Props) {
    const [open, setOpen] = useState(false);

    return (
        <YStack paddingLeft={paddingLeft}>
            <AntDesign accessibilityRole="button" accessibilityLabel="What is this?"
                       onPress={() => setOpen(true)} name="question-circle"
                       size={20} color={palette.dim}/>

            <Sheet open={open} onOpenChange={setOpen} modal dismissOnSnapToBottom
                   snapPointsMode="fit">
                <Sheet.Overlay enterStyle={{opacity: 0}} exitStyle={{opacity: 0}}/>
                <Sheet.Handle/>
                <Sheet.Frame padding="$4" backgroundColor={palette.surface}>
                    <YStack gap="$3" paddingBottom="$6">
                        <Text fontSize={18} fontWeight="700" color={palette.text}>
                            What is this?
                        </Text>
                        <Text fontSize={15} color={palette.dim}>{content}</Text>
                    </YStack>
                </Sheet.Frame>
            </Sheet>
        </YStack>
    );
}
```

The sheet renders its content only while open, so the test's assertion that the
text is absent before the press and present after it is meaningful. If Tamagui's
`Sheet` mounts its frame eagerly in the test environment, assert on
`screen.getByText(content)` after the press only, and add a separate assertion
that `Alert.alert` was never called — do not weaken the no-`Alert` assertion.

- [ ] **Step 5: Rewrite the write path**

In `hooks/useCardWriter.ts`, remove the `Alert` import, add
`import {notify} from "@/components/XbrwToast";`, add the error state, and
replace both `Alert.alert` calls:

```ts
type CardWriter = {
    writeCard: (recipe: Recipe | null) => Promise<void>;
    /** Dismiss the overlay and release the NFC session. */
    onNFCDialogClose: () => Promise<void>;
    /** Whether the scanning overlay should be shown. Renamed in Task 16. */
    showNfcOverlay: boolean;
    /** Write progress 0-100. */
    writeProgress: number;
    /**
     * The pour-volume mismatch, or null.
     *
     * A state rather than an event: the machine rejects a recipe whose pour
     * volumes do not sum to dosage x ratio, so this is a property of the recipe
     * that persists until it is fixed. Delivered as a modal you dismiss, it was
     * something the user then had to remember.
     */
    volumeError: string | null;
};
```

In the body, add `const [volumeError, setVolumeError] = useState<string | null>(null);`,
and in `writeCard`:

```ts
                if (recipe.isPourVolumeValid()) {
                    setVolumeError(null);
                    setWriteProgress(0);
                    setShowNfcOverlay(true);
                    await recipe.writeCard(nfc, progressCallback);
                    setShowNfcOverlay(false);
                } else {
                    setVolumeError(
                        "Your individual pour volumes must add up to the total volume."
                    );
                }
            }
        } catch (e) {
            console.log("Write error!:" + e);
            setShowNfcOverlay(false);
            // A cancelled scan throws, and the user cancelling is not a failure.
            if (!nfc.getIsClosed()) {
                notify({tone: "error", message: "Could not write the recipe to the card."});
            }
        }
```

and return `volumeError` from the hook.

- [ ] **Step 6: Replace the editor's Alerts**

In `hooks/useRecipeEditor.ts`, remove the `Alert` import and the `toast` import,
add `import {notify} from "@/components/XbrwToast";`, then:

- line ~120 (`Pour Limit`) becomes
  `notify({tone: "info", message: "Tea recipes are limited to 3 pours."});`
- line ~257 (`No Restore Options`) becomes
  `notify({tone: "info", message: "This recipe has no backup, XID or share link to restore from."});`
- line ~272 (`Pour Volume Error`) is the same validation as the write path.
  Replace it with the same `setVolumeError(...)` state, exposed from this hook
  under the same name so the editor screen renders one message regardless of
  which path raised it.
- the four bare `toast("Recipe restored ...")` calls become
  `notify({tone: "success", message: "Recipe restored from the NFC backup."})`
  and the equivalents for the offline backup, the XID and the share link.

In `components/RestoreDialog.tsx`, replace the bare
`toast(\`${error}\`, {...})` with `notify({tone: "error", message: String(error)});`
and drop the now-unused `toast` import and its inline style object — styling
lives in `XbrwToast` now.

- [ ] **Step 7: Render the inline message**

In `app/editRecipe.tsx`, add `volumeError` to the `useCardWriter()` destructure
on line ~45, and render it beside the save button:

```tsx
{volumeError !== null && (
    <Text accessibilityRole="alert" fontSize={13} color={palette.danger}
          paddingHorizontal="$3" paddingBottom="$2">
        {volumeError}
    </Text>
)}
```

The editor raises the same mismatch from `useRecipeEditor`. Expose it from that
hook under the same name and render whichever is non-null:
`const inlineError = volumeError ?? editorVolumeError;` — one message on screen
regardless of which path noticed the problem, because it is one state of one
recipe.

Read the file first to find where the save button lives and to use whatever
`Text` and `palette` imports it already has. Do not restructure that screen —
it is sub-project 4's work.

- [ ] **Step 8: Run the tests**

Run: `npx jest components/__tests__/TooltipComponent.test.tsx hooks/__tests__/useCardWriter.test.ts`
Expected: PASS.

- [ ] **Step 9: Prove no Alert survives**

Run: `grep -rn "Alert" app components hooks library --include=*.ts --include=*.tsx | grep -v __tests__`
Expected: **no output**. A hit in a test file is fine — the tests assert that
`Alert.alert` is never called, which requires naming it.

- [ ] **Step 10: Commit**

```bash
git add components/TooltipComponent.tsx components/RestoreDialog.tsx \
        hooks/useCardWriter.ts hooks/useRecipeEditor.ts app/editRecipe.tsx \
        components/__tests__/TooltipComponent.test.tsx \
        hooks/__tests__/useCardWriter.test.ts
```

Subject: `feat: give the app one voice`
Body:
```
Every native Alert is gone. Six become notices through notify(); the
pour-volume mismatch becomes an inline message beside the save
button, because it is a state of the recipe rather than an event --
delivered as a modal you dismiss, it was something the user then had
to remember.

The tooltip becomes a sheet. It was always a paragraph of
explanation, which is a strange thing to put in a modal you must
dismiss before you can look at what is being explained.

One of these reaches into the editor, which is otherwise sub-project
4's territory. Shipping this claiming "one voice" while a system
modal still fires would have made the claim false.
```

---

### Task 18: Full verification

- [ ] **Step 1: Confirm the card format is untouched**

```bash
git diff main --stat -- library/__tests__/Recipe.card.test.ts library/__tests__/cardFixtures.ts library/Pour.ts
```
Expected: **no output**. `cardFixtures.ts` is a deliberately independent
reimplementation of the byte layout — if it changed, the round-trip test has
been made tautological and the change is a regression until proven otherwise.

```bash
git diff main -- library/Recipe.ts | grep -E "^[+-].*(parseData|getData|POLY_TABLE|GRIND_SIZE_OFFSET)"
```
Expected: **no output**.

- [ ] **Step 2: Confirm no colour or motion literals crept in**

```bash
grep -rnE "#[0-9a-fA-F]{6}\b" app components --include=*.tsx | grep -v __tests__
```
Expected: no output.

```bash
grep -rnE "duration: *[0-9]" app components --include=*.tsx | grep -v __tests__
```
Expected: no output — every duration comes from `constants/motion.ts`.

- [ ] **Step 2b: Confirm the app has exactly one toast dispatcher**

```bash
grep -rnE "\btoast[.(]" app components hooks --include=*.ts --include=*.tsx | grep -v __tests__ | grep -v "^components/XbrwToast.tsx"
```
Expected: **no output**. `notify()` is what supplies the `customToast` body, so a
bare `toast()` call anywhere else renders the toast library's own default and the
app changes voice mid-sentence.

- [ ] **Step 3: Confirm the sub-project 1 components are actually mounted**

```bash
grep -rn "RecipeCard\|CtaTile\|ScreenTitle\|DotBloom" app components --include=*.tsx | grep -v __tests__ | grep -v "^components/RecipeCard\|^components/CtaTile\|^components/ScreenTitle\|^components/DotBloom"
```
Expected: hits in `app/index.tsx`, `components/HomeHeader.tsx`,
`components/SwipeableRecipeRow.tsx`, `components/EmptyLibrary.tsx` and
`components/NfcOverlay.tsx`. This is the check that this sub-project did the
thing it exists to do; sub-project 1 built these and wired none of them in.

- [ ] **Step 4: Run all four gates**

```bash
npm run typecheck
```
Expected: 0 errors.

```bash
npm run lint
```
Expected: 0 errors. Warnings from `react-hooks/exhaustive-deps` are expected and
deliberate — the React Compiler owns memoisation. Any *new* rule firing as an
error must be fixed rather than disabled.

```bash
npm test
```
Expected: all suites pass. The count should be well above the 426 tests on
`main`.

```bash
npx expo-doctor
```
Expected: all checks pass. This is a hard failure in CI.

- [ ] **Step 5: Tick every checkbox in this plan and commit**

```bash
git add docs/superpowers/plans/2026-08-22-navigation-shell-feedback.md
```

Subject: `docs: mark the navigation shell plan complete`
Body:
```
All automated gates green: typecheck, lint, tests and expo-doctor.
The physical-device verification below is outstanding and blocks the
merge.
```

---

### Task 19: Physical device verification — BLOCKS MERGE

**NFC cannot be exercised in a simulator or an emulator.** No amount of green
CI substitutes for this, and a malformed write to a genuine card is not trivially
recoverable. This is the one step that cannot be automated, and the pull request
must not merge until a human has done it.

- [ ] **Step 1: Build and install on a real iPhone**

```bash
npm run ios -- --device
```

- [ ] **Step 2: Verify on iOS with a genuine card**

Check each of these and record the result in the pull request:

- Reading a card: the app dims, the bloom sits above the CoreNFC sheet without
  being clipped by it, and the sheet's own text tracks the progress.
- The bloom fills in step with the real read, not on a timer.
- A successful read opens the editor and shows the success notice.
- Reading a card that is already saved says "Already in your library".
- Cancelling the system sheet produces **no** error notice.
- Writing a recipe: the progress is truthful and the card is afterwards readable
  by the xBloom machine.
- A recipe whose pour volumes do not add up shows the inline message beside the
  save button and never touches the card.

- [ ] **Step 3: Build and install on a real Android device**

```bash
npm run android
```

- [ ] **Step 4: Verify the same list on Android**

Plus the two Android-specific behaviours:

- The overlay is centred and occupies the whole screen — there is no system
  sheet to sit above.
- Backing out of a scan produces no error notice.

- [ ] **Step 5: Verify the collapse on a real list**

Scroll a library of at least six recipes. The tiles must fly into the header
once, stay collapsed while scrolling, and expand once near the top — with no
flicker at any resting position. Park the list deliberately near the threshold
and nudge it: the header must not flap.

- [ ] **Step 6: Verify Reduced Motion**

Turn on Reduce Motion in the OS settings and repeat the scan and the collapse.
Both must still *change* — cross-fading rather than sliding. If anything simply
stops moving, that is a bug: a user who disabled motion must still see that
something happened.

- [ ] **Step 7: Record the result**

Post the outcome of steps 2, 4, 5 and 6 as a comment on the pull request before
merging.

---

## Notes for the implementer

**If a step's code does not match what you find in the file**, the file has moved
on since this plan was written. Stop, read the current file, and adapt — then
record what you changed and why in this document, under the task. Every prior
sub-project in this repository carries such corrections, and they are the most
useful part of the plan afterwards.

**If a test seems to pass without doing anything**, it probably is. RNTL v14's
`render` and `fireEvent` are asynchronous; a missing `await` leaves `screen`
empty and every `queryBy*` assertion trivially true. Sabotage-check anything
that passed first time.

**Do not edit `library/__tests__/cardFixtures.ts` or
`library/__tests__/Recipe.card.test.ts` for any reason.**
