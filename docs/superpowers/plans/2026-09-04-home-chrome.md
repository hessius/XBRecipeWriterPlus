# Home Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three home-screen findings from the device test in #87 — the BREW shortcut on the recipe card, the machine connection dot, and the wordmark's flash of brand colour.

**Architecture:** Nothing new architecturally. `constants/` gains two desaturated palette entries and three dot-matrix glyphs. `components/MachineDot.tsx` stops being a circle and becomes a diamond at three sizes, cross-fading between a saturated and a desaturated copy of itself as the header collapses — the same two-copy trick `HomeTitle` already uses, because a colour that arrives as a prop cannot be driven by Reanimated. `components/BrewCapsule.tsx` becomes `components/BrewShortcut.tsx` holding three alternative shapes behind one prop, with a fourth alternative living in `SwipeableRecipeRow` because it is a swipe tile rather than card chrome. `library/Settings.ts` gains one key to choose between them; the existing on/off boolean is untouched.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, Tamagui, `react-native-reanimated` v4, Jest + `@testing-library/react-native` v14 (async `render`/`fireEvent`, always via `renderWithProviders`).

**Design spec:** `docs/superpowers/specs/2026-09-04-home-chrome-design.md`. Tracking issue: #87. Branch: `m4-watch-it-brew`.

---

## Conventions this plan assumes

- Import through the `@/` alias.
- **Every colour comes from `constants/colors.ts` (`palette`).** No hex literals and no named CSS colours anywhere in `app/` or `components/`. Hex literals belong in `constants/colors.ts` and nowhere else.
- **No em dashes in user-facing copy.** Em dashes in code comments are house style and are correct; there are 500+ of them. The rule is about strings a user reads.
- The React Compiler is on: do not hand-write `useMemo`/`useCallback`, and destructure props rather than reading a whole `props` object inside a hook.
- `react-hooks/set-state-in-effect` and `react-hooks/purity` are lint **errors**.
- Component tests render through `renderWithProviders` from `test-utils/render.tsx` and **must be `await`ed**. Forgetting the `await` leaves `screen` empty and the test passes for the wrong reason.
- Declare components at module scope. A component defined inside another component's body is a new type every render, so React remounts it and discards its state. That bug has been fixed twice in this repo.
- Reanimated cannot animate a colour that is passed as a prop rather than set as a style. Where a colour must change, draw the thing twice and cross-fade opacity. `components/HomeTitle.tsx` explains this in a comment and is the precedent.

**Validation commands** (run before every commit):

```bash
npm run typecheck
npm run lint
npm test
```

Baseline at the start of this plan: **1837 tests passing**, 6 pre-existing lint warnings, 0 lint errors. `npx expo-doctor` must stay at 21/21; it is a hard CI failure. Run it once at the end.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `components/BrewShortcut.tsx` | The three card-drawn BREW shapes — `edge`, `tab`, `chip` — behind one `variant` prop. Alternatives to one another, never composed, so they live side by side in one file while the choice is open. |
| `components/__tests__/BrewShortcut.test.tsx` | Its tests. |

**Deleted**

| File | Why |
|---|---|
| `components/BrewCapsule.tsx` | Replaced by `BrewShortcut.tsx`. Its five faults are catalogued in the spec. |
| `components/__tests__/BrewCapsule.test.tsx` | Its assertions move to `BrewShortcut.test.tsx`, adapted. Nothing is dropped. |

**Modified**

| File | Change |
|---|---|
| `constants/colors.ts` | `successMuted`, `warnMuted`. |
| `constants/dotIcons.ts` | `link-on`, `link-wait`, `link-off`. |
| `constants/__tests__/dotIcons.test.ts` | Its hard-coded name list. |
| `constants/motion.ts` | `ATTRACT.wordmarkReplayFloor`. |
| `components/MachineDot.tsx` | Full rewrite: three diamonds, three colours, desaturation on collapse, `accent` prop and ring removed. |
| `components/HomeHeader.tsx` | Pass `collapsed` to `MachineDot` and `HomeTitle`; `machineAccent` prop removed. |
| `components/HomeTitle.tsx` | Tint driven by expansion rather than a launch timer, rate limited. |
| `components/SettingsChoiceRow.tsx` | `stacked` layout, for a choice too wide to sit beside its label. |
| `components/RecipeCard.tsx` | `brewShortcut` variant replaces `showBrew`; marker shifts for `tab`. |
| `components/SwipeableRecipeRow.tsx` | A third swipe tile, for the `swipe` variant. |
| `library/Settings.ts` | `brewShortcut`. |
| `app/settings.tsx` | The shape row, and `brewShortcut` through backup and restore. |
| `app/index.tsx` | Read `brewShortcut`; stop passing `machineAccent`. |

---

## Task 1: Two colours that have stepped back

The dot desaturates as the header collapses. React Native has no colour filter, so the desaturated versions are palette entries.

Each is its original converted to OKLCH with chroma multiplied by 0.45, lightness and hue untouched. So the change is saturation and nothing else, and contrast against `base` is preserved.

**Files:**
- Modify: `constants/colors.ts`
- Test: `constants/__tests__/colors.test.ts`

- [ ] **Step 1: Create the colour test file**

`constants/__tests__/colors.test.ts` **does not exist** — this task creates it. `constants/__tests__/` currently holds only `brewCopy`, `dotIcons`, `licences`, `motion.sheet` and `recipeHelp`, and nothing anywhere iterates the palette. So there is no existing luminance or contrast helper to reuse; write it in the test file.

Keep it out of `constants/colors.ts`, which is a data module and must stay one.

- [ ] **Step 2: Write the failing test**

Create `constants/__tests__/colors.test.ts` with the import it needs (`import {palette} from "@/constants/colors";`) and:

```ts
describe("the desaturated twins", () => {
    /** sRGB relative luminance, per WCAG. */
    function luminance(hex: string): number {
        const channels = [1, 3, 5].map((i) => {
            const c = parseInt(hex.slice(i, i + 2), 16) / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function contrastOnBase(hex: string): number {
        return (luminance(hex) + 0.05) / (luminance(palette.base) + 0.05);
    }

    it.each([
        ["success", palette.success, palette.successMuted],
        ["warn", palette.warn, palette.warnMuted]
    ])("keeps %s legible after desaturating it", (_name, full, twin) => {
        // The point of desaturating rather than dimming: the glyph must not
        // get harder to see as it steps back. 3:1 is the WCAG floor for a
        // non-text graphic.
        expect(contrastOnBase(twin)).toBeGreaterThan(3);
        // And it must genuinely be a step back, not a different colour at the
        // same saturation.
        expect(contrastOnBase(twin)).toBeCloseTo(contrastOnBase(full), 0);
    });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest constants/__tests__/colors.test.ts -t "desaturated twins"`
Expected: FAIL. TypeScript will not have `palette.successMuted`, so the failure is a type error or `undefined` reaching `parseInt`. Either is the right failure. Confirm you saw it before continuing.

- [ ] **Step 4: Add the two entries**

In `constants/colors.ts`, immediately after the `warn` entry so each twin sits near its original:

```ts
    /**
     * `success` and `warn`, desaturated.
     *
     * For chrome that has stepped back — today, the connection dot as the
     * header collapses. Each is its original in OKLCH with the chroma
     * multiplied by 0.45 and the lightness and hue left alone, so the
     * transition between the two is a change in saturation and nothing else.
     * That is what reads as receding; dropping opacity instead reads as the
     * glyph being broken.
     *
     * Lightness held means contrast against `base` is held too: 11.7:1 and
     * 12.6:1, against 12.1:1 and 12.5:1 for the originals.
     *
     * `muted` needs no twin. It is already grey.
     */
    successMuted: "#9BCDA8",
    warnMuted:    "#DAC799",
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx jest constants/__tests__/colors.test.ts`
Expected: PASS.

- [ ] **Step 6: Check nothing else enumerates the palette**

Run: `npx jest constants/`
Expected: PASS. Nothing currently iterates the palette keys, so this should be uneventful — but run it, because adding a key to a widely imported module is exactly the change that surprises you.

The two twins have been checked independently: `#9BCDA8` and `#DAC799` are `success` and `warn` at OKLCH chroma × 0.45, and contrast against `base` is 11.69:1 and 12.61:1 against the originals' 12.07:1 and 12.52:1. Both clear the 3:1 floor and both sit inside `toBeCloseTo(…, 0)`. If your test disagrees with any of those numbers, your helper is wrong, not the palette.

- [ ] **Step 7: Commit**

```bash
git add constants/colors.ts constants/__tests__/colors.test.ts
git commit -m "feat: desaturated twins of success and warn

Chrome that steps back should lose saturation, not luminance. Dropping
opacity on a 9pt glyph reads as the glyph being broken rather than as the
glyph receding, so the connection dot needs somewhere to go that is the same
colour, the same brightness, and less insistent.

OKLCH chroma at 0.45 with lightness and hue held, so contrast against base
is unchanged and the transition is saturation alone.

Refs #87"
```

