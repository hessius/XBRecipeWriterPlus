# Design Language and Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's visual language and branding — palette, typography, motion primitives, icon, splash and name — without changing any behaviour.

**Architecture:** Colour and motion tokens live in plain modules under `constants/`, because roughly half the call sites are React Native, expo-router or SVG props that cannot accept a Tamagui `$token`. Presentational primitives are added to `components/` at module scope and are individually unit-tested. The accent resolver is pure domain logic and goes in `library/` as a new file; no existing `library/` file is touched, so the card byte format and its characterisation tests are untouched.

**Tech Stack:** Expo SDK 57, React Native 0.86, Tamagui v2, Reanimated 4, react-native-svg, expo-font, Jest + @testing-library/react-native 14.

**Spec:** [`docs/superpowers/specs/2026-08-22-design-language-branding-design.md`](../specs/2026-08-22-design-language-branding-design.md)

---

## Scope note

This sub-project is behaviour-neutral. It ships two things:

1. **Primitives** — `DotMatrixText`, `PourProfile`, `DigitRoll`, `DotBloom`,
   `WriteSweep`, `CtaTile`, `ScreenTitle`, `Wordmark`, `RecipeCard` — which are
   built and tested here but **not wired into any screen**. Sub-project 4 wires
   them.
2. **A re-skin** of what already exists — palette swap, dark-only switch and
   branding — so the app stays coherent while the new primitives wait.

If a task makes an existing screen behave differently, that is a bug in this
sub-project, not a feature.

## Conventions this plan assumes

- Import through the `@/` alias, which maps to the repository root.
- Components are declared **at module scope**. A component defined inside another
  component's body is a new type on every render, so React remounts it and
  discards its state. That bug has already been fixed twice in this repository.
- The **React Compiler is enabled**. Do not hand-write `useMemo` or `useCallback`,
  and do not read a whole `props` object inside a hook — destructure first, or the
  compiler bails out of optimising the entire component.
- `@testing-library/react-native` v14's `render` and `fireEvent` are
  **asynchronous**. Forget the `await` and `screen` stays empty and the test
  passes for the wrong reason. Always render via `renderWithProviders` from
  `test-utils/render.tsx`.
- Never import from `@react-navigation/*`; SDK 56 forked those into `expo-router`.

## File structure

**Created**

| File | Responsibility |
|---|---|
| `assets/fonts/Doto-SemiBold.ttf`, `Doto-Bold.ttf`, `Doto-ExtraBold.ttf` | Static Doto instances. Variable fonts are unreliable in RN. |
| `assets/fonts/Doto-OFL.txt` | Doto's licence, required by OFL. |
| `assets/branding/xbrw-icon.svg` | Committed copy of the logo. `AgentResources/` is gitignored. |
| `assets/images/icon.png`, `adaptive-icon.png`, `favicon.png`, `splash-icon.png` | Generated raster assets. |
| `scripts/generate-icons.sh` | Regenerates the rasters from the SVG. |
| `constants/motion.ts` | Durations, easings, springs and the Reduce Motion hook. |
| `library/accent.ts` | Accent assignment and resolution. Pure, no React. |
| `library/__tests__/accent.test.ts` | Accent resolver tests. |
| `components/DotMatrixText.tsx` | Doto text. The only place the font family is named. Enforces the size floor. |
| `components/PourProfile.tsx` | Stepped cumulative-water SVG path from a `Pour[]`. |
| `components/DigitRoll.tsx` | Rolling Doto numerals. |
| `components/DotBloom.tsx` | Scanning animation, driven by progress. |
| `components/WriteSweep.tsx` | Write animation, driven by block progress. |
| `components/CtaTile.tsx` | Icon over Doto label. |
| `components/ScreenTitle.tsx` | Inter title with superscript Doto count. |
| `components/Wordmark.tsx` | `XBRW++` lockup for the header. |
| `components/RecipeCard.tsx` | Accent fill, name, Doto stats, marker, profile behind. |
| `components/SplashOverlay.tsx` | Animated dot-matrix splash handoff. |

**Modified**

| File | Change |
|---|---|
| `constants/colors.ts` | Replaced wholesale. Light/dark splits collapsed. |
| `tamagui.config.ts` | `defaultTheme` becomes `dark`. |
| `app/_layout.tsx` | Load Doto, drop colour-scheme branching, black chrome, mount `SplashOverlay`. |
| `test-utils/render.tsx` | Provider renders the dark theme. |
| `app.json` | Name, `userInterfaceStyle`, splash config, version bump. |
| `eslint.config.js` | Forbid raw colour literals in `app/` and `components/`. |
| All files under `components/` and `app/` that read the old palette | Consume the new tokens; remove `useColorScheme` branching. |

---

### Task 1: Bundle the Doto font

**Files:**
- Create: `assets/fonts/Doto-SemiBold.ttf`, `assets/fonts/Doto-Bold.ttf`, `assets/fonts/Doto-ExtraBold.ttf`, `assets/fonts/Doto-OFL.txt`

- [ ] **Step 1: Download the three static weights**

Google Fonts serves a separate static TTF per weight from the `css2` endpoint. A
browser User-Agent is required, or the endpoint returns woff2, which React Native
cannot load.

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
CSS=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Doto:wght@600;700;800&display=swap")

for pair in "600:SemiBold" "700:Bold" "800:ExtraBold"; do
  W="${pair%%:*}"; NAME="${pair##*:}"
  URL=$(echo "$CSS" | awk -v w="  font-weight: $W;" '$0==w{f=1} f&&/src: url\(/{print; exit}' \
        | sed -E 's/.*url\(([^)]+)\).*/\1/')
  echo "weight $W -> $URL"
  curl -sSL -o "assets/fonts/Doto-$NAME.ttf" "$URL"
done

ls -l assets/fonts/Doto-*.ttf
```

Expected: three non-empty files, roughly 20–40 KB each.

- [ ] **Step 2: Verify they are real TrueType files, not an error page**

```bash
file assets/fonts/Doto-*.ttf
```

Expected: every line reports `TrueType Font data` or `TrueType font data`. If any
line says `HTML document` or `ASCII text`, the download failed — re-run Step 1.

- [ ] **Step 3: Fetch the licence**

OFL requires the licence to ship alongside the font.

```bash
curl -sSL -o assets/fonts/Doto-OFL.txt \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/doto/OFL.txt"
head -3 assets/fonts/Doto-OFL.txt
```

Expected: the word `Copyright` on the first line and `SIL Open Font License`
within the first few lines.

- [ ] **Step 4: Commit**

```bash
git add assets/fonts/Doto-SemiBold.ttf assets/fonts/Doto-Bold.ttf \
        assets/fonts/Doto-ExtraBold.ttf assets/fonts/Doto-OFL.txt
git commit -m "Bundle the Doto dot-matrix font"
```

---

### Task 2: Replace the palette

**Files:**
- Modify: `constants/colors.ts` (replaced wholesale)

This task deliberately leaves the rest of the app broken at the type level. Task
12 fixes every call site. Do not expect `npm run typecheck` to be green until
then.

- [ ] **Step 1: Write the new palette**

Replace the entire contents of `constants/colors.ts`:

```ts
/**
 * Single source of truth for every colour in the app.
 *
 * The app is dark-only, so there are no light/dark variants here. Colour lives
 * in a plain module rather than in Tamagui theme tokens because roughly half the
 * call sites are plain React Native, expo-router or SVG props that cannot accept
 * a `$token`, and Tamagui's theme proxy has no parent-theme fallback — a custom
 * key added to a theme would not resolve inside a sub-theme such as `dark_Button`.
 *
 * Add semantically named entries (`danger`, `surface`, `muted`), never literal
 * ones (`red`).
 */

/** The two halves of the accent palette. */
export type AccentGroup = "coffee" | "tea";

/** Surfaces, text and semantics. */
export const palette = {
    /** Screen background. `base` rather than `void`: `void` is a reserved word
     *  and cannot be shorthand-destructured. */
    base:    "#000000",
    /** Sheets and elevated panels. */
    surface: "#101010",
    /** CTA tiles, inputs, and cards that are not accent-filled. */
    raised:  "#161616",
    /** Hairlines and borders. */
    line:    "#262626",
    /** Tertiary text and superscript counts. */
    muted:   "#6E6E6E",
    /** Secondary text. */
    dim:     "#A3A3A3",
    /** Primary text. */
    text:    "#FFFFFF",

    /** Confirmation, and the "reader ready" state. */
    success: "#5DDC8A",
    /** Destructive actions and validation errors. */
    danger:  "#FF6B5E",
    /** Recoverable problems and cautions. */
    warn:    "#F0C24A",
    /** Informational accents. */
    info:    "#7FB4FF"
} as const;

/**
 * Foregrounds drawn on top of an accent fill. Fixed rather than per-accent:
 * every accent is light enough to take the same dark ink.
 */
