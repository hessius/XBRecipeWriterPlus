# Quick Edit UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four problems the user found on device after package 6 shipped: the home
shortcut stutters, the split BREW button's tap boundary is invisible, the editor shows two
BREW buttons when the panel is open, and only the temperature knob shows what the recipe says.

**Architecture:** Four independent changes. The tray action is deferred until the tray's own
close animation has finished, so the panel's mount no longer lands on top of it. The split
button moves out of `app/editRecipe.tsx` into its own component so it can be tested, gains a
visible hairline, and its arrow becomes a toggle that reports its state. The panel in the
editor loses its own BREW: the action bar keeps the one BREW on screen and brews whatever the
panel currently says, which means the accessibility guard has to stop hiding the action bar.
The panel's existing `detail` slot, used today only by TEMP OFFSET, is extended to the other
three knobs, shown only when that knob has been moved.

**Tech Stack:** React Native, Expo SDK 57, Tamagui, react-native-gesture-handler
(`ReanimatedSwipeable`), `@testing-library/react-native` v14, jest.

---

## Background an implementer needs

**What quick edit is.** It adjusts a recipe for one brew without saving it. Dose, ratio and
grind are absolute values; temperature is a signed offset applied to every stage. The panel is
`components/QuickEditPanel.tsx` and is hosted twice: in a sheet on the home screen
(`app/index.tsx`, `HomeQuickEditSheet`) and as a layer above the action bar in the editor
(`app/editRecipe.tsx`, `QuickEditLayer`).

**The invariant the panel turns on.** `updateAdjustment` in `QuickEditPanel.tsx` **deletes** a
key when a knob returns to its saved value. So `adjustments.dose !== undefined` means exactly
"the dose has been adjusted". Task 4 depends on that; do not weaken it.

**Tea.** `quickEditBounds` returns `null` for `ratio` and `grind` on a tea recipe, because the
machine sends neither for tea. The panel reads the null rather than calling `isTea()` itself.
Keep it that way.

**Testing notes that will cost you an hour if you skip them.**
- `render`, `fireEvent` and `renderHook` from `@testing-library/react-native` v14 are
  **asynchronous**. Forget the `await` and `screen` stays empty and the test passes for the
  wrong reason.
- Always render via `renderWithProviders` from `test-utils/render.tsx`.
- The suite runs twice, as a `ios` and an `android` jest project. Do not assume a platform.
- RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`. Assert on text, test IDs
  and accessible labels. Where a test must assert a style (task 2 does), reach the host
  component by test ID and flatten `props.style` with `StyleSheet.flatten`.
- Run a single file with `npx jest --runTestsByPath path/to/file`, add `-t "name"` for one test.
  `npm test` emits about 23 MB of output; capture only the final summary.

---

## File Structure

| File | Change | Responsible for |
|---|---|---|
| `constants/motion.ts` | modify | gains `TRAY_ACTION_FALLBACK`, the safety net for task 1 |
| `components/SwipeableRecipeRow.tsx` | modify | defers the TUNE tile until the tray has closed |
| `components/__tests__/SwipeableRecipeRow.test.tsx` | modify | mock gains a close-end trigger; two new tests |
| `components/__tests__/SwipeableRecipeRow.bounce.test.tsx` | modify | same mock change, for consistency |
| `components/__tests__/DrawerHintReducedMotion.test.tsx` | modify | same mock change, for consistency |
| `components/SplitBrewButton.tsx` | **create** | the split BREW/arrow control, extracted and testable |
| `components/__tests__/SplitBrewButton.test.tsx` | **create** | divider contrast, arrow state, disabled BREW |
| `app/editRecipe.tsx` | modify | uses the extracted button; one BREW; the a11y wrapper |
| `app/__tests__/editRecipe.test.tsx` | modify | one BREW on screen, the toggle, the disabled bar |
| `library/quickEdit.ts` | modify | `describeGrind`, `describeKnobBaseline` |
| `library/__tests__/quickEdit.test.ts` | modify | baseline strings, grinder off, the font-scale rule |
| `components/QuickEditPanel.tsx` | modify | baseline details on dose, ratio and grind |
| `components/__tests__/QuickEditPanel.test.tsx` | modify | shown only when adjusted |

---

## Task 1: The home shortcut stutters

**The diagnosis.** `components/SwipeableRecipeRow.tsx` calls `swipeableRef.current?.close()`
and then `onQuickEdit()` **on the same tick**. The tray's close animation and the mount of the
whole panel (four `Stepper`s and several `DotMatrixText` runs, each of which draws a grid of
dots) therefore land together, and the mount blocks the thread the close is being driven from.
The editor does not stutter because nothing is animating out there.

`ReanimatedSwipeable` fires `onSwipeableClose` when the close animation **ends**, including for
a programmatic `close()` (`dispatchEndEvents` in
`node_modules/react-native-gesture-handler/lib/module/components/ReanimatedSwipeable/ReanimatedSwipeable.js`).
That is the clock to use, rather than guessing a duration.

**Only the TUNE tile defers.** BREW, WRITE, SHARE, DELETE, DUPLICATE and STAR stay immediate.
Two reasons: the user reported TUNE alone, and a deferred action is an action that can be lost
if the row unmounts first, which for a delete or a star would be a lost user intent. TUNE opens
a surface over a row that stays put, which is the case the deferral is for.

A safety net timer runs the pending action anyway if `onSwipeableClose` never arrives, so the
tile can never become a dead button.

**Files:**
- Modify: `constants/motion.ts`
- Modify: `components/SwipeableRecipeRow.tsx:347-357` (the TUNE tile) and the `Swipeable`
  element at `:388-413`
- Test: `components/__tests__/SwipeableRecipeRow.test.tsx`
- Modify (mock only): `components/__tests__/SwipeableRecipeRow.bounce.test.tsx`,
  `components/__tests__/DrawerHintReducedMotion.test.tsx`

- [ ] **Step 1: Add the constant**

In `constants/motion.ts`, directly after the `BOUNCE_OPEN_DELAY` / `BOUNCE_CLOSE_DELAY` block:

```ts
/**
 * How long a tray action waits for the tray's own close animation before it
 * runs anyway.
 *
 * The tray reports its own close, so this is a safety net rather than the
 * clock: if that report never arrives the tile must still act, because a
 * control that silently does nothing is worse than one that acts a frame late.
 * Comfortably longer than the spring the tray closes with.
 */