---

## Task 2: Three glyphs for one link

The dot becomes a dot-matrix glyph like every other item in the toolbar, and its state stops being carried by colour alone.

One diamond at three sizes. Diamonds because `constants/dotIcons.ts` says only axis-aligned runs and pure diagonals survive at 9 x 9, and a diamond is the only closed shape that is entirely diagonal.

**Files:**
- Modify: `constants/dotIcons.ts`
- Modify: `constants/__tests__/dotIcons.test.ts`

- [ ] **Step 1: Read the test's name list**

Run: `sed -n '1,20p' constants/__tests__/dotIcons.test.ts`

Line 10 holds a hard-coded, alphabetically sorted list of every icon name. It exists so that adding an icon is a deliberate act. You are about to add three.

- [ ] **Step 2: Add the three names to the list, and watch the test fail**

Insert `"link-off", "link-on", "link-wait"` into that array in sorted position. Sorted position matters: the list is sorted and the assertion compares against a sort.

Run: `npx jest constants/__tests__/dotIcons.test.ts`
Expected: FAIL, because `DOT_ICONS` does not have those keys yet. Confirm you saw it.

- [ ] **Step 3: Draw the three glyphs**

In `constants/dotIcons.ts`, add to `DOT_ICONS`. Copy these grids exactly. They were drawn and reviewed at size and are the approved artwork, not an illustration of an idea:

```ts
    /**
     * The machine link, at three amounts of presence.
     *
     * One shape at three sizes rather than three symbols, so the three states
     * rank against each other before any colour is read: strip the colour and
     * a filled diamond, a hollow one and four dots still say more, less and
     * least. That is what lets the dot desaturate on collapse without losing
     * the only thing it was saying.
     *
     * Diamonds because of this file's own constraint. Only axis-aligned runs
     * and pure diagonals survive at 9x9, and a diamond is the one closed shape
     * that is entirely diagonal, so it is unmistakably not a square and still
     * lands cleanly on every dot.
     */
    "link-on": [
        "....#....",
        "...###...",
        "..#####..",
        ".#######.",
        "#########",
        ".#######.",
        "..#####..",
        "...###...",
        "....#...."
    ],
    "link-wait": [
        "....#....",
        "...#.#...",
        "..#...#..",
        ".#.....#.",
        "#.......#",
        ".#.....#.",
        "..#...#..",
        "...#.#...",
        "....#...."
    ],
    /** Four lit cells: the same diamond at its smallest drawable size. */
    "link-off": [
        ".........",
        ".........",
        ".........",
        ".........",
        "....#....",
        "...#.#...",
        "....#....",
        ".........",
        "........."
    ],
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest constants/__tests__/dotIcons.test.ts`
Expected: PASS. The suite also asserts every grid is `DOT_ICON_GRID` rows of `DOT_ICON_GRID` characters, which will catch a miscounted row.

- [ ] **Step 5: Commit**

```bash
git add constants/dotIcons.ts constants/__tests__/dotIcons.test.ts
git commit -m "feat: three dot-matrix glyphs for the machine link

The connection dot was the one item in the toolbar that was not a dot-matrix
glyph, and the one control whose state was carried by colour alone.

A diamond at three sizes fixes both at once. The ranking survives having the
colour stripped, which is what makes it safe to desaturate the dot when the
header collapses.

Refs #87"
```

---

## Task 3: The dot becomes a diamond

`MachineDot` is a 9 pt filled circle. It takes an `accent` prop, which `app/index.tsx` fills with `palette.success`, and it draws a faint ring at 0.25 opacity when connected and drops the fill to `opacity: 0.5` while connecting.

So connected and connecting are the same colour told apart by half-strength fill, which nobody reads as a state, and `palette.warn` goes unused where it means exactly what is wanted. The ring exists only because a filled circle had no other way to say "more present than the other filled circle".

Three glyphs, three colours, no ring, no accent prop, and a desaturation as the header collapses.

**Files:**
- Modify: `components/MachineDot.tsx` (full rewrite)
- Test: `components/__tests__/MachineDot.test.tsx`

- [ ] **Step 1: Read what is there now**

```bash
cat components/MachineDot.tsx
cat components/__tests__/MachineDot.test.tsx
grep -n "ACTION_ICON_SIZE" components/HomeHeader.tsx
```

Five existing tests. Three of them assert the old look (`is accent with a ring when connected`, `is grey and ringless when out of range`, `is half-lit while connecting`) and are being **replaced**, because the look they describe is the defect. Two of them (`says which state it is in, for a screen reader`, `opens on a press`) assert behaviour that is not changing and **must survive unchanged**.

Note `ACTION_ICON_SIZE` from `HomeHeader`. The new glyph uses that same value, because the whole complaint was that this control did not match the icons beside it.

- [ ] **Step 2: Write the failing tests**

Replace the three look tests in `components/__tests__/MachineDot.test.tsx` with the block below. Leave the accessibility and press tests alone.

```ts
describe("the shape says the state", () => {
    it.each([
        ["connected", "link-on", palette.success],
        ["connecting", "link-wait", palette.warn],
        ["disconnected", "link-off", palette.muted],
        ["failed", "link-off", palette.muted]
    ] as const)("draws %s as %s", async (status, icon, colour) => {
        await renderWithProviders(
            <MachineDot status={status} collapsed={false} onPress={() => undefined}/>
        );
        // The saturated copy is the one on top. Reading its props rather than
        // its pixels: the glyph's identity is the whole point of the change.
        const lit = screen.getByTestId("machine-dot-lit");
        expect(lit.props.name).toBe(icon);
        expect(lit.props.color).toBe(colour);
    });

    it("has no ring left to draw", async () => {
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} onPress={() => undefined}/>
        );
        // The ring was compensating for a shape that could not say "present".
        // The filled diamond says it, so the ring is gone rather than restyled.
        expect(screen.queryByTestId("machine-dot-ring")).toBeNull();
    });
});

describe("collapsing", () => {
    it("keeps a desaturated copy underneath to fade to", async () => {
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} onPress={() => undefined}/>
        );
        // Two copies, cross-faded, because Reanimated cannot drive a colour
        // that arrives as a prop. Same reason HomeTitle draws its wordmark
        // twice.
        expect(screen.getByTestId("machine-dot-dim").props.color)
            .toBe(palette.successMuted);
        expect(screen.getByTestId("machine-dot-lit").props.color)
            .toBe(palette.success);
    });

    it("starts collapsed already desaturated, with no animation to watch", async () => {
        await renderWithProviders(
            <MachineDot status="connected" collapsed onPress={() => undefined}/>
        );
        // Mounting into the collapsed state is the header arriving settled,
        // not a transition anybody saw begin.
        expect(screen.getByTestId("machine-dot-tint").props.style)
            .toEqual(expect.objectContaining({opacity: 0}));
    });

    it("is fully lit when expanded", async () => {
        await renderWithProviders(
            <MachineDot status="connected" collapsed={false} onPress={() => undefined}/>
        );
        expect(screen.getByTestId("machine-dot-tint").props.style)
            .toEqual(expect.objectContaining({opacity: 1}));
    });

    it("does not bother cross-fading grey to grey", async () => {
        await renderWithProviders(
            <MachineDot status="disconnected" collapsed={false} onPress={() => undefined}/>
        );
        // muted has no twin because it is already grey, so the second copy
        // would be a pixel-identical overdraw on every frame of every scroll.
        expect(screen.queryByTestId("machine-dot-dim")).toBeNull();
    });

    it("keeps the greyed-out glyph visible when the header collapses", async () => {
        await renderWithProviders(
            <MachineDot status="disconnected" collapsed onPress={() => undefined}/>
        );
        // With no copy underneath to reveal, fading this one out does not
        // desaturate it, it deletes it.
        expect(screen.getByTestId("machine-dot-tint").props.style)
            .toEqual(expect.objectContaining({opacity: 1}));
    });
});
```

The file will need `palette` imported from `@/constants/colors` if it does not already import it.

**On reading `.props.style.opacity` from an `Animated.View`:** this works in this repo and there is precedent at `components/__tests__/BrewStageRung.test.tsx:106`. If the shared value's initial state does not surface there in your run, do not weaken the assertion to `toBeDefined`. Read `components/__tests__/HomeTitle.test.tsx` to see how the existing tint test reaches the same kind of value and follow it.

- [ ] **Step 3: Run them and watch them fail**

Run: `npx jest components/__tests__/MachineDot.test.tsx`
Expected: FAIL. `collapsed` is not a prop, `machine-dot-lit` does not exist. Report the failure output.

- [ ] **Step 4: Rewrite the component**

Replace `components/MachineDot.tsx` entirely:

```tsx
import React, {useEffect} from "react";
import {Pressable, StyleSheet} from "react-native";
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from "react-native-reanimated";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";
import type {DotIconName} from "@/constants/dotIcons";
import {DURATION, EASING, useReducedMotion} from "@/constants/motion";
import type {LinkStatus} from "@/hooks/useMachine";

type Props = {
    status: LinkStatus;
    /** Drives the desaturation. The header owns the threshold. */
    collapsed: boolean;
    onPress: () => void;
};

/**
 * The same size as the glyphs beside it.
 *
 * It used to be 9, a deliberately smaller circle meant to read as ambient. That
 * was the wrong lever: it made the one non-glyph in a row of glyphs also the
 * one odd size. Insistence is handled by colour and by the shape's own weight
 * now, so the size can simply match its neighbours.
 */
const SIZE = 20;
/** The HIG's smallest comfortable target, as in HomeHeader. */
const TOUCH_TARGET = 44;

const LABELS: Record<LinkStatus, string> = {
    connected:    "Machine connected",
    connecting:   "Machine connecting",
    disconnected: "Machine not in range",
    failed:       "Machine not in range"
};

/**
 * What each state looks like.
 *
 * `dim` is null where the colour is already grey: cross-fading `muted` to
 * `muted` is a pixel-identical overdraw on every frame of every scroll.
 */
const LOOKS: Record<LinkStatus, {icon: DotIconName; lit: string; dim: string | null}> = {
    connected:    {icon: "link-on",   lit: palette.success, dim: palette.successMuted},
    connecting:   {icon: "link-wait", lit: palette.warn,    dim: palette.warnMuted},
    disconnected: {icon: "link-off",  lit: palette.muted,   dim: null},
    failed:       {icon: "link-off",  lit: palette.muted,   dim: null}
};

/**
 * The machine link, left of the settings glyph.
 *
 * A diamond at three sizes rather than a dot at three colours. The state has to
 * survive being desaturated when the header collapses, and a state carried by
 * hue alone does not: desaturating it would delete the only thing it said. With
 * the shape carrying the ranking, the colour is free to step back.
 *
 * Drawn twice and cross-faded rather than animating one colour, for the reason
 * `HomeTitle` gives about the wordmark: `DotIcon` takes its colour as a prop,
 * and Reanimated drives styles, not props.
 *
 * Padded out to a full touch target rather than given `hitSlop`, for the reason
 * `HomeHeader` states: hit slop on adjacent controls overlaps into the gap
 * between them and the later sibling wins, which here would put the settings
 * glyph under a tap aimed at the dot.
 */
export default function MachineDot({status, collapsed, onPress}: Props) {
    const reduced = useReducedMotion();
    const look = LOOKS[status];

    /**
     * 1 is fully saturated. Collapsing carries it to 0, revealing the dim copy.
     *
     * Pinned at 1 when there is no dim copy. Fading the only drawn glyph out
     * would not desaturate it, it would delete it — the desaturation is the
     * *other* copy showing through, not this one going away.
     */
    const fades = look.dim !== null;
    const tint = useSharedValue(fades && collapsed ? 0 : 1);

    useEffect(() => {
        const target = fades && collapsed ? 0 : 1;
        tint.value = reduced
            ? target
            : withTiming(target, {duration: DURATION.base, easing: EASING.out});
    }, [collapsed, fades, reduced, tint]);

    const tintStyle = useAnimatedStyle(() => ({opacity: tint.value}));

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={LABELS[status]}
            onPress={onPress}
            style={{
                width:          TOUCH_TARGET,
                height:         TOUCH_TARGET,
                alignItems:     "center",
                justifyContent: "center"
            }}
        >
            {fades && (
                <DotIcon testID="machine-dot-dim" name={look.icon}
                         size={SIZE} color={look.dim}/>
            )}
            <Animated.View
                testID="machine-dot-tint"
                style={[fades ? StyleSheet.absoluteFill : null, tintStyle]}
                pointerEvents="none">
                <DotIcon testID="machine-dot-lit" name={look.icon}
                         size={SIZE} color={look.lit}/>
            </Animated.View>
        </Pressable>
    );
}
```

Two things to check rather than assume:

1. `SIZE` must equal `ACTION_ICON_SIZE` in `HomeHeader.tsx`. If that constant is not 20, use its value and say so in your report. Do not import it — it is private to the header and the dot matching it is a design decision, not a dependency.
2. When `look.dim` is null there is no absolutely-positioned sibling, so the `Animated.View` must lay out normally or the glyph will collapse to zero size. That is what the conditional `StyleSheet.absoluteFill` is doing. Verify the disconnected glyph actually renders at size in the test output rather than trusting the reasoning.
3. `fades` gates the animation as well as the second copy. Both branches matter and both are tested: without the gate, collapsing the header makes a disconnected machine's glyph vanish entirely rather than step back.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest components/__tests__/MachineDot.test.tsx`
Expected: PASS, including the two older tests you did not touch.

- [ ] **Step 6: Find every other caller**

Run: `grep -rn "MachineDot" --include=*.tsx --include=*.ts .`

`HomeHeader` passes `accent` and does not pass `collapsed`, so it will not typecheck. That is Task 4. Do not fix it here — but do confirm the break is only in the files Task 4 names, and report it if it is not.

- [ ] **Step 7: Commit**

```bash
git add components/MachineDot.tsx components/__tests__/MachineDot.test.tsx
git commit -m "feat: the connection dot is a diamond, not a circle

Connected and connecting were the same colour separated by opacity 0.5, which
is not a difference anybody reads, so of three states the dot distinguished
two. warn was going unused in the one place it means precisely what is needed.

Shape now carries the ranking and colour reinforces it, which is what makes
the dot safe to desaturate when the header collapses: with the state in the
silhouette, dropping the saturation costs no information.

The ring goes with it. It only ever existed because a filled circle had no way
to say it was more present than another filled circle.

Typechecking is broken until HomeHeader stops passing accent and starts
passing collapsed.

Refs #87"
```

---

## Task 4: Wire the dot up

`MachineDot` no longer takes `accent` and now requires `collapsed`. Two callers to fix, and one prop to delete on the way through.

`HomeHeader` takes a `machineAccent` prop purely to forward it. `app/index.tsx` fills it with `palette.success`. With the colour now decided by the state inside `MachineDot`, that whole channel is dead and goes.

**Files:**
- Modify: `components/HomeHeader.tsx`
- Modify: `app/index.tsx`
- Test: `components/__tests__/HomeHeader.test.tsx`

- [ ] **Step 1: Confirm the break**

Run: `npm run typecheck`
Expected: FAIL, naming `HomeHeader.tsx` for passing `accent` and omitting `collapsed`. If it names any file other than `components/HomeHeader.tsx`, stop and report it — this plan assumed two callers and would be wrong.

- [ ] **Step 2: Write the failing test**

Add to `components/__tests__/HomeHeader.test.tsx`:

```ts
it("tells the dot when the header has collapsed", async () => {
    await renderWithProviders(
        <HomeHeader count={3} collapsed editing={false} showEdit
                    machineStatus="connected"
                    onToggleEdit={() => undefined} onScan={() => undefined}
                    onImport={() => undefined} onSettings={() => undefined}/>
    );
    // The dot desaturates with the header rather than on its own schedule, so
    // the header is the only thing that knows the threshold.
    expect(screen.getByTestId("machine-dot-tint").props.style)
        .toEqual(expect.objectContaining({opacity: 0}));
});
```

Match the surrounding tests' prop spelling — read one before writing this, because `HomeHeader` has required props this snippet may not have guessed correctly.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest components/__tests__/HomeHeader.test.tsx -t "collapsed"`
Expected: FAIL.

- [ ] **Step 4: Fix `HomeHeader`**

Delete the `machineAccent` prop from the `Props` type, from the destructured parameter list, and from its default. Then change the render:

```tsx
                {machineStatus !== undefined && (
                    <MachineDot
                        status={machineStatus}
                        collapsed={collapsed}
                        onPress={onMachinePress}
                    />
                )}
```

- [ ] **Step 5: Fix `app/index.tsx`**

Delete the line `machineAccent={palette.success}` (around line 451).

**Leave the `accent={palette.success}` on `MachinePopover` alone** (around line 534). That is a different component, it is out of scope, and removing it would break the popover.

- [ ] **Step 6: Check `palette` is still used**

Run: `grep -n "palette\." app/index.tsx | head`

If that was the only use, the import is now unused and lint will say so. It almost certainly is not, but check rather than assume.

- [ ] **Step 7: Run everything**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all clean. Any `HomeHeader` snapshot or accessibility test that named `machineAccent` will need updating — if one does, say which and why in your report.

- [ ] **Step 8: Commit**

```bash
git add components/HomeHeader.tsx components/__tests__/HomeHeader.test.tsx app/index.tsx
git commit -m "refactor: the header stops choosing the dot's colour

MachineDot decides its own colour from its own state now, so the accent prop
threaded from app/index.tsx through HomeHeader existed only to deliver a
constant. What the header does know, and the dot cannot, is whether it has
collapsed, so that is what it passes instead.

Refs #87"
```

---

## Task 5: The wordmark flashes on the way back up

`HomeTitle` already draws the lockup twice and cross-fades a `palette.brand` `++` down to `palette.muted`. That is already the flash of colour. It fires once, on a timer, in the first ten seconds of the session, and then the mechanism sits unused for the rest of the app's life.