export const onAccent = {
    /** Recipe names and Doto values. */
    text:          "#0C0C0C",
    /** Micro-labels above values. */
    label:         "rgba(0,0,0,0.45)",
    /** Pour profile stroke. */
    profileStroke: "rgba(0,0,0,0.85)",
    /** Pour profile fill. */
    profileFill:   "rgba(0,0,0,0.30)",
    /** Beverage marker and contactless mark. */
    marker:        "rgba(0,0,0,0.70)"
} as const;

/**
 * Recipe accents, split by beverage. Colour is a redundant signal — a Doto
 * `TEA` / `COFFEE` marker carries the same information — because colour alone is
 * not an accessible signal.
 *
 * Deliberately NOT `as const`. Literal narrowing would type a group as a tuple
 * of specific hex strings, which no consumer wants and which breaks
 * lookup-by-value: on a union of two disjoint literal tuples, the parameter of
 * `indexOf` and `includes` collapses to `never`. Sub-project 2 needs exactly
 * that lookup to map a persisted colour back to an index. `readonly string[]`
 * keeps the immutability and drops the narrowing.
 */
export const accents: Record<AccentGroup, readonly string[]> = {
    coffee: [
        "#9FC3F0", // Sky
        "#F0B98E", // Peach
        "#F0A0AB", // Blossom
        "#B4D6A8", // Sage
        "#97D8C4", // Mint
        "#BDB2E8", // Lilac
        "#A6D6E8", // Ice
        "#E7A9C9"  // Rose
    ],
    tea:    [
        "#CFD6A3", // Sencha
        "#DCC194", // Oolong
        "#D9CF9A", // Jasmine
        "#E0AEA6"  // Hibiscus
    ]
};
```

- [ ] **Step 2: Confirm the module itself compiles**

```bash
npx tsc --noEmit --skipLibCheck --ignoreConfig --target es2020 --module esnext \
  --moduleResolution bundler constants/colors.ts
```

`--ignoreConfig` is required: `tsconfig.json` is present, and this version of
`tsc` refuses to compile named files while a config exists without it.

Expected: no output, exit code 0. The whole-project `npm run typecheck` will
report roughly 35 errors across the 14 files that import the old palette. That is
this task's intended outcome, not a defect — Task 12 clears them.

- [ ] **Step 3: Commit**

```bash
git add constants/colors.ts
git commit -m "Replace the palette with the dark-only design tokens"
```

---

### Task 3: Accent resolver

**Files:**
- Create: `library/accent.ts`
- Test: `library/__tests__/accent.test.ts`

The resolver takes a persisted accent index when one exists and otherwise derives
a stable index from the recipe's uuid. Sub-project 2 adds the persisted field;
until then every recipe takes the fallback path, and cards must not change colour
between launches.

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/accent.test.ts`:

```ts
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {accents} from "@/constants/colors";
import {accentGroupFor, assignAccentIndex, resolveAccent} from "@/library/accent";

function recipeWithCup(cup: number): Recipe {
    const r = new Recipe();
    r.cupType = cup;
    return r;
}

describe("accentGroupFor", () => {
    it("puts tea recipes in the tea group", () => {
        expect(accentGroupFor(recipeWithCup(CUP_TYPE.TEA))).toBe("tea");
    });

    it("puts every other cup type in the coffee group", () => {
        for (const cup of [CUP_TYPE.XPOD, CUP_TYPE.OMNI, CUP_TYPE.OTHER]) {
            expect(accentGroupFor(recipeWithCup(cup))).toBe("coffee");
        }
    });
});

describe("resolveAccent", () => {
    it("is stable for the same recipe across calls", () => {
        const r = recipeWithCup(CUP_TYPE.XPOD);
        expect(resolveAccent(r)).toBe(resolveAccent(r));
    });

    it("only ever draws a tea recipe from the tea half", () => {
        for (let i = 0; i < 200; i++) {
            expect(accents.tea).toContain(resolveAccent(recipeWithCup(CUP_TYPE.TEA)));
        }
    });

    it("only ever draws a coffee recipe from the coffee half", () => {
        for (let i = 0; i < 200; i++) {
            expect(accents.coffee).toContain(resolveAccent(recipeWithCup(CUP_TYPE.XPOD)));
        }
    });

    it("prefers a persisted index over the uuid fallback", () => {
        const r = recipeWithCup(CUP_TYPE.XPOD);
        (r as unknown as {accentIndex: number}).accentIndex = 3;
        expect(resolveAccent(r)).toBe(accents.coffee[3]);
    });

    it("ignores a persisted index that is out of range", () => {
        const r = recipeWithCup(CUP_TYPE.XPOD);
        (r as unknown as {accentIndex: number}).accentIndex = 99;
        expect(accents.coffee).toContain(resolveAccent(r));
    });
});

describe("assignAccentIndex", () => {
    it("returns zero when nothing is in use", () => {
        expect(assignAccentIndex("coffee", [])).toBe(0);
    });

    it("returns the first unused index while the palette has room", () => {
        expect(assignAccentIndex("coffee", [0, 1, 2])).toBe(3);
    });

    it("fills the lowest free index rather than appending", () => {
        expect(assignAccentIndex("coffee", [0, 2, 3])).toBe(1);
    });

    it("picks the least-used index once the palette is full", () => {
        // All eight used once, plus a second use of index 5. Index 5 is now the
        // most used, so it must not win; the lowest of the tied indices does.
        expect(assignAccentIndex("coffee", [0, 1, 2, 3, 4, 5, 6, 7, 5])).toBe(0);
    });

    it("breaks ties by lowest index", () => {
        expect(assignAccentIndex("coffee", [0, 0, 1, 2, 3, 4, 5, 6, 7])).toBe(1);
    });

    it("stays within the tea half", () => {
        expect(assignAccentIndex("tea", [0, 1, 2, 3])).toBeLessThan(accents.tea.length);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest library/__tests__/accent.test.ts`
Expected: FAIL — `Cannot find module '@/library/accent'`.

- [ ] **Step 3: Write the implementation**

Create `library/accent.ts`:

```ts
import Recipe, {CUP_TYPE} from "./Recipe";
import {accents, type AccentGroup} from "@/constants/colors";

/** Which half of the palette a recipe draws from. */
export function accentGroupFor(recipe: Recipe): AccentGroup {
    return recipe.cupType === CUP_TYPE.TEA ? "tea" : "coffee";
}

/**
 * FNV-1a over the uuid. Any stable hash would do; the only requirement is that a
 * given recipe keeps its colour across launches, since the accent is not yet
 * persisted. Sub-project 2 adds the persisted field and this becomes the
 * fallback for recipes saved before it existed.
 */
function hashToIndex(key: string, modulo: number): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % modulo;
}

/** The accent colour to paint a recipe's card with. */
export function resolveAccent(recipe: Recipe): string {
    const group = accentGroupFor(recipe);
    const groupAccents = accents[group];

    const persisted = (recipe as unknown as {accentIndex?: number}).accentIndex;
    if (
        typeof persisted === "number" &&
        Number.isInteger(persisted) &&
        persisted >= 0 &&
        persisted < groupAccents.length
    ) {
        return groupAccents[persisted];
    }

    return groupAccents[hashToIndex(recipe.uuid, groupAccents.length)];
}

/**
 * The index to give a newly saved recipe: the least-used accent in its half of
 * the palette, ties broken by lowest index. While the library is smaller than
 * the half-palette this is simply the first unused colour; past that, colours
 * repeat as evenly as possible rather than clustering.
 *
 * @param group Which half to assign from.
 * @param inUse Accent indices already taken by recipes in the same half.
 *              Repeats are meaningful — they are what makes an index "more used".
 */
export function assignAccentIndex(group: AccentGroup, inUse: number[]): number {
    const counts: number[] = new Array(accents[group].length).fill(0);
    for (const index of inUse) {
        if (Number.isInteger(index) && index >= 0 && index < counts.length) {
            counts[index]++;
        }
    }

    let best = 0;
    for (let i = 1; i < counts.length; i++) {
        if (counts[i] < counts[best]) {
            best = i;
        }
    }
    return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest library/__tests__/accent.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add library/accent.ts library/__tests__/accent.test.ts
git commit -m "Add the recipe accent resolver"
```

---

### Task 4: Motion tokens

**Files:**
- Create: `constants/motion.ts`
- Test: `components/__tests__/motion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/motion.test.ts`:

```ts
import {AccessibilityInfo} from "react-native";
import {renderHook, waitFor} from "@testing-library/react-native";

import {DURATION, useReducedMotion} from "@/constants/motion";

describe("DURATION", () => {
    it("orders fast, base and deliberate", () => {
        expect(DURATION.fast).toBeLessThan(DURATION.base);
        expect(DURATION.base).toBeLessThan(DURATION.deliberate);
    });
});

describe("useReducedMotion", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("reports false when the OS has motion enabled", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

        const {result} = renderHook(() => useReducedMotion());

        await waitFor(() => expect(result.current).toBe(false));
    });

    it("reports true when the OS has motion reduced", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

        const {result} = renderHook(() => useReducedMotion());

        await waitFor(() => expect(result.current).toBe(true));
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/motion.test.ts`
Expected: FAIL — `Cannot find module '@/constants/motion'`.