export const TRAY_ACTION_FALLBACK = 400;
```

- [ ] **Step 2: Teach the three row mocks to report a finished close**

In **each** of `components/__tests__/SwipeableRecipeRow.test.tsx`,
`components/__tests__/SwipeableRecipeRow.bounce.test.tsx` and
`components/__tests__/DrawerHintReducedMotion.test.tsx`, the `jest.mock` of
`react-native-gesture-handler/ReanimatedSwipeable` declares a props type and renders a
`simulate-drag` pressable. Add `onSwipeableClose` to the props type and a second pressable
beside it:

```tsx
            onSwipeableOpenStartDrag?: (direction: "left" | "right") => void;
            onSwipeableClose?: (direction: "left" | "right") => void;
```

```tsx
                    <MockPressable testID="simulate-drag"
                                   onPress={() => props.onSwipeableOpenStartDrag?.("left")}/>
                    {/* The real Swipeable reports a close when the animation
                        ends, which is a frame the renderer has no notion of.
                        The test drives that moment itself. */}
                    <MockPressable testID="simulate-close-end"
                                   onPress={() => props.onSwipeableClose?.("left")}/>
```

- [ ] **Step 3: Write the failing tests**

In `components/__tests__/SwipeableRecipeRow.test.tsx`, beside the other tray tile tests. Match
the file's existing render helper and recipe fixture rather than inventing new ones; the row
must be given an `onQuickEdit` prop for the TUNE tile to appear.

```tsx
    it("waits for the tray to close before opening quick edit", async () => {
        const onQuickEdit = jest.fn();
        await renderRow({onQuickEdit});

        await fireEvent.press(screen.getByTestId("recipe-row-quick-edit"));
        expect(mockClose).toHaveBeenCalled();
        expect(onQuickEdit).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByTestId("simulate-close-end"));
        expect(onQuickEdit).toHaveBeenCalledTimes(1);
    });

    it("opens quick edit anyway if the tray never reports its close", async () => {
        jest.useFakeTimers();
        try {
            const onQuickEdit = jest.fn();
            await renderRow({onQuickEdit});

            await fireEvent.press(screen.getByTestId("recipe-row-quick-edit"));
            expect(onQuickEdit).not.toHaveBeenCalled();

            act(() => {
                jest.advanceTimersByTime(TRAY_ACTION_FALLBACK);
            });
            expect(onQuickEdit).toHaveBeenCalledTimes(1);

            // A late report must not open it a second time.
            await fireEvent.press(screen.getByTestId("simulate-close-end"));
            expect(onQuickEdit).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
```

Import `TRAY_ACTION_FALLBACK` from `@/constants/motion` alongside the existing `BOUNCE_*`
imports. `act` is already imported in that file.

- [ ] **Step 4: Run them and watch them fail**

Run: `npx jest --runTestsByPath components/__tests__/SwipeableRecipeRow.test.tsx -t "quick edit"`
Expected: FAIL. The first says `onQuickEdit` was called once when zero was expected, because
today the tile fires on the same tick.

- [ ] **Step 5: Implement**

In `components/SwipeableRecipeRow.tsx`, add beside the existing refs (near `swipeableRef` at
`:187`):

```tsx
    /**
     * An action waiting for the tray to finish closing.
     *
     * Quick edit opens a panel over a row that stays on screen, so its mount
     * used to land on top of the tray's own close animation and both stuttered.
     * The tray reports when it has actually closed, which is a better clock
     * than any duration guessed here. The timer is only a safety net: if that
     * report never arrives the tile must still act.
     *
     * Deliberately not applied to the other tiles. A deferred action is one
     * that can be lost if the row unmounts first, which for a delete or a star
     * would lose what the user asked for.
     */
    const afterClose = useRef<(() => void) | null>(null);
    const afterCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (afterCloseTimer.current !== null) clearTimeout(afterCloseTimer.current);
    }, []);

    function runAfterClose() {
        if (afterCloseTimer.current !== null) {
            clearTimeout(afterCloseTimer.current);
            afterCloseTimer.current = null;
        }
        const pending = afterClose.current;
        afterClose.current = null;
        pending?.();
    }

    function closeThen(action: () => void) {
        afterClose.current = action;
        afterCloseTimer.current = setTimeout(runAfterClose, TRAY_ACTION_FALLBACK);
        swipeableRef.current?.close();
    }
```

Import `TRAY_ACTION_FALLBACK` from `@/constants/motion` beside the existing `BOUNCE_*` imports.
`useEffect` and `useRef` are already imported.

Change the TUNE tile's handler only:

```tsx
                          onPress={() => closeThen(onQuickEdit)}/>
```

Add the report to the `Swipeable` element, beside `onSwipeableOpenStartDrag`:

```tsx
                onSwipeableClose={runAfterClose}
```

- [ ] **Step 6: Run the tests**

Run: `npx jest --runTestsByPath components/__tests__/SwipeableRecipeRow.test.tsx`
Expected: PASS, whole file, both projects.

Then the two files whose mock you touched:

Run: `npx jest --runTestsByPath components/__tests__/SwipeableRecipeRow.bounce.test.tsx components/__tests__/DrawerHintReducedMotion.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add constants/motion.ts components/SwipeableRecipeRow.tsx components/__tests__
git commit -m "Quick edit: open the panel after the tray has closed"
```

---

## Task 2: The split button's tap boundary is invisible

**The diagnosis.** `SplitBrewButton` in `app/editRecipe.tsx:693-729` already draws
`borderLeftWidth={1} borderLeftColor={accent}` between its halves. When BREW is enabled **both
halves are filled with `accent`**, so the hairline is accent on accent and cannot be seen. The
fix is contrast, not a new element: the divider takes `palette.base`, which is the same ink the
labels already use on an accent fill, so it reads as part of the control rather than as a new
colour.

The control moves into its own file at the same time, because a component defined inside a
screen cannot be tested, and task 3 is about to give it a second state.

**Files:**
- Create: `components/SplitBrewButton.tsx`
- Modify: `app/editRecipe.tsx:638-650` (the local `SplitBrewButtonProps` type) and `:693-729`
- Test: `components/__tests__/SplitBrewButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/SplitBrewButton.test.tsx`:

```tsx
import React from "react";
import {StyleSheet} from "react-native";
import {screen} from "@testing-library/react-native";

import SplitBrewButton from "@/components/SplitBrewButton";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

const ACCENT = "#FF8A3D";

function flattenStyle(testID: string): Record<string, unknown> {
    return (StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {})
        as Record<string, unknown>;
}

describe("SplitBrewButton", () => {
    it("draws a divider that contrasts with the fill it sits on", async () => {
        await renderWithProviders(
            <SplitBrewButton enabled accent={ACCENT} flex={2} quickEditOpen={false}
                             onBrew={jest.fn()} onToggleQuickEdit={jest.fn()}/>
        );

        const divider = flattenStyle("split-brew-divider");
        expect(divider.borderLeftWidth).toBe(1);
        expect(divider.borderLeftColor).toBe(palette.base);
        // The point of the whole fix: a hairline the same colour as the fill
        // it is drawn on is not a hairline.
        expect(divider.borderLeftColor).not.toBe(divider.backgroundColor);
    });

    it("still contrasts when BREW is disabled", async () => {
        await renderWithProviders(
            <SplitBrewButton enabled={false} accent={ACCENT} flex={2} quickEditOpen={false}
                             onBrew={jest.fn()} onToggleQuickEdit={jest.fn()}/>
        );

        const divider = flattenStyle("split-brew-divider");
        expect(divider.borderLeftColor).not.toBe(divider.backgroundColor);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest --runTestsByPath components/__tests__/SplitBrewButton.test.tsx`
Expected: FAIL with "Cannot find module '@/components/SplitBrewButton'".

- [ ] **Step 3: Create the component**

Create `components/SplitBrewButton.tsx`. This is the body lifted out of `app/editRecipe.tsx`
with the divider colour changed and the arrow state added (task 3 uses the state; it is written
once, here, so the file is not touched twice).

```tsx
import React from "react";
import {Pressable} from "react-native";
import {XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

export type SplitBrewButtonProps = {
    enabled: boolean;
    accent: string;
    flex: number;
    /** Whether the quick edit panel this button opens is showing. */
    quickEditOpen: boolean;
    onBrew: () => void;
    onToggleQuickEdit: () => void;
};

/**
 * BREW, with the quick edit panel's handle on its right.
 *
 * One control rather than two, because the arrow opens an adjustment to the
 * very brew the other half starts. While the panel is open the arrow is the
 * way back: the panel carries no BREW of its own, so there is exactly one BREW
 * on screen and it always brews what the panel currently says.
 */
export default function SplitBrewButton({
    enabled, accent, flex, quickEditOpen, onBrew, onToggleQuickEdit
}: SplitBrewButtonProps) {
    const brewFill = enabled ? accent : palette.none;

    return (
        <XStack flex={flex} borderRadius="$4" overflow="hidden"
                borderWidth={1} borderColor={accent} backgroundColor={palette.none}>
            <Pressable accessibilityRole="button" accessibilityLabel="Brew"
                       accessibilityState={{disabled: !enabled}}
                       onPress={() => enabled && onBrew()}
                       style={{flex: 1.55}}>
                <YStack alignItems="center" paddingVertical="$3.5"
                        backgroundColor={brewFill}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={2}
                                   color={enabled ? palette.base : palette.muted}>
                        BREW
                    </DotMatrixText>
                </YStack>
            </Pressable>
            <Pressable accessibilityRole="button"
                       accessibilityLabel={quickEditOpen ? "Close quick edit" : "Quick edit brew"}
                       accessibilityState={{expanded: quickEditOpen}}
                       onPress={onToggleQuickEdit}
                       style={{flex: 0.45}}>
                {/* The hairline is where one tap target ends and the next
                    begins, so it has to be visible against both fills. It was
                    drawn in the accent on an accent fill, which is to say not
                    drawn at all. `base` is the ink the labels already use on
                    an accent fill, so the boundary reads as part of the
                    control rather than as a new colour. */}
                <YStack testID="split-brew-divider"
                        alignItems="center" paddingVertical="$3.5"
                        borderLeftWidth={1} borderLeftColor={palette.base}
                        backgroundColor={accent}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                                   color={palette.base}>
                        {quickEditOpen ? "▼" : "▲"}
                    </DotMatrixText>
                </YStack>
            </Pressable>
        </XStack>
    );
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest --runTestsByPath components/__tests__/SplitBrewButton.test.tsx`
Expected: PASS.

If `StyleSheet.flatten` returns a style where `borderLeftColor` is absent because Tamagui has
compiled it elsewhere, do **not** weaken the assertion. Move the border onto the `style` prop of
a plain `View` wrapper so the property is where a test can see it, and say so in a comment.

- [ ] **Step 5: Delete the local copy**

In `app/editRecipe.tsx`, delete the `SplitBrewButtonProps` type (around `:638-650`) and the
`SplitBrewButton` function (`:693-729`), and import the component instead:

```tsx
import SplitBrewButton from "@/components/SplitBrewButton";
```

`ActionBar` will not compile yet, because the component now requires `quickEditOpen` and
`onToggleQuickEdit`. Task 3 wires those. To keep this task's commit green, pass them through
`ActionBar` now: add `quickEditOpen: boolean;` to `ActionBarProps`, accept it, and render

```tsx
                <SplitBrewButton enabled={canBrew} accent={accent} flex={2}
                                 quickEditOpen={quickEditOpen}
                                 onBrew={onBrew}
                                 onToggleQuickEdit={onQuickEdit}/>
```

and at the call site (`:1414`) pass `quickEditOpen={quickEditOpen}`.

- [ ] **Step 6: Run typecheck and the editor tests**

Run: `npm run typecheck`
Expected: silent.

Run: `npx jest --runTestsByPath app/__tests__/editRecipe.test.tsx`
Expected: PASS. If a test asserts the arrow's old accessibility label, it is still
"Quick edit brew" while closed, so nothing should move.

- [ ] **Step 7: Commit**

```bash
git add components/SplitBrewButton.tsx components/__tests__/SplitBrewButton.test.tsx app/editRecipe.tsx
git commit -m "Split BREW: extract the control and make its divider visible"
```

---

## Task 3: Two BREW buttons in the editor

**The diagnosis.** `QuickEditLayer` (`app/editRecipe.tsx:800-845`) positions itself
`bottom: actionBarHeight`, so its scrim stops short of the action bar and the bar's own BREW
stays visible and tappable directly below the panel's `renderBrewAction` BREW. Two buttons of
the same size, colour and label, one above the other.

**The decision (the user chose it).** The panel in the editor loses its BREW. The action bar
keeps the single BREW, and while the panel is open that BREW brews the adjusted recipe and is
disabled when the adjustment cannot be brewed. The arrow becomes the toggle, which is why task 2
gave it a `▼`. No new close control is needed: the arrow and the backdrop both close.

The home sheet is **unchanged**. There is no action bar there, so its BREW is the only one and
`renderBrewAction` stays a supported prop of `QuickEditPanel`.

**The accessibility consequence, which is the part that is easy to get wrong.** Today
`quickEditOpen` is part of `screenCovered` (`:1279`), which puts
`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"` on the whole
`editor-content` subtree — **including the action bar**. And `QuickEditLayer` carries
`accessibilityViewIsModal`, which hides the bar from VoiceOver on iOS. Under this change the
bar holds the only BREW, so both of those would make the primary action unreachable to a
screen reader user. The covered region therefore has to shrink to the deck, leaving the bar
reachable.

**Files:**
- Modify: `app/editRecipe.tsx` — `QuickEditLayer` (`:772-847`), `screenCovered` (`:1272-1280`),
  the content subtree (`:1283-1300` and the `</YStack>` at `:1432`), the `ActionBar` call
  (`:1413-1431`), the layer mount (`:1434-1442`), `onQuickEditOpen` (`:1161`)
- Test: `app/__tests__/editRecipe.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `app/__tests__/editRecipe.test.tsx`, in the quick edit describe block if there is one,
otherwise a new one. Use the file's existing helpers for rendering the editor with a machine
remembered (the split button only appears when `rememberedMachine !== ""`); copy whatever the
existing quick edit test does to open the panel.

```tsx
    it("shows one BREW while the quick edit panel is open", async () => {
        await openTheQuickEditPanel();

        expect(await screen.findByTestId("quick-edit-panel")).toBeTruthy();
        expect(screen.queryByLabelText("Brew quick edit")).toBeNull();
        expect(screen.getAllByLabelText("Brew")).toHaveLength(1);
    });

    it("closes the panel from the arrow it opened with", async () => {
        await openTheQuickEditPanel();
        expect(await screen.findByTestId("quick-edit-panel")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Close quick edit"));
        await waitFor(() => {
            expect(screen.queryByTestId("quick-edit-panel")).toBeNull();
        });
    });

    it("leaves the action bar reachable while the panel is open", async () => {
        await openTheQuickEditPanel();

        // The bar holds the only BREW now, so the guard that hides the screen
        // behind a sheet must not hide the bar with it.
        const content = screen.getByTestId("editor-content");
        expect(content.props.accessibilityElementsHidden).toBeFalsy();
        expect(screen.getByTestId("editor-actions")).toBeTruthy();
    });
```

Note: `screen.getByLabelText("Close quick edit")` will match both the arrow and the backdrop
unless the backdrop is distinguished. The backdrop already carries
`testID="quick-edit-backdrop"`; if the query is ambiguous, change the **backdrop's** label to
`"Close quick edit panel"` and keep the arrow's as `"Close quick edit"`, and say in a comment
that two controls doing the same thing still need distinct names for a screen reader.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest --runTestsByPath app/__tests__/editRecipe.test.tsx -t "quick edit"`
Expected: FAIL. The first finds two elements labelled "Brew"; the third finds
`accessibilityElementsHidden` true.

- [ ] **Step 3: Drop the panel's BREW**

In `QuickEditLayer`, remove `onBrew` from `QuickEditLayerProps` and from the destructured
parameters, remove the `renderBrewAction` prop from `<QuickEditPanel .../>`, and remove
`accessibilityViewIsModal` from the wrapping `View`. Replace it with a comment:

```tsx
        // Deliberately not `accessibilityViewIsModal`. The panel carries no
        // BREW of its own: the action bar below the scrim holds the single
        // BREW and brews whatever the panel currently says, so a modal flag
        // here would hide the one control this panel exists to modify. The
        // deck behind the scrim is hidden instead, on both platforms, by the
        // wrapper in the screen.
```

`BarButton` may now be unused inside the layer; leave the component itself alone, it is still
used by the bar.

At the mount site (`:1434-1442`) drop `onBrew={onQuickEditBrewPress}`.

- [ ] **Step 4: Wire the bar**

In `EditRecipe`, beside the other derived values and after `recipe` is known to be present:

```tsx
    // While the panel is open the bar's BREW is the panel's BREW: it brews
    // what the knobs currently say, and refuses for the same reasons the panel
    // reports. A combination the machine would reject must not be reachable
    // from a control sitting below the notice explaining why.
    const quickEditBlocked = quickEditOpen
        && quickEditProblems(recipe, quickEditAdjustments, temperatureUnit).length > 0;

    function closeQuickEdit() {
        setQuickEditOpen(false);
        // Closing discards. The adjustment is only visible while the panel is,
        // so keeping it would leave the bar's BREW quietly brewing something
        // the screen no longer shows.
        setQuickEditAdjustments({});
    }
```

Change the `ActionBar` call:

```tsx
            <ActionBar accent={accent} canWrite={canWrite} canSave={canSave}
                       canBrewAtAll={rememberedMachine !== ""}
                       canBrew={canBrew && !quickEditBlocked}
                       quickEditOpen={quickEditOpen}
                       onBrew={quickEditOpen ? onQuickEditBrewPress : onBrewPress}
                       onQuickEdit={quickEditOpen ? closeQuickEdit : onQuickEditOpen}
```

and the layer's `onClose={closeQuickEdit}`.

- [ ] **Step 5: Shrink the covered region**

Remove `quickEditOpen` from `screenCovered` and add, just below it:

```tsx
    // The quick edit panel covers the deck but not the action bar, which holds
    // the BREW it adjusts. So it hides the deck rather than the screen.
    const deckCovered = screenCovered || quickEditOpen;
```

Wrap `RecipeHero` and the `ScrollView` (everything inside `editor-content` **except**
`ActionBar`) in:

```tsx
            <YStack testID="editor-deck" flex={1}
                    accessibilityElementsHidden={deckCovered}
                    importantForAccessibility={deckCovered ? "no-hide-descendants" : "auto"}>
```

closing it immediately before `<ActionBar`. The bar is absolutely positioned, so a `flex={1}`
wrapper around its siblings is layout-neutral; verify that by eye in the simulator before
committing.

- [ ] **Step 6: Run the tests**

Run: `npx jest --runTestsByPath app/__tests__/editRecipe.test.tsx`
Expected: PASS, whole file.

Run: `npx jest --runTestsByPath components/__tests__/QuickEditPanel.test.tsx app/__tests__/index.test.tsx`
Expected: PASS. The home sheet keeps its own BREW and must not have moved.

- [ ] **Step 7: Commit**

```bash
git add app/editRecipe.tsx app/__tests__/editRecipe.test.tsx
git commit -m "Quick edit: one BREW in the editor, the arrow toggles the panel"
```

---

## Task 4: Say what the recipe says, on every adjusted knob

**What the user asked for.** "the row with the hint for the temp offset with the recipe values
- i want that for the other knobs as well when they have been adjusted."

TEMP OFFSET shows its baseline **always**, because an offset knob cannot otherwise tell you
what it is offsetting. The other three show an absolute value, so their baseline is only
interesting once it has been left behind. That asymmetry is deliberate; keep it.

**Files:**
- Modify: `library/quickEdit.ts`
- Modify: `components/QuickEditPanel.tsx:43-55` (the `grindValue` helper) and the three knob
  rows at `:131-170`
- Test: `library/__tests__/quickEdit.test.ts`, `components/__tests__/QuickEditPanel.test.tsx`

- [ ] **Step 1: Write the failing domain test**

In `library/__tests__/quickEdit.test.ts`, following the file's existing recipe builders:

```ts
describe("describeKnobBaseline", () => {
    it("says what the recipe's dose is", () => {
        const recipe = coffeeRecipe({dosage: 18});
        expect(describeKnobBaseline(recipe, "dose", 1)).toBe("recipe 18 g");
    });

    it("says what the recipe's ratio is", () => {
        const recipe = coffeeRecipe({ratio: 16});
        expect(describeKnobBaseline(recipe, "ratio", 1)).toBe("recipe 16");
    });

    it("says OFF where the recipe does not grind", () => {
        const recipe = coffeeRecipe({grinder: false, grindSize: 65});
        expect(describeKnobBaseline(recipe, "grind", 1)).toBe("recipe OFF");
    });

    it("keeps the latent grind size out of it", () => {
        // The grinder toggle does not clear `grindSize`, so a recipe that does
        // not grind still carries a number. The baseline must report what the
        // machine would do, not what the field happens to hold.
        const recipe = coffeeRecipe({grinder: true, grindSize: 65});
        expect(describeKnobBaseline(recipe, "grind", 1)).toBe("recipe 65");
    });

    it("drops the word at a large font scale, like the temperature baseline", () => {
        const recipe = coffeeRecipe({dosage: 18});
        expect(describeKnobBaseline(recipe, "dose", 1.4)).toBe("18 g");
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest --runTestsByPath library/__tests__/quickEdit.test.ts -t "describeKnobBaseline"`
Expected: FAIL, `describeKnobBaseline is not a function`.

- [ ] **Step 3: Implement it**

In `library/quickEdit.ts`, after `effectiveGrind`:

```ts
/** How a grind value reads, including the one that means the grinder is off. */
export function describeGrind(value: number): string {
    return value === GRINDER_OFF_VALUE ? "OFF" : String(value);
}

export type QuickEditKnob = "dose" | "ratio" | "grind";

/**
 * What the saved recipe says for one knob.
 *
 * The same shape as `describeTemperatureBaseline`, and for the same reason: a
 * panel that changes a value for one brew has to be able to say what it is
 * changing it from. The leading word goes at a large font scale, where the row
 * is tight and "recipe" is the least load-bearing part of the phrase.
 */
export function describeKnobBaseline(
    recipe: Recipe,
    knob: QuickEditKnob,
    fontScale: number
): string {
    const value = knob === "dose"
        ? `${recipe.dosage} g`
        : knob === "ratio"
            ? String(recipe.ratio)
            : describeGrind(effectiveGrind(recipe));

    return fontScale >= 1.4 ? value : `recipe ${value}`;
}
```

- [ ] **Step 4: Run it**

Run: `npx jest --runTestsByPath library/__tests__/quickEdit.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Write the failing panel tests**

In `components/__tests__/QuickEditPanel.test.tsx`, following the file's existing render helper:

```tsx
    it("says nothing about the recipe's dose until the dose is adjusted", async () => {
        await renderPanel({recipe: coffeeRecipe({dosage: 18}), adjustments: {}});

        expect(screen.queryByTestId("quick-edit-dose-baseline")).toBeNull();
    });

    it("says what the recipe's dose was once it has been adjusted", async () => {
        await renderPanel({recipe: coffeeRecipe({dosage: 18}), adjustments: {dose: 20}});

        expect(screen.getByTestId("quick-edit-dose-baseline")).toHaveTextContent("recipe 18 g");
    });

    it("says what the recipe's grind was once it has been adjusted", async () => {
        await renderPanel({
            recipe:      coffeeRecipe({grinder: true, grindSize: 65}),
            adjustments: {grind: 70}
        });

        expect(screen.getByTestId("quick-edit-grind-baseline")).toHaveTextContent("recipe 65");
    });
```

- [ ] **Step 6: Run them and watch them fail**

Run: `npx jest --runTestsByPath components/__tests__/QuickEditPanel.test.tsx -t "recipe's"`
Expected: FAIL, unable to find an element with testID `quick-edit-dose-baseline`.

- [ ] **Step 7: Implement**

In `components/QuickEditPanel.tsx`, delete the local `grindValue` helper and import
`describeGrind`, `describeKnobBaseline` and `type QuickEditKnob` from `@/library/quickEdit`.
Replace the `formatValue` on the grind stepper with
`formatValue={(value) => describeGrind(value)}`.

Add a helper above the component:

```tsx
/**
 * The saved value for a knob, shown only once that knob has been moved.
 *
 * TEMP OFFSET shows its baseline always, because an offset cannot say what it
 * is offsetting any other way. An absolute knob already reads as its own
 * value, so its baseline is only worth the row once it has been left behind.
 */
function baselineDetail(
    recipe: Recipe,
    knob: QuickEditKnob,
    adjusted: boolean,
    fontScale: number
): React.ReactNode {
    if (!adjusted) return undefined;

    return (
        <Text testID={`quick-edit-${knob}-baseline`} fontSize={12} lineHeight={16}
              color={palette.dim}>
            {describeKnobBaseline(recipe, knob, fontScale)}
        </Text>
    );
}
```

Pass it on the three rows:

```tsx
                <QuickEditRow label="DOSE"
                              detail={baselineDetail(
                                  recipe, "dose", adjustments.dose !== undefined, fontScale
                              )}>
```

```tsx
                    <QuickEditRow label="RATIO"
                                  detail={baselineDetail(
                                      recipe, "ratio", adjustments.ratio !== undefined, fontScale
                                  )}>
```

```tsx
                    <QuickEditRow label="GRIND"
                                  detail={baselineDetail(
                                      recipe, "grind", adjustments.grind !== undefined, fontScale
                                  )}>
```

- [ ] **Step 8: Run the tests**

Run: `npx jest --runTestsByPath components/__tests__/QuickEditPanel.test.tsx`
Expected: PASS, whole file.

- [ ] **Step 9: Commit**

```bash
git add library/quickEdit.ts library/__tests__/quickEdit.test.ts components/QuickEditPanel.tsx components/__tests__/QuickEditPanel.test.tsx
git commit -m "Quick edit: show the recipe's own value on every adjusted knob"
```

---

## Task 5: Gates and documentation

**Files:**
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1: Update the contributor notes**

The quick edit paragraph in `.github/copilot-instructions.md` describes the editor's hosting of
the panel. Correct it to say that in the editor the panel carries no BREW of its own: the action
bar holds the single BREW, brews whatever the panel currently says, and the arrow in
`components/SplitBrewButton.tsx` toggles the panel. Add that `quickEditOpen` hides the
`editor-deck` wrapper rather than `editor-content`, because the bar must stay reachable, and
that the layer deliberately carries no `accessibilityViewIsModal`.

Add a sentence to the `components/SwipeableRecipeRow.tsx` note: the TUNE tile waits for
`onSwipeableClose` before opening the panel, with `TRAY_ACTION_FALLBACK` as a safety net, and
the other tiles deliberately do not.

- [ ] **Step 2: Run the four gates**

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Expected: typecheck silent; lint 0 errors (26 pre-existing warnings); the whole suite green on
both the `ios` and `android` projects; expo-doctor 21/21.

- [ ] **Step 3: Commit and push**

```bash
git add .github/copilot-instructions.md
git commit -m "Docs: quick edit's single BREW and the deferred tray action"
git push -u origin quick-edit-ux-fixes
```

---

## Still needs hardware

The stutter diagnosis was read off the code rather than profiled. Verify on an iPhone 17 Pro
that the home TUNE tile now closes its tray cleanly and the sheet arrives without a second
stutter. If the sheet's own entrance still janks, the remaining cost is the panel's mount
(four `Stepper`s and several `DotMatrixText` runs) and the next move is to defer the panel's
body until the sheet has settled, not to lengthen the delay.

The split button's divider and the single BREW both want a look at the same time.