Rehang it on the header's expansion. Collapsing carries the tint to 0, which is the muted `++` it settles to anyway, so the desaturation asked for on collapse is not a new treatment. Expanding replays it: rise, hold briefly, fall away.

Rate limited, because a fast scroll up and down would otherwise strobe.

**Files:**
- Modify: `constants/motion.ts`
- Modify: `components/HomeTitle.tsx`
- Modify: `components/HomeHeader.tsx`
- Test: `components/__tests__/HomeTitle.test.tsx`

- [ ] **Step 1: Read what is there**

```bash
cat components/HomeTitle.tsx
cat components/__tests__/HomeTitle.test.tsx
grep -n "wordmarkFadeDelay" -B4 -A8 constants/motion.ts
```

The existing launch behaviour is **kept**, not replaced. Both triggers may fire. The tests for the launch tint must all still pass untouched — if you find yourself editing one, stop and report why.

- [ ] **Step 2: Add the two timings**

In `constants/motion.ts`, inside `ATTRACT`, beside `wordmarkFadeDelay`:

```ts
    /**
     * The shortest gap between two replays of the wordmark's tint.
     *
     * Without it, a fast scroll up and down strobes the one piece of brand
     * colour in the app, which is the opposite of a nod. An expansion that
     * arrives sooner than this settles to the muted `++` without replaying,
     * silently.
     *
     * A judgement, not a measurement, and here rather than in the component so
     * it is tunable in the one place motion is tuned.
     */
    wordmarkReplayFloor: 2000,
    /**
     * How long the replayed tint holds at full before falling away.
     *
     * The launch tint holds for ten seconds because it is being read. This one
     * is being noticed, which takes less.
     */
    wordmarkReplayHold: 600,
```

- [ ] **Step 3: Write the failing tests**

Add to `components/__tests__/HomeTitle.test.tsx`. Read the file's existing setup first — it pins its clock to `SESSION_START` and installs fake timers, and you must follow that pattern rather than inventing a second one.

```ts
describe("the tint replays on the way back up", () => {
    it("gives the tint up when the header collapses", async () => {
        const {rerender} = await renderWithProviders(
            <HomeTitle count={3} fontSize={28} collapsed={false}/>
        );
        await rerender(<HomeTitle count={3} fontSize={20} collapsed/>);
        jest.advanceTimersByTime(DURATION.deliberate + 1);

        expect(screen.getByTestId("home-title-tint").props.style)
            .toEqual(expect.objectContaining({opacity: 0}));
    });

    it("replays it when the header expands again", async () => {
        const {rerender} = await renderWithProviders(
            <HomeTitle count={3} fontSize={28} collapsed={false}/>
        );
        await rerender(<HomeTitle count={3} fontSize={20} collapsed/>);
        jest.advanceTimersByTime(ATTRACT.wordmarkReplayFloor + 1);
        await rerender(<HomeTitle count={3} fontSize={28} collapsed={false}/>);

        // Caught mid-rise: the point is that it came back, not where it got to.
        jest.advanceTimersByTime(DURATION.base);
        expect(screen.getByTestId("home-title-tint").props.style.opacity)
            .toBeGreaterThan(0);
    });

    it("does not strobe when the list is scrubbed up and down", async () => {
        const {rerender} = await renderWithProviders(
            <HomeTitle count={3} fontSize={28} collapsed={false}/>
        );
        await rerender(<HomeTitle count={3} fontSize={20} collapsed/>);
        // Back up immediately, the way a flick does.
        await rerender(<HomeTitle count={3} fontSize={28} collapsed={false}/>);
        jest.advanceTimersByTime(DURATION.base);

        expect(screen.getByTestId("home-title-tint").props.style.opacity).toBe(0);
    });

    it("does not replay on mount, so a settled session stays settled", async () => {
        await renderWithProviders(<HomeTitle count={3} fontSize={28} collapsed={false}/>);
        // Mounting expanded is not an expansion. Only the launch timer, which
        // has its own tests, may touch the tint here.
        jest.advanceTimersByTime(DURATION.base);
        expect(screen.getByTestId("home-title-tint").props.style.opacity).toBe(1);
    });
});
```

You will need `ATTRACT` and `DURATION` imported from `@/constants/motion`.

- [ ] **Step 4: Run them and watch them fail**

Run: `npx jest components/__tests__/HomeTitle.test.tsx -t "replays"`
Expected: FAIL. `collapsed` is not a prop.

- [ ] **Step 5: Add the trigger**

In `components/HomeTitle.tsx`, add `collapsed: boolean` to `Props` with a doc comment, add it to the destructured parameters, and add this effect **after** the existing launch-timer effect. Extend the imports from `react` with `useRef`, and from `react-native-reanimated` with `withDelay` and `withSequence`.

```tsx
    /**
     * When the tint last replayed, so a fast scroll cannot strobe it.
     *
     * Seeded to the session start rather than to zero: the launch tint is
     * itself a showing, and an expansion in the first two seconds of the app
     * would otherwise replay on top of it.
     */
    const lastReplay = useRef(SESSION_START);
    /**
     * The last collapse state acted on.
     *
     * Mounting expanded is not an expansion. Without this, every mount of the
     * header — returning from Settings, for one — would replay the tint, which
     * is the behaviour the launch timer's `SESSION_START` exists to prevent.
     */
    const acted = useRef(collapsed);

    useEffect(() => {
        if (acted.current === collapsed) return;
        acted.current = collapsed;

        if (collapsed) {
            // Where the tint was always headed. Collapsing simply gets it
            // there, which is why the desaturation on collapse needed no new
            // colour and no new animation.
            tint.value = reduced
                ? 0
                : withTiming(0, {duration: DURATION.deliberate, easing: EASING.inOut});
            return;
        }

        const now = Date.now();
        if (reduced || now - lastReplay.current < ATTRACT.wordmarkReplayFloor) {
            tint.value = 0;
            return;
        }
        lastReplay.current = now;

        tint.value = withSequence(
            withTiming(1, {duration: DURATION.base, easing: EASING.out}),
            withDelay(
                ATTRACT.wordmarkReplayHold,
                withTiming(0, {duration: DURATION.deliberate, easing: EASING.inOut})
            )
        );
    }, [collapsed, reduced, tint]);
```

Then update the component's doc comment. The existing paragraph says the tint happens "Once per session, timed from launch", which is about to be false. Replace that sentence with an account of the new trigger and of why the launch tint is kept alongside it.

- [ ] **Step 6: Pass it from the header**

In `components/HomeHeader.tsx`:

```tsx
            <HomeTitle count={count} collapsed={collapsed}
                       fontSize={collapsed ? TITLE_FONT_SIZE_COMPACT : TITLE_FONT_SIZE}/>
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx jest components/__tests__/HomeTitle.test.tsx components/__tests__/HomeHeader.test.tsx`
Expected: PASS, including every pre-existing launch-tint test.

If `useReducedMotion` is mocked in this suite, the reduced-motion branch may need its own test — check whether the file already has one for the launch tint and mirror it if so.

- [ ] **Step 8: Commit**

```bash
git add constants/motion.ts components/HomeTitle.tsx components/HomeHeader.tsx components/__tests__/HomeTitle.test.tsx
git commit -m "feat: the wordmark's tint replays when the header expands

The mechanism was already here. HomeTitle draws the lockup twice and
cross-fades a brand-pink ++ down to muted, and it fired once on a launch timer
and then sat unused for the rest of the app's life.

Hanging it on expansion gets both of the things the device test asked for out
of one animation: the ++ going pink to muted on collapse is the desaturation,
and coming back is the nod. Rate limited, because a flick up and down would
otherwise strobe the only brand colour in the app.

The launch tint is kept. It is the same animation with a different trigger.

Refs #87"
```

---

## Task 6: A setting for the shape

Four shapes need choosing between on a device. The existing on/off toggle stays exactly as it is; a second key picks the shape when it is on.

Added rather than renamed, deliberately. `Settings` has no migration machinery — `get` falls back to `DEFAULTS[key]` when a row is absent — so folding the boolean into a five-valued key would silently switch the shortcut back on for anyone who had turned it off.

**Files:**
- Create: `library/brewShortcut.ts`
- Create: `library/__tests__/brewShortcut.test.ts`
- Modify: `library/Settings.ts`
- Modify: `components/SettingsChoiceRow.tsx`
- Modify: `app/settings.tsx`
- Test: `components/__tests__/SettingsChoiceRow.test.tsx`, `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing guard test**

`Settings.get` type-checks a stored value with `typeof` against the default. Every candidate here is a string, so that check passes anything. The guard is what makes the key safe.

Create `library/__tests__/brewShortcut.test.ts`:

```ts
import {asBrewShortcut, BREW_SHORTCUTS, DEFAULT_BREW_SHORTCUT} from "@/library/brewShortcut";