- [ ] **Step 3: Write the implementation**

Create `constants/motion.ts`:

```ts
import {useEffect, useState} from "react";
import {AccessibilityInfo} from "react-native";
import {Easing} from "react-native-reanimated";

/**
 * Single source of truth for motion timing.
 *
 * `fast` is feedback, not decoration. `deliberate` is reserved for the two
 * ceremonies — scanning a card and writing one — which are the only moments
 * where the app should feel like it is taking its time.
 */
export const DURATION = {
    fast:       120,
    base:       240,
    deliberate: 400
} as const;

/** Timing curves, for anything the system drives. */
export const EASING = {
    /** Entering. */
    out:   Easing.bezier(0.2, 0.85, 0.3, 1),
    /** Leaving. */
    in:    Easing.bezier(0.7, 0, 0.85, 0.15),
    /** Continuous or looping motion. */
    inOut: Easing.bezier(0.45, 0, 0.25, 1)
} as const;

/** Spring configs, for anything a finger drives. */
export const SPRING = {
    /** Cards, sheets, anything with weight. */
    gentle: {damping: 20, stiffness: 160, mass: 1},
    /** Toggles and small controls. */
    snappy: {damping: 22, stiffness: 300, mass: 0.8}
} as const;

/**
 * Whether the OS has Reduce Motion enabled.
 *
 * Every animation in the app honours this by degrading to a cross-fade — never
 * to nothing. A user who has disabled motion must still see that something
 * changed.
 */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        let cancelled = false;

        // Reading an OS accessibility setting: an external system, which is what
        // effects are for.
        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => {
                if (!cancelled) {
                    setReduced(enabled);
                }
            })
            .catch(() => {
                // An unavailable setting is not a reason to fail. Assume motion is fine.
            });

        const subscription = AccessibilityInfo.addEventListener(
            "reduceMotionChanged",
            setReduced
        );

        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);

    return reduced;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/motion.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add constants/motion.ts components/__tests__/motion.test.ts
git commit -m "Add motion tokens and the reduce-motion hook"
```

---

### Task 5: DotMatrixText

**Files:**
- Create: `components/DotMatrixText.tsx`
- Test: `components/__tests__/DotMatrixText.test.tsx`

The 11 px floor is enforced here rather than left to call sites, because it was
established empirically — below it Doto stops reading as characters.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/DotMatrixText.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";
import {StyleSheet} from "react-native";

import DotMatrixText, {DOTO_MIN_FONT_SIZE} from "@/components/DotMatrixText";
import {renderWithProviders} from "@/test-utils/render";

function styleOf(testID: string): Record<string, unknown> {
    return StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
}