describe("asBrewShortcut", () => {
    it.each(BREW_SHORTCUTS)("keeps %s", (shape) => {
        expect(asBrewShortcut(shape)).toBe(shape);
    });

    it.each([
        ["a value from a build that had different shapes", "capsule"],
        ["the boolean this replaced being restored into the wrong key", true],
        ["nothing at all", undefined],
        ["a hand-edited row", ""]
    ])("falls back to the default given %s", (_why, value) => {
        // Settings.get only compares typeof against the default, and every
        // candidate here is a string, so nothing upstream rejects a wrong one.
        expect(asBrewShortcut(value)).toBe(DEFAULT_BREW_SHORTCUT);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/__tests__/brewShortcut.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the module**

Create `library/brewShortcut.ts`. It mirrors `library/units.ts`, which is where `asTemperatureUnit` lives and is the pattern for a small typed-value module.

```ts
/**
 * Which shape the BREW shortcut takes on a recipe card.
 *
 * Four of them, because the last one shipped on the strength of a mockup and
 * had five distinct faults in the hand. They are alternatives, never composed,
 * and one of them will be chosen on a device and the rest deleted. Whether
 * there is a shortcut at all is a separate, older setting.
 */
export const BREW_SHORTCUTS = ["edge", "tab", "chip", "swipe"] as const;

export type BrewShortcut = (typeof BREW_SHORTCUTS)[number];

/**
 * The trailing-edge band.
 *
 * Reached by the eye last, after the name and the figures, which is the right
 * order of importance for a shortcut. Its cost is that full bleed stacks the
 * bands into a near-continuous strip down a scrolling list, which is the thing
 * to watch for on a device and the reason `tab` exists.
 */
export const DEFAULT_BREW_SHORTCUT: BrewShortcut = "edge";

export function asBrewShortcut(value: unknown): BrewShortcut {
    return BREW_SHORTCUTS.includes(value as BrewShortcut)
        ? (value as BrewShortcut)
        : DEFAULT_BREW_SHORTCUT;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest library/__tests__/brewShortcut.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the key**

In `library/Settings.ts`, in `DEFAULTS`, directly beneath `showBrewOnRecipeRows` so the two read together:

```ts
    /**
     * Which shape that shortcut takes.
     *
     * A second key rather than five values on the boolean above. `get` falls
     * back to `DEFAULTS[key]` for an absent row and there is no migration
     * machinery here, so folding the two together would quietly switch the
     * shortcut back on for anybody who had turned it off. When one shape wins,
     * this key goes and the boolean stays.
     *
     * Read through `asBrewShortcut`: `get` only compares `typeof` against the
     * default, which cannot tell one string from another.
     */
    brewShortcut: DEFAULT_BREW_SHORTCUT as string,
```

Import `DEFAULT_BREW_SHORTCUT` from `@/library/brewShortcut`.

**Typed as `string`, not as `BrewShortcut`**, on purpose: `SettingValue` is derived from the shape of `DEFAULTS`, and a literal union there would let call sites believe a stored value is already narrowed when `get` has done no such check. Widening here is what forces every reader through the guard. If `Settings.ts` has an existing key that solves this differently, follow that instead and say so.

- [ ] **Step 6: Write the failing test for the stacked row**

Four labels beside a flexible label leave the label about 118 pt, so its description wraps to four lines. `SegmentedControl` sizes to its content and does not flex, so the row needs to put the control on its own line.

Add to `components/__tests__/SettingsChoiceRow.test.tsx`:

```ts
it("puts a wide choice on its own line", async () => {
    await renderWithProviders(
        <SettingsChoiceRow stacked label="Shortcut shape" description="Which one."
                           value="edge" options={FOUR_OPTIONS}
                           onChange={() => undefined}/>
    );
    // Beside a flexible label, four segments squeeze the description to a
    // four-line wrap. Stacking is a layout, not a different control.
    expect(screen.getByTestId("settings-choice-stacked")).toBeTruthy();
});

it("keeps a narrow choice beside its label", async () => {
    await renderWithProviders(
        <SettingsChoiceRow label="Temperature" description="Which one."
                           value="C" options={TWO_OPTIONS}
                           onChange={() => undefined}/>
    );
    expect(screen.queryByTestId("settings-choice-stacked")).toBeNull();
});
```

Define `FOUR_OPTIONS` and `TWO_OPTIONS` at the top of the file. If the file does not exist, create it and cover the unstacked case too, since it is currently untested.

- [ ] **Step 7: Run it and watch it fail, then add the layout**

Run: `npx jest components/__tests__/SettingsChoiceRow.test.tsx`
Expected: FAIL.

In `components/SettingsChoiceRow.tsx`, add to `Props`:

```ts
    /**
     * Put the control beneath the label rather than beside it.
     *
     * For a choice too wide to share a line. `SegmentedControl` sizes to its
     * content and does not flex, so four segments beside a flexible label
     * squeeze the description into a four-line wrap.
     */
    stacked?: boolean;
```

Then branch the return. Keep the existing row exactly as it is for the unstacked case, and add:

```tsx
    if (stacked) {
        return (
            <YStack testID="settings-choice-stacked" gap="$2.5"
                    paddingVertical="$3" paddingHorizontal="$4">
                <YStack gap="$1">
                    <Text fontSize={16} color={palette.text}>{label}</Text>
                    <Text fontSize={13} color={palette.dim}>{description}</Text>
                </YStack>
                <SegmentedControl value={value} options={options} onChange={onChange}
                                  accessibilityLabel={label}/>
            </YStack>
        );
    }
```

`SegmentedControl` is content-sized, so it sits left-aligned under the label rather than stretching. That is deliberate — a segmented control stretched to full width reads as four buttons.

The label and description markup is now written twice. That is acceptable here and preferable to a wrapper component whose only job is to be shared by two layouts of the same row; if you disagree, extract it to a module-scope function in the same file, **not** inside the component body.

- [ ] **Step 8: Add the row to the settings screen**

In `app/settings.tsx`:

```tsx
const BREW_SHORTCUT_OPTIONS = [
    {value: "edge", label: "EDGE"},
    {value: "tab", label: "TAB"},
    {value: "chip", label: "CHIP"},
    {value: "swipe", label: "SWIPE"}
] as const;
```

Read the setting beside the others:

```tsx
    const [brewShortcut, setBrewShortcut] = useSetting("brewShortcut", settings);
```

And render it directly beneath the `Show BREW on recipe rows` toggle, inside the same `SettingsSection`:

```tsx
                    {showBrewOnRecipeRows && (
                        <SettingsChoiceRow
                            stacked
                            label="BREW shortcut shape"
                            description="Four shapes to try on the device. One of them will win and the rest will go."
                            value={brewShortcut}
                            options={BREW_SHORTCUT_OPTIONS}
                            onChange={(value) => setBrewShortcut(asBrewShortcut(value))}/>
                    )}
```

Import `asBrewShortcut` from `@/library/brewShortcut`.

- [ ] **Step 9: Carry it through backup and restore**

Two edits in the same file, following exactly what the neighbouring keys do:

- In `settingsSnapshot()`, add `brewShortcut` to the returned object.
- In the restore path, beside the `showBrewOnRecipeRows` check:

```tsx
        if (typeof incoming.brewShortcut === "string") {
            setBrewShortcut(asBrewShortcut(incoming.brewShortcut));
        }
```

The guard is what makes an unknown value from a newer or older build land on the default rather than on nothing.

You will need to add `brewShortcut` to whatever type `BackupPayload` is. Find it and add it as optional, matching how the other settings are declared there.

- [ ] **Step 10: Test the screen**

Add to `app/__tests__/settings.test.tsx`, matching the file's existing conventions for building a `Settings` with a fake store:

```ts
it("offers the shape only when the shortcut is on", async () => {
    const settings = fakeSettings({showBrewOnRecipeRows: false});
    await renderWithProviders(<SettingsScreen settings={settings}/>);
    // A shape for a shortcut that is not drawn is a dead control.
    expect(screen.queryByText("BREW shortcut shape")).toBeNull();
});

it("offers the shape when the shortcut is on", async () => {
    const settings = fakeSettings({showBrewOnRecipeRows: true});
    await renderWithProviders(<SettingsScreen settings={settings}/>);
    expect(screen.getByText("BREW shortcut shape")).toBeTruthy();
});

it("carries the shape into a backup", async () => {
    const settings = fakeSettings({brewShortcut: "chip"});
    await renderWithProviders(<SettingsScreen settings={settings}/>);
    // A backup that drops a preference silently is worse than one that fails.
    expect(await exportedPayload()).toEqual(
        expect.objectContaining({brewShortcut: "chip"})
    );
});
```

`fakeSettings` and `exportedPayload` are placeholders for whatever this suite already uses — **read the file and use its real helpers.** If it has no way to inspect an exported payload, assert the snapshot another way rather than inventing an export seam, and say so in your report.

- [ ] **Step 11: Run everything**

```bash
npm run typecheck
npm run lint
npm test
```

- [ ] **Step 12: Commit**

```bash
git add library/brewShortcut.ts library/__tests__/brewShortcut.test.ts library/Settings.ts components/SettingsChoiceRow.tsx components/__tests__/SettingsChoiceRow.test.tsx app/settings.tsx app/__tests__/settings.test.tsx
git commit -m "feat: a setting for the BREW shortcut's shape

The last shortcut shipped on the strength of a mockup and had five distinct
faults in the hand, so the replacement is four shapes to be chosen between on
a device rather than one more guess.

A second key rather than five values on the existing boolean. Settings has no
migration machinery and get falls back to the default for an absent row, so
folding the two together would quietly switch the shortcut back on for anybody
who had turned it off. When a shape wins, this key goes and the boolean stays.

Refs #87"
```

---

## Task 7: Three shapes for BREW

`BrewCapsule` goes. Its five faults are catalogued in the spec: a radius half a point off the card's and derived by a rule that only coincides at one width, a collision with the `TEA` marker, a label that cannot be centred in a 21 pt column, a 21 pt target, and a shared edge with the swipe tray.

The last of those is **accepted**, not fixed. `BrewCapsule`'s own comment predicted it and asked for a hardware check; the hardware said no, but a tap and a horizontal drag are distinguishable by intent and every alternative costs more.

`swipe` is not built here. It is a tile in the swipe tray rather than card chrome, and it is Task 9.

**Files:**
- Create: `components/BrewShortcut.tsx`
- Create: `components/__tests__/BrewShortcut.test.tsx`
- Delete: `components/BrewCapsule.tsx`, `components/__tests__/BrewCapsule.test.tsx`

- [ ] **Step 1: Read what is being replaced**

```bash
cat components/BrewCapsule.tsx
cat components/__tests__/BrewCapsule.test.tsx
```

Every assertion in that test file is either about a fault being removed or about behaviour that must survive. **Nothing is dropped.** Go through it line by line and carry each assertion into the new file, adapted. If you conclude one genuinely no longer has meaning, say which and why in your report rather than deleting it quietly.

- [ ] **Step 2: Write the failing tests**

Create `components/__tests__/BrewShortcut.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import BrewShortcut, {SHORTCUT_INSET} from "@/components/BrewShortcut";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = "#FF8800";

describe("BrewShortcut", () => {
    it.each(["edge", "tab", "chip"] as const)("says BREW as a %s", async (variant) => {
        await renderWithProviders(
            <BrewShortcut variant={variant} accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        // The three differ in shape alone, so the word and the colours are
        // the invariant across all of them.
        expect(screen.getByLabelText("Brew this recipe")).toBeTruthy();
    });

    it("gives the tab a radius concentric with the card's", async () => {
        await renderWithProviders(
            <BrewShortcut variant="tab" accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        // 16 - 4. Two curves that nearly agree read as a sticker; one curve
        // inside another sharing a centre reads as a cut-out. The old capsule
        // used width/2, which was 10.5 and right only by coincidence.
        expect(screen.getByTestId("brew-shortcut").props.style)
            .toEqual(expect.objectContaining({borderRadius: 12}));
    });

    it("gives the edge band no radius of its own", async () => {
        await renderWithProviders(
            <BrewShortcut variant="edge" accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        // It bleeds to the card's boundary and the card's overflow: hidden
        // clips it, so there is no second radius to get wrong.
        expect(screen.getByTestId("brew-shortcut").props.style.borderRadius)
            .toBeUndefined();
    });

    it("reserves room on the card's trailing edge for the bands", () => {
        // Fault 2 was the capsule landing on the TEA marker. Fixed by the card
        // knowing what each shape occupies, not by picking a shape that misses.
        expect(SHORTCUT_INSET.edge).toBeGreaterThan(0);
        expect(SHORTCUT_INSET.tab).toBeGreaterThan(SHORTCUT_INSET.edge);
        // The chip is at the bottom, where nothing sits unless the card is
        // editing, and the card hides the shortcut while it is.
        expect(SHORTCUT_INSET.chip).toBe(0);
    });

    it("reaches a full touch target", async () => {
        await renderWithProviders(
            <BrewShortcut variant="edge" accent={ACCENT} ink={palette.base}
                          onPress={() => undefined}/>
        );
        const slop = screen.getByTestId("brew-shortcut").props.hitSlop;
        // 34 wide plus 10 of slop. left stays 0: a left slop steals presses
        // from the card body, which is the bigger and more common target.
        expect(slop.left).toBe(0);
        expect(34 + slop.right).toBeGreaterThanOrEqual(44);
    });
});
```

Carry the old file's press test across too, in whatever form it took.

- [ ] **Step 3: Run them and watch them fail**

Run: `npx jest components/__tests__/BrewShortcut.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 4: Write the component**

Create `components/BrewShortcut.tsx`:

```tsx
import React from "react";
import {Pressable, type ViewStyle} from "react-native";

import DotMatrixText from "@/components/DotMatrixText";

/** The shapes the card itself draws. `swipe` is a tile in the tray, not chrome. */
export type CardShortcut = "edge" | "tab" | "chip";

type Props = {
    variant: CardShortcut;
    /** The card's accent, used for the letter ink. */
    accent: string;
    /** The card's own ink, so the shortcut reads as cut from the card. */
    ink: string;
    onPress: () => void;
};

/** Wide enough to centre four stacked letters, which 21 was not. */
const BAND_WIDTH = 34;
const TAB_INSET = 4;
/** `RecipeCard`'s `borderRadius="$8"`. */
const CARD_RADIUS = 16;
/**
 * Concentric with the card, rather than derived from the tab's own width.
 *
 * A shape inset by n inside a radius r is concentric at r - n. The capsule this
 * replaces used `width / 2`, which gave 10.5 against the card's 16 — half a
 * point off, and arrived at by a rule that only coincides with the right answer
 * at one width.
 */
const TAB_RADIUS = CARD_RADIUS - TAB_INSET;
const CHIP_WIDTH = 78;
const CHIP_HEIGHT = 34;
/** The chip's inner corner. A fold, so it is smaller than the card's own. */
const CHIP_FOLD = 14;
/** The card's own padding, which the shortcut's reservation is measured against. */
const CARD_PADDING = 14;

/**
 * How much of the card's trailing edge each shape occupies.
 *
 * The card adds this to its title row's right padding. Fault 2 of the shipped
 * capsule was landing on the `TEA` marker, and it is fixed by the card knowing
 * what the shortcut takes rather than by choosing a shape that happens to miss.
 * The pour profile and the stats row are not inset, because neither reaches
 * that edge.
 */
export const SHORTCUT_INSET: Record<CardShortcut, number> = {
    edge: BAND_WIDTH - CARD_PADDING,
    tab:  BAND_WIDTH + TAB_INSET - CARD_PADDING,
    chip: 0
};

/**
 * Slop, not a wider shape.
 *
 * `left` is deliberately 0, for the reason the capsule's comment gave: a left
 * slop steals presses from the card body behind it, and the card is the bigger
 * and more common target. The bands are 34 across, so 10 to the right reaches
 * the HIG's 44; they already run the card's height. The chip is 34 tall and
 * takes its 10 vertically instead.
 */
const BAND_SLOP = {top: 8, bottom: 8, left: 0, right: 10};
const CHIP_SLOP = {top: 10, bottom: 0, left: 10, right: 0};

const SHAPES: Record<CardShortcut, ViewStyle> = {
    edge: {right: 0, top: 0, bottom: 0, width: BAND_WIDTH},
    tab:  {
        right:        TAB_INSET,
        top:          TAB_INSET,
        bottom:       TAB_INSET,
        width:        BAND_WIDTH,
        borderRadius: TAB_RADIUS
    },
    chip: {
        right:                   0,
        bottom:                  0,
        width:                   CHIP_WIDTH,
        height:                  CHIP_HEIGHT,
        borderTopLeftRadius:     CHIP_FOLD,
        borderBottomRightRadius: CARD_RADIUS
    }
};

/**
 * BREW, on a recipe card, in one of three shapes.
 *
 * Three rather than one because the shape that shipped was chosen from a mockup
 * and had five faults in the hand. They are alternatives, never composed, and
 * they live in one file precisely so they can be read against each other while
 * the choice is open. When one wins the other two are deleted.
 *
 * The bands stack their letters, one per line, rather than rotating them:
 * rotated text at this size is unreadable, and four stacked letters stay a
 * shape you recognise without reading. The chip is wide enough to say the word
 * outright, which is most of why it is worth trying.
 *
 * Every shape shares the card's right edge with the swipe tray. That was
 * predicted before the capsule shipped and confirmed on hardware, and it is
 * accepted: a tap and a horizontal drag are distinguishable by intent, and
 * every alternative costs more than the collision does.
 */
export default function BrewShortcut({variant, accent, ink, onPress}: Props) {
    const horizontal = variant === "chip";

    return (
        <Pressable
            testID="brew-shortcut"
            accessibilityRole="button"
            accessibilityLabel="Brew this recipe"
            onPress={onPress}
            hitSlop={horizontal ? CHIP_SLOP : BAND_SLOP}
            style={{
                position:        "absolute",
                backgroundColor: ink,
                alignItems:      "center",
                justifyContent:  "center",
                ...SHAPES[variant]
            }}
        >
            {horizontal ? (
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                               color={accent}>
                    BREW
                </DotMatrixText>
            ) : (
                ["B", "R", "E", "W"].map((letter) => (
                    <DotMatrixText key={letter} fontSize={9} weight="bold" color={accent}>
                        {letter}
                    </DotMatrixText>
                ))
            )}
        </Pressable>
    );
}
```

`CARD_RADIUS` and `CARD_PADDING` restate values that `RecipeCard` expresses as Tamagui tokens (`$8`, `$3.5`). They are duplicated rather than imported because the tokens are not numbers at this call site. **Verify both against the running theme rather than trusting this plan**: `$8` should be 16 and `$3.5` should be 14. If either differs, use the real value and report it.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest components/__tests__/BrewShortcut.test.tsx`
Expected: PASS.

- [ ] **Step 6: Delete the capsule**

```bash
git rm components/BrewCapsule.tsx components/__tests__/BrewCapsule.test.tsx
```

Run: `npm run typecheck`
Expected: FAIL, naming `components/RecipeCard.tsx`. That is Task 8. Confirm nothing else imports it.

- [ ] **Step 7: Commit**

Note that this commit leaves the tree not typechecking, which is why it says so.

```bash
git add components/BrewShortcut.tsx components/__tests__/BrewShortcut.test.tsx
git commit -m "feat: three shapes for the BREW shortcut

The capsule had five faults in the hand: a radius half a point off the card's
and derived by a rule that only coincides at one width, a collision with the
TEA marker, a label that cannot be centred in a 21pt column, a 21pt target,
and a shared edge with the swipe tray.

Four of the five are fixed here. The fifth is accepted: the capsule's own
comment predicted the swipe collision and asked for a hardware check, the
hardware said no, and every alternative costs more than the collision does.

Three shapes rather than one, because choosing from a mockup is what produced
the first five faults. They live in one file so they can be read against each
other, and two of them will be deleted.

Typechecking is broken until RecipeCard stops importing BrewCapsule.

Refs #87"
```

---

## Task 8: The card draws the shape it is told

`RecipeCard` takes `showBrew: boolean` and renders `BrewCapsule`. It becomes a variant, the title row reserves the space the variant occupies, and the shortcut disappears while the card is editing.

**Files:**
- Modify: `components/RecipeCard.tsx`
- Test: `components/__tests__/RecipeCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `components/__tests__/RecipeCard.test.tsx`, following the file's existing helper for building a `Recipe`:

```tsx
describe("the BREW shortcut", () => {
    it.each(["edge", "tab", "chip"] as const)("draws a %s", async (variant) => {
        await renderWithProviders(
            <RecipeCard recipe={aRecipe()} onPress={() => undefined}
                        brewShortcut={variant} onBrew={() => undefined}/>
        );
        expect(screen.getByTestId("brew-shortcut")).toBeTruthy();
    });

    it("draws nothing for swipe, which is the tray's job", async () => {
        await renderWithProviders(
            <RecipeCard recipe={aRecipe()} onPress={() => undefined}
                        brewShortcut="swipe" onBrew={() => undefined}/>
        );
        expect(screen.queryByTestId("brew-shortcut")).toBeNull();
    });

    it("draws nothing when there is no shortcut at all", async () => {
        await renderWithProviders(
            <RecipeCard recipe={aRecipe()} onPress={() => undefined}/>
        );
        expect(screen.queryByTestId("brew-shortcut")).toBeNull();
    });

    it("stands aside while the card is editing", async () => {
        await renderWithProviders(
            <RecipeCard recipe={aRecipe()} onPress={() => undefined} editing
                        brewShortcut="chip" onBrew={() => undefined}
                        onDuplicate={() => undefined} onDelete={() => undefined}/>
        );
        // Duplicate and delete sit in the card's bottom right, which is
        // exactly where the chip lands, and editing is the one mode where
        // brewing is plainly not what the user came to do.
        expect(screen.queryByTestId("brew-shortcut")).toBeNull();
        expect(screen.getByTestId("recipe-card-delete")).toBeTruthy();
    });

    it("keeps the marker clear of the band", async () => {
        await renderWithProviders(
            <RecipeCard recipe={aTeaRecipe()} onPress={() => undefined}
                        brewShortcut="tab" onBrew={() => undefined}/>
        );
        // The shipped capsule sat on top of the TEA marker. The card reserves
        // the trailing edge rather than hoping the shape misses it.
        expect(screen.getByTestId("recipe-card-title-row").props.style)
            .toEqual(expect.objectContaining({paddingRight: SHORTCUT_INSET.tab}));
    });
});
```

`aTeaRecipe()` must be a recipe whose `cupType` is `CUP_TYPE.TEA`, so the marker renders. The file almost certainly already builds one for its marker tests — **use that helper rather than adding another.**

Import `SHORTCUT_INSET` from `@/components/BrewShortcut`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`
Expected: FAIL. Existing tests in this file that pass `showBrew` will also fail to typecheck — that is expected and they are updated in the next step.

- [ ] **Step 3: Change the props**

In `components/RecipeCard.tsx`, replace the `showBrew` prop with:

```ts
    /**
     * Which shape the BREW shortcut takes, or undefined for none.
     *
     * `swipe` draws nothing here: it is a tile in the swipe tray rather than
     * anything on the card.
     */
    brewShortcut?: BrewShortcutSetting;
```

The setting's type and the component share the name `BrewShortcut`, so alias one of them:

```ts
import BrewShortcut, {type CardShortcut, SHORTCUT_INSET} from "@/components/BrewShortcut";
import type {BrewShortcut as BrewShortcutSetting} from "@/library/brewShortcut";
```

Alias rather than rename either export. The component is `BrewShortcut` because that is what it is, and the setting's type is `BrewShortcut` because that is what it holds.

- [ ] **Step 4: Render it**

Replace the `showBrew && onBrew !== undefined` block:

```tsx
            {shortcut !== null && onBrew !== undefined && (
                <BrewShortcut variant={shortcut} accent={accent}
                              ink={onAccent.text} onPress={onBrew}/>
            )}
```

and compute `shortcut` at the top of the component body:

```tsx
    /**
     * The shape this card actually draws, or null for none.
     *
     * `swipe` is the tray's tile and `editing` gives the card's bottom right
     * over to duplicate and delete, which every shape would land on.
     */
    const shortcut: CardShortcut | null =
        editing || brewShortcut === undefined || brewShortcut === "swipe"
            ? null
            : brewShortcut;
```

- [ ] **Step 5: Reserve the space**

Give the title row a `testID` and the reservation. It is the `XStack` holding the name, the marker and the will-not-write icon:

```tsx
            <XStack testID="recipe-card-title-row"
                    justifyContent="space-between" alignItems="flex-start" gap="$2"
                    paddingRight={shortcut === null ? 0 : SHORTCUT_INSET[shortcut]}>
```

Only this row. The pour profile bleeds past the card's edge by design and the stats row is left-aligned, so neither reaches the trailing edge.

- [ ] **Step 6: Fix the existing tests that passed `showBrew`**

Run: `grep -n "showBrew" components/__tests__/RecipeCard.test.tsx`

Change each `showBrew` to `brewShortcut="edge"`. **Do not delete any of them** — they assert the shortcut appears, calls back and is labelled, all of which still hold.

- [ ] **Step 7: Run everything for this file**

Run: `npx jest components/__tests__/RecipeCard.test.tsx`
Expected: PASS.

Run: `npm run typecheck`
Expected: FAIL, naming `components/SwipeableRecipeRow.tsx` and `app/index.tsx`. Those are Tasks 9 and 10.

- [ ] **Step 8: Commit**

```bash
git add components/RecipeCard.tsx components/__tests__/RecipeCard.test.tsx
git commit -m "feat: the card reserves the space its shortcut occupies

The shipped capsule was positioned absolutely against the card's right edge
while the TEA marker sat in normal flow at the same edge, knowing nothing
about it, so on a tea recipe the capsule sat on the T. Choosing a shape that
happens to miss would leave the next shape to rediscover it, so each shape
declares what it takes and the title row takes it as padding.

The shortcut also stands aside while the card is editing. The bottom right is
empty except in that mode, where it holds duplicate and delete, and editing is
the one mode where brewing is plainly not what the user came to do.

Typechecking is broken until SwipeableRecipeRow and app/index.tsx follow.

Refs #87"
```

---

## Task 9: BREW as a swipe tile

The fourth shape. No card chrome at all: BREW joins duplicate and delete in the swipe tray, in the recipe's accent so it reads as the one non-destructive tile among two neutrals.

**Files:**
- Modify: `components/SwipeableRecipeRow.tsx`
- Test: `components/__tests__/SwipeableRecipeRow.test.tsx`

- [ ] **Step 1: Read the row**

```bash
cat components/SwipeableRecipeRow.tsx
```

Note `TILE_WIDTH`, `TILE_GLYPH_SIZE`, the `Tile` component and `renderRightActions`. There is no `brew` glyph in `constants/dotIcons.ts` — check with `grep -n '"brew"\|brew:' constants/dotIcons.ts`. **Do not draw one.** The tile says the word, in Doto, the way the card's shortcut does; a new glyph is a design decision this plan has not made and the icon set's own comment says to keep the set small.

- [ ] **Step 2: Write the failing tests**

```tsx
it("offers BREW in the tray when that is the chosen shape", async () => {
    await renderWithProviders(
        <SwipeableRecipeRow recipe={aRecipe()} onPress={() => undefined}
                            onDelete={() => undefined} onDuplicate={() => undefined}
                            brewShortcut="swipe" onBrew={() => undefined}/>
    );
    expect(screen.getByTestId("recipe-row-brew")).toBeTruthy();
});

it.each(["edge", "tab", "chip"] as const)("keeps the tray to two tiles for %s", async (shape) => {
    await renderWithProviders(
        <SwipeableRecipeRow recipe={aRecipe()} onPress={() => undefined}
                            onDelete={() => undefined} onDuplicate={() => undefined}
                            brewShortcut={shape} onBrew={() => undefined}/>
    );
    // The card is drawing it. Two places to brew one recipe is one too many.
    expect(screen.queryByTestId("recipe-row-brew")).toBeNull();
});

it("brews when the tile is pressed", async () => {
    const onBrew = jest.fn();
    await renderWithProviders(
        <SwipeableRecipeRow recipe={aRecipe()} onPress={() => undefined}
                            onDelete={() => undefined} onDuplicate={() => undefined}
                            brewShortcut="swipe" onBrew={onBrew}/>
    );
    await fireEvent.press(screen.getByTestId("recipe-row-brew"));
    expect(onBrew).toHaveBeenCalled();
});
```

Follow the file's existing tests for how they reach the tray — the tiles are rendered by `renderRightActions`, which a gesture-handler `Swipeable` may not call until it is opened. **If the existing tests have a helper for opening the row, use it.** If the tray turns out not to be reachable in tests at all, say so plainly rather than asserting something weaker that looks equivalent.

- [ ] **Step 3: Run them and watch them fail**

Run: `npx jest components/__tests__/SwipeableRecipeRow.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Change the props and add the tile**

Replace `showBrew?: boolean` with:

```ts
    /**
     * Forwarded to the card, except for `swipe`, which the tray draws itself.
     */
    brewShortcut?: BrewShortcut;
```

In `renderRightActions`, add the BREW tile **first**, so it is the nearest to the thumb and the destructive ones stay furthest:

```tsx
                {brewShortcut === "swipe" && onBrew !== undefined && (
                    <Tile label="Brew this recipe" testID="recipe-row-brew"
                          tone={accentFor(recipe)}
                          onPress={() => {
                              close();
                              onBrew();
                          }}/>
                )}
```

Match the existing tiles' closing behaviour exactly — read how duplicate and delete close the row and do the same thing, whatever it is called.

`Tile` currently takes an `icon`. It needs to take a word instead, for this tile only. Give it an optional `word?: string` that renders a `DotMatrixText` in place of the `DotIcon`, and assert in the type or in a comment that exactly one of `icon` and `word` is given. Do not add a `brew` glyph to `constants/dotIcons.ts`.

Find how the accent is derived for a recipe — `RecipeCard` computes it; there is very likely a shared helper. Use the same one rather than a second derivation.

- [ ] **Step 5: Forward the rest**

Replace the forwarding of `showBrew` to `RecipeCard` with `brewShortcut={brewShortcut}`. The card already ignores `swipe`.

- [ ] **Step 6: Run and commit**

```bash
npx jest components/__tests__/SwipeableRecipeRow.test.tsx
```

```bash
git add components/SwipeableRecipeRow.tsx components/__tests__/SwipeableRecipeRow.test.tsx
git commit -m "feat: BREW as a swipe tile

The fourth candidate shape, and the only one that costs the card nothing: no
chrome, no reserved edge, no collision with the marker or with the swipe tray,
because it is the swipe tray.

In the recipe's accent so it reads as the one non-destructive tile among two
neutrals, and nearest the thumb so the destructive ones stay furthest.

It says the word rather than taking a glyph. The icon set's own comment asks
that it be kept small, and choosing a bitmap for BREW is a design decision
nobody has made.

Refs #87"
```

---

## Task 10: Read the setting

The last wiring. `app/index.tsx` reads `showBrewOnRecipeRows`, and now the shape too.

**Files:**
- Modify: `app/index.tsx`
- Test: `app/__tests__/index.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("draws the shape the settings chose", async () => {
    const settings = fakeSettings({
        showBrewOnRecipeRows: true,
        brewShortcut:         "chip",
        machineDeviceId:      "AA:BB"
    });
    await renderWithProviders(<HomeScreen settings={settings}/>);
    expect(await screen.findByTestId("brew-shortcut")).toBeTruthy();
});

it("draws no shortcut when nobody here owns a machine", async () => {
    const settings = fakeSettings({
        showBrewOnRecipeRows: true,
        brewShortcut:         "chip",
        machineDeviceId:      ""
    });
    await renderWithProviders(<HomeScreen settings={settings}/>);
    // A dead BREW button on every recipe would be worse than no button.
    expect(screen.queryByTestId("brew-shortcut")).toBeNull();
});
```

`fakeSettings` is a placeholder — **read the file and use its real helper.** The suite must also have at least one recipe in the library for a card to exist; follow how the existing tests seed it.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest app/__tests__/index.test.tsx -t "shape"`
Expected: FAIL.

- [ ] **Step 3: Wire it**

Beside the existing read at line 77:

```tsx
    const [shortcutShape] = useSetting("brewShortcut", settings);
```

Replace `const showBrew = showBrewRows && remembered !== "";` with:

```tsx
    /**
     * Undefined rather than a shape when there is nothing to brew on.
     *
     * A dead BREW button on every recipe would be worse than no button, which
     * is the same reason the editor's action bar checks `machineDeviceId`.
     */
    const brewShortcut = showBrewRows && remembered !== ""
        ? asBrewShortcut(shortcutShape)
        : undefined;
```

Import `asBrewShortcut` from `@/library/brewShortcut`. Then change the forwarding at line 504 from `showBrew={showBrew}` to `brewShortcut={brewShortcut}`.

- [ ] **Step 4: Run everything**

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Expected: typecheck and lint clean, all tests green, expo-doctor 21/21. Report the test total.

- [ ] **Step 5: Check nothing still refers to the old prop**

```bash
grep -rn "showBrew\b\|BrewCapsule" --include=*.ts --include=*.tsx .
```

Expected: only `showBrewOnRecipeRows`, which is a different and surviving key. Anything else is a leftover.

- [ ] **Step 6: Commit**

```bash
git add app/index.tsx app/__tests__/index.test.tsx
git commit -m "feat: the home screen draws the chosen shortcut shape

Last of the wiring. The shape is only consulted when the shortcut is on and a
machine is remembered, because a dead BREW button on every recipe would be
worse than no button.

Refs #87"
```

---

## Finishing

- [ ] **Update the issue**

Tick these on #87: the BREW pill's design, the connection dot's icon and colour, and the wordmark's desaturation and flash. The popover bug is already ticked.

Leave the brew-screen items alone. They belong to the other plan.

- [ ] **Device test**

None of this can be judged in a simulator, and two things in particular cannot be judged anywhere else:

1. **Scroll the library with each of the four shapes.** `edge` is the default and its known cost is that full-bleed bands stack into a near-continuous dark strip down the right of the screen. That is the single thing the setting exists to settle. Try `tab` immediately after, which keeps roughly 8 pt of breath between rows.
2. **Scroll up and down quickly, repeatedly.** The wordmark's pink should read as a nod and never as a strobe. If `wordmarkReplayFloor` at 2000 ms is wrong it will be obvious within a few seconds, and it is one number in `constants/motion.ts`.

Also check: the `TEA` marker is clear of every shape; the diamond is legible at 20 pt and its three states are distinguishable at arm's length; the desaturation on collapse is perceptible without being a dimming; and a swipe on a card with `edge` or `tab` still opens the tray rather than firing BREW.

- [ ] **Delete the losers**

Once a shape has won, delete the other three, the `brewShortcut` key, `library/brewShortcut.ts`, the settings row and the `stacked` layout if nothing else uses it. Keep `showBrewOnRecipeRows`.

This is not optional cleanup. Four shapes in the tree is a trial, and a trial that is never concluded is just four shapes in the tree.

## Out of scope

- Anything on the brew screen. That is `docs/superpowers/plans/2026-09-04-brew-screen-rebuild.md`.
- Issue #86, the brew record not snapshotting its plan.
- `MachinePopover`, beyond the mount-point fix that has already landed.
- Any new dot-matrix glyph beyond the three link states. The icon set's comment asks that it be kept small.