describe("DotMatrixText", () => {
    it("renders its content", async () => {
        await renderWithProviders(<DotMatrixText>255</DotMatrixText>);
        expect(screen.getByText("255")).toBeTruthy();
    });

    it("uses the Doto family", async () => {
        await renderWithProviders(<DotMatrixText testID="dm">255</DotMatrixText>);
        expect(styleOf("dm").fontFamily).toMatch(/^Doto-/);
    });

    it("raises a font size below the floor", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" fontSize={6}>255</DotMatrixText>
        );
        expect(styleOf("dm").fontSize).toBe(DOTO_MIN_FONT_SIZE);
    });

    it("leaves a font size at or above the floor alone", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" fontSize={18}>255</DotMatrixText>
        );
        expect(styleOf("dm").fontSize).toBe(18);
    });

    it("maps the weight onto the matching static instance", async () => {
        await renderWithProviders(
            <DotMatrixText testID="dm" weight="extrabold">255</DotMatrixText>
        );
        expect(styleOf("dm").fontFamily).toBe("Doto-ExtraBold");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/DotMatrixText.test.tsx`
Expected: FAIL — `Cannot find module '@/components/DotMatrixText'`.

- [ ] **Step 3: Write the implementation**

Create `components/DotMatrixText.tsx`:

```tsx
import React from "react";
import {Text, type StyleProp, type TextStyle} from "react-native";

import {palette} from "@/constants/colors";

/**
 * Doto below this size stops reading as characters and starts reading as noise.
 * Established by rendering a legibility ladder at true device scale during
 * design. The component clamps rather than trusting call sites.
 */
export const DOTO_MIN_FONT_SIZE = 11;

const FAMILIES = {
    semibold:  "Doto-SemiBold",
    bold:      "Doto-Bold",
    extrabold: "Doto-ExtraBold"
} as const;

export type DotoWeight = keyof typeof FAMILIES;

type Props = {
    children: React.ReactNode;
    /** Clamped up to `DOTO_MIN_FONT_SIZE`. */
    fontSize?: number;
    weight?: DotoWeight;
    color?: string;
    /** Doto is dense, so most call sites want a little extra tracking. */
    letterSpacing?: number;
    numberOfLines?: number;
    style?: StyleProp<TextStyle>;
    testID?: string;
};

/**
 * Dot-matrix text.
 *
 * The rule this component exists to enforce: Doto is for machine-derived values
 * and system status. Anything a human typed — a recipe name, an error message —
 * stays in Inter and must not be rendered through here.
 *
 * This is the only place in the app that names the Doto font family.
 */
export default function DotMatrixText({
    children,
    fontSize = 14,
    weight = "bold",
    color = palette.text,
    letterSpacing = 0.5,
    numberOfLines,
    style,
    testID
}: Props) {
    return (
        <Text
            testID={testID}
            numberOfLines={numberOfLines}
            style={[
                {
                    fontFamily: FAMILIES[weight],
                    fontSize:   Math.max(fontSize, DOTO_MIN_FONT_SIZE),
                    color,
                    letterSpacing
                },
                style
            ]}>
            {children}
        </Text>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/DotMatrixText.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/DotMatrixText.tsx components/__tests__/DotMatrixText.test.tsx
git commit -m "Add the DotMatrixText primitive"
```

---

### Task 6: PourProfile

**Files:**
- Create: `components/PourProfile.tsx`
- Test: `components/__tests__/PourProfile.test.tsx`

The path builder is exported separately from the component so it can be tested
without rendering, including the degenerate cases that would otherwise divide by
zero.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/PourProfile.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import PourProfile, {buildProfilePath} from "@/components/PourProfile";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function pours(volumes: number[]): Pour[] {
    return volumes.map((v, i) => {
        const p = new Pour();
        p.pourNumber = i;
        p.volume = v;
        return p;
    });
}

describe("buildProfilePath", () => {
    it("starts at the bottom left", () => {
        expect(buildProfilePath(pours([50, 50]), 100, 40)).toMatch(/^M0 40/);
    });

    it("reaches the top by the last pour", () => {
        expect(buildProfilePath(pours([50, 50]), 100, 40)).toContain("100 0");
    });

    it("handles a single pour", () => {
        expect(buildProfilePath(pours([100]), 100, 40)).toContain("100 0");
    });

    it("does not produce NaN for a zero-volume bloom", () => {
        expect(buildProfilePath(pours([0, 100]), 100, 40)).not.toContain("NaN");
    });

    it("does not produce NaN when every pour is zero", () => {
        expect(buildProfilePath(pours([0, 0]), 100, 40)).not.toContain("NaN");
    });

    it("returns an empty path for no pours", () => {
        expect(buildProfilePath([], 100, 40)).toBe("");
    });
});

describe("PourProfile", () => {
    it("renders nothing when there are no pours", async () => {
        await renderWithProviders(
            <PourProfile testID="pp" pours={[]} width={100} height={40}/>
        );
        expect(screen.queryByTestId("pp")).toBeNull();
    });

    it("renders when there are pours", async () => {
        await renderWithProviders(
            <PourProfile testID="pp" pours={pours([50, 50])} width={100} height={40}/>
        );
        expect(screen.getByTestId("pp")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/PourProfile.test.tsx`
Expected: FAIL — `Cannot find module '@/components/PourProfile'`.

- [ ] **Step 3: Write the implementation**

Create `components/PourProfile.tsx`:

```tsx
import React from "react";
import Svg, {Path} from "react-native-svg";

import type Pour from "@/library/Pour";
import {onAccent} from "@/constants/colors";

function round(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * The silhouette of a brew: cumulative water over time, stepped.
 *
 * Each pour contributes a rise followed by a flat, so pauses read as plateaus.
 * Time is divided evenly between pours rather than scaled by pause duration —
 * the shape is an identifying mark, not a chart, and even division keeps short
 * pours visible.
 */
export function buildProfilePath(pours: Pour[], width: number, height: number): string {
    if (pours.length === 0) {
        return "";
    }

    const total = pours.reduce((sum, pour) => sum + Math.max(pour.volume, 0), 0);
    const points: [number, number][] = [[0, height]];
    let poured = 0;

    for (let i = 0; i < pours.length; i++) {
        // A recipe whose pours are all zero has no shape. Drawing it flat along
        // the bottom is honest, and more importantly it is not NaN.
        const before = total > 0 ? poured / total : 0;
        poured += Math.max(pours[i].volume, 0);
        const after = total > 0 ? poured / total : 0;

        const riseStart = (i / pours.length) * width;
        const riseEnd = ((i + 0.62) / pours.length) * width;
        const flatEnd = ((i + 1) / pours.length) * width;

        points.push([riseStart, height - before * height]);
        points.push([riseEnd, height - after * height]);
        points.push([flatEnd, height - after * height]);
    }

    return "M" + points.map(([x, y]) => `${round(x)} ${round(y)}`).join(" L");
}

type Props = {
    pours: Pour[];
    width: number;
    height: number;
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    testID?: string;
};

/**
 * Draws a pour schedule. Knows nothing about cards — the caller supplies the
 * colours, so the same component serves an accent-filled card and a dark row.
 */
export default function PourProfile({
    pours,
    width,
    height,
    stroke = onAccent.profileStroke,
    fill = onAccent.profileFill,
    strokeWidth = 1.6,
    testID
}: Props) {
    const path = buildProfilePath(pours, width, height);
    if (path === "") {
        return null;
    }

    return (
        <Svg testID={testID} width={width} height={height}
             viewBox={`0 0 ${width} ${height}`}>
            <Path d={`${path} L${round(width)} ${round(height)} Z`} fill={fill}/>
            <Path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth}
                  strokeLinejoin="round"/>
        </Svg>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/PourProfile.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add components/PourProfile.tsx components/__tests__/PourProfile.test.tsx
git commit -m "Add the PourProfile primitive"
```

---
### Task 7: DigitRoll

**Files:**
- Create: `components/DigitRoll.tsx`
- Test: `components/__tests__/DigitRoll.test.tsx`

A value that changes should be seen to change. Each digit column slides to its
new glyph; digits that did not change do not move.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/DigitRoll.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import DigitRoll from "@/components/DigitRoll";
import {renderWithProviders} from "@/test-utils/render";

describe("DigitRoll", () => {
    it("renders one column per digit", async () => {
        await renderWithProviders(<DigitRoll value={255}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
    });

    it("renders the current value as text", async () => {
        await renderWithProviders(<DigitRoll value={255}/>);
        expect(screen.getByLabelText("255")).toBeTruthy();
    });

    it("pads to the requested minimum width", async () => {
        await renderWithProviders(<DigitRoll value={7} minDigits={3}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
        expect(screen.getByLabelText("007")).toBeTruthy();
    });

    it("appends a suffix outside the rolling columns", async () => {
        await renderWithProviders(<DigitRoll value={255} suffix="ml"/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(3);
        expect(screen.getByText("ml")).toBeTruthy();
    });

    it("grows the column count when the value gains a digit", async () => {
        const {rerender} = await renderWithProviders(<DigitRoll value={9}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(1);

        await rerender(<DigitRoll value={10}/>);
        expect(screen.getAllByTestId("digit-roll-column")).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/DigitRoll.test.tsx`
Expected: FAIL — `Cannot find module '@/components/DigitRoll'`.

- [ ] **Step 3: Write the implementation**

Create `components/DigitRoll.tsx`:

```tsx
import React, {useEffect} from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from "react-native-reanimated";

import DotMatrixText, {type DotoWeight} from "@/components/DotMatrixText";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type ColumnProps = {
    digit: number;
    fontSize: number;
    weight: DotoWeight;
    color: string;
    reduced: boolean;
};

/**
 * One digit position. The full 0–9 strip is rendered and translated, so the
 * intermediate glyphs are genuinely visible as it moves.
 */
function DigitColumn({digit, fontSize, weight, color, reduced}: ColumnProps) {
    // Doto's line box is close to 1.35em at these sizes; hard-coding the ratio
    // keeps the strip aligned without measuring on every render.
    const rowHeight = Math.round(fontSize * 1.35);
    const offset = useSharedValue(-digit * rowHeight);

    useEffect(() => {
        const target = -digit * rowHeight;
        offset.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
    }, [digit, rowHeight, reduced, offset]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{translateY: offset.value}]
    }));

    return (
        <View testID="digit-roll-column"
              style={{height: rowHeight, overflow: "hidden"}}>
            <Animated.View style={animatedStyle}>
                {DIGITS.map((d) => (
                    <DotMatrixText key={d} fontSize={fontSize} weight={weight}
                                   color={color}
                                   style={{height: rowHeight, lineHeight: rowHeight}}>
                        {d}
                    </DotMatrixText>
                ))}
            </Animated.View>
        </View>
    );
}

type Props = {
    value: number;
    /** Zero-pads up to this many digits. */
    minDigits?: number;
    /** Static text after the digits — a unit, not part of the roll. */
    suffix?: string;
    fontSize?: number;
    weight?: DotoWeight;
    color?: string;
};

/**
 * A number whose digits roll when it changes.
 *
 * Reduce Motion snaps each column to its target rather than removing the
 * component, so the value is still correct and still visibly updates.
 */
export default function DigitRoll({
    value,
    minDigits = 1,
    suffix,
    fontSize = 20,
    weight = "bold",
    color = palette.text
}: Props) {
    const reduced = useReducedMotion();
    const text = Math.max(0, Math.round(value)).toString().padStart(minDigits, "0");
    const digits = text.split("").map((d) => Number(d));

    return (
        <View accessibilityLabel={text}
              style={{flexDirection: "row", alignItems: "flex-end"}}>
            {digits.map((digit, index) => (
                <DigitColumn
                    // Position-keyed on purpose: index 0 is the same column
                    // whether it holds a 2 or a 3, which is what should roll.
                    key={index}
                    digit={digit}
                    fontSize={fontSize}
                    weight={weight}
                    color={color}
                    reduced={reduced}
                />
            ))}
            {suffix !== undefined && (
                <DotMatrixText fontSize={Math.round(fontSize * 0.6)} weight="semibold"
                               color={color} style={{marginLeft: 2}}>
                    {suffix}
                </DotMatrixText>
            )}
        </View>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/DigitRoll.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/DigitRoll.tsx components/__tests__/DigitRoll.test.tsx
git commit -m "Add the DigitRoll primitive"
```

---

### Task 8: DotBloom

**Files:**
- Create: `components/DotBloom.tsx`
- Test: `components/__tests__/DotBloom.test.tsx`

The scanning animation. It is driven by real read progress, never by a timer —
a progress indicator that lies is worse than none.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/DotBloom.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import DotBloom, {litCount} from "@/components/DotBloom";
import {renderWithProviders} from "@/test-utils/render";

describe("litCount", () => {
    it("lights nothing at zero", () => {
        expect(litCount(0, 24)).toBe(0);
    });

    it("lights everything at one", () => {
        expect(litCount(1, 24)).toBe(24);
    });

    it("lights half at one half", () => {
        expect(litCount(0.5, 24)).toBe(12);
    });

    it("clamps progress above one", () => {
        expect(litCount(4, 24)).toBe(24);
    });

    it("clamps progress below zero", () => {
        expect(litCount(-1, 24)).toBe(0);
    });

    it("treats a non-finite progress as zero", () => {
        expect(litCount(Number.NaN, 24)).toBe(0);
    });
});

describe("DotBloom", () => {
    it("renders the full ring of dots regardless of progress", async () => {
        await renderWithProviders(<DotBloom progress={0.25} dotCount={24}/>);
        expect(screen.getAllByTestId("dot-bloom-dot")).toHaveLength(24);
    });

    it("exposes progress as an accessibility value", async () => {
        await renderWithProviders(<DotBloom progress={0.5}/>);
        expect(screen.getByTestId("dot-bloom").props.accessibilityValue)
            .toEqual({min: 0, max: 100, now: 50});
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/DotBloom.test.tsx`
Expected: FAIL — `Cannot find module '@/components/DotBloom'`.

- [ ] **Step 3: Write the implementation**

Create `components/DotBloom.tsx`:

```tsx
import React from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming
} from "react-native-reanimated";

import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

/** How many dots of `total` are lit at a given progress. */
export function litCount(progress: number, total: number): number {
    if (!Number.isFinite(progress)) {
        return 0;
    }
    return Math.round(Math.min(Math.max(progress, 0), 1) * total);
}

type DotProps = {
    lit: boolean;
    index: number;
    total: number;
    radius: number;
    size: number;
    reduced: boolean;
};

function BloomDot({lit, index, total, radius, size, reduced}: DotProps) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const pulse = useSharedValue(1);

    React.useEffect(() => {
        // The leading unlit dot breathes so the ring does not look frozen while
        // the reader is waiting for a card. Everything else is static.
        if (reduced || lit) {
            pulse.value = 1;
            return;
        }
        pulse.value = withRepeat(
            withTiming(0.35, {duration: DURATION.deliberate, easing: EASING.inOut}),
            -1,
            true
        );
    }, [lit, reduced, pulse]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: lit ? 1 : 0.18 * pulse.value
    }));

    return (
        <Animated.View
            testID="dot-bloom-dot"
            style={[
                {
                    position:        "absolute",
                    width:           size,
                    height:          size,
                    borderRadius:    size / 2,
                    backgroundColor: lit ? palette.success : palette.dim,
                    left:            radius + Math.cos(angle) * radius - size / 2,
                    top:             radius + Math.sin(angle) * radius - size / 2
                },
                animatedStyle
            ]}
        />
    );
}

type Props = {
    /** Real read progress, 0–1. Never a timer. */
    progress: number;
    dotCount?: number;
    /** Diameter of the ring. */
    size?: number;
    dotSize?: number;
};

/**
 * The scanning ceremony: a ring of dots that fills as the card is read.
 *
 * On iOS this is composed into the top half of the screen, because CoreNFC
 * presents a system sheet over the lower half that the app cannot draw on. On
 * Android there is no system sheet and it sits inside the app's own dialog.
 * Those compositions belong to sub-project 3; this component only draws the ring.
 */
export default function DotBloom({
    progress,
    dotCount = 24,
    size = 160,
    dotSize = 8
}: Props) {
    const reduced = useReducedMotion();
    const lit = litCount(progress, dotCount);
    const radius = size / 2;

    return (
        <View
            testID="dot-bloom"
            accessibilityRole="progressbar"
            accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(Math.min(Math.max(progress, 0), 1) * 100)
            }}
            style={{width: size, height: size}}>
            {Array.from({length: dotCount}, (_, index) => (
                <BloomDot key={index} index={index} total={dotCount} lit={index < lit}
                          radius={radius} size={dotSize} reduced={reduced}/>
            ))}
        </View>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/DotBloom.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add components/DotBloom.tsx components/__tests__/DotBloom.test.tsx
git commit -m "Add the DotBloom scanning animation"
```

---

### Task 9: WriteSweep

**Files:**
- Create: `components/WriteSweep.tsx`
- Test: `components/__tests__/WriteSweep.test.tsx`

The write ceremony. Blocks light up as they are committed. Writing to a card is
the one irreversible thing the app does — a malformed write to a genuine card is
not trivially recoverable — so this animation must never run ahead of reality.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/WriteSweep.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import WriteSweep, {blockState} from "@/components/WriteSweep";
import {renderWithProviders} from "@/test-utils/render";

describe("blockState", () => {
    it("marks earlier blocks as written", () => {
        expect(blockState(0, 3)).toBe("written");
    });

    it("marks the current block as active", () => {
        expect(blockState(3, 3)).toBe("active");
    });

    it("marks later blocks as pending", () => {
        expect(blockState(4, 3)).toBe("pending");
    });

    it("marks everything written once the count passes the last block", () => {
        expect(blockState(9, 10)).toBe("written");
    });
});

describe("WriteSweep", () => {
    it("renders one cell per block", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={12}/>);
        expect(screen.getAllByTestId("write-sweep-block")).toHaveLength(12);
    });

    it("reports progress as blocks, not a percentage of time", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={6} totalBlocks={12}/>);
        expect(screen.getByTestId("write-sweep").props.accessibilityValue)
            .toEqual({min: 0, max: 12, now: 6});
    });

    it("renders nothing when there are no blocks to write", async () => {
        await renderWithProviders(<WriteSweep blocksWritten={0} totalBlocks={0}/>);
        expect(screen.queryByTestId("write-sweep")).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/WriteSweep.test.tsx`
Expected: FAIL — `Cannot find module '@/components/WriteSweep'`.

- [ ] **Step 3: Write the implementation**

Create `components/WriteSweep.tsx`:

```tsx
import React, {useEffect} from "react";
import {View} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from "react-native-reanimated";

import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

export type BlockState = "written" | "active" | "pending";

/** What a given block index is doing, given how many blocks are committed. */
export function blockState(index: number, blocksWritten: number): BlockState {
    if (index < blocksWritten) {
        return "written";
    }
    return index === blocksWritten ? "active" : "pending";
}

const COLOURS: Record<BlockState, string> = {
    written: palette.success,
    active:  palette.text,
    pending: palette.line
};

type CellProps = {
    state: BlockState;
    reduced: boolean;
};

function SweepBlock({state, reduced}: CellProps) {
    const fade = useSharedValue(state === "pending" ? 0.4 : 1);

    useEffect(() => {
        const target = state === "pending" ? 0.4 : 1;
        fade.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.fast, easing: EASING.out});
    }, [state, reduced, fade]);

    const animatedStyle = useAnimatedStyle(() => ({opacity: fade.value}));

    return (
        <Animated.View
            testID="write-sweep-block"
            style={[
                {
                    flex:            1,
                    height:          10,
                    borderRadius:    2,
                    marginHorizontal: 1,
                    backgroundColor: COLOURS[state]
                },
                animatedStyle
            ]}
        />
    );
}

type Props = {
    /** Blocks actually committed to the card. Never a timer. */
    blocksWritten: number;
    totalBlocks: number;
};

/**
 * The write ceremony: a strip of blocks that light up as they are committed.
 *
 * Deliberately literal. The card is written block by block, so the progress
 * shown is the progress that happened.
 */
export default function WriteSweep({blocksWritten, totalBlocks}: Props) {
    const reduced = useReducedMotion();
    if (totalBlocks <= 0) {
        return null;
    }

    const written = Math.min(Math.max(blocksWritten, 0), totalBlocks);

    return (
        <View
            testID="write-sweep"
            accessibilityRole="progressbar"
            accessibilityValue={{min: 0, max: totalBlocks, now: written}}
            style={{flexDirection: "row", alignItems: "center"}}>
            {Array.from({length: totalBlocks}, (_, index) => (
                <SweepBlock key={index} state={blockState(index, written)}
                            reduced={reduced}/>
            ))}
        </View>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/WriteSweep.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add components/WriteSweep.tsx components/__tests__/WriteSweep.test.tsx
git commit -m "Add the WriteSweep write animation"
```

---

### Task 10: Home chrome primitives

**Files:**
- Create: `components/CtaTile.tsx`, `components/ScreenTitle.tsx`, `components/Wordmark.tsx`
- Test: `components/__tests__/CtaTile.test.tsx`, `components/__tests__/ScreenTitle.test.tsx`, `components/__tests__/Wordmark.test.tsx`

Three small, related pieces of the home header, built together because each is
too small to be its own task.

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/CtaTile.test.tsx`:

```tsx
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import CtaTile from "@/components/CtaTile";
import {renderWithProviders} from "@/test-utils/render";

describe("CtaTile", () => {
    it("renders its label", async () => {
        await renderWithProviders(
            <CtaTile icon="scan1" label="SCAN" onPress={jest.fn()}/>
        );
        expect(screen.getByText("SCAN")).toBeTruthy();
    });

    it("calls onPress when tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <CtaTile icon="scan1" label="SCAN" onPress={onPress}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: "SCAN"}));

        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("does not call onPress when disabled", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <CtaTile icon="scan1" label="SCAN" onPress={onPress} disabled/>
        );

        await fireEvent.press(screen.getByRole("button", {name: "SCAN"}));

        expect(onPress).not.toHaveBeenCalled();
    });

    it("uses the accessibility label when the Doto label is an abbreviation", async () => {
        await renderWithProviders(
            <CtaTile icon="scan1" label="SCAN" accessibilityLabel="Scan a card"
                     onPress={jest.fn()}/>
        );
        expect(screen.getByRole("button", {name: "Scan a card"})).toBeTruthy();
    });
});
```

Create `components/__tests__/ScreenTitle.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import ScreenTitle from "@/components/ScreenTitle";
import {renderWithProviders} from "@/test-utils/render";

describe("ScreenTitle", () => {
    it("renders the title", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        expect(screen.getByText("Recipes")).toBeTruthy();
    });

    it("renders the count as a superscript", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={12}/>);
        expect(screen.getByText("12")).toBeTruthy();
    });

    it("omits the count when there is none", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes"/>);
        expect(screen.queryByTestId("screen-title-count")).toBeNull();
    });

    it("omits the count when it is zero, because the empty state says it better", async () => {
        await renderWithProviders(<ScreenTitle title="Recipes" count={0}/>);
        expect(screen.queryByTestId("screen-title-count")).toBeNull();
    });
});
```

Create `components/__tests__/Wordmark.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import Wordmark from "@/components/Wordmark";
import {renderWithProviders} from "@/test-utils/render";

describe("Wordmark", () => {
    it("renders the product name", async () => {
        await renderWithProviders(<Wordmark/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("sets the plus signs apart from the letters", async () => {
        await renderWithProviders(<Wordmark/>);
        expect(screen.getByText("XBRW")).toBeTruthy();
        expect(screen.getByText("++")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/CtaTile.test.tsx components/__tests__/ScreenTitle.test.tsx components/__tests__/Wordmark.test.tsx`
Expected: FAIL — three `Cannot find module` errors.

- [ ] **Step 3: Write the implementations**

Create `components/CtaTile.tsx`:

```tsx
import React from "react";
import {AntDesign} from "@expo/vector-icons";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    /** An AntDesign glyph name. v15 uses kebab-case, e.g. `plus-circle`. */
    icon: React.ComponentProps<typeof AntDesign>["name"];
    /** Shown in Doto, so keep it short and upper-case. */
    label: string;
    onPress: () => void;
    /** Spell the action out here when the label is an abbreviation. */
    accessibilityLabel?: string;
    disabled?: boolean;
};

/**
 * A primary action: icon above a dot-matrix label.
 *
 * The home screen shows two of these at equal weight. There is deliberately no
 * primary/secondary variant — if a third action ever earns equal weight it joins
 * the row; if it does not, it does not belong here.
 */
export default function CtaTile({
    icon,
    label,
    onPress,
    accessibilityLabel,
    disabled = false
}: Props) {
    return (
        <YStack
            flex={1}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{disabled}}
            onPress={disabled ? undefined : onPress}
            alignItems="center"
            justifyContent="center"
            gap="$2"
            paddingVertical="$4"
            borderRadius="$6"
            backgroundColor={palette.raised}
            borderWidth={1}
            borderColor={palette.line}
            opacity={disabled ? 0.4 : 1}
            pressStyle={disabled ? undefined : {opacity: 0.7, scale: 0.98}}>
            <AntDesign name={icon} size={22}
                       color={disabled ? palette.muted : palette.text}/>
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                           color={disabled ? palette.muted : palette.text}>
                {label}
            </DotMatrixText>
        </YStack>
    );
}
```

Create `components/ScreenTitle.tsx`:

```tsx
import React from "react";
import {XStack, Text} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    /** Prose, so this is Inter — never rendered in Doto. */
    title: string;
    /** Rendered as a small superscript. Hidden when absent or zero. */
    count?: number;
};

/**
 * A screen title with a machine-counted superscript beside it.
 *
 * The split is the typography rule in miniature: the word is prose, the number
 * is a machine-derived value.
 */
export default function ScreenTitle({title, count}: Props) {
    const showCount = typeof count === "number" && count > 0;

    return (
        <XStack alignItems="flex-start" gap="$1">
            <Text fontSize={28} fontWeight="700" color={palette.text}>
                {title}
            </Text>
            {showCount && (
                <DotMatrixText testID="screen-title-count" fontSize={11}
                               weight="bold" color={palette.muted}
                               style={{marginTop: 4}}>
                    {count}
                </DotMatrixText>
            )}
        </XStack>
    );
}
```

Create `components/Wordmark.tsx`:

```tsx
import React from "react";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    fontSize?: number;
    color?: string;
    /** Colour of the `++`. Defaults to the same as the letters. */
    plusColor?: string;
};

/**
 * The `XBRW++` lockup.
 *
 * The name is an abbreviation and a version marker rather than a word, which is
 * why it is allowed in Doto — it is a label on a machine, not prose. The `++`
 * carries the fork's identity, so it is the part that may be tinted.
 */
export default function Wordmark({
    fontSize = 15,
    color = palette.text,
    plusColor
}: Props) {
    return (
        <XStack accessibilityRole="header" accessibilityLabel="XBRW++"
                alignItems="center">
            <DotMatrixText fontSize={fontSize} weight="extrabold" letterSpacing={1}
                           color={color}>
                XBRW
            </DotMatrixText>
            <DotMatrixText fontSize={fontSize} weight="extrabold" letterSpacing={1}
                           color={plusColor ?? color}>
                ++
            </DotMatrixText>
        </XStack>
    );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/CtaTile.test.tsx components/__tests__/ScreenTitle.test.tsx components/__tests__/Wordmark.test.tsx`
Expected: PASS, 10 tests across 3 suites.

- [ ] **Step 5: Commit**

```bash
git add components/CtaTile.tsx components/ScreenTitle.tsx components/Wordmark.tsx \
        components/__tests__/CtaTile.test.tsx \
        components/__tests__/ScreenTitle.test.tsx \
        components/__tests__/Wordmark.test.tsx
git commit -m "Add the home chrome primitives"
```

---

### Task 11: RecipeCard

**Files:**
- Create: `components/RecipeCard.tsx`
- Test: `components/__tests__/RecipeCard.test.tsx`

The centrepiece. Compact card shape, accent fill, the pour profile drawn behind
at low opacity, Doto stats, and a beverage marker. It replaces nothing yet —
`components/RecipeItem.tsx` stays in place until sub-project 4 swaps it.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/RecipeCard.test.tsx`:

```tsx
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipeCard from "@/components/RecipeCard";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour from "@/library/Pour";
import {accents} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
    const recipe = new Recipe();
    recipe.title = "Ethiopia Guji";
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.cupType = CUP_TYPE.XPOD;

    const pour = new Pour();
    pour.pourNumber = 0;
    pour.volume = 288;
    recipe.pours = [pour];

    return Object.assign(recipe, overrides);
}

describe("RecipeCard", () => {
    it("renders the recipe name", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("shows the dose and ratio", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByLabelText("18")).toBeTruthy();
        expect(screen.getByLabelText("16")).toBeTruthy();
    });

    it("marks a coffee recipe as COFFEE", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}/>
        );
        expect(screen.getByText("COFFEE")).toBeTruthy();
    });

    it("marks a tea recipe as TEA", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()}/>
        );
        expect(screen.getByText("TEA")).toBeTruthy();
    });

    it("hides the coffee marker when asked", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()} showCoffeeMarker={false}/>
        );
        expect(screen.queryByText("COFFEE")).toBeNull();
    });

    it("still shows the tea marker when the coffee marker is hidden", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()} showCoffeeMarker={false}/>
        );
        expect(screen.getByText("TEA")).toBeTruthy();
    });

    it("draws a tea recipe from the tea half of the palette", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe({cupType: CUP_TYPE.TEA})}
                        onPress={jest.fn()}/>
        );
        const card = screen.getByTestId("recipe-card");
        expect(accents.tea).toContain(card.props.style.backgroundColor);
    });

    it("calls onPress when tapped", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={onPress}/>
        );

        await fireEvent.press(screen.getByTestId("recipe-card"));

        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("hides the row actions by default", async () => {
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={jest.fn()} onDelete={jest.fn()}/>
        );
        expect(screen.queryByRole("button", {name: "Delete recipe"})).toBeNull();
    });

    it("reveals the row actions in edit mode", async () => {
        const onDelete = jest.fn();
        await renderWithProviders(
            <RecipeCard recipe={makeRecipe()} onPress={jest.fn()}
                        onDuplicate={jest.fn()} onDelete={onDelete} editing/>
        );

        await fireEvent.press(screen.getByRole("button", {name: "Delete recipe"}));

        expect(onDelete).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`
Expected: FAIL — `Cannot find module '@/components/RecipeCard'`.

- [ ] **Step 3: Write the implementation**

Create `components/RecipeCard.tsx`:

```tsx
import React from "react";
import {View} from "react-native";
import {AntDesign} from "@expo/vector-icons";
import {XStack, YStack, Text} from "tamagui";

import DigitRoll from "@/components/DigitRoll";
import DotMatrixText from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {accentGroupFor, resolveAccent} from "@/library/accent";
import {onAccent} from "@/constants/colors";

const CARD_HEIGHT = 116;
const PROFILE_HEIGHT = 56;

type StatProps = {
    label: string;
    value: number;
    suffix?: string;
};

function Stat({label, value, suffix}: StatProps) {
    return (
        <YStack gap="$0.5">
            <DotMatrixText fontSize={11} weight="semibold" letterSpacing={1.2}
                           color={onAccent.label}>
                {label}
            </DotMatrixText>
            <DigitRoll value={value} suffix={suffix} fontSize={18} weight="extrabold"
                       color={onAccent.text}/>
        </YStack>
    );
}

type Props = {
    recipe: Recipe;
    onPress: () => void;
    /** When true, the destructive actions are visible rather than swipe-only. */
    editing?: boolean;
    onDuplicate?: () => void;
    onDelete?: () => void;
    /**
     * The `TEA` marker is always shown; the `COFFEE` marker is redundant for a
     * mostly-coffee library and sub-project 6 adds a setting to hide it.
     */
    showCoffeeMarker?: boolean;
};

/**
 * A recipe as a card.
 *
 * The name is prose and stays in Inter. Dose and ratio are machine-derived and
 * are Doto. The pour profile is drawn behind the content at low contrast, so a
 * recipe is recognisable by its silhouette before it is read.
 */
export default function RecipeCard({
    recipe,
    onPress,
    editing = false,
    onDuplicate,
    onDelete,
    showCoffeeMarker = true
}: Props) {
    const accent = resolveAccent(recipe);
    const isTea = accentGroupFor(recipe) === "tea";
    const marker = isTea ? "TEA" : "COFFEE";
    const showMarker = isTea || showCoffeeMarker;

    return (
        <YStack
            testID="recipe-card"
            accessibilityRole="button"
            accessibilityLabel={recipe.title}
            onPress={onPress}
            pressStyle={{opacity: 0.85, scale: 0.99}}
            height={CARD_HEIGHT}
            borderRadius="$8"
            overflow="hidden"
            justifyContent="space-between"
            padding="$3.5"
            style={{backgroundColor: accent}}>

            <View pointerEvents="none"
                  style={{position: "absolute", right: 0, bottom: 0, opacity: 0.5}}>
                <PourProfile pours={recipe.pours} width={200} height={PROFILE_HEIGHT}/>
            </View>

            <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                <Text flex={1} fontSize={17} fontWeight="700" numberOfLines={2}
                      color={onAccent.text}>
                    {recipe.title}
                </Text>
                {showMarker && (
                    <DotMatrixText fontSize={11} weight="semibold" letterSpacing={1.4}
                                   color={onAccent.marker}>
                        {marker}
                    </DotMatrixText>
                )}
            </XStack>

            <XStack justifyContent="space-between" alignItems="flex-end" gap="$4">
                <XStack gap="$5">
                    <Stat label="DOSE" value={recipe.dosage} suffix="g"/>
                    <Stat label="RATIO" value={recipe.ratio}/>
                    {recipe.cupType !== CUP_TYPE.TEA && (
                        <Stat label="GRIND" value={recipe.grindSize}/>
                    )}
                </XStack>

                {editing && (
                    <XStack gap="$3">
                        {onDuplicate !== undefined && (
                            <View accessibilityRole="button"
                                  accessibilityLabel="Duplicate recipe"
                                  onTouchEnd={onDuplicate}>
                                <AntDesign name="copy1" size={18}
                                           color={onAccent.marker}/>
                            </View>
                        )}
                        {onDelete !== undefined && (
                            <View accessibilityRole="button"
                                  accessibilityLabel="Delete recipe"
                                  onTouchEnd={onDelete}>
                                <AntDesign name="delete" size={18}
                                           color={onAccent.marker}/>
                            </View>
                        )}
                    </XStack>
                )}
            </XStack>
        </YStack>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`
Expected: PASS, 10 tests.

If the two action buttons do not respond to `fireEvent.press`, replace the
`View` + `onTouchEnd` pairs with Tamagui `YStack` and `onPress`, which is what
`CtaTile` uses and is known to work with the testing library.

- [ ] **Step 5: Commit**

```bash
git add components/RecipeCard.tsx components/__tests__/RecipeCard.test.tsx
git commit -m "Add the RecipeCard component"
```

---

### Task 12: Switch the app to dark-only

**Files:**
- Modify: `tamagui.config.ts`, `app/_layout.tsx`, `test-utils/render.tsx`
- Modify: every file under `app/` and `components/` that reads the old palette or `useColorScheme`

This is the task that makes `npm run typecheck` green again after Task 2.

- [ ] **Step 1: Find every call site that still needs migrating**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
npm run typecheck 2>&1 | grep -E "^(app|components|hooks)/" | sort -u
grep -rn "useColorScheme" app components hooks
```

Expected: a list of files. Every one of them is in scope for this task.

- [ ] **Step 2: Default the Tamagui config to dark**

In `tamagui.config.ts`, change the settings block:

```ts
    settings: {
        defaultTheme: "dark"
    }
```

- [ ] **Step 3: Make the test provider dark**

In `test-utils/render.tsx`, change `defaultTheme="light"` to `defaultTheme="dark"`
and change the `<Theme name="light">` wrapper, if present, to `<Theme name="dark">`.

- [ ] **Step 4: Remove colour-scheme branching from the root layout**

In `app/_layout.tsx`:

- Delete the `useColorScheme` import and every use of it.
- Delete the locally built `LightTheme` object.
- Load the Doto weights alongside the existing font load:

```tsx
    const [loaded] = useFonts({
        SpaceMono:         require("../assets/fonts/SpaceMono-Regular.ttf"),
        "Doto-SemiBold":   require("../assets/fonts/Doto-SemiBold.ttf"),
        "Doto-Bold":       require("../assets/fonts/Doto-Bold.ttf"),
        "Doto-ExtraBold":  require("../assets/fonts/Doto-ExtraBold.ttf")
    });
```

- Build a single navigation theme from the palette:

```tsx
const AppTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        background: palette.base,
        card:       palette.base,
        text:       palette.text,
        border:     palette.line,
        primary:    palette.text,
        notification: palette.danger
    }
};
```

- Pass `AppTheme` unconditionally to `ThemeProvider`, use `<Theme name="dark">`
  for the Tamagui `Theme`, and set the `Stack` chrome to `palette.base`
  background with `palette.text` tint. `DarkTheme` is imported from
  `expo-router`, never from `@react-navigation/*`.

- [ ] **Step 5: Migrate every remaining call site**

Work through the list from Step 1. The mapping from the old palette to the new:

| Old intent | New token |
|---|---|
| screen background | `palette.base` |
| card / sheet background | `palette.surface` |
| input or tile background | `palette.raised` |
| border, divider | `palette.line` |
| primary text | `palette.text` |
| secondary text | `palette.dim` |
| tertiary / placeholder text | `palette.muted` |
| brand / accent chrome | `palette.text` on `palette.base` |
| destructive | `palette.danger` |
| confirmation | `palette.success` |

Where a component picked a colour from `useColorScheme()`, delete the branch and
keep the dark value.

- [ ] **Step 6: Verify**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck silent, lint clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Switch the app to dark-only and migrate every colour call site"
```

---

### Task 13: Branding assets and app metadata

**Files:**
- Create: `assets/branding/xbrw-icon.svg`, `scripts/generate-icons.sh`
- Modify: `assets/images/icon.png`, `assets/images/adaptive-icon.png`, `assets/images/favicon.png`
- Create: `assets/images/splash-icon.png`
- Modify: `app.json`

- [ ] **Step 1: Copy the logo into the repository**

`AgentResources/` is gitignored, so the source SVG must live in the repo.

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
mkdir -p assets/branding
cp "AgentResources/Branding/xbrw-icon-new.svg" assets/branding/xbrw-icon.svg
head -2 assets/branding/xbrw-icon.svg
```

Expected: an `<svg` element with a `1024` viewBox or width.

- [ ] **Step 2: Write the generator script**

Create `scripts/generate-icons.sh`:

```bash
#!/usr/bin/env bash
# Regenerates the raster app assets from assets/branding/xbrw-icon.svg.
#
# Requires rsvg-convert (brew install librsvg). The outputs are committed, so
# this only needs running when the SVG changes.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets/branding/xbrw-icon.svg"
OUT="assets/images"

if ! command -v rsvg-convert >/dev/null 2>&1; then
    echo "rsvg-convert not found. Install it with: brew install librsvg" >&2
    exit 1
fi

render() {
    local size="$1" dest="$2"
    rsvg-convert -w "$size" -h "$size" -b "#000000" "$SRC" -o "$OUT/$dest"
    echo "  $dest (${size}x${size})"
}

echo "Rendering from $SRC:"
render 1024 icon.png
render 1024 adaptive-icon.png
render  512 splash-icon.png
render   48 favicon.png
echo "Done."
```

- [ ] **Step 3: Run it**

```bash
chmod +x scripts/generate-icons.sh
./scripts/generate-icons.sh
file assets/images/*.png
```

Expected: four `PNG image data` lines with the sizes `1024 x 1024`,
`1024 x 1024`, `512 x 512` and `48 x 48`.

- [ ] **Step 4: Update `app.json`**

Change these keys. Everything else stays as it is.

```json
{
  "expo": {
    "name": "XBRW++",
    "version": "2.4.0",
    "userInterfaceStyle": "dark",
    "backgroundColor": "#000000",
    "splash": {
      "image": "./assets/images/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#000000"
    },
    "ios": {
      "userInterfaceStyle": "dark"
    },
    "android": {
      "userInterfaceStyle": "dark",
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#000000"
      }
    }
  }
}
```

The version bump from `2.3.0` to `2.4.0` is not optional:
`runtimeVersion.policy` is `appVersion`, and changing the icon, splash and
interface style is native-affecting. Do not change `slug`, `scheme` or the
bundle identifiers — that would orphan installed builds and break the share
intent.

- [ ] **Step 5: Verify the config still parses and is healthy**

```bash
npx expo config --type public > /dev/null && echo "config ok"
npx expo-doctor
```

Expected: `config ok`, then expo-doctor reporting all checks passed. expo-doctor
is a hard failure in CI, so it must be green here.

- [ ] **Step 6: Commit**

```bash
git add assets/branding/xbrw-icon.svg scripts/generate-icons.sh \
        assets/images/icon.png assets/images/adaptive-icon.png \
        assets/images/splash-icon.png assets/images/favicon.png app.json
git commit -m "Rebrand to XBRW++ with generated dark app assets"
```

- [ ] **Step 7: Regenerate the native projects**

`ios/` and `android/` are generated by CNG and gitignored, so this produces no
diff — but the change will not appear on a device until it is run.

```bash
npx expo prebuild --clean
```

Expected: completes without error. Nothing to commit.

---

### Task 14: Animated splash

**Files:**
- Create: `components/SplashOverlay.tsx`, `components/__tests__/SplashOverlay.test.tsx`
- Modify: `app/_layout.tsx`

`expo-splash-screen` shows the static PNG until the JS bundle has hydrated. This
overlay covers the seam between that and the app's first paint, and animates the
dots out.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/SplashOverlay.test.tsx`:

```tsx
import React from "react";
import {AccessibilityInfo} from "react-native";
import {screen, waitFor} from "@testing-library/react-native";

import SplashOverlay from "@/components/SplashOverlay";
import {renderWithProviders} from "@/test-utils/render";

describe("SplashOverlay", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("renders the wordmark while visible", async () => {
        await renderWithProviders(<SplashOverlay visible onFinished={jest.fn()}/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("renders nothing when not visible", async () => {
        await renderWithProviders(
            <SplashOverlay visible={false} onFinished={jest.fn()}/>
        );
        expect(screen.queryByTestId("splash-overlay")).toBeNull();
    });

    it("reports finished once it has played", async () => {
        const onFinished = jest.fn();
        await renderWithProviders(<SplashOverlay visible onFinished={onFinished}/>);

        await waitFor(() => expect(onFinished).toHaveBeenCalled(), {timeout: 4000});
    });

    it("still reports finished under reduce motion", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
        const onFinished = jest.fn();

        await renderWithProviders(<SplashOverlay visible onFinished={onFinished}/>);

        await waitFor(() => expect(onFinished).toHaveBeenCalled(), {timeout: 4000});
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest components/__tests__/SplashOverlay.test.tsx`
Expected: FAIL — `Cannot find module '@/components/SplashOverlay'`.

- [ ] **Step 3: Write the implementation**

Create `components/SplashOverlay.tsx`:

```tsx
import React, {useEffect} from "react";
import {StyleSheet, View} from "react-native";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming
} from "react-native-reanimated";

import Wordmark from "@/components/Wordmark";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import {palette} from "@/constants/colors";

const HOLD_MS = 320;

type Props = {
    visible: boolean;
    /** Called once the overlay has played and faded. */
    onFinished: () => void;
};

/**
 * Covers the seam between the static splash and the app's first paint.
 *
 * The static PNG that `expo-splash-screen` shows is the same lockup on the same
 * black, so the handoff is invisible: only the animation is new. Under Reduce
 * Motion it holds the static frame and cross-fades — the spec's rule is that
 * motion degrades to a cross-fade, never to nothing.
 */
export default function SplashOverlay({visible, onFinished}: Props) {
    const reduced = useReducedMotion();
    const opacity = useSharedValue(1);
    const scale = useSharedValue(reduced ? 1 : 0.92);

    useEffect(() => {
        if (!visible) {
            return;
        }

        if (!reduced) {
            scale.value = withTiming(1, {
                duration: DURATION.deliberate,
                easing:   EASING.out
            });
        }

        opacity.value = withDelay(
            HOLD_MS,
            withTiming(0, {duration: DURATION.base, easing: EASING.in}, (done) => {
                if (done) {
                    runOnJS(onFinished)();
                }
            })
        );
    }, [visible, reduced, opacity, scale, onFinished]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity:   opacity.value,
        transform: [{scale: scale.value}]
    }));

    if (!visible) {
        return null;
    }

    return (
        <View testID="splash-overlay" pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.backdrop]}>
            <Animated.View style={animatedStyle}>
                <Wordmark fontSize={34}/>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        alignItems:      "center",
        justifyContent:  "center",
        backgroundColor: palette.base
    }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest components/__tests__/SplashOverlay.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mount it in the root layout**

In `app/_layout.tsx`, add the state and render the overlay as the last child
inside `SafeAreaProvider`, above the `Stack`, so it covers the whole app:

```tsx
    const [splashDone, setSplashDone] = useState(false);
```

```tsx
            <SplashOverlay visible={!splashDone}
                           onFinished={() => setSplashDone(true)}/>
```

The existing `SplashScreen.hideAsync()` call stays exactly where it is — the
native splash must hide before the overlay can be seen, and the overlay is what
covers the gap after it.

- [ ] **Step 6: Verify the app still boots**

```bash
npm run typecheck && npm test
```

Expected: typecheck silent, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/SplashOverlay.tsx components/__tests__/SplashOverlay.test.tsx \
        app/_layout.tsx
git commit -m "Add the animated splash overlay"
```

---

### Task 15: Enforce the palette with a lint rule

**Files:**
- Modify: `eslint.config.js`

The spec's rule — all colour comes from `constants/colors.ts` — has been a
convention enforced by review. Now that the palette is being replaced wholesale,
make it mechanical.

- [ ] **Step 1: Add the rule**

Append a block to `eslint.config.js`, after the existing configuration objects:

```js
    {
        files:   ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
        ignores: ["**/__tests__/**"],
        rules:   {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
                    message:  "Colour literals are not allowed here. Add a semantically named token to constants/colors.ts and import it."
                },
                {
                    selector: "Literal[value=/^(?:rgba?|hsla?)\\(/]",
                    message:  "Colour literals are not allowed here. Add a semantically named token to constants/colors.ts and import it."
                }
            ]
        }
    }
```

Tests are exempt because they assert on concrete colour values, which is the
point of them.

- [ ] **Step 2: Run lint and fix the fallout**

```bash
npm run lint
```

Every reported literal is a real violation. For each one, add a semantically
named entry to `constants/colors.ts` — `danger`, `surface`, `muted`, never
`red` — and import it. The `onAccent` values in `constants/colors.ts` itself are
not affected: the rule only covers `app/` and `components/`.

Expected after fixing: no errors.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js constants/colors.ts app components
git commit -m "Forbid raw colour literals in app and components"
```

---

### Task 16: Full verification

**Files:** none

- [ ] **Step 1: Run everything CI runs**

`.github/workflows/ci.yml` runs these four on every push to `main` and every pull
request. All four must be green, and expo-doctor is a hard failure.

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
npm run typecheck && npm run lint && npm test && npx expo-doctor
```

Expected: typecheck silent; lint clean; the full Jest suite passing, including
the untouched `library/__tests__/` characterisation tests for the card byte
format; expo-doctor reporting all checks passed.

- [ ] **Step 2: Confirm the card format was not touched**

A changed expectation in these tests is a regression until proven otherwise — a
malformed write to a genuine card is not trivially recoverable, and this
sub-project has no business near the byte layout.

```bash
git diff --stat main -- library/Recipe.ts library/Pour.ts library/NFC.ts \
                        library/RecipeDatabase.ts library/XBloomRecipe.ts
```

Expected: no output. The only change under `library/` should be the new
`accent.ts` and its test.

- [ ] **Step 3: Verify on a device**

The simulator cannot exercise NFC, and Doto's legibility was established on a
desktop display rather than in a hand.

```bash
npm run ios -- --device
```

Then check, by eye:
- the splash animates and hands off to the app without a flash of a different colour
- the app is black in both OS appearance settings
- Doto at 11 px is readable at arm's length, and still readable in daylight
- dark text on the lightest tea accents (`#DCC194` Oolong, `#D9CF9A` Jasmine) is
  comfortable, not marginal

Record anything marginal against the follow-on contrast-audit issue rather than
adjusting the palette ad hoc.

- [ ] **Step 4: Commit anything outstanding**

```bash
git status --short
```

Expected: a clean tree. If not, commit the remainder.

---

## Done

Sub-project 1 is complete when:

- The app is black, named `XBRW++`, and carries the new icon and animated splash.
- `constants/colors.ts` is the only source of colour, enforced by lint.
- The nine primitives exist, are tested, and are not yet wired into a screen.
- `library/` is unchanged apart from the new `accent.ts`.
- Typecheck, lint, tests and expo-doctor are all green.

Sub-project 4 wires the primitives into the home screen. Sub-project 3 composes
the bloom and sweep against the iOS system sheet and the Android dialog.
