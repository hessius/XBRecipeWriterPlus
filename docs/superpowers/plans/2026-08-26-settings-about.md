# Settings and About Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sub-project 6 — a restructured settings screen, a temperature unit the user can choose, an About screen, backup and restore, and delete-all — which closes the UI overhaul programme.

**Architecture:** Five independent areas built in order. Each area lands as a set of small, module-scope units with hard boundaries: pure logic in `library/` with no React (`units.ts`, `backup.ts`), stateful glue in `hooks/`, presentation in `components/`, and route files that stay close to layout. `app/settings.tsx` becomes a declaration of rows over four new row components rather than hand-written JSX.

**Tech Stack:** Expo SDK 57, React Native 0.86, Tamagui, expo-sqlite, Reanimated 4, Jest + @testing-library/react-native. New native dependencies: `expo-sharing`, `expo-file-system`, `expo-document-picker`.

**Spec:** `docs/superpowers/specs/2026-08-26-settings-about-design.md`

**Worktree:** `/Users/jesperhessius/Dev/xbrw-sp6-settings` on branch `sp6-settings`, based on `main` at `c9623d7`.

---

## House rules (read before the first task)

These are the conventions this repository's reviewers enforce. Breaking one is a
review round-trip.

- **The React Compiler is on.** Do not hand-write `useMemo` or `useCallback`. Do
  not read a whole `props` object inside a hook — destructure first. Do not
  introduce `try`/`finally` in a React file; plain `try`/`catch` is fine in a
  non-React module.
- **Every component is declared at module scope.** A component declared inside
  another component's body is a new type on every render and React remounts it.
  This bug has been fixed twice in this repository already.
- **No hex literals and no named CSS colours** in `app/` or `components/`.
  Everything comes from `constants/colors.ts`. Add a semantically named entry if
  you need a new one, never a literal one.
- **RNTL v14 is asynchronous.** `render`, `fireEvent`, `renderHook` and `act` all
  return promises and **must be awaited**. Forget the `await` and `screen` stays
  empty and the test passes for the wrong reason. Always render through
  `renderWithProviders` from `@/test-utils/render`.
- **Doto is for machine-derived values only**, and only through
  `DotMatrixText`. Anything a human typed — a recipe name, an error message —
  stays in the body face.
- **Imports use the `@/` alias.**
- **Comments explain _why_**, not what.
- **Commit messages are prose** explaining the reasoning, and carry the trailer
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **`library/__tests__/` must not change.** Those are characterisation tests for
  the card byte format. If something in this sub-project alters one, it is a
  regression until proven otherwise.

### Gates

Run all three before every commit. All three must be clean.

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
npm run typecheck && npm run lint && npm test
```

Baseline at the start of this plan: **59 suites, 988 tests passing.**

### Mutation testing is required

Tests in this repository have repeatedly passed for the wrong reason. After each
task's tests go green, **break the implementation deliberately** and confirm the
right test fails. Each task names the mutation to try. Put the code back
afterwards.

---

# Phase 1 — The settings screen

Turns `app/settings.tsx` from hand-written JSX into a declaration of rows, and
adds the section headings the screen needs once it has more than one group.

**Files this phase creates or modifies:**

| File | Responsibility |
|---|---|
| `components/SegmentedControl.tsx` (create) | The pill-group of options. Extracted from `SegmentedRow` so the editor and settings share one control |
| `components/SegmentedRow.tsx` (modify) | Keeps its `FieldRow` + help-topic wrapper, delegates the control |
| `components/SettingsSection.tsx` (create) | A dot-matrix heading and its rows |
| `components/SettingsToggleRow.tsx` (create) | Label, description, switch. Moved out of `settings.tsx` |
| `components/SettingsChoiceRow.tsx` (create) | Label, description, segmented control |
| `components/SettingsActionRow.tsx` (create) | Label, optional detail, chevron. `tone="danger"` variant |
| `app/settings.tsx` (modify) | Becomes a list of sections |

The row components are prefixed `Settings` because `components/` is flat and
already holds a `FieldRow`; an unprefixed `ToggleRow` beside it would not say
which screen it belongs to.

---

### Task 1: Extract the segmented control

`SegmentedRow` currently owns both the row chrome (a `FieldRow`, identified by a
`HelpTopic`) and the pill group inside it. Settings needs the pill group without
the help topic — there is no `HelpTopic` for "temperature unit" and inventing one
would put a settings row into the recipe editor's help sheet.

**Files:**
- Create: `components/SegmentedControl.tsx`
- Modify: `components/SegmentedRow.tsx`
- Test: `components/__tests__/SegmentedControl.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/SegmentedControl.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import SegmentedControl from "@/components/SegmentedControl";
import {renderWithProviders} from "@/test-utils/render";

const OPTIONS = [
    {value: "C", label: "°C"},
    {value: "F", label: "°F"}
] as const;

describe("SegmentedControl", () => {
    it("marks the selected option checked and the others not", async () => {
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={() => {}}/>
        );

        expect(screen.getByLabelText("°C").props.accessibilityState.checked).toBe(true);
        expect(screen.getByLabelText("°F").props.accessibilityState.checked).toBe(false);
    });

    it("reports the value of the option that was pressed", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("°F"));

        expect(onChange).toHaveBeenCalledWith("F");
    });

    it("is announced as one radio group rather than two loose buttons", async () => {
        await renderWithProviders(
            <SegmentedControl value="C" options={OPTIONS} onChange={() => {}}/>
        );

        expect(screen.getByRole("radiogroup")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
npx jest components/__tests__/SegmentedControl.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/SegmentedControl'`.

- [ ] **Step 3: Write the control**

Create `components/SegmentedControl.tsx`:

```tsx
import React from "react";
import {Pressable} from "react-native";
import {Text, XStack} from "tamagui";

import {palette} from "@/constants/colors";

export type SegmentOption = {
    value: string;
    label: string;
};

type Props = {
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
    /** Fill of the selected segment. The editor passes the recipe's accent. */
    accent?: string;
};

/**
 * A short list of options, one of which is on.
 *
 * Lifted out of `SegmentedRow`, which pairs it with a `FieldRow` and so requires
 * a `HelpTopic`. Settings has options to offer and no help topics to name them
 * by, and inventing one would put a settings row into the recipe editor's help
 * sheet. The chrome and the control are two responsibilities; this is the
 * control.
 */
export default function SegmentedControl({value, options, onChange, accent}: Props) {
    return (
        <XStack accessibilityRole="radiogroup" backgroundColor={palette.raised}
                borderRadius="$3" padding={2} gap={2}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable key={option.value} accessibilityRole="radio"
                               accessibilityLabel={option.label}
                               accessibilityState={{checked: selected}}
                               onPress={() => onChange(option.value)}>
                        <Text fontSize={11} fontWeight="600"
                              paddingHorizontal="$2.5" paddingVertical="$1.5"
                              borderRadius="$2"
                              backgroundColor={selected ? (accent ?? palette.text) : undefined}
                              color={selected ? palette.base : palette.dim}>
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </XStack>
    );
}
```

- [ ] **Step 4: Point `SegmentedRow` at it**

Replace the whole body of `components/SegmentedRow.tsx` with:

```tsx
import React from "react";

import FieldRow from "@/components/FieldRow";
import SegmentedControl, {type SegmentOption} from "@/components/SegmentedControl";
import type {HelpTopic} from "@/constants/recipeHelp";

export type {SegmentOption};

type Props = {
    topic: HelpTopic;
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
    /** The recipe's accent, used to fill the selected segment. */
    accent?: string;
    showHint?: boolean;
};

/** A `FieldRow` whose value is one of a short list. */
export default function SegmentedRow({
    topic, value, options, onChange, accent, showHint
}: Props) {
    return (
        <FieldRow topic={topic} showHint={showHint}>
            <SegmentedControl value={value} options={options} onChange={onChange}
                              accent={accent}/>
        </FieldRow>
    );
}
```

`export type {SegmentOption}` keeps every existing importer of
`SegmentedRow`'s `SegmentOption` compiling unchanged.

- [ ] **Step 5: Run the new test and every test that touches the editor**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
npx jest components/__tests__/SegmentedControl.test.tsx components/__tests__/StageTile.test.tsx app/__tests__/editRecipe.test.tsx
```

Expected: PASS, all three suites.

- [ ] **Step 6: Mutation check**

In `components/SegmentedControl.tsx`, change `accessibilityState={{checked: selected}}`
to `accessibilityState={{checked: true}}`.

```bash
npx jest components/__tests__/SegmentedControl.test.tsx
```

Expected: FAIL on "marks the selected option checked and the others not". Put it
back and confirm green.

- [ ] **Step 7: Gates and commit**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
npm run typecheck && npm run lint && npm test
git add components/SegmentedControl.tsx components/SegmentedRow.tsx components/__tests__/SegmentedControl.test.tsx
git commit -F - <<'MSG'
Separate the segmented control from the row that holds it

SegmentedRow does two things: it draws a FieldRow, which is identified by a
HelpTopic and takes its label from the recipe help map, and it draws the pill
group inside it. The settings screen needs the second without the first — there
is no help topic for a temperature unit, and inventing one would put a settings
row into the recipe editor's help sheet.

The control moves out unchanged and SegmentedRow keeps its chrome. Its
SegmentOption type is re-exported so no existing importer has to move.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 2: The settings section heading

**Files:**
- Create: `components/SettingsSection.tsx`
- Test: `components/__tests__/SettingsSection.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/SettingsSection.test.tsx`:

```tsx
import React from "react";
import {Text} from "react-native";
import {screen} from "@testing-library/react-native";

import SettingsSection from "@/components/SettingsSection";
import {renderWithProviders} from "@/test-utils/render";

describe("SettingsSection", () => {
    it("heads its rows with the title, in upper case", async () => {
        await renderWithProviders(
            <SettingsSection title="Recipe list">
                <Text>a row</Text>
            </SettingsSection>
        );

        expect(screen.getByText("RECIPE LIST")).toBeTruthy();
        expect(screen.getByText("a row")).toBeTruthy();
    });

    it("draws no heading when it has no title", async () => {
        // The identity section at the top of the screen is the whole reason
        // this is optional: a heading above the app's own name would be
        // labelling the label.
        await renderWithProviders(
            <SettingsSection>
                <Text>a row</Text>
            </SettingsSection>
        );

        expect(screen.queryByTestId("settings-section-title")).toBeNull();
        expect(screen.getByText("a row")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/SettingsSection.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/SettingsSection'`.

- [ ] **Step 3: Write it**

Create `components/SettingsSection.tsx`:

```tsx
import React from "react";
import {YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type Props = {
    /** Omitted by the identity section, which needs no label above the app's name. */
    title?: string;
    children: React.ReactNode;
};

/**
 * A group of settings rows under a heading.
 *
 * The heading is Doto because it is a machine label rather than prose — the same
 * treatment the screen already used for its one section before there were
 * several. Upper-cased here rather than at the call sites so the sections cannot
 * drift apart from one another.
 */
export default function SettingsSection({title, children}: Props) {
    return (
        <YStack gap="$2" paddingTop="$4">
            {title !== undefined && (
                <DotMatrixText testID="settings-section-title" fontSize={11}
                               weight="bold" letterSpacing={1.6} color={palette.dim}>
                    {title.toUpperCase()}
                </DotMatrixText>
            )}
            <YStack>{children}</YStack>
        </YStack>
    );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest components/__tests__/SettingsSection.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Mutation check**

Remove the `{title !== undefined && ...}` guard so the heading always renders.
`npx jest components/__tests__/SettingsSection.test.tsx` must FAIL on "draws no
heading when it has no title". Put it back.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npx jest components/__tests__/SettingsSection.test.tsx
git add components/SettingsSection.tsx components/__tests__/SettingsSection.test.tsx
git commit -F - <<'MSG'
Give the settings screen a section heading

The screen had one group and drew its heading inline. It is about to have four,
and four inline headings are four chances to drift. The title is optional
because the identity section at the top needs no label above the app's own name.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 3: The three row components

Three small components with the same shape: a label, a description, and one
control on the right. Built together because they share a layout and testing
them apart from one another would triple the harness for no extra coverage.

**Files:**
- Create: `components/SettingsToggleRow.tsx`
- Create: `components/SettingsChoiceRow.tsx`
- Create: `components/SettingsActionRow.tsx`
- Test: `components/__tests__/SettingsRows.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/SettingsRows.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

describe("SettingsToggleRow", () => {
    it("shows the label, the description and the switch in its state", async () => {
        await renderWithProviders(
            <SettingsToggleRow label="Show the COFFEE marker"
                               description="Redundant in a mostly-coffee library."
                               value onChange={() => {}}/>
        );

        expect(screen.getByText("Show the COFFEE marker")).toBeTruthy();
        expect(screen.getByText("Redundant in a mostly-coffee library.")).toBeTruthy();
        expect(screen.getByLabelText("Show the COFFEE marker")
            .props.accessibilityState.checked).toBe(true);
    });

    it("reports a change", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <SettingsToggleRow label="Dot matrix" description="d" value={false}
                               onChange={onChange}/>
        );

        await fireEvent(screen.getByLabelText("Dot matrix"), "checkedChange", true);

        expect(onChange).toHaveBeenCalledWith(true);
    });
});

describe("SettingsChoiceRow", () => {
    const OPTIONS = [{value: "C", label: "°C"}, {value: "F", label: "°F"}];

    it("shows the label and the option that is on", async () => {
        await renderWithProviders(
            <SettingsChoiceRow label="Temperature" description="How hot the water is shown."
                               value="F" options={OPTIONS} onChange={() => {}}/>
        );

        expect(screen.getByText("Temperature")).toBeTruthy();
        expect(screen.getByLabelText("°F").props.accessibilityState.checked).toBe(true);
    });

    it("reports the option that was chosen", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <SettingsChoiceRow label="Temperature" description="d" value="C"
                               options={OPTIONS} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("°F"));

        expect(onChange).toHaveBeenCalledWith("F");
    });
});

describe("SettingsActionRow", () => {
    it("is a button carrying its label and detail", async () => {
        await renderWithProviders(
            <SettingsActionRow label="About XBRW++" detail="Version 2.6.0"
                               onPress={() => {}}/>
        );

        const row = screen.getByRole("button", {name: "About XBRW++"});
        expect(row).toBeTruthy();
        expect(screen.getByText("Version 2.6.0")).toBeTruthy();
    });

    it("runs its action when pressed", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <SettingsActionRow label="Back up my recipes" onPress={onPress}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: "Back up my recipes"}));

        expect(onPress).toHaveBeenCalled();
    });

    it("draws a destructive row in the danger colour", async () => {
        await renderWithProviders(
            <SettingsActionRow label="Delete all recipes" tone="danger" onPress={() => {}}/>
        );

        expect(screen.getByText("Delete all recipes").props.style)
            .toEqual(expect.objectContaining({color: palette.danger}));
    });

    it("draws an ordinary row in the text colour", async () => {
        await renderWithProviders(
            <SettingsActionRow label="Back up my recipes" onPress={() => {}}/>
        );

        expect(screen.getByText("Back up my recipes").props.style)
            .toEqual(expect.objectContaining({color: palette.text}));
    });
});
```

> **Note on the colour assertions:** Tamagui flattens its style prop, so
> `props.style` is an object rather than an array. If the assertion fails with an
> array, switch to
> `expect(StyleSheet.flatten(screen.getByText("...").props.style).color).toBe(palette.danger)`
> and import `StyleSheet` from `react-native`. Do not weaken the assertion to
> "renders without throwing" — that is the class of test this repository has been
> bitten by.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/SettingsRows.test.tsx
```

Expected: FAIL — three missing modules.

- [ ] **Step 3: Write `SettingsToggleRow`**

Create `components/SettingsToggleRow.tsx`. This is the `ToggleRow` currently
inside `app/settings.tsx`, moved out unchanged apart from the row separator:

```tsx
import React from "react";
import {Switch, Text, XStack, YStack} from "tamagui";

import {palette} from "@/constants/colors";

type Props = {
    label: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
};

/** A setting that is on or off. */
export default function SettingsToggleRow({label, description, value, onChange}: Props) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                paddingVertical="$3" borderBottomWidth={1} borderBottomColor={palette.line}>
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
```

- [ ] **Step 4: Write `SettingsChoiceRow`**

Create `components/SettingsChoiceRow.tsx`:

```tsx
import React from "react";
import {Text, XStack, YStack} from "tamagui";

import SegmentedControl, {type SegmentOption} from "@/components/SegmentedControl";
import {palette} from "@/constants/colors";

type Props = {
    label: string;
    description: string;
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
};

/** A setting that is one of a short list. */
export default function SettingsChoiceRow({
    label, description, value, options, onChange
}: Props) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                paddingVertical="$3" borderBottomWidth={1} borderBottomColor={palette.line}>
            <YStack flex={1} gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            <SegmentedControl value={value} options={options} onChange={onChange}/>
        </XStack>
    );
}
```

- [ ] **Step 5: Write `SettingsActionRow`**

Create `components/SettingsActionRow.tsx`:

```tsx
import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {palette} from "@/constants/colors";

type Props = {
    label: string;
    /** Shown under the label. The version, or what the action will do. */
    detail?: string;
    /** `danger` for a row that destroys something. */
    tone?: "default" | "danger";
    onPress: () => void;
};

/**
 * A settings row that does something rather than holding a value.
 *
 * The chevron is the `back` glyph rotated, which is how `StageTile` already
 * builds its caret: rotating one bitmap beats drawing a second that has to look
 * like its sibling. The rotation goes on a wrapper because `DotIcon` owns its
 * own style prop.
 */
export default function SettingsActionRow({label, detail, tone = "default", onPress}: Props) {
    const ink = tone === "danger" ? palette.danger : palette.text;

    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   accessibilityHint={detail}
                   onPress={onPress}>
            <XStack alignItems="center" justifyContent="space-between" gap="$4"
                    paddingVertical="$3.5" borderBottomWidth={1}
                    borderBottomColor={palette.line}>
                <YStack flex={1} gap="$1">
                    <Text fontSize={16} color={ink}>{label}</Text>
                    {detail !== undefined && (
                        <Text fontSize={13} color={palette.dim}>{detail}</Text>
                    )}
                </YStack>
                {/* Decorative: the row is already a labelled button, so the
                    glyph must not become a second accessibility element. */}
                <XStack style={{transform: [{rotate: "180deg"}]}}>
                    <DotIcon name="back" size={14} color={palette.muted}/>
                </XStack>
            </XStack>
        </Pressable>
    );
}
```

- [ ] **Step 6: Run it and watch it pass**

```bash
npx jest components/__tests__/SettingsRows.test.tsx
```

Expected: PASS, 7 tests. If the two colour assertions fail because `props.style`
is an array, apply the `StyleSheet.flatten` form from the note in Step 1.

- [ ] **Step 7: Mutation check**

In `components/SettingsActionRow.tsx` change
`const ink = tone === "danger" ? palette.danger : palette.text;` to
`const ink = palette.text;`.

```bash
npx jest components/__tests__/SettingsRows.test.tsx
```

Expected: FAIL on "draws a destructive row in the danger colour". Put it back.

- [ ] **Step 8: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/SettingsToggleRow.tsx components/SettingsChoiceRow.tsx components/SettingsActionRow.tsx components/__tests__/SettingsRows.test.tsx
git commit -F - <<'MSG'
Three settings rows, at module scope

The screen is about to hold rows of three kinds, and the one kind it has was
declared inside the route file. That is fine while there is one of it and wrong
as soon as the screen becomes a list: a component declared in another
component's body is a new type on every render, which React answers by
remounting. This repository has fixed that bug twice.

They share a layout deliberately — label and description on the left, one
control on the right — so a reader can tell what a row does from its right-hand
edge. The destructive variant is a tone rather than a separate component,
because the only thing that changes is the ink.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 4: Rebuild the settings screen from the rows

The screen becomes sections and rows. Only the two existing toggles are wired up
in this task — the About row, the temperature row and the three library rows
arrive with the phases that build what they open.

**Files:**
- Modify: `app/settings.tsx`
- Test: `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Add the failing tests**

Append to the `describe("SettingsScreen", ...)` block in
`app/__tests__/settings.test.tsx`, before its closing `});`:

```tsx
    it("heads the toggles with the part of the app they change", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("RECIPE LIST")).toBeTruthy();
    });
```

- [ ] **Step 2: Run the suite and watch the new test fail**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: the six existing tests PASS; "heads the toggles with the part of the
app they change" FAILS, because the heading is currently the literal string
`RECIPE LIST` inside a `DotMatrixText` — verify the failure message before
assuming. If it already passes, that is fine: the heading text is unchanged by
design, and this test exists to keep it that way through the rewrite.

- [ ] **Step 3: Rewrite the screen**

Replace the whole of `app/settings.tsx` with:

```tsx
import React from "react";
import {ScrollView, YStack} from "tamagui";

import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {palette} from "@/constants/colors";
import {useSetting} from "@/hooks/useSetting";
import {type Settings} from "@/library/Settings";

type Props = {
    /** Injected by tests. The route renders with the shared store. */
    settings?: Settings;
};

/**
 * The settings screen.
 *
 * A declaration of sections and rows rather than hand-written layout. The screen
 * accumulated rows from three sub-projects and each one that arrived as more JSX
 * made the next harder to place; the rows are components now, so this file says
 * what the screen offers and nothing about how a row is drawn.
 *
 * The one-line editor hints are deliberately not here. Sub-project 4 put that
 * toggle in the editor's overflow sheet, beside the deck it annotates, which is
 * the better home for it — and `app/__tests__/settings.test.tsx` holds that
 * decision in place.
 */
export default function SettingsScreen({settings}: Props) {
    const [showCoffeeMarker, setShowCoffeeMarker] =
        useSetting("showCoffeeMarker", settings);
    const [dotMatrixProfile, setDotMatrixProfile] =
        useSetting("dotMatrixProfile", settings);

    return (
        <ScrollView backgroundColor={palette.base}
                    contentContainerStyle={{padding: 16, paddingBottom: 48}}>
            <YStack>
                <SettingsSection title="Recipe list">
                    <SettingsToggleRow
                        label="Show the COFFEE marker"
                        description="The TEA marker is always shown. COFFEE is redundant in a mostly-coffee library."
                        value={showCoffeeMarker}
                        onChange={setShowCoffeeMarker}/>
                    <SettingsToggleRow
                        label="Dot matrix pour profile"
                        description="Fill the graph behind each recipe with a screen of dots instead of a flat tint."
                        value={dotMatrixProfile}
                        onChange={setDotMatrixProfile}/>
                </SettingsSection>
            </YStack>
        </ScrollView>
    );
}
```

- [ ] **Step 4: Run the suite**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation check**

Swap the two `SettingsToggleRow`s' `value` props (give the coffee marker row
`dotMatrixProfile` and vice versa).

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: FAIL on "shows the coffee marker toggle in its stored state". Put it
back.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/settings.tsx app/__tests__/settings.test.tsx
git commit -F - <<'MSG'
Rebuild the settings screen out of rows

Three sub-projects have added to this screen and each addition arrived as more
inline JSX, which made the next one harder to place. It is a declaration now:
sections holding rows, with nothing in the route file about how a row is drawn.

The rows it offers are unchanged. What follows can be added by naming it.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

# Phase 2 — Units

Temperature, and only temperature. The reasoning for excluding mass and volume is
in the spec and is not revisited here.

**The rule that governs this whole phase:** `Recipe`, `Pour`, the byte format and
every stored value stay canonical Celsius. Conversion happens at the field
boundary and nowhere else. A user who switches units and switches back must get
a byte-identical card.

**Files this phase creates or modifies:**

| File | Responsibility |
|---|---|
| `library/units.ts` (create) | Pure conversion, the storable ladder, and the suffix |
| `library/Settings.ts` (modify) | Adds `temperatureUnit` |
| `components/Stepper.tsx` (modify) | Optional explicit ladder of allowed values |
| `components/StageTile.tsx` (modify) | Renders and edits the temperature in the chosen unit |
| `library/cardLimits.ts` (modify) | Reports an out-of-range temperature in the chosen unit |
| `constants/recipeHelp.ts` (modify) | The temperature hint names both ranges |
| `app/settings.tsx` (modify) | The Units section |
| `hooks/useRecipeEditor.ts` (modify) | Passes the unit into `cardWriteProblems` |

---

### Task 5: `library/units.ts`

**Files:**
- Create: `library/units.ts`
- Test: `library/__tests__/units.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/units.test.ts`:

```ts
import {
    CELSIUS_RANGE,
    displayRange,
    displayValues,
    fromDisplay,
    snapToStorable,
    toDisplay,
    unitSuffix,
    type TemperatureUnit
} from "@/library/units";

describe("toDisplay", () => {
    it("leaves Celsius alone", () => {
        expect(toDisplay(93, "C")).toBe(93);
        expect(toDisplay(39, "C")).toBe(39);
    });

    it("converts to whole Fahrenheit", () => {
        expect(toDisplay(0, "F")).toBe(32);
        expect(toDisplay(100, "F")).toBe(212);
        expect(toDisplay(93, "F")).toBe(199);
    });

    it("converts both ends of the card's range", () => {
        expect(toDisplay(CELSIUS_RANGE.min, "F")).toBe(102);
        expect(toDisplay(CELSIUS_RANGE.max, "F")).toBe(210);
    });
});

describe("fromDisplay", () => {
    it("leaves Celsius alone", () => {
        expect(fromDisplay(93, "C")).toBe(93);
    });

    it("converts back to whole Celsius", () => {
        expect(fromDisplay(199, "F")).toBe(93);
        expect(fromDisplay(102, "F")).toBe(39);
        expect(fromDisplay(210, "F")).toBe(99);
    });

    it("clamps to what the card can hold", () => {
        expect(fromDisplay(500, "F")).toBe(CELSIUS_RANGE.max);
        expect(fromDisplay(-40, "F")).toBe(CELSIUS_RANGE.min);
        expect(fromDisplay(200, "C")).toBe(CELSIUS_RANGE.max);
        expect(fromDisplay(0, "C")).toBe(CELSIUS_RANGE.min);
    });

    it("refuses a value that is not a number", () => {
        expect(fromDisplay(Number.NaN, "F")).toBe(CELSIUS_RANGE.min);
    });
});

describe("the round trip", () => {
    // The property that makes this feature safe: a user who switches to
    // Fahrenheit and back must get the identical card. Every storable Celsius
    // value is checked, not a sample, because one that failed would silently
    // rewrite a recipe.
    it("is the identity for every storable Celsius value", () => {
        for (let c = CELSIUS_RANGE.min; c <= CELSIUS_RANGE.max; c++) {
            expect(fromDisplay(toDisplay(c, "F"), "F")).toBe(c);
        }
    });
});

describe("displayValues", () => {
    it("lists every storable value, in order, without repeats", () => {
        for (const unit of ["C", "F"] as TemperatureUnit[]) {
            const values = displayValues(unit);
            expect(values.length).toBe(CELSIUS_RANGE.max - CELSIUS_RANGE.min + 1);
            expect(new Set(values).size).toBe(values.length);
            for (let i = 1; i < values.length; i++) {
                expect(values[i]).toBeGreaterThan(values[i - 1]);
            }
        }
    });

    it("skips the Fahrenheit values the card cannot hold", () => {
        // 1 °C is 1.8 °F, so a stepper that moved by one would sometimes not
        // move the stored value at all — a control that visibly does nothing.
        const values = displayValues("F");
        const at194 = values.indexOf(194);
        expect(at194).toBeGreaterThan(0);
        expect(values[at194 + 1]).toBe(196);
        expect(values[at194 + 2]).toBe(198);
        expect(values).not.toContain(195);
    });

    it("is the plain Celsius run", () => {
        expect(displayValues("C")[0]).toBe(39);
        expect(displayValues("C")[1]).toBe(40);
    });
});

describe("snapToStorable", () => {
    it("moves a typed value to the nearest one the card can hold", () => {
        expect(snapToStorable(195, "F")).toBe(196);
        expect(snapToStorable(194.4, "F")).toBe(194);
        expect(snapToStorable(93, "C")).toBe(93);
    });

    it("clamps out-of-range input rather than extrapolating", () => {
        expect(snapToStorable(400, "F")).toBe(210);
        expect(snapToStorable(0, "F")).toBe(102);
    });
});

describe("displayRange", () => {
    it("is the card's range, in the unit asked for", () => {
        expect(displayRange("C")).toEqual({min: 39, max: 99});
        expect(displayRange("F")).toEqual({min: 102, max: 210});
    });
});

describe("unitSuffix", () => {
    it("names the unit", () => {
        expect(unitSuffix("C")).toBe("°C");
        expect(unitSuffix("F")).toBe("°F");
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/units.test.ts
```

Expected: FAIL — `Cannot find module '@/library/units'`.

- [ ] **Step 3: Write the module**

Create `library/units.ts`:

```ts
/**
 * Temperature, in the unit the user asked to see it in.
 *
 * The card stores one byte of whole Celsius, so Celsius is canonical everywhere
 * behind this module: `Recipe`, `Pour`, the byte format and every stored value.
 * Conversion happens at the field boundary and nowhere else, which is what makes
 * switching units and switching back produce a byte-identical card.
 *
 * Pure, and free of React, so the arithmetic can be tested as arithmetic.
 */

export type TemperatureUnit = "C" | "F";

/** What the card can hold, in whole Celsius. Mirrors `cardLimits`. */
export const CELSIUS_RANGE = {min: 39, max: 99} as const;

function clampCelsius(celsius: number): number {
    if (!Number.isFinite(celsius)) return CELSIUS_RANGE.min;
    return Math.min(Math.max(celsius, CELSIUS_RANGE.min), CELSIUS_RANGE.max);
}

/** Canonical Celsius to the number the user is shown. */
export function toDisplay(celsius: number, unit: TemperatureUnit): number {
    if (unit === "C") return celsius;
    return Math.round(celsius * 9 / 5 + 32);
}

/**
 * A number the user was shown, back to canonical Celsius.
 *
 * Rounded and clamped, so this is the only door a temperature enters the model
 * through and nothing past it has to defend itself.
 */
export function fromDisplay(value: number, unit: TemperatureUnit): number {
    if (!Number.isFinite(value)) return CELSIUS_RANGE.min;
    const celsius = unit === "C" ? value : (value - 32) * 5 / 9;
    return clampCelsius(Math.round(celsius));
}

/**
 * Every value the field can settle on, in order.
 *
 * The card's resolution is one Celsius degree, so in Fahrenheit the ladder has
 * gaps: 194, 196, 198. That is the honest rendering. Stepping by one Fahrenheit
 * degree instead would sometimes land on the same stored Celsius and leave the
 * user tapping a control that visibly does nothing, which is indistinguishable
 * from a frozen screen.
 */
export function displayValues(unit: TemperatureUnit): readonly number[] {
    const values: number[] = [];
    for (let c = CELSIUS_RANGE.min; c <= CELSIUS_RANGE.max; c++) {
        values.push(toDisplay(c, unit));
    }
    return values;
}

/** The nearest value the field can settle on. For a typed entry. */
export function snapToStorable(value: number, unit: TemperatureUnit): number {
    return toDisplay(fromDisplay(Math.round(value), unit), unit);
}

/** The bounds to hand a stepper. */
export function displayRange(unit: TemperatureUnit): {min: number; max: number} {
    return {
        min: toDisplay(CELSIUS_RANGE.min, unit),
        max: toDisplay(CELSIUS_RANGE.max, unit)
    };
}

export function unitSuffix(unit: TemperatureUnit): string {
    return unit === "C" ? "°C" : "°F";
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest library/__tests__/units.test.ts
```

Expected: PASS, all tests.

> If `snapToStorable(194.4, "F")` fails, note that `Math.round(194.4)` is 194,
> `fromDisplay(194, "F")` is 90, and `toDisplay(90, "F")` is 194. The chain is
> correct; do not "fix" it by removing the outer `Math.round`.

- [ ] **Step 5: Mutation check**

Change `Math.round(celsius * 9 / 5 + 32)` to `Math.floor(celsius * 9 / 5 + 32)`.

```bash
npx jest library/__tests__/units.test.ts
```

Expected: FAIL on "converts both ends of the card's range" (39 °C floors to 102
still, but 99 °C floors to 210 — check which cases actually break, and if none
do, use `Math.trunc(celsius * 9 / 5) + 32` instead, which breaks the round trip).
The requirement is that **some** test fails; find a mutation that one catches and
record which. Put it back.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npx jest library/__tests__/units.test.ts
git add library/units.ts library/__tests__/units.test.ts
git commit -F - <<'MSG'
Temperature, in the unit the user asked for

The card holds one byte of whole Celsius and nothing behind this module changes:
Recipe, Pour and the byte format stay canonical. Conversion happens at the field
boundary, which is what makes switching to Fahrenheit and back produce a
byte-identical card — asserted for every one of the 61 storable values rather
than for a sample, because a value that failed would silently rewrite a recipe.

displayValues is the part worth reading twice. One Celsius degree is 1.8
Fahrenheit degrees, so a field that stepped by one Fahrenheit would sometimes
land back on the same stored value and leave the user tapping a control that
does nothing. The ladder skips those, so Fahrenheit climbs 194, 196, 198. That is
the card's real resolution rather than a pretence of finer.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 6: The setting

**Files:**
- Modify: `library/Settings.ts`
- Test: `library/__tests__/Settings.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/Settings.test.ts`, inside its outermost `describe`:

```ts
    it("shows temperatures in Celsius unless told otherwise", () => {
        expect(new Settings(fakeStorage()).get("temperatureUnit")).toBe("C");
    });

    it("remembers a switch to Fahrenheit", () => {
        const storage = fakeStorage();
        new Settings(storage).set("temperatureUnit", "F");
        expect(new Settings(storage).get("temperatureUnit")).toBe("F");
    });
```

Check the existing file for the exact name of its storage helper — this plan
assumes `fakeStorage()`, which the file already uses at line 64. If it is called
something else, use that name.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/Settings.test.ts
```

Expected: FAIL — `temperatureUnit` is not a `SettingKey`, so this is a
**typecheck** failure as well as a test failure. Both are expected.

- [ ] **Step 3: Add the key**

In `library/Settings.ts`, inside `DEFAULTS`, after the `showHints` entry (mind
the trailing comma on the line above):

```ts
    /**
     * The unit temperatures are shown and entered in.
     *
     * Celsius by default, and Celsius canonically: the card stores one byte of
     * whole Celsius and every value behind `library/units.ts` is in it. This
     * setting changes what is drawn on a field and what a stepper walks, and
     * nothing else.
     *
     * Only temperature converts. The dose is in grams — which is how coffee is
     * weighed everywhere it is taken seriously, the United States included —
     * and the ratio is dimensionless, so a volume shown in fluid ounces would
     * make the ratio beside it correspond to nothing on screen.
     */
    temperatureUnit: "C" as "C" | "F"
```

The `as "C" | "F"` matters: without it the `as const` on `DEFAULTS` narrows the
type to the literal `"C"` and `set("temperatureUnit", "F")` will not compile.
`Widen<T>` would otherwise widen it all the way to `string`, which loses the
check that only two values are legal.

- [ ] **Step 4: Run it and watch it pass**

```bash
npm run typecheck && npx jest library/__tests__/Settings.test.ts
```

Expected: both clean.

- [ ] **Step 5: Mutation check**

Change the default to `"F" as "C" | "F"`. The test "shows temperatures in
Celsius unless told otherwise" must FAIL. Put it back.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/Settings.ts library/__tests__/Settings.test.ts
git commit -F - <<'MSG'
Remember which unit temperatures are shown in

Celsius by default and Celsius canonically. This setting changes what a field
draws and what a stepper walks; nothing behind library/units.ts knows it exists.

The explicit "C" | "F" annotation is load-bearing: DEFAULTS is declared as const,
so without it the key's type is the literal "C" and switching to Fahrenheit would
not compile. Widening it to string instead would lose the check that only two
values are legal.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 7: Teach `Stepper` an explicit ladder

The stepper works from `min`/`max`/`step` today, which cannot express "the next
value up is 196, not 195". This adds an optional list of allowed values; when it
is given, a step moves one entry along it and a typed value snaps to the nearest
entry. Every existing call site is unchanged.

**Files:**
- Modify: `components/Stepper.tsx`
- Test: `components/__tests__/Stepper.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/Stepper.test.tsx`, at the end of the file:

```tsx
describe("Stepper walking an explicit ladder", () => {
    // The Fahrenheit case: the card stores whole Celsius, so the values a
    // temperature field can settle on are not one apart.
    const LADDER = [190, 192, 194, 196, 198, 199, 201];

    it("steps to the next value on the ladder, not the next integer", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={194} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).toHaveBeenCalledWith(196);
    });

    it("steps back down the ladder", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={196} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Decrease Temperature"));

        expect(onChange).toHaveBeenCalledWith(194);
    });

    it("stays put at the top of the ladder", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={201} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).not.toHaveBeenCalled();
    });

    it("snaps a typed value onto the ladder", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={194} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Edit Temperature"));
        await fireEvent.changeText(screen.getByTestId("stepper-input"), "195");
        await fireEvent(screen.getByTestId("stepper-input"), "submitEditing");

        expect(onChange).toHaveBeenCalledWith(196);
    });

    it("steps by one from a value that is not on the ladder", async () => {
        // A recipe imported before the unit was switched can hold a value the
        // ladder does not contain. The stepper must still move, and must move
        // onto the ladder rather than off into the gaps.
        const onChange = jest.fn();
        await renderWithProviders(
            <Stepper label="Temperature" value={195} min={190} max={201} step={1}
                     values={LADDER} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        expect(onChange).toHaveBeenCalledWith(196);
    });
});
```

Check the top of the existing file for how it imports `screen`, `fireEvent`,
`renderWithProviders` and `Stepper`, and reuse those imports rather than adding
duplicates.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/Stepper.test.tsx
```

Expected: the existing tests PASS; the five new ones FAIL, and `npm run typecheck`
reports that `values` is not a prop of `Stepper`.

- [ ] **Step 3: Add the ladder helper**

In `components/Stepper.tsx`, immediately after the existing `stepped` function,
add:

```ts
/**
 * One step along an explicit list of allowed values.
 *
 * For a field whose legal values are not evenly spaced: a temperature shown in
 * Fahrenheit can settle on 194 or 196 but not 195, because the card stores whole
 * Celsius. Stepping by one and rounding back would sometimes not move the stored
 * value at all, and a control that visibly does nothing cannot be told from a
 * frozen screen.
 *
 * A value that is not on the ladder — a recipe imported before the unit was
 * switched — steps onto the nearest one in the direction asked for, rather than
 * refusing to move.
 */
export function steppedThrough(
    value: number, values: readonly number[], direction: 1 | -1
): number {
    if (values.length === 0) return value;

    const index = values.indexOf(value);
    if (index !== -1) {
        const next = index + direction;
        return next < 0 || next >= values.length ? value : values[next];
    }

    const candidates = direction === 1
        ? values.filter((candidate) => candidate > value)
        : values.filter((candidate) => candidate < value);
    if (candidates.length === 0) return value;
    return direction === 1 ? candidates[0] : candidates[candidates.length - 1];
}

/** The nearest allowed value. For a typed entry. */
export function snapThrough(value: number, values: readonly number[]): number {
    if (values.length === 0) return value;
    return values.reduce((best, candidate) =>
        Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best);
}
```

- [ ] **Step 4: Wire the prop in**

In the `Props` type in `components/Stepper.tsx`, after `step: number;`, add:

```ts
    /**
     * The values this field may settle on, when they are not evenly spaced.
     *
     * Given, a step moves one entry along the list and a typed value snaps to
     * the nearest entry; `step` is then only a hint for the keyboard. Omitted —
     * which is every call site but the temperature field — the stepper works
     * from `min`, `max` and `step` as before.
     */
    values?: readonly number[];
```

Add `values` to the destructured parameter list:

```ts
export default function Stepper({label, value, min, max, step, values, accent, unit, onChange}: Props) {
```

Replace the body of `nudge` with:

```ts
    function nudge(direction: 1 | -1) {
        const next = values
            ? steppedThrough(value, values, direction)
            : stepped(value, step, direction, min, max);
        if (next !== value) onChange(next);
    }
```

Replace the `tick` body inside `startRepeating` with:

```ts
        const tick = () => {
            const current = latestValue.current;
            const next = values
                ? steppedThrough(current, values, direction)
                : stepped(current, step, direction, min, max);
            if (next === current) return;
            onChange(next);
            delay = Math.max(REPEAT_MIN_MS, delay * 0.82);
            repeat.current = setTimeout(tick, delay);
        };
```

Replace the last two lines of `commit` with:

```ts
        const next = values
            ? snapThrough(parsed, values)
            : clamp(parsed, min, max);
        if (next !== value) onChange(next);
```

- [ ] **Step 5: Run it and watch it pass**

```bash
npx jest components/__tests__/Stepper.test.tsx
```

Expected: PASS, the existing tests and the five new ones.

- [ ] **Step 6: Mutation check**

In `steppedThrough`, change `return next < 0 || next >= values.length ? value : values[next];`
to `return values[Math.min(Math.max(next, 0), values.length - 1)];` — which is the
same at the ends. Then change it to `return values[index] ?? value;`.

```bash
npx jest components/__tests__/Stepper.test.tsx
```

Expected: FAIL on "steps to the next value on the ladder". Put it back.

- [ ] **Step 7: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/Stepper.tsx components/__tests__/Stepper.test.tsx
git commit -F - <<'MSG'
Let a stepper walk a list rather than an interval

Every field on the editor has evenly spaced values, so min, max and step have
been enough. A temperature shown in Fahrenheit does not: the card stores whole
Celsius, so the field can settle on 194 or 196 and not on 195. Stepping by one
and rounding back would sometimes leave the stored value where it was, and a
button that visibly does nothing cannot be told from a frozen screen.

The prop is optional and every existing call site is untouched. A value that is
not on the ladder — a recipe imported before the unit was switched — steps onto
the nearest one in the direction asked for rather than refusing to move.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 8: Show and edit the temperature in the chosen unit

**Files:**
- Modify: `components/StageTile.tsx`
- Test: `components/__tests__/StageTile.test.tsx`

`StageTile` currently hard-codes `"°C"` in its header fact and `min={39} max={99}
step={1}` on its temperature stepper. It gains a `temperatureUnit` prop rather
than reading the setting itself: the tile is presentational, its tests construct
it directly, and a hook inside it would make every one of them depend on a
settings store.

- [ ] **Step 1: Write the failing test**

Append to `components/__tests__/StageTile.test.tsx`:

```tsx
describe("StageTile in Fahrenheit", () => {
    it("shows the stage temperature in Fahrenheit", async () => {
        const pour = new Pour();
        pour.setTemperature(93);

        await renderWithProviders(
            <StageTile pour={pour} index={0} count={1} open={false} accent="#FFFFFF"
                       isTea={false} temperatureUnit="F"
                       onToggle={() => {}} onChange={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText("199")).toBeTruthy();
        expect(screen.getByText("°F")).toBeTruthy();
        expect(screen.queryByText("93")).toBeNull();
    });

    it("shows the stage temperature in Celsius by default", async () => {
        const pour = new Pour();
        pour.setTemperature(93);

        await renderWithProviders(
            <StageTile pour={pour} index={0} count={1} open={false} accent="#FFFFFF"
                       isTea={false}
                       onToggle={() => {}} onChange={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText("93")).toBeTruthy();
        expect(screen.getByText("°C")).toBeTruthy();
    });

    it("reports a Fahrenheit step back to the model in Celsius", async () => {
        const pour = new Pour();
        pour.setTemperature(93);
        const onChange = jest.fn();

        await renderWithProviders(
            <StageTile pour={pour} index={0} count={1} open accent="#FFFFFF"
                       isTea={false} temperatureUnit="F"
                       onToggle={() => {}} onChange={onChange} onDelete={() => {}}/>
        );

        await fireEvent.press(screen.getByLabelText("Increase Temperature"));

        // 93 °C is 199 °F; the next value on the ladder is 201 °F, which is 94 °C.
        expect(onChange).toHaveBeenCalledWith(0, "temperature", 94);
    });
});
```

Check the top of the existing `StageTile.test.tsx` for how it builds a `Pour` and
what props it passes, and match that. If the file has a `renderTile` helper, use
it and pass `temperatureUnit` through — do not duplicate its harness.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/StageTile.test.tsx
```

Expected: the new tests FAIL and `npm run typecheck` reports `temperatureUnit` is
not a prop.

- [ ] **Step 3: Take the prop**

In `components/StageTile.tsx`, add the import:

```ts
import {displayValues, displayRange, fromDisplay, toDisplay, unitSuffix,
        type TemperatureUnit} from "@/library/units";
```

Add to `Props`, after `isTea: boolean;`:

```ts
    /**
     * The unit to draw and edit the temperature in. Passed in rather than read
     * here: this tile is presentational, and a settings hook inside it would
     * make every test of it depend on a store.
     */
    temperatureUnit?: TemperatureUnit;
```

Add `temperatureUnit = "C"` to the destructured parameters.

- [ ] **Step 4: Convert the header fact**

Replace

```tsx
                        {fact(pour.getTemperature(), "°C")}
```

with

```tsx
                        {fact(toDisplay(pour.getTemperature(), temperatureUnit),
                              unitSuffix(temperatureUnit))}
```

- [ ] **Step 5: Convert the stepper**

Replace

```tsx
                        <StageValue topic="temperature" value={pour.getTemperature()}
                                    min={39} max={99} step={1}
                                    onChange={(v) => onChange(index, "temperature", v)}/>
```

with

```tsx
                        {/* The one field in the app whose displayed value is not
                            its stored value. The ladder is what the card can
                            actually hold: in Fahrenheit the storable values are
                            not one apart, and a step that did not move the
                            stored value would read as a dead button. */}
                        <StageValue topic="temperature"
                                    value={toDisplay(pour.getTemperature(), temperatureUnit)}
                                    min={displayRange(temperatureUnit).min}
                                    max={displayRange(temperatureUnit).max}
                                    step={1}
                                    values={displayValues(temperatureUnit)}
                                    onChange={(v) =>
                                        onChange(index, "temperature",
                                                 fromDisplay(v, temperatureUnit))}/>
```

- [ ] **Step 6: Let `StageValue` carry the ladder through**

Find the local `StageValue` component near the bottom of `components/StageTile.tsx`.
Add `values?: readonly number[];` to its props type, add `values` to its
destructured parameters, and pass `values={values}` to the `Stepper` it renders.

- [ ] **Step 7: Run it and watch it pass**

```bash
npx jest components/__tests__/StageTile.test.tsx
```

Expected: PASS, existing and new.

- [ ] **Step 8: Mutation check**

Change the `onChange` on the temperature `StageValue` to pass `v` straight
through instead of `fromDisplay(v, temperatureUnit)`.

```bash
npx jest components/__tests__/StageTile.test.tsx
```

Expected: FAIL on "reports a Fahrenheit step back to the model in Celsius". This
is the mutation that matters most in the whole phase — it is the one that would
write 201 to a card as if it were Celsius. Put it back.

- [ ] **Step 9: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/StageTile.tsx components/__tests__/StageTile.test.tsx
git commit -F - <<'MSG'
Draw and edit the stage temperature in the chosen unit

The only field in the app whose displayed value is not its stored value. The
conversion is at this boundary and nowhere else, so everything behind it — the
Pour, the Recipe, the byte written to the card — stays in whole Celsius.

The unit arrives as a prop rather than being read here. This tile is
presentational and its tests construct it directly; a settings hook inside it
would make every one of them depend on a store in order to check a layout.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 9: Pass the unit down from the editor

**Files:**
- Modify: `app/editRecipe.tsx`
- Test: `app/__tests__/editRecipe.test.tsx`

- [ ] **Step 1: Find the `StageTile` call site**

```bash
grep -n "StageTile" app/editRecipe.tsx
```

- [ ] **Step 2: Write the failing test**

Look at how `app/__tests__/editRecipe.test.tsx` fakes settings — it uses a
`mockSettings` object at lines 256 and 277. Follow that pattern and append a test
inside the appropriate `describe`:

```tsx
    it("draws stage temperatures in the unit the user chose", async () => {
        mockSettings = {temperatureUnit: "F"};

        await renderEditor();

        expect(screen.getAllByText("°F").length).toBeGreaterThan(0);
    });
```

Read the surrounding tests first and match their setup exactly — `renderEditor`
is this plan's placeholder for whatever helper that file already uses. If
`mockSettings` is reset between tests, reset it the same way.

- [ ] **Step 3: Run it and watch it fail**

```bash
npx jest app/__tests__/editRecipe.test.tsx
```

Expected: FAIL — no `°F` on screen.

- [ ] **Step 4: Read the setting and pass it**

In `app/editRecipe.tsx`, beside the existing `useSetting("showHints")` call, add:

```ts
    const [temperatureUnit] = useSetting("temperatureUnit");
```

and add `temperatureUnit={temperatureUnit}` to the `StageTile` element.

- [ ] **Step 5: Run it and watch it pass**

```bash
npx jest app/__tests__/editRecipe.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Mutation check**

Remove the `temperatureUnit={temperatureUnit}` prop. The new test must FAIL. Put
it back.

- [ ] **Step 7: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/editRecipe.tsx app/__tests__/editRecipe.test.tsx
git commit -F - <<'MSG'
Hand the editor's stages the unit the user chose

One read of the setting, at the screen, passed down. The tiles stay
presentational.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 10: Say the range in the unit the user is reading

Two places describe the temperature range in words: the out-of-range message from
`cardWriteProblems`, which a user sees when a card is refused, and the hint in
`constants/recipeHelp.ts`.

The hint is the easier of the two and gets the simpler treatment: it names both
ranges, statically. It is not currently rendered anywhere — `temperature` has no
`detail`, so it is not in `DETAILED_TOPICS`, and `StageTile` draws no hints — so
making it dynamic would be machinery in support of nothing.

**Files:**
- Modify: `library/cardLimits.ts`
- Modify: `constants/recipeHelp.ts`
- Modify: `hooks/useRecipeEditor.ts`
- Test: `library/__tests__/cardLimits.test.ts`
- Test: `constants/__tests__/recipeHelp.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `library/__tests__/cardLimits.test.ts`, inside its outermost `describe`:

```ts
    it("reports an out-of-range temperature in Celsius by default", () => {
        const recipe = validRecipe();
        recipe.pours[0].temperature = 120;
        expect(cardWriteProblems(recipe)).toContain(
            "Stage 1 brews at 120 C. The range is 39-99 C."
        );
    });

    it("reports an out-of-range temperature in Fahrenheit when that is what is shown", () => {
        // A user reading the editor in Fahrenheit and told the range is 39-99
        // has been given a number they cannot act on.
        const recipe = validRecipe();
        recipe.pours[0].temperature = 120;
        expect(cardWriteProblems(recipe, "F")).toContain(
            "Stage 1 brews at 248 F. The range is 102-210 F."
        );
    });
```

Check the first test against the exact string the existing code produces before
relying on it — run `npx jest library/__tests__/cardLimits.test.ts -t "Celsius by
default"` and read the diff. Fix the expected string to match, not the code.

Append to `constants/__tests__/recipeHelp.test.ts`:

```ts
    it("gives the temperature range in both units", () => {
        expect(RECIPE_HELP.temperature.hint).toContain("39");
        expect(RECIPE_HELP.temperature.hint).toContain("99");
        expect(RECIPE_HELP.temperature.hint).toContain("102");
        expect(RECIPE_HELP.temperature.hint).toContain("210");
    });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx jest library/__tests__/cardLimits.test.ts constants/__tests__/recipeHelp.test.ts
```

Expected: the Fahrenheit test and the hint test FAIL.

- [ ] **Step 3: Make the message unit-aware**

In `library/cardLimits.ts`, add the import:

```ts
import {displayRange, toDisplay, type TemperatureUnit} from "./units";
```

Change the signature:

```ts
export function cardWriteProblems(
    recipe: Recipe,
    temperatureUnit: TemperatureUnit = "C"
): string[] {
```

Replace the temperature message block with:

```ts
        // Said in the unit the user is reading the editor in. A message that
        // reports a Fahrenheit field as out of a Celsius range gives them a
        // number they cannot act on.
        const shownTemp = toDisplay(pour.temperature, temperatureUnit);
        const tempRange = displayRange(temperatureUnit);
        const tempMsg =
            `Stage ${stage} brews at ${shownTemp} ${temperatureUnit}. ` +
            `The range is ${tempRange.min}-${tempRange.max} ${temperatureUnit}.`;
```

Leave the `outside(pour.temperature, TEMPERATURE)` check exactly as it is: the
check is on the stored value, only the wording changes.

`toDisplay` does not clamp, so an out-of-range 120 °C reports as 248 F — which is
the point. `checkInteger` keeps using the same message.

- [ ] **Step 4: Update the hint**

In `constants/recipeHelp.ts`, change the temperature entry's hint to:

```ts
        hint:  "39 to 99 °C, or 102 to 210 °F.",
```

- [ ] **Step 5: Pass the unit from the editor hook**

In `hooks/useRecipeEditor.ts`, add:

```ts
import {useSetting} from "@/hooks/useSetting";
```

if it is not already imported, then inside the hook:

```ts
    const [temperatureUnit] = useSetting("temperatureUnit");
```

and change

```ts
    const writeProblems = recipe ? cardWriteProblems(recipe) : [];
```

to

```ts
    const writeProblems = recipe ? cardWriteProblems(recipe, temperatureUnit) : [];
```

If `useRecipeEditor` takes an injected settings store in its existing tests, pass
that through as `useSetting`'s second argument the way the rest of the codebase
does. Check `hooks/__tests__/useRecipeEditor.test.ts` before changing the
signature — if it does not, do not add one.

- [ ] **Step 6: Run everything that touches these**

```bash
npx jest library/__tests__/cardLimits.test.ts constants/__tests__/recipeHelp.test.ts hooks/__tests__/useRecipeEditor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Mutation check**

In `cardLimits.ts`, drop the `toDisplay` call so `shownTemp` is `pour.temperature`.
The Fahrenheit test must FAIL. Put it back.

- [ ] **Step 8: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/cardLimits.ts constants/recipeHelp.ts hooks/useRecipeEditor.ts library/__tests__/cardLimits.test.ts constants/__tests__/recipeHelp.test.ts
git commit -F - <<'MSG'
Say the temperature range in the unit on screen

A user reading the editor in Fahrenheit, told their stage is outside 39 to 99,
has been handed a number that matches nothing in front of them. The check is
still on the stored Celsius; only the wording moves.

The help hint names both ranges statically rather than following the setting. It
is not rendered anywhere today — temperature has no long form, so it is not in
DETAILED_TOPICS, and the stage tiles draw no hints — so making it dynamic would
be machinery in support of nothing.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 11: The Units section on the settings screen

**Files:**
- Modify: `app/settings.tsx`
- Test: `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe("SettingsScreen", ...)`:

```tsx
    it("offers Celsius and Fahrenheit, starting on Celsius", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText("UNITS")).toBeTruthy();
        expect(screen.getByLabelText("°C").props.accessibilityState.checked).toBe(true);
        expect(screen.getByLabelText("°F").props.accessibilityState.checked).toBe(false);
    });

    it("persists a switch to Fahrenheit", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent.press(screen.getByLabelText("°F"));

        expect(new Settings(storage).get("temperatureUnit")).toBe("F");
    });

    it("says what the unit changes and what it does not", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText(/card always stores/i)).toBeTruthy();
    });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: three FAILs.

- [ ] **Step 3: Add the section**

In `app/settings.tsx`, add the imports:

```tsx
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import type {TemperatureUnit} from "@/library/units";
```

Add above the component, at module scope:

```tsx
const TEMPERATURE_OPTIONS = [
    {value: "C", label: "°C"},
    {value: "F", label: "°F"}
] as const;
```

Read the setting:

```ts
    const [temperatureUnit, setTemperatureUnit] = useSetting("temperatureUnit", settings);
```

And add the section after the recipe list one:

```tsx
                <SettingsSection title="Units">
                    <SettingsChoiceRow
                        label="Temperature"
                        description="What the editor shows and takes. The card always stores Celsius, so switching back and forth changes nothing that is written."
                        value={temperatureUnit}
                        options={TEMPERATURE_OPTIONS}
                        onChange={(value) => setTemperatureUnit(value as TemperatureUnit)}/>
                </SettingsSection>
```

The cast is needed because `SegmentedControl` is typed on `string` — it has to
be, since it serves the editor's pattern and agitation rows too. Narrowing it
back here is the smallest honest place to do it.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Mutation check**

Change the `onChange` to `() => setTemperatureUnit("C")`. "persists a switch to
Fahrenheit" must FAIL. Put it back.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/settings.tsx app/__tests__/settings.test.tsx
git commit -F - <<'MSG'
Let the user choose Celsius or Fahrenheit

The description says what the switch does not do as well as what it does: the
card stores Celsius whatever is on screen, so a user who tries Fahrenheit and
changes their mind has not altered a recipe.

Only temperature is offered. Coffee is weighed in grams everywhere it is taken
seriously, and the ratio is dimensionless — a volume in fluid ounces would leave
the ratio beside it corresponding to nothing on screen.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 12: Prove the round trip on a real recipe

The unit phase's real risk is not arithmetic — it is that something converts
twice, or converts on save. This is the test that catches that.

**Files:**
- Test: `library/__tests__/units.roundtrip.test.ts`

- [ ] **Step 1: Write it**

Create `library/__tests__/units.roundtrip.test.ts`:

```ts
import {toDisplay, fromDisplay, CELSIUS_RANGE} from "@/library/units";
import Recipe from "@/library/Recipe";

/**
 * The promise the units feature makes: switching to Fahrenheit and back must
 * produce a byte-identical card.
 *
 * Deliberately at the byte level rather than at the field. Every arithmetic
 * check in units.test.ts could pass while something converted twice, or
 * converted on save, and only the bytes would show it.
 */
describe("switching units and switching back", () => {
    it("leaves the card bytes untouched", () => {
        const recipe = new Recipe();
        const before = JSON.stringify(recipe.getData(new Uint8Array(32)));

        for (const pour of recipe.pours) {
            const shown = toDisplay(pour.temperature, "F");
            pour.temperature = fromDisplay(shown, "F");
        }

        expect(JSON.stringify(recipe.getData(new Uint8Array(32)))).toBe(before);
    });

    it("survives a pass through every storable temperature", () => {
        const recipe = new Recipe();
        for (let c = CELSIUS_RANGE.min; c <= CELSIUS_RANGE.max; c++) {
            recipe.pours[0].temperature = c;
            const before = JSON.stringify(recipe.getData(new Uint8Array(32)));

            recipe.pours[0].temperature =
                fromDisplay(toDisplay(c, "F"), "F");

            expect(JSON.stringify(recipe.getData(new Uint8Array(32)))).toBe(before);
        }
    });
});
```

> **This file is new and lives in `library/__tests__/`, which the house rules say
> must not change.** That rule is about not altering the existing
> characterisation tests. Adding a new file that asserts the format is
> _unchanged_ is the opposite of a violation. Do not modify any existing file in
> that directory.

- [ ] **Step 2: Run it**

```bash
npx jest library/__tests__/units.roundtrip.test.ts
```

Expected: PASS. If `new Recipe()` needs arguments or `getData` has a different
signature, read `library/__tests__/Recipe.card.test.ts` and copy how it builds a
recipe and gets its bytes — do not guess.

- [ ] **Step 3: Mutation check**

In `library/units.ts`, change `fromDisplay`'s Fahrenheit branch to
`(value - 32) * 5 / 9 + 0.6`. This test must FAIL. Put it back.

- [ ] **Step 4: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/__tests__/units.roundtrip.test.ts
git commit -F - <<'MSG'
Pin the units promise at the byte level

Every arithmetic check in units.test.ts could pass while something in the app
converted twice, or converted on save. Only the bytes would show it, and a
malformed write to a genuine card is not trivially recoverable.

This asserts the card format is untouched by a full pass through Fahrenheit, for
every one of the storable temperatures.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---
# Phase 3 — About

`app/about.tsx`, pushed from the settings identity row. Eight content blocks,
one of which moves.

**Files this phase creates or modifies:**

| File | Responsibility |
|---|---|
| `scripts/generate-licences.sh` (create) | Walks the installed tree, writes the licence list |
| `constants/licences.ts` (create, generated) | The committed licence list |
| `components/LivingMark.tsx` (create) | The `++` drawn as dots that breathe and scatter |
| `components/AboutTicker.tsx` (create) | The idle attract-mode ticker |
| `app/about.tsx` (create) | The screen |
| `app/_layout.tsx` (modify) | Registers the route |
| `app/settings.tsx` (modify) | The identity row that pushes it |

---

### Task 13: Generate the licence list

**Files:**
- Create: `scripts/generate-licences.sh`
- Create: `constants/licences.ts` (by running the script)
- Test: `constants/__tests__/licences.test.ts`

- [ ] **Step 1: Read the existing convention**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
cat scripts/generate-icons.sh
```

Match its shape: a bash wrapper with an inline `python3 - <<'PYTHON'` heredoc, a
generated-file banner, and the same header comment style.

- [ ] **Step 2: Write the failing test**

Create `constants/__tests__/licences.test.ts`:

```ts
import {LICENCES} from "@/constants/licences";

describe("the generated licence list", () => {
    it("is not empty", () => {
        expect(LICENCES.length).toBeGreaterThan(0);
    });

    it("names a licence and a version for every entry", () => {
        for (const entry of LICENCES) {
            expect(entry.name).toBeTruthy();
            expect(entry.version).toBeTruthy();
            expect(entry.licence).toBeTruthy();
        }
    });

    it("is sorted, so a regeneration produces a readable diff", () => {
        const names = LICENCES.map((entry) => entry.name);
        expect([...names].sort()).toEqual(names);
    });

    it("lists no package twice", () => {
        const names = LICENCES.map((entry) => entry.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("covers the dependencies this app actually declares", () => {
        // A generator that quietly misses the tree is worse than no list: it
        // produces a confident, wrong one, and the obligation here is legal.
        const names = new Set(LICENCES.map((entry) => entry.name));
        for (const declared of ["expo", "react", "react-native", "tamagui"]) {
            expect(names.has(declared)).toBe(true);
        }
    });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx jest constants/__tests__/licences.test.ts
```

Expected: FAIL — `Cannot find module '@/constants/licences'`.

- [ ] **Step 4: Write the generator**

Create `scripts/generate-licences.sh` and `chmod +x` it:

```bash
#!/usr/bin/env bash
#
# Writes constants/licences.ts from the installed dependency tree.
#
# Generated but committed, following scripts/generate-icons.sh: the build does
# not depend on this having been run, but this is the only sanctioned way to
# change the output. A hand-maintained list would be wrong within one dependency
# bump, and the obligation is legal rather than cosmetic.
#
# Run after any change to package.json's dependencies:
#
#     ./scripts/generate-licences.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PYTHON'
import json, os, pathlib

root = pathlib.Path(".")
pkg = json.loads((root / "package.json").read_text())

def manifest(name):
    """The installed package.json for a dependency, or None."""
    path = root / "node_modules" / pathlib.Path(*name.split("/")) / "package.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None

def licence_of(data):
    """npm has used three shapes for this field over the years."""
    value = data.get("license") or data.get("licenses")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("type", "See package")
    if isinstance(value, list) and value:
        first = value[0]
        if isinstance(first, dict):
            return first.get("type", "See package")
        return str(first)
    return "See package"

# Transitive closure over runtime dependencies only. devDependencies are not
# shipped, so they carry no distribution obligation.
seen = {}
queue = list(pkg.get("dependencies", {}).keys())
while queue:
    name = queue.pop()
    if name in seen:
        continue
    data = manifest(name)
    if data is None:
        # Not installed: an optional peer, or a platform-specific package that
        # this machine skipped. Recorded so a reader can tell the difference
        # between "no obligation" and "not looked at".
        seen[name] = {"version": "not installed", "licence": "unknown"}
        continue
    seen[name] = {
        "version": data.get("version", "unknown"),
        "licence": licence_of(data)
    }
    queue.extend(data.get("dependencies", {}).keys())

lines = [
    "/**",
    " * Open-source licences, for the About screen.",
    " *",
    " * GENERATED FILE — do not edit by hand.",
    " * Regenerate with ./scripts/generate-licences.sh after changing dependencies.",
    " */",
    "",
    "export type Licence = {",
    "    name: string;",
    "    version: string;",
    "    licence: string;",
    "};",
    "",
    "export const LICENCES: readonly Licence[] = ["
]
for name in sorted(seen):
    entry = seen[name]
    lines.append(
        '    {name: %s, version: %s, licence: %s},'
        % (json.dumps(name), json.dumps(entry["version"]), json.dumps(entry["licence"]))
    )
lines.append("];")
lines.append("")

pathlib.Path("constants/licences.ts").write_text("\n".join(lines))
print("Wrote constants/licences.ts with %d packages." % len(seen))
PYTHON
```

- [ ] **Step 5: Run it**

```bash
chmod +x scripts/generate-licences.sh
./scripts/generate-licences.sh
```

Expected: "Wrote constants/licences.ts with N packages", N in the hundreds.

- [ ] **Step 6: Run the test and watch it pass**

```bash
npx jest constants/__tests__/licences.test.ts
```

Expected: PASS, 5 tests.

If the "covers the dependencies this app actually declares" test fails, the walk
is missing something real. Fix the generator, not the test.

- [ ] **Step 7: Mutation check**

Change `queue = list(pkg.get("dependencies", {}).keys())` to
`queue = ["expo"]`, regenerate, and run the test. It must FAIL on the coverage
test. Put both the script and the generated file back.

- [ ] **Step 8: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add scripts/generate-licences.sh constants/licences.ts constants/__tests__/licences.test.ts
git commit -F - <<'MSG'
Generate the licence list rather than maintain one

App Store distribution expects the open-source licences to be listed, and a
hand-written list would be wrong within one dependency bump. The script walks the
runtime dependency tree transitively — devDependencies are not shipped, so they
carry no obligation — and writes a committed constants/licences.ts.

Generated but committed follows generate-icons.sh: the build does not depend on
the script having been run, and the script is the only sanctioned way to change
its output. The test asserts the walk reaches the dependencies this app actually
declares, because a generator that quietly misses the tree produces a confident,
wrong list, and the obligation here is legal rather than cosmetic.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 14: The living `++` mark

**Files:**
- Create: `components/LivingMark.tsx`
- Test: `components/__tests__/LivingMark.test.tsx`

Before writing, read `components/DotIcon.tsx` and `constants/dotIcons.ts`. The
grid is `DOT_ICON_GRID` (9), the glyph is `DOT_ICONS.plus`, and `litCells(glyph)`
answers which cells are on. This component reuses that machinery rather than
inventing a second dot renderer — which is both cheaper and the only way the
app's animated moments stay in one visual language.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/LivingMark.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import LivingMark from "@/components/LivingMark";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

import {useReducedMotion} from "@/constants/motion";
const mockReducedMotion = useReducedMotion as jest.Mock;

describe("LivingMark", () => {
    beforeEach(() => mockReducedMotion.mockReturnValue(false));

    it("draws the mark as dots", async () => {
        await renderWithProviders(<LivingMark size={120}/>);
        // Two plus glyphs, each a 9x9 grid of lit cells.
        expect(screen.getAllByTestId("living-mark-dot").length).toBeGreaterThan(1);
    });

    it("names itself for a screen reader, which cannot see dots", async () => {
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("still draws the mark under Reduce Motion", async () => {
        // The requirement is that it renders static, not that it disappears.
        mockReducedMotion.mockReturnValue(true);
        await renderWithProviders(<LivingMark size={120}/>);
        expect(screen.getAllByTestId("living-mark-dot").length).toBeGreaterThan(1);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });

    it("survives a tap", async () => {
        // The scatter is a Reanimated shared value, which a unit test cannot
        // observe. What it can prove is that the gesture is wired and does not
        // throw, which is the failure that would take the screen down.
        await renderWithProviders(<LivingMark size={120}/>);
        await fireEvent.press(screen.getByLabelText("XBRW++"));
        expect(screen.getAllByTestId("living-mark-dot").length).toBeGreaterThan(1);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/LivingMark.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `components/LivingMark.tsx`:

```tsx
import React, {useEffect} from "react";
import {Pressable} from "react-native";
import Animated, {
    useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence,
    withSpring, withTiming
} from "react-native-reanimated";
import {XStack} from "tamagui";

import {palette} from "@/constants/colors";
import {DOT_ICONS, DOT_ICON_GRID, litCells} from "@/constants/dotIcons";
import {SPRING, useReducedMotion} from "@/constants/motion";

type Cell = {
    row: number;
    column: number;
    /** Where this dot flies to when the mark is tapped, in dot widths. */
    scatterX: number;
    scatterY: number;
    /** Staggers the breath so the mark ripples rather than pulsing as a block. */
    phase: number;
};

const BREATH_MS = 2400;

/**
 * The lit cells of both plus signs, laid out side by side, resolved once.
 *
 * At module scope because the layout is a constant: it depends on the glyph
 * bitmap and nothing else, so recomputing it per render would be work in
 * support of the same answer. The scatter offsets are fixed here too, so a dot
 * flies the same way every time rather than somewhere new on each tap — which
 * reads as a mark coming apart rather than as noise.
 */
const CELLS: Cell[] = (() => {
    const lit = litCells(DOT_ICONS.plus);
    const cells: Cell[] = [];
    for (const mark of [0, 1]) {
        for (const cell of lit) {
            const column = cell.column + mark * (DOT_ICON_GRID + 1);
            // Deterministic pseudo-random: the same cell always flies the same
            // way, and no random number generator has to be seeded for a test.
            const angle = (cell.row * 7 + column * 13) % 360;
            const radius = 3 + ((cell.row * 5 + column * 3) % 5);
            cells.push({
                row: cell.row,
                column,
                scatterX: Math.cos(angle * Math.PI / 180) * radius,
                scatterY: Math.sin(angle * Math.PI / 180) * radius,
                phase: ((cell.row * 3 + column * 5) % 8) * 90
            });
        }
    }
    return cells;
})();

const COLUMNS = DOT_ICON_GRID * 2 + 1;

type Props = {
    /** Width of the whole mark, in points. */
    size: number;
};

/**
 * The `++` of XBRW++, drawn as dots that breathe and scatter.
 *
 * The app's one moment of personality, and deliberately built out of the dot
 * machinery the icons already use rather than a second animation system. Under
 * Reduce Motion it renders as a static mark: the screen must be complete
 * without the movement, so the movement is the only thing that goes.
 */
export default function LivingMark({size}: Props) {
    const reduced = useReducedMotion();
    const breath = useSharedValue(0);
    const scatter = useSharedValue(0);
    const dot = size / (COLUMNS + (COLUMNS - 1) * 0.35);
    const gap = dot * 0.35;

    useEffect(() => {
        if (reduced) {
            breath.value = 0;
            return;
        }
        breath.value = withRepeat(
            withSequence(
                withTiming(1, {duration: BREATH_MS / 2}),
                withTiming(0, {duration: BREATH_MS / 2})
            ),
            -1, false
        );
    }, [reduced, breath]);

    function onPress() {
        if (reduced) return;
        scatter.value = withSequence(
            withTiming(1, {duration: 220}),
            withDelay(120, withSpring(0, SPRING.settle))
        );
    }

    return (
        <Pressable accessibilityRole="image" accessibilityLabel="XBRW++"
                   onPress={onPress}>
            <XStack width={size} height={dot * DOT_ICON_GRID + gap * (DOT_ICON_GRID - 1)}>
                {CELLS.map((cell) => (
                    <MarkDot key={`${cell.row}-${cell.column}`} cell={cell}
                             dot={dot} gap={gap} breath={breath} scatter={scatter}/>
                ))}
            </XStack>
        </Pressable>
    );
}

type DotProps = {
    cell: Cell;
    dot: number;
    gap: number;
    breath: Animated.SharedValue<number>;
    scatter: Animated.SharedValue<number>;
};

/**
 * One dot.
 *
 * At module scope, like every component in this repository: declared inside
 * `LivingMark` it would be a new type on every render and React would remount
 * every dot, taking each one's animation with it.
 */
function MarkDot({cell, dot, gap, breath, scatter}: DotProps) {
    const style = useAnimatedStyle(() => {
        const phased = Math.sin((breath.value * 360 + cell.phase) * Math.PI / 180);
        return {
            opacity: 0.72 + phased * 0.28 - scatter.value * 0.4,
            transform: [
                {translateX: scatter.value * cell.scatterX * (dot + gap)},
                {translateY: scatter.value * cell.scatterY * (dot + gap)},
                {scale: 1 + phased * 0.08}
            ]
        };
    });

    return (
        <Animated.View testID="living-mark-dot" style={[
            {
                position: "absolute",
                left: cell.column * (dot + gap),
                top: cell.row * (dot + gap),
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: palette.text
            },
            style
        ]}/>
    );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest components/__tests__/LivingMark.test.tsx
```

Expected: PASS, 4 tests.

If `litCells` has a different return shape than `{row, column}`, read
`constants/dotIcons.ts` and adapt — do not guess. If `SPRING.settle` does not
exist, use whichever key `constants/motion.ts` actually exports for a settling
spring.

- [ ] **Step 5: Mutation check**

Remove the `if (reduced) { breath.value = 0; return; }` guard.

```bash
npx jest components/__tests__/LivingMark.test.tsx
```

The suite will still pass — a unit test cannot observe a Reanimated shared value.
**This is a known coverage gap and it is why Reduce Motion is on the device
checklist in Phase 6.** Note it and move on; do not weaken the component to make
it testable.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/LivingMark.tsx components/__tests__/LivingMark.test.tsx
git commit -F - <<'MSG'
Draw the ++ as dots that breathe

The app's one moment of personality, built out of the dot-icon machinery rather
than a second animation system — which is both the cheaper option and the only
one that keeps the app's animated moments speaking one visual language.

The layout and the scatter offsets are resolved once at module scope. They
depend on the glyph bitmap and nothing else, and fixing the offsets means a dot
flies the same way every time, which reads as a mark coming apart rather than as
noise.

Under Reduce Motion it renders static. The screen is complete without the
movement, so the movement is the only thing that goes.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 15: The idle ticker

**Files:**
- Create: `components/AboutTicker.tsx`
- Test: `components/__tests__/AboutTicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/AboutTicker.test.tsx`:

```tsx
import React from "react";
import {act, screen} from "@testing-library/react-native";

import AboutTicker from "@/components/AboutTicker";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotion: jest.fn(() => false)
}));

import {useReducedMotion} from "@/constants/motion";
const mockReducedMotion = useReducedMotion as jest.Mock;

describe("AboutTicker", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockReducedMotion.mockReturnValue(false);
    });
    afterEach(() => jest.useRealTimers());

    it("says nothing at first", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST", "SECOND"]}/>);
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });

    it("is still silent just before its delay", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(7900);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });

    it("starts once the screen has been left alone", async () => {
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(8100);
        });
        expect(screen.getByTestId("about-ticker")).toBeTruthy();
    });

    it("never starts under Reduce Motion", async () => {
        // Not "starts and then holds still" — an attract mode is motion, and a
        // user who asked for less of it did not ask for a slower version.
        mockReducedMotion.mockReturnValue(true);
        await renderWithProviders(<AboutTicker lines={["FIRST"]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(60000);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });

    it("says nothing when it has nothing to say", async () => {
        await renderWithProviders(<AboutTicker lines={[]} delayMs={8000}/>);
        await act(async () => {
            jest.advanceTimersByTime(9000);
        });
        expect(screen.queryByTestId("about-ticker")).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/AboutTicker.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `components/AboutTicker.tsx`:

```tsx
import React, {useEffect, useState} from "react";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useReducedMotion} from "@/constants/motion";

/** Long enough that nobody reading the screen meets it by accident. */
const DEFAULT_DELAY_MS = 8000;
const LINE_MS = 4200;

type Props = {
    lines: readonly string[];
    /** Overridable so a test does not have to know the production value. */
    delayMs?: number;
};

/**
 * An attract mode.
 *
 * Nothing at all until the screen has been open and untouched for several
 * seconds, then a dot-matrix line cycling underneath the mark, in the register
 * of a 90s crack intro. Idling into a scroller is what that era actually did,
 * and it makes the flourish a reward for lingering rather than a novelty that
 * greets everyone who came to check a version number.
 *
 * Under Reduce Motion it does not start at all. A slower attract mode is still
 * an attract mode, and a user who asked for less movement did not ask for a
 * gentler version of the movement.
 */
export default function AboutTicker({lines, delayMs = DEFAULT_DELAY_MS}: Props) {
    const reduced = useReducedMotion();
    const [started, setStarted] = useState(false);
    const [index, setIndex] = useState(0);
    const silent = reduced || lines.length === 0;

    useEffect(() => {
        if (silent) return;
        const timer = setTimeout(() => setStarted(true), delayMs);
        return () => clearTimeout(timer);
    }, [silent, delayMs]);

    useEffect(() => {
        if (!started || silent) return;
        const timer = setInterval(
            () => setIndex((current) => (current + 1) % lines.length),
            LINE_MS
        );
        return () => clearInterval(timer);
    }, [started, silent, lines.length]);

    if (!started || silent) return null;

    return (
        <DotMatrixText testID="about-ticker" fontSize={11} weight="bold"
                       letterSpacing={2} color={palette.muted}>
            {lines[index % lines.length].toUpperCase()}
        </DotMatrixText>
    );
}
```

`setStarted` is called from a timer rather than during render, so
`react-hooks/set-state-in-effect` — which is an error in this repository — is not
triggered.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest components/__tests__/AboutTicker.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Mutation check**

Change `const silent = reduced || lines.length === 0;` to
`const silent = lines.length === 0;`. "never starts under Reduce Motion" must
FAIL. Then change `setTimeout(..., delayMs)` to `setTimeout(..., 0)`; "is still
silent just before its delay" must FAIL. Put both back.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/AboutTicker.tsx components/__tests__/AboutTicker.test.tsx
git commit -F - <<'MSG'
An attract mode, for whoever stays

Nothing at all until the About screen has been open and untouched for several
seconds, then a dot-matrix line cycling under the mark. Idling into a scroller is
what the era this app borrows from actually did, and the delay is the point: the
flourish rewards lingering rather than greeting everyone who came to check a
version number.

Under Reduce Motion it does not start. A slower attract mode is still an attract
mode.

Eight seconds is a starting value to be tuned on a device.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 16: The About screen

**Files:**
- Create: `app/about.tsx`
- Modify: `app/_layout.tsx`
- Test: `app/__tests__/about.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/about.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import AboutScreen from "@/app/about";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-application", () => ({
    nativeApplicationVersion: "2.6.0",
    nativeBuildVersion: "42"
}));

describe("AboutScreen", () => {
    it("says which version this is, because a bug report without one is useless", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/2\.6\.0/)).toBeTruthy();
        expect(screen.getByText(/42/)).toBeTruthy();
    });

    it("states that it is unofficial, in plain sight", async () => {
        // Not behind a tap, an accordion or a scroll-to-reveal. The app uses
        // xBloom's marks, reads their cards and calls their undocumented API,
        // and has never said so anywhere.
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/not affiliated with/i)).toBeTruthy();
        expect(screen.getByText(/xBloom/)).toBeTruthy();
    });

    it("says what leaves the phone", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/stay on this phone/i)).toBeTruthy();
    });

    it("explains why only genuine cards work", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/signature/i)).toBeTruthy();
    });

    it("offers somewhere to report a fault", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByRole("link", {name: /report an issue/i})).toBeTruthy();
        expect(screen.getByRole("link", {name: /source code/i})).toBeTruthy();
    });

    it("lists the open-source licences", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByText(/open-source/i)).toBeTruthy();
    });

    it("draws the mark", async () => {
        await renderWithProviders(<AboutScreen/>);
        expect(screen.getByLabelText("XBRW++")).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest app/__tests__/about.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Install `expo-application`**

```bash
./node_modules/.bin/expo install expo-application
```

`npm 12`'s `npx` swallows flags, so call the binary directly. `expo-application`
reads the version out of the built app, which is the only number that is true of
the binary in the user's hand — `app.json` is what the last build was made from,
which is not the same thing after an OTA update.

- [ ] **Step 4: Write the screen**

Create `app/about.tsx`:

```tsx
import * as Application from "expo-application";
import React from "react";
import {Linking} from "react-native";
import {ScrollView, Text, YStack} from "tamagui";

import AboutTicker from "@/components/AboutTicker";
import LivingMark from "@/components/LivingMark";
import SettingsSection from "@/components/SettingsSection";
import {palette} from "@/constants/colors";
import {LICENCES} from "@/constants/licences";

const REPO_URL = "https://github.com/hessius/XBRecipeWriterPlus";
const ISSUES_URL = "https://github.com/hessius/XBRecipeWriterPlus/issues";

/**
 * Lines for the idle ticker.
 *
 * Facts about the app rather than jokes about it: the register is a 90s crack
 * intro, and what those actually scrolled was information nobody had asked for.
 */
const TICKER_LINES = [
    "READS AND WRITES GENUINE XBLOOM CARDS",
    "EVERY RECIPE LIVES ON THIS PHONE",
    "THIRTY-TWO BYTES OF SIGNATURE PER CARD",
    "ONE BYTE OF WHOLE CELSIUS PER STAGE",
    "MADE BY HESSIUS"
];

const VERSION = Application.nativeApplicationVersion ?? "unknown";
const BUILD = Application.nativeBuildVersion ?? "unknown";

/**
 * About.
 *
 * Reached from the identity row at the top of settings. Every block here is
 * something a user or a reviewer needed and could not find: which build they are
 * running, whose app this is and whose it is not, what leaves the phone, why a
 * blank card will not take a recipe, and where to report a fault.
 *
 * The disclaimer is not behind an interaction. This app uses xBloom's marks,
 * reads their cards and calls their undocumented API, and it has never said so
 * anywhere.
 */
export default function AboutScreen() {
    return (
        <ScrollView backgroundColor={palette.base}
                    contentContainerStyle={{padding: 16, paddingBottom: 48}}>
            <YStack alignItems="center" gap="$3" paddingVertical="$6">
                <LivingMark size={180}/>
                <AboutTicker lines={TICKER_LINES}/>
            </YStack>

            <YStack alignItems="center" gap="$1" paddingBottom="$4">
                <Text fontSize={16} color={palette.text}>XBRecipeWriter++</Text>
                <Text fontSize={13} color={palette.dim}>
                    Version {VERSION} (build {BUILD})
                </Text>
            </YStack>

            <SettingsSection title="Independent">
                <AboutParagraph>
                    XBRecipeWriter++ is not affiliated with, endorsed by or
                    supported by xBloom. xBloom and its logos are the trademarks
                    of their owner, used here only to say which machine and which
                    cards this app works with.
                </AboutParagraph>
                <AboutParagraph>
                    It reads and writes xBloom recipe cards, and it can import a
                    shared recipe from xBloom&apos;s own service. Neither
                    capability is documented or guaranteed, and either may stop
                    working without notice.
                </AboutParagraph>
            </SettingsSection>

            <SettingsSection title="What leaves your phone">
                <AboutParagraph>
                    Your recipes stay on this phone. There is no account, no sync
                    and no analytics.
                </AboutParagraph>
                <AboutParagraph>
                    Importing a shared recipe sends that recipe&apos;s ID to
                    xBloom in order to fetch it. Nothing else is sent anywhere. A
                    backup goes only where you send it.
                </AboutParagraph>
            </SettingsSection>

            <SettingsSection title="Why only genuine cards work">
                <AboutParagraph>
                    The first 32 bytes of every xBloom card are a signature
                    derived from that card&apos;s serial number. This app cannot
                    compute one, so it reads the signature off the card and
                    writes it back untouched.
                </AboutParagraph>
                <AboutParagraph>
                    That is why a recipe can be written to a card that came with
                    coffee in it, and why a blank card will not take one.
                </AboutParagraph>
            </SettingsSection>

            <SettingsSection title="Made by">
                <AboutParagraph>
                    Built by Jesper Hessius. Free, open source, and not for sale.
                </AboutParagraph>
                <AboutLink label="Source code" url={REPO_URL}/>
                <AboutLink label="Report an issue" url={ISSUES_URL}/>
            </SettingsSection>

            <SettingsSection title="Open-source licences">
                <AboutParagraph>
                    This app stands on {LICENCES.length} open-source packages.
                </AboutParagraph>
                <YStack paddingTop="$2" gap="$1">
                    {LICENCES.map((entry) => (
                        <Text key={entry.name} fontSize={11} color={palette.muted}>
                            {entry.name} {entry.version} — {entry.licence}
                        </Text>
                    ))}
                </YStack>
            </SettingsSection>
        </ScrollView>
    );
}

/** Body copy. At module scope; see the note in every other component here. */
function AboutParagraph({children}: {children: React.ReactNode}) {
    return (
        <Text fontSize={14} lineHeight={21} color={palette.dim} paddingBottom="$2">
            {children}
        </Text>
    );
}

function AboutLink({label, url}: {label: string; url: string}) {
    return (
        <Text accessibilityRole="link" accessibilityLabel={label}
              fontSize={14} color={palette.text} paddingVertical="$1.5"
              textDecorationLine="underline"
              onPress={() => Linking.openURL(url)}>
            {label}
        </Text>
    );
}
```

- [ ] **Step 5: Register the route**

In `app/_layout.tsx`, beside the existing `<Stack.Screen name="settings" .../>`,
add a matching entry:

```tsx
                <Stack.Screen name="about" options={{title: "About"}}/>
```

Copy the exact option shape the `settings` screen uses — if it sets
`headerStyle`, `headerTintColor` or a `presentation`, match them, so About does
not arrive with different chrome from the screen that pushes it.

- [ ] **Step 6: Run it and watch it pass**

```bash
npx jest app/__tests__/about.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 7: Mutation check**

Delete the "Independent" section from the screen. "states that it is unofficial,
in plain sight" must FAIL. Put it back.

- [ ] **Step 8: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/about.tsx app/_layout.tsx app/__tests__/about.test.tsx package.json package-lock.json
git commit -F - <<'MSG'
An About screen, saying the things this app has never said

Every block here is something a user or a reviewer needed and could not find.
Which build they are running, because a bug report without one is useless. That
this app is not xBloom's, which it has never stated anywhere despite using their
marks, reading their cards and calling their undocumented API. What leaves the
phone, which is a share ID and nothing else. Why a blank card refuses a recipe,
which is a question users hit with no explanation available. Where to report a
fault. And the licences, which App Store distribution expects.

The disclaimer is not behind a tap. A disclosure that has to be found is not one.

The version comes from expo-application rather than app.json: after an OTA update
those are different numbers, and the one that matters is the one true of the
binary in the user's hand.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 17: The identity row

**Files:**
- Modify: `app/settings.tsx`
- Test: `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe("SettingsScreen", ...)`:

```tsx
    it("opens About from the top of the screen, not the bottom", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        const about = screen.getByRole("button", {name: "About XBRW++"});
        await fireEvent.press(about);

        expect(mockPush).toHaveBeenCalledWith("/about");
    });
```

Add the router mock at the top of the file, above the `describe`:

```tsx
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
    ...jest.requireActual("expo-router"),
    useRouter: () => ({push: mockPush})
}));
```

If the file already mocks `expo-router`, extend that mock rather than adding a
second — two `jest.mock` calls for one module is a silent overwrite.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: FAIL — no button named "About XBRW++".

- [ ] **Step 3: Add the row**

In `app/settings.tsx`, add the imports:

```tsx
import * as Application from "expo-application";
import {useRouter} from "expo-router";

import SettingsActionRow from "@/components/SettingsActionRow";
```

At module scope:

```tsx
const VERSION = Application.nativeApplicationVersion ?? "unknown";
```

Inside the component, above the return:

```ts
    const router = useRouter();
```

And as the first section, above "Recipe list":

```tsx
                {/* At the top rather than the conventional bottom. The row
                    carries the app's name and version, so it reads as the
                    screen's identity rather than its footnote — the shape iOS
                    uses for the Apple ID row — and it is the row an App Store
                    reviewer comes here looking for. */}
                <SettingsSection>
                    <SettingsActionRow label="About XBRW++"
                                       detail={`Version ${VERSION}`}
                                       onPress={() => router.push("/about")}/>
                </SettingsSection>
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Mutation check**

Change the push target to `"/settings"`. The new test must FAIL. Put it back.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/settings.tsx app/__tests__/settings.test.tsx
git commit -F - <<'MSG'
Put About at the top of settings

Not at the bottom, where an About row conventionally goes. Carrying the app's
name and version it reads as the screen's identity rather than as its footnote,
which is the shape iOS itself uses for the Apple ID row — and it is the row an
App Store reviewer arrives looking for.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---
# Phase 4 — Backup and restore

Built before delete-all, deliberately: nothing in this app has ever destroyed
user data, and the first destructive action should not ship before the escape
hatch that makes it survivable.

**Files this phase creates or modifies:**

| File | Responsibility |
|---|---|
| `library/backup.ts` (create) | The envelope, the parser, the merge. Pure |
| `library/RecipeDatabase.ts` (modify) | `deleteAllRecipes()` |
| `hooks/useBackup.ts` (create) | The file and share-sheet side |
| `components/RestoreSheet.tsx` (create) | What was found, and what to do with it |
| `app/settings.tsx` (modify) | The Library section |

---

### Task 18: `library/backup.ts`

**Files:**
- Create: `library/backup.ts`
- Test: `library/__tests__/backup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/backup.test.ts`:

```ts
import {buildBackup, mergeRecipes, parseBackup, BACKUP_FORMAT, BACKUP_VERSION}
    from "@/library/backup";
import Recipe from "@/library/Recipe";

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

describe("buildBackup", () => {
    it("writes an envelope that names its format and version", () => {
        const parsed = JSON.parse(buildBackup([recipeNamed("A", "u1")], {temperatureUnit: "F"}));
        expect(parsed.format).toBe(BACKUP_FORMAT);
        expect(parsed.version).toBe(BACKUP_VERSION);
        expect(parsed.recipes).toHaveLength(1);
        expect(parsed.settings.temperatureUnit).toBe("F");
    });

    it("stamps when it was made and by which app version", () => {
        const parsed = JSON.parse(buildBackup([recipeNamed("A", "u1")], {}, "2.6.0"));
        expect(parsed.appVersion).toBe("2.6.0");
        expect(Number.isNaN(Date.parse(parsed.exportedAt))).toBe(false);
    });
});

describe("the round trip", () => {
    it("gives back the recipes that went in", () => {
        const recipes = [recipeNamed("Morning", "u1"), recipeNamed("Evening", "u2")];
        const result = parseBackup(buildBackup(recipes, {}));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes.map((r) => r.name)).toEqual(["Morning", "Evening"]);
        expect(result.payload.recipes.map((r) => r.uuid)).toEqual(["u1", "u2"]);
    });

    it("preserves the stage temperatures exactly", () => {
        const recipe = recipeNamed("Morning", "u1");
        recipe.pours[0].temperature = 93;
        const result = parseBackup(buildBackup([recipe], {}));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes[0].pours[0].temperature).toBe(93);
    });
});

describe("parseBackup refuses, with a reason", () => {
    // Every failure here is a message the user has to act on. An exception
    // crossing a screen boundary becomes a generic apology.
    it("refuses text that is not JSON", () => {
        const result = parseBackup("{ not json");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/could not be read/i);
    });

    it("refuses a JSON file that is not a backup", () => {
        const result = parseBackup(JSON.stringify({hello: "world"}));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/not an XBRW\+\+ backup/i);
    });

    it("refuses a backup from a newer app by saying which side is old", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION + 1, recipes: [{}]
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/newer version/i);
    });

    it("refuses a backup with no recipes rather than restoring nothing", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: []
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/no recipes/i);
    });

    it("refuses a backup whose recipes are not a list", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION, recipes: "lots"
        }));
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toMatch(/not an XBRW\+\+ backup/i);
    });

    it("skips a recipe blob that will not parse, and keeps the rest", () => {
        // A backup file is a document from anywhere. One bad entry must not
        // cost the user the other forty.
        const good = JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0];
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [good, {nonsense: true}, null]
        }));

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.recipes).toHaveLength(1);
        expect(result.payload.skipped).toBe(2);
    });

    it("never throws, whatever it is handed", () => {
        for (const input of ["", "null", "[]", "0", '"a string"', "undefined"]) {
            expect(() => parseBackup(input)).not.toThrow();
            expect(parseBackup(input).ok).toBe(false);
        }
    });

    it("treats missing settings as no settings rather than as a fault", () => {
        const result = parseBackup(JSON.stringify({
            format: BACKUP_FORMAT, version: BACKUP_VERSION,
            recipes: [JSON.parse(buildBackup([recipeNamed("A", "u1")], {})).recipes[0]]
        }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.payload.settings).toEqual({});
    });
});

describe("mergeRecipes", () => {
    it("adds everything into an empty library", () => {
        const incoming = [recipeNamed("A", "u1"), recipeNamed("B", "u2")];
        const result = mergeRecipes([], incoming);
        expect(result.toAdd).toHaveLength(2);
        expect(result.alreadyPresent).toBe(0);
    });

    it("adds nothing when every recipe is already there", () => {
        const existing = [recipeNamed("A", "u1")];
        const result = mergeRecipes(existing, [recipeNamed("A renamed", "u1")]);
        expect(result.toAdd).toHaveLength(0);
        expect(result.alreadyPresent).toBe(1);
    });

    it("adds only what is new", () => {
        const existing = [recipeNamed("A", "u1")];
        const result = mergeRecipes(existing, [recipeNamed("A", "u1"), recipeNamed("B", "u2")]);
        expect(result.toAdd.map((r) => r.uuid)).toEqual(["u2"]);
        expect(result.alreadyPresent).toBe(1);
    });

    it("never overwrites, so a merge cannot lose an edit", () => {
        const mine = recipeNamed("My careful edit", "u1");
        const result = mergeRecipes([mine], [recipeNamed("Their version", "u1")]);
        expect(result.toAdd).toHaveLength(0);
    });

    it("handles an empty backup", () => {
        const result = mergeRecipes([recipeNamed("A", "u1")], []);
        expect(result.toAdd).toHaveLength(0);
        expect(result.alreadyPresent).toBe(0);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/backup.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `library/backup.ts`:

```ts
import Recipe from "./Recipe";

/**
 * The backup file, and the only door it comes back in through.
 *
 * Pure and free of React, so the format can be tested as a format. A backup is a
 * document from anywhere — mailed, AirDropped, edited by hand — so nothing here
 * trusts its input, and nothing here throws: every failure is a sentence the
 * user has to be able to act on, and an exception crossing a screen boundary
 * becomes a generic apology.
 */

export const BACKUP_FORMAT = "xbrw-backup";

/**
 * Bumped only for a change this app could not read.
 *
 * Its purpose is to let a future format be recognised and refused by name rather
 * than silently misread into a broken library.
 */
export const BACKUP_VERSION = 1;

export type BackupSettings = Record<string, unknown>;

export type BackupPayload = {
    recipes: Recipe[];
    settings: BackupSettings;
    /** Entries that were present but unreadable. Reported, not hidden. */
    skipped: number;
    appVersion: string;
    exportedAt: string;
};

export type ParseResult =
    | {ok: true; payload: BackupPayload}
    | {ok: false; reason: string};

/** The envelope, as a string ready to be written to a file. */
export function buildBackup(
    recipes: readonly Recipe[],
    settings: BackupSettings,
    appVersion = "unknown"
): string {
    return JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion,
        // Recipes are already whole JSON blobs keyed by UUID in the database, so
        // the envelope is a container rather than a translation. Nothing here
        // reshapes a recipe, which is what keeps the format honest across a
        // change to the model.
        recipes: recipes.map((recipe) => JSON.parse(JSON.stringify(recipe))),
        settings
    }, null, 2);
}

/** A validated payload, or a reason. Never throws. */
export function parseBackup(text: string): ParseResult {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return {ok: false, reason: "That file could not be read. It is not valid JSON."};
    }

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return {ok: false, reason: "That file is not an XBRW++ backup."};
    }

    const envelope = raw as Record<string, unknown>;

    if (envelope.format !== BACKUP_FORMAT) {
        return {ok: false, reason: "That file is not an XBRW++ backup."};
    }

    // Checked before the contents, so a file this app genuinely cannot read is
    // named as such rather than reported as a pile of unreadable recipes.
    if (typeof envelope.version === "number" && envelope.version > BACKUP_VERSION) {
        return {
            ok: false,
            reason: "That backup was made by a newer version of XBRW++. Update the app and try again."
        };
    }

    if (!Array.isArray(envelope.recipes)) {
        return {ok: false, reason: "That file is not an XBRW++ backup."};
    }

    const recipes: Recipe[] = [];
    let skipped = 0;
    for (const entry of envelope.recipes) {
        const recipe = reviveRecipe(entry);
        if (recipe === null) skipped += 1;
        else recipes.push(recipe);
    }

    if (recipes.length === 0) {
        return {ok: false, reason: "There are no recipes in that backup."};
    }

    return {
        ok: true,
        payload: {
            recipes,
            settings: isPlainObject(envelope.settings) ? envelope.settings : {},
            skipped,
            appVersion: typeof envelope.appVersion === "string" ? envelope.appVersion : "unknown",
            exportedAt: typeof envelope.exportedAt === "string" ? envelope.exportedAt : ""
        }
    };
}

/**
 * What a restore would add, and what is already there.
 *
 * Matched on UUID and never overwriting. A merge that replaced a matching
 * recipe would silently discard an edit the user made after the backup, which is
 * a data loss dressed up as a restore.
 */
export function mergeRecipes(
    existing: readonly Recipe[],
    incoming: readonly Recipe[]
): {toAdd: Recipe[]; alreadyPresent: number} {
    const known = new Set(existing.map((recipe) => recipe.uuid));
    const toAdd: Recipe[] = [];
    let alreadyPresent = 0;

    for (const recipe of incoming) {
        if (known.has(recipe.uuid)) alreadyPresent += 1;
        else {
            toAdd.push(recipe);
            // Guards a backup that contains the same UUID twice, which would
            // otherwise be inserted twice and break the library's key.
            known.add(recipe.uuid);
        }
    }

    return {toAdd, alreadyPresent};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reviveRecipe(entry: unknown): Recipe | null {
    if (!isPlainObject(entry) || typeof entry.uuid !== "string" || entry.uuid === "") {
        return null;
    }
    try {
        return new Recipe(entry);
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest library/__tests__/backup.test.ts
```

Expected: PASS.

If `new Recipe(entry)` needs a JSON **string** rather than an object, check the
constructor in `library/Recipe.ts` and adapt `reviveRecipe` — the constructor's
signature is the authority, not this plan.

- [ ] **Step 5: Mutation check**

In `mergeRecipes`, change `if (known.has(recipe.uuid)) alreadyPresent += 1;` to
`if (false) ...` so everything is added. "never overwrites, so a merge cannot
lose an edit" must FAIL.

Then in `parseBackup`, move the `version` check below the `recipes` check. "refuses
a backup from a newer app by saying which side is old" must FAIL. Put both back.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/backup.ts library/__tests__/backup.test.ts
git commit -F - <<'MSG'
The backup file, and the only door it comes back in through

Recipes are already whole JSON blobs keyed by UUID, so the envelope is a
container rather than a translation — nothing here reshapes a recipe, which is
what keeps the format honest across a change to the model.

parseBackup answers a payload or a reason and never throws. A backup is a
document from anywhere: mailed, AirDropped, edited by hand. Every failure it can
have is a sentence the user must be able to act on, and an exception crossing a
screen boundary becomes a generic apology instead. One unreadable entry costs
that entry and is counted, not the other forty.

The version field is checked before the contents, so a file this app genuinely
cannot read is refused by name rather than reported as a pile of broken recipes.

mergeRecipes never overwrites. Replacing a matching recipe would discard an edit
the user made after the backup, which is data loss dressed as a restore.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 19: `deleteAllRecipes`

**Files:**
- Modify: `library/RecipeDatabase.ts`
- Test: `library/__tests__/RecipeDatabase.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `library/__tests__/RecipeDatabase.test.ts`, following whatever harness
the file already uses to get a database:

```ts
    it("empties the library", () => {
        const db = freshDatabase();
        db.insertRecipe(recipeNamed("A"));
        db.insertRecipe(recipeNamed("B"));

        db.deleteAllRecipes();

        expect(db.retrieveAllRecipes()).toBeNull();
    });

    it("is harmless on an empty library", () => {
        const db = freshDatabase();
        expect(() => db.deleteAllRecipes()).not.toThrow();
        expect(db.retrieveAllRecipes()).toBeNull();
    });
```

`freshDatabase()` and `recipeNamed()` are this plan's placeholders — read the top
of the existing file and use whatever it actually provides. Note that
`retrieveAllRecipes` answers `null` for an empty table, not `[]`; assert against
what the method really does.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest library/__tests__/RecipeDatabase.test.ts
```

Expected: FAIL — `deleteAllRecipes is not a function`.

- [ ] **Step 3: Add the method**

In `library/RecipeDatabase.ts`, after `deleteRecipe`:

```ts
    /**
     * Empties the library.
     *
     * `DELETE FROM` rather than dropping the table: the schema is created in the
     * constructor and a dropped table would leave every other database object in
     * this process holding a handle to something that no longer exists.
     */
    public deleteAllRecipes(): void {
        this.db.runSync("DELETE FROM recipes");
    }
```

Check the exact call style the neighbouring methods use — `runSync`,
`execSync` or a prepared statement — and match it.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest library/__tests__/RecipeDatabase.test.ts
```

Expected: PASS.

- [ ] **Step 5: Mutation check**

Change the statement to `DELETE FROM recipes WHERE uuid = 'nothing'`. "empties
the library" must FAIL. Put it back.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint && npm test
git add library/RecipeDatabase.ts library/__tests__/RecipeDatabase.test.ts
git commit -F - <<'MSG'
Let the database be emptied

DELETE FROM rather than dropping the table: the schema is created in the
constructor, and a dropped table would leave every other database object in the
process holding a handle to something that is gone.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 20: Install the file dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `app.json`

- [ ] **Step 1: Install**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
./node_modules/.bin/expo install expo-sharing expo-file-system expo-document-picker
```

Call the binary directly — npm 12's `npx` swallows the flags. If the install is
rejected with `EALLOWSCRIPTS`, run `npx expo-doctor`, read off the versions it
expects for this SDK, and write them into `package.json` by hand followed by
`npm install`.

- [ ] **Step 2: Bump the version**

In `app.json`, change `expo.version` from `2.5.0` to `2.6.0`.
`runtimeVersion.policy` is `appVersion`, so a native-affecting change needs it —
and three new native modules is as native-affecting as it gets.

- [ ] **Step 3: Check the health of the tree**

```bash
npx expo-doctor
```

Expected: all checks pass. This is a hard failure in CI, so fix anything it
reports here rather than at the end.

- [ ] **Step 4: Confirm nothing regressed**

```bash
npm run typecheck && npm run lint && npm test
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json
git commit -F - <<'MSG'
Add the file, share and picker modules, and bump to 2.6.0

Backup writes a file, hands it to the system share sheet, and reads one back
through the document picker. Three native modules, so runtimeVersion's appVersion
policy requires the bump — an over-the-air update could not carry them.

Going out through the share sheet rather than to a location this app chooses
means no storage permission is needed, the user decides where their library goes,
and a backup is shareable: one person's library can be handed to another.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 21: `hooks/useBackup.ts`

The file-and-share side, kept out of the screen. Every function here answers a
result rather than throwing, for the same reason `parseBackup` does.

**Files:**
- Create: `hooks/useBackup.ts`
- Test: `hooks/__tests__/useBackup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useBackup.test.ts`:

```ts
import {renderHook, act} from "@testing-library/react-native";

import {useBackup} from "@/hooks/useBackup";
import Recipe from "@/library/Recipe";

const mockWriteAsStringAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockGetDocumentAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();

jest.mock("expo-file-system", () => ({
    documentDirectory: "file:///docs/",
    writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
    readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args)
}));
jest.mock("expo-sharing", () => ({
    shareAsync: (...args: unknown[]) => mockShareAsync(...args),
    isAvailableAsync: () => mockIsAvailableAsync()
}));
jest.mock("expo-document-picker", () => ({
    getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args)
}));

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

describe("exportBackup", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsAvailableAsync.mockResolvedValue(true);
        mockWriteAsStringAsync.mockResolvedValue(undefined);
        mockShareAsync.mockResolvedValue(undefined);
    });

    it("writes a dated file and opens the share sheet", async () => {
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(outcome).toEqual({ok: true});
        const [path, contents] = mockWriteAsStringAsync.mock.calls[0];
        expect(path).toMatch(/xbrw-backup-\d{4}-\d{2}-\d{2}\.json$/);
        expect(JSON.parse(contents).format).toBe("xbrw-backup");
        expect(mockShareAsync).toHaveBeenCalledWith(path, expect.anything());
    });

    it("says so when there is no share sheet, rather than leaving a dead button", async () => {
        mockIsAvailableAsync.mockResolvedValue(false);
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(outcome).toEqual({ok: false, reason: expect.stringMatching(/cannot share/i)});
    });

    it("reports a write that failed instead of claiming success", async () => {
        mockWriteAsStringAsync.mockRejectedValue(new Error("disk full"));
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.exportBackup([recipeNamed("A", "u1")], {});
        });

        expect(outcome).toEqual({ok: false, reason: expect.stringMatching(/could not be written/i)});
    });
});

describe("pickBackup", () => {
    beforeEach(() => jest.clearAllMocks());

    it("says nothing when the picker was cancelled", async () => {
        // The user withdrew. There is no failure to report and a message would
        // be the app arguing with a decision.
        mockGetDocumentAsync.mockResolvedValue({canceled: true});
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.pickBackup();
        });

        expect(outcome).toEqual({cancelled: true});
    });

    it("parses the chosen file", async () => {
        mockGetDocumentAsync.mockResolvedValue({
            canceled: false, assets: [{uri: "file:///picked.json"}]
        });
        mockReadAsStringAsync.mockResolvedValue(JSON.stringify({
            format: "xbrw-backup", version: 1,
            recipes: [JSON.parse(JSON.stringify(recipeNamed("A", "u1")))]
        }));
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.pickBackup();
        });

        expect(outcome.cancelled).toBe(false);
        expect(outcome.result.ok).toBe(true);
    });

    it("reports a file it could not read", async () => {
        mockGetDocumentAsync.mockResolvedValue({
            canceled: false, assets: [{uri: "file:///picked.json"}]
        });
        mockReadAsStringAsync.mockRejectedValue(new Error("gone"));
        const {result} = await renderHook(() => useBackup());

        let outcome;
        await act(async () => {
            outcome = await result.current.pickBackup();
        });

        expect(outcome.cancelled).toBe(false);
        expect(outcome.result.ok).toBe(false);
        expect(outcome.result.reason).toMatch(/could not be read/i);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest hooks/__tests__/useBackup.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

Create `hooks/useBackup.ts`:

```ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import {buildBackup, parseBackup, type BackupSettings, type ParseResult}
    from "@/library/backup";
import type Recipe from "@/library/Recipe";

export type ExportOutcome = {ok: true} | {ok: false; reason: string};

export type PickOutcome =
    | {cancelled: true}
    | {cancelled: false; result: ParseResult};

export type BackupActions = {
    exportBackup: (recipes: readonly Recipe[], settings: BackupSettings, appVersion?: string)
        => Promise<ExportOutcome>;
    pickBackup: () => Promise<PickOutcome>;
};

function fileNameForToday(): string {
    return `xbrw-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * Writing a backup out and reading one back in.
 *
 * The file and share-sheet side, kept out of the screen for the reason
 * useRecipeEditor and useRecipeLibrary exist: a route file should stay close to
 * layout. Every function answers a result rather than throwing, so the screen
 * has one shape to handle and no failure can reach the user as a crash.
 */
export function useBackup(): BackupActions {
    async function exportBackup(
        recipes: readonly Recipe[],
        settings: BackupSettings,
        appVersion?: string
    ): Promise<ExportOutcome> {
        // Checked before anything is written, so a device that cannot share does
        // not leave a file behind that the user was never offered.
        const canShare = await Sharing.isAvailableAsync().catch(() => false);
        if (!canShare) {
            return {ok: false, reason: "This device cannot share files, so the backup was not made."};
        }

        const path = `${FileSystem.documentDirectory}${fileNameForToday()}`;
        try {
            await FileSystem.writeAsStringAsync(path, buildBackup(recipes, settings, appVersion));
        } catch {
            return {ok: false, reason: "The backup could not be written to this device."};
        }

        try {
            await Sharing.shareAsync(path, {
                mimeType: "application/json",
                dialogTitle: "Back up your recipes",
                UTI: "public.json"
            });
        } catch {
            return {ok: false, reason: "The backup was made but could not be shared."};
        }

        return {ok: true};
    }

    async function pickBackup(): Promise<PickOutcome> {
        let picked;
        try {
            picked = await DocumentPicker.getDocumentAsync({
                // Not restricted to application/json: a backup that has been
                // through mail or a chat app frequently arrives typed as
                // text/plain or octet-stream, and a picker that greys it out
                // looks like the app rejecting a file it can read perfectly.
                type: "*/*",
                copyToCacheDirectory: true
            });
        } catch {
            return {cancelled: false, result: {ok: false, reason: "That file could not be read."}};
        }

        if (picked.canceled) return {cancelled: true};

        const uri = picked.assets?.[0]?.uri;
        if (uri === undefined) {
            return {cancelled: false, result: {ok: false, reason: "That file could not be read."}};
        }

        try {
            const text = await FileSystem.readAsStringAsync(uri);
            return {cancelled: false, result: parseBackup(text)};
        } catch {
            return {cancelled: false, result: {ok: false, reason: "That file could not be read."}};
        }
    }

    return {exportBackup, pickBackup};
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest hooks/__tests__/useBackup.test.ts
```

Expected: PASS.

If `expo-file-system` in this SDK exports its API under `expo-file-system/legacy`
or has replaced `documentDirectory` with a `Paths` object, read the installed
package's types and use the current API. Do not import from a legacy path to
make an old shape work.

- [ ] **Step 5: Mutation check**

Remove the `isAvailableAsync` check. "says so when there is no share sheet" must
FAIL. Then make the `writeAsStringAsync` catch return `{ok: true}`; "reports a
write that failed" must FAIL. Put both back.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add hooks/useBackup.ts hooks/__tests__/useBackup.test.ts
git commit -F - <<'MSG'
Write a backup out, and read one back in

Out through the system share sheet, so the user chooses Files, AirDrop or mail
and the app needs no storage permission to do it. Availability is checked before
anything is written, so a device that cannot share does not quietly leave a file
behind that its owner was never offered.

The picker accepts any type. A backup that has been through mail or a chat app
routinely arrives as text/plain or octet-stream, and a picker that greys it out
looks like the app refusing a file it can read perfectly.

Every function answers a result rather than throwing, so the screen has one shape
to handle and no failure reaches the user as a crash.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 22: The restore sheet

**Files:**
- Create: `components/RestoreSheet.tsx`
- Test: `components/__tests__/RestoreSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/RestoreSheet.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import RestoreSheet from "@/components/RestoreSheet";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

const PAYLOAD = {
    recipes: [recipeNamed("A", "u1"), recipeNamed("B", "u2")],
    settings: {temperatureUnit: "F"},
    skipped: 0,
    appVersion: "2.6.0",
    exportedAt: "2026-08-26T21:00:00.000Z"
};

describe("RestoreSheet", () => {
    it("says how much would be added and how much is already there", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[recipeNamed("A", "u1")]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByText(/1 new recipe/i)).toBeTruthy();
        expect(screen.getByText(/1 .*already/i)).toBeTruthy();
    });

    it("merges by default, because merging cannot lose anything", async () => {
        const onRestore = jest.fn();
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[recipeNamed("A", "u1")]}
                          onCancel={() => {}} onRestore={onRestore}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /add.*librar/i}));

        expect(onRestore).toHaveBeenCalledWith({replace: false, includeSettings: false});
    });

    it("offers the backup's settings, switched off", async () => {
        // Restoring someone else's library should not silently change your
        // preferences, so taking their settings is opt-in.
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByLabelText(/settings from this backup/i)
            .props.accessibilityState.checked).toBe(false);
    });

    it("carries the settings choice out", async () => {
        const onRestore = jest.fn();
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[]}
                          onCancel={() => {}} onRestore={onRestore}/>
        );

        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add.*librar/i}));

        expect(onRestore).toHaveBeenCalledWith({replace: false, includeSettings: true});
    });

    it("keeps replace behind its own confirmation", async () => {
        // A second way to destroy a library must not be one tap away from the
        // safe one.
        const onRestore = jest.fn();
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[recipeNamed("A", "u1")]}
                          onCancel={() => {}} onRestore={onRestore}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /replace/i}));
        expect(onRestore).not.toHaveBeenCalled();
        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();

        await fireEvent.press(screen.getByRole("button", {name: /yes, replace/i}));
        expect(onRestore).toHaveBeenCalledWith({replace: true, includeSettings: false});
    });

    it("does not offer to replace an empty library", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.queryByRole("button", {name: /replace/i})).toBeNull();
    });

    it("reports entries it could not read", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={{...PAYLOAD, skipped: 3}} existing={[]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByText(/3 .*could not be read/i)).toBeTruthy();
    });

    it("says plainly when there is nothing to add", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD}
                          existing={[recipeNamed("A", "u1"), recipeNamed("B", "u2")]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByText(/already in your library/i)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/RestoreSheet.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `components/RestoreSheet.tsx`. Read `components/ImportRecipeComponent.tsx`
first for how a sheet with actions is built in this repository, and match it:

```tsx
import React, {useState} from "react";
import {Button, Text, XStack, YStack} from "tamagui";

import SettingsToggleRow from "@/components/SettingsToggleRow";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {mergeRecipes, type BackupPayload} from "@/library/backup";
import type Recipe from "@/library/Recipe";

export type RestoreChoice = {
    replace: boolean;
    includeSettings: boolean;
};

type Props = {
    open: boolean;
    payload: BackupPayload;
    existing: readonly Recipe[];
    onCancel: () => void;
    onRestore: (choice: RestoreChoice) => void;
};

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/**
 * What was found in a backup, and what to do with it.
 *
 * Merging is the button. It cannot lose anything: recipes are matched by UUID
 * and nothing already in the library is touched, so a user who restores an old
 * backup keeps every edit they made since.
 *
 * Replacing exists, because restoring a library onto a device that has drifted
 * is a real thing to want, but it is a second way to destroy a library and it
 * gets its own confirmation. It is not offered at all when there is nothing to
 * destroy.
 */
export default function RestoreSheet({open, payload, existing, onCancel, onRestore}: Props) {
    const [includeSettings, setIncludeSettings] = useState(false);
    const [confirmingReplace, setConfirmingReplace] = useState(false);
    const {toAdd, alreadyPresent} = mergeRecipes(existing, payload.recipes);

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {
            if (!next) {
                setConfirmingReplace(false);
                onCancel();
            }
        }} title="Restore" heightPercent={60}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {confirmingReplace ? (
                    <YStack gap="$3">
                        <Text fontSize={15} color={palette.text}>
                            Replacing deletes {plural(existing.length, "recipe", "recipes")} and
                            puts {plural(payload.recipes.length, "recipe", "recipes")} in their
                            place. This cannot be undone.
                        </Text>
                        <XStack gap="$3">
                            <Button flex={1} accessibilityRole="button"
                                    onPress={() => setConfirmingReplace(false)}>
                                Back
                            </Button>
                            <Button flex={1} accessibilityRole="button"
                                    accessibilityLabel="Yes, replace my library"
                                    backgroundColor={palette.danger}
                                    onPress={() => onRestore({replace: true, includeSettings})}>
                                Yes, replace
                            </Button>
                        </XStack>
                    </YStack>
                ) : (
                    <YStack gap="$3">
                        <Text fontSize={15} color={palette.text}>
                            {toAdd.length === 0
                                ? "Every recipe in this backup is already in your library."
                                : `This backup has ${plural(toAdd.length, "new recipe", "new recipes")}.`}
                        </Text>
                        {alreadyPresent > 0 && (
                            <Text fontSize={13} color={palette.dim}>
                                {plural(alreadyPresent, "recipe is", "recipes are")} already in your
                                library and will be left exactly as they are.
                            </Text>
                        )}
                        {payload.skipped > 0 && (
                            <Text fontSize={13} color={palette.danger}>
                                {plural(payload.skipped, "entry", "entries")} in this file could not
                                be read and will be skipped.
                            </Text>
                        )}

                        <SettingsToggleRow
                            label="Take the settings from this backup"
                            description="Off by default: restoring someone else's library should not change your preferences."
                            value={includeSettings}
                            onChange={setIncludeSettings}/>

                        <Button accessibilityRole="button"
                                accessibilityLabel="Add to my library"
                                disabled={toAdd.length === 0}
                                opacity={toAdd.length === 0 ? 0.4 : 1}
                                onPress={() => onRestore({replace: false, includeSettings})}>
                            Add to my library
                        </Button>

                        {existing.length > 0 && (
                            <Button accessibilityRole="button"
                                    accessibilityLabel="Replace my library"
                                    chromeless color={palette.danger}
                                    onPress={() => setConfirmingReplace(true)}>
                                Replace my library instead
                            </Button>
                        )}
                    </YStack>
                )}
            </YStack>
        </XbrwSheet>
    );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest components/__tests__/RestoreSheet.test.tsx
```

Expected: PASS, 8 tests.

The text assertions are regular expressions on purpose, so exact wording can be
adjusted without breaking them — but if a test fails because the wording differs,
**check which side is wrong**. If the sheet says something less clear than the
test expected, fix the sheet.

- [ ] **Step 5: Mutation check**

Make the replace button call `onRestore` directly instead of
`setConfirmingReplace(true)`. "keeps replace behind its own confirmation" must
FAIL. Then default `includeSettings` to `true`; "offers the backup's settings,
switched off" must FAIL. Put both back.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/RestoreSheet.tsx components/__tests__/RestoreSheet.test.tsx
git commit -F - <<'MSG'
Show what a backup holds before restoring any of it

Merging is the button, because merging cannot lose anything: recipes are matched
by UUID and nothing already in the library is touched, so restoring an old backup
keeps every edit made since.

Replacing exists — restoring onto a device that has drifted is a real thing to
want — but it is a second way to destroy a library, so it takes its own
confirmation, states how many recipes it will delete, and is not offered at all
when there is nothing to delete.

The backup's settings are offered switched off. Restoring someone else's library
should not silently change your preferences.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

### Task 23: The Library section

**Files:**
- Modify: `app/settings.tsx`
- Test: `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe("SettingsScreen", ...)`:

```tsx
    it("offers backup and restore", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText("LIBRARY")).toBeTruthy();
        expect(screen.getByRole("button", {name: "Back up my recipes"})).toBeTruthy();
        expect(screen.getByRole("button", {name: "Restore from a backup"})).toBeTruthy();
    });

    it("says nothing at all when the picker was cancelled", async () => {
        // The user withdrew. A message would be the app arguing with them.
        mockPickBackup.mockResolvedValue({cancelled: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button", {name: "Restore from a backup"}));

        expect(mockNotify).not.toHaveBeenCalled();
    });

    it("reports a file it could not read", async () => {
        mockPickBackup.mockResolvedValue({
            cancelled: false, result: {ok: false, reason: "That file could not be read."}
        });
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button", {name: "Restore from a backup"}));

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error", message: "That file could not be read."})
        );
    });
```

Add the mocks at the top of the file, extending any existing `jest.mock` calls
rather than duplicating them:

```tsx
const mockExportBackup = jest.fn();
const mockPickBackup = jest.fn();
jest.mock("@/hooks/useBackup", () => ({
    useBackup: () => ({
        exportBackup: (...args: unknown[]) => mockExportBackup(...args),
        pickBackup: (...args: unknown[]) => mockPickBackup(...args)
    })
}));

const mockNotify = jest.fn();
jest.mock("@/library/notify", () => ({
    ...jest.requireActual("@/library/notify"),
    notify: (...args: unknown[]) => mockNotify(...args)
}));
```

and `beforeEach(() => jest.clearAllMocks());` inside the `describe`.

Check how `notify` is actually exported and called — `grep -n "notify" app/index.tsx`
— and mock the same shape. If `notify` lives somewhere other than
`@/library/notify`, mock that path.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: three FAILs.

- [ ] **Step 3: Add the section and its handlers**

In `app/settings.tsx`, add the imports:

```tsx
import RestoreSheet from "@/components/RestoreSheet";
import {useBackup} from "@/hooks/useBackup";
import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import {notify} from "@/library/notify";
import type {BackupPayload} from "@/library/backup";
```

Inside the component:

```ts
    const library = useRecipeLibrary();
    const {exportBackup, pickBackup} = useBackup();
    const [pending, setPending] = useState<BackupPayload | null>(null);

    async function onBackUp() {
        const outcome = await exportBackup(library.recipes, settingsSnapshot(), VERSION);
        if (!outcome.ok) notify({tone: "error", message: outcome.reason});
    }

    async function onRestore() {
        const outcome = await pickBackup();
        // Cancelling is not a failure. The user withdrew, and a message here
        // would be the app arguing with a decision they already made.
        if (outcome.cancelled) return;
        if (!outcome.result.ok) {
            notify({tone: "error", message: outcome.result.reason});
            return;
        }
        setPending(outcome.result.payload);
    }
```

`settingsSnapshot()` is a small helper on the component — read every key the
settings screen knows about and return them as an object:

```ts
    function settingsSnapshot() {
        return {showCoffeeMarker, dotMatrixProfile, temperatureUnit};
    }
```

Add the section after Units:

```tsx
                <SettingsSection title="Library">
                    <SettingsActionRow label="Back up my recipes"
                                       detail="Writes a file and hands it to the share sheet."
                                       onPress={onBackUp}/>
                    <SettingsActionRow label="Restore from a backup"
                                       detail="Adds anything your library does not already have."
                                       onPress={onRestore}/>
                </SettingsSection>
```

And, after the closing `</YStack>` of the sections and inside the `ScrollView`:

```tsx
                {pending !== null && (
                    <RestoreSheet open payload={pending} existing={library.recipes}
                                  onCancel={() => setPending(null)}
                                  onRestore={(choice) => {
                                      applyRestore(pending, choice);
                                      setPending(null);
                                  }}/>
                )}
```

with the apply function on the component:

```ts
    function applyRestore(payload: BackupPayload, choice: RestoreChoice) {
        const store = new RecipeDatabase();
        if (choice.replace) store.deleteAllRecipes();

        const target = choice.replace ? [] : library.recipes;
        const {toAdd} = mergeRecipes(target, payload.recipes);
        for (const recipe of toAdd) store.insertRecipe(recipe);

        if (choice.includeSettings) applySettings(payload.settings);

        library.refresh();
        notify({
            tone: "success",
            message: toAdd.length === 1
                ? "1 recipe restored"
                : `${toAdd.length} recipes restored`
        });
    }

    function applySettings(incoming: Record<string, unknown>) {
        // Only the keys this app knows, and only values of the right shape. A
        // backup is a document from anywhere, so its settings block is input
        // rather than instruction.
        if (typeof incoming.showCoffeeMarker === "boolean") {
            setShowCoffeeMarker(incoming.showCoffeeMarker);
        }
        if (typeof incoming.dotMatrixProfile === "boolean") {
            setDotMatrixProfile(incoming.dotMatrixProfile);
        }
        if (incoming.temperatureUnit === "C" || incoming.temperatureUnit === "F") {
            setTemperatureUnit(incoming.temperatureUnit);
        }
    }
```

with the extra imports `RecipeDatabase`, `mergeRecipes`, `type RestoreChoice`
and `useState`.

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest app/__tests__/settings.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Mutation check**

In `onRestore`, remove the `if (outcome.cancelled) return;` guard. "says nothing
at all when the picker was cancelled" must FAIL. Then in `applySettings`, drop
the `typeof === "boolean"` guards; typecheck must fail. Put both back.

- [ ] **Step 6: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add app/settings.tsx app/__tests__/settings.test.tsx
git commit -F - <<'MSG'
Wire backup and restore into settings

Cancelling the picker says nothing. The user withdrew, and a message there would
be the app arguing with a decision already made. Everything else that can go
wrong says what went wrong, in a sentence that names the cause rather than
apologising in general.

A backup's settings block is validated key by key before any of it is applied.
The file is a document from anywhere, so its settings are input rather than
instruction.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

# Phase 5 — Delete all recipes

Last, and only now that the escape hatch exists.

---

### Task 24: Delete all, offering a backup first

**Files:**
- Create: `components/DeleteAllSheet.tsx`
- Modify: `app/settings.tsx`
- Test: `components/__tests__/DeleteAllSheet.test.tsx`
- Test: `app/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/DeleteAllSheet.test.tsx`:

```tsx
import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import DeleteAllSheet from "@/components/DeleteAllSheet";
import {renderWithProviders} from "@/test-utils/render";

describe("DeleteAllSheet", () => {
    it("says how much is about to be lost", async () => {
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText(/12 recipes/)).toBeTruthy();
        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });

    it("counts one recipe as one recipe", async () => {
        await renderWithProviders(
            <DeleteAllSheet open count={1} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={() => {}}/>
        );

        expect(screen.getByText(/1 recipe\b/)).toBeTruthy();
    });

    it("offers a backup first, which is the actual safety", async () => {
        const onBackUpFirst = jest.fn();
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={() => {}}
                            onBackUpFirst={onBackUpFirst} onDelete={() => {}}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /back up first/i}));

        expect(onBackUpFirst).toHaveBeenCalled();
    });

    it("deletes only on the explicit confirmation", async () => {
        const onDelete = jest.fn();
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={() => {}}
                            onBackUpFirst={() => {}} onDelete={onDelete}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /delete all 12/i}));

        expect(onDelete).toHaveBeenCalled();
    });

    it("withdraws without deleting", async () => {
        const onCancel = jest.fn();
        const onDelete = jest.fn();
        await renderWithProviders(
            <DeleteAllSheet open count={12} onCancel={onCancel}
                            onBackUpFirst={() => {}} onDelete={onDelete}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /keep my recipes/i}));

        expect(onCancel).toHaveBeenCalled();
        expect(onDelete).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest components/__tests__/DeleteAllSheet.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `components/DeleteAllSheet.tsx`:

```tsx
import React from "react";
import {Button, Text, YStack} from "tamagui";

import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";

type Props = {
    open: boolean;
    count: number;
    onCancel: () => void;
    onBackUpFirst: () => void;
    onDelete: () => void;
};

/**
 * The one thing in this app that destroys user data.
 *
 * It offers a backup before it offers the deletion, because the backup is the
 * actual safety — a dialog can only ask a question, and a user who has already
 * decided will answer any wording. The count is in the sentence so the answer is
 * given against a number rather than against the word "all".
 *
 * The safe choice is the one that reads as the plain action: "Keep my recipes",
 * not "Cancel".
 */
export default function DeleteAllSheet({
    open, count, onCancel, onBackUpFirst, onDelete
}: Props) {
    const subject = count === 1 ? "1 recipe" : `${count} recipes`;

    return (
        <XbrwSheet open={open} onOpenChange={(next) => {if (!next) onCancel();}}
                   title="Delete all recipes" heightPercent={52}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={15} color={palette.text}>
                    This deletes {subject} from this phone. It cannot be undone, and
                    a recipe already written to a card is not a copy of this library.
                </Text>

                <Button accessibilityRole="button" accessibilityLabel="Back up first"
                        onPress={onBackUpFirst}>
                    Back up first
                </Button>

                <Button accessibilityRole="button"
                        accessibilityLabel={`Delete all ${count} recipes`}
                        backgroundColor={palette.danger} onPress={onDelete}>
                    Delete all {subject}
                </Button>

                <Button accessibilityRole="button" accessibilityLabel="Keep my recipes"
                        chromeless onPress={onCancel}>
                    Keep my recipes
                </Button>
            </YStack>
        </XbrwSheet>
    );
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest components/__tests__/DeleteAllSheet.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add the row and its test**

Append to `app/__tests__/settings.test.tsx`:

```tsx
    it("offers to delete everything, in the danger colour", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        const row = screen.getByRole("button", {name: "Delete all recipes"});
        expect(row).toBeTruthy();
        expect(screen.getByText("Delete all recipes").props.style)
            .toEqual(expect.objectContaining({color: palette.danger}));
    });

    it("asks before deleting anything", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button", {name: "Delete all recipes"}));

        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });
```

Run it, watch it fail, then in `app/settings.tsx` add to the Library section:

```tsx
                    <SettingsActionRow label="Delete all recipes" tone="danger"
                                       detail="Everything on this phone. There is no undo."
                                       onPress={() => setConfirmingDeleteAll(true)}/>
```

with the state, the sheet and the handlers:

```ts
    const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);

    async function onBackUpFirst() {
        setConfirmingDeleteAll(false);
        await onBackUp();
    }

    function onDeleteAll() {
        const deleted = library.recipes.length;
        new RecipeDatabase().deleteAllRecipes();
        library.refresh();
        setConfirmingDeleteAll(false);
        notify({
            tone: "success",
            message: deleted === 1 ? "1 recipe deleted" : `${deleted} recipes deleted`
        });
    }
```

```tsx
                <DeleteAllSheet open={confirmingDeleteAll} count={library.recipes.length}
                                onCancel={() => setConfirmingDeleteAll(false)}
                                onBackUpFirst={onBackUpFirst}
                                onDelete={onDeleteAll}/>
```

Note that `onBackUpFirst` dismisses the sheet before exporting: the share sheet
is a system modal and presenting it over an open bottom sheet is how iOS ends up
with a share sheet that cannot be dismissed.

- [ ] **Step 6: Run everything**

```bash
npx jest app/__tests__/settings.test.tsx components/__tests__/DeleteAllSheet.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Mutation check**

Make the settings row call `onDeleteAll()` directly instead of
`setConfirmingDeleteAll(true)`. "asks before deleting anything" must FAIL. Put it
back.

- [ ] **Step 8: Gates and commit**

```bash
npm run typecheck && npm run lint && npm test
git add components/DeleteAllSheet.tsx components/__tests__/DeleteAllSheet.test.tsx app/settings.tsx app/__tests__/settings.test.tsx
git commit -F - <<'MSG'
Delete all recipes, offering a backup before it offers the deletion

The one thing in this app that destroys user data, and it ships last, after the
escape hatch that makes it survivable.

The backup is the actual safety. A dialog can only ask a question and a user who
has already decided will answer any wording, so the sheet leads with a way out
rather than with a sterner sentence. The count is in the question so the answer
is given against a number rather than against the word "all", and the safe choice
reads as the plain action — "Keep my recipes", not "Cancel".

Backing up first dismisses the sheet before it exports. The share sheet is a
system modal, and presenting one over an open bottom sheet is how iOS ends up
with a share sheet that will not go away.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
MSG
```

---

# Phase 6 — Ship

---

### Task 25: Full gate, prebuild and device verification

- [ ] **Step 1: The whole suite**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
npm run typecheck && npm run lint && npm test && npx expo-doctor
```

All four clean. `expo-doctor` is a hard failure in CI.

- [ ] **Step 2: Confirm the card format never moved**

```bash
git diff main --stat -- library/__tests__/
```

Expected: only `library/__tests__/units.test.ts`, `units.roundtrip.test.ts` and
`backup.test.ts` — all new files. **If any pre-existing file in that directory is
modified, stop.** A change there is a regression until proven otherwise, and a
malformed write to a genuine card is not trivially recoverable.

- [ ] **Step 3: Kill stale Metro servers**

```bash
lsof -ti :8081
```

Kill each PID it reports with `kill <PID>`. Stale servers from earlier worktrees
have caused a device to attach to the wrong bundle more than once in this
project.

- [ ] **Step 4: Prebuild**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
./node_modules/.bin/expo prebuild --clean
```

- [ ] **Step 5: Re-inject the signing team**

`prebuild` wipes it every time.

```bash
grep -c "PRODUCT_BUNDLE_IDENTIFIER" ios/*.xcodeproj/project.pbxproj
```

Add `DEVELOPMENT_TEAM = A5J788W4Q9;` to **all four** blocks that contain
`PRODUCT_BUNDLE_IDENTIFIER`. Verify:

```bash
grep -c "DEVELOPMENT_TEAM = A5J788W4Q9" ios/*.xcodeproj/project.pbxproj
```

Expected: `4`.

- [ ] **Step 6: Build to the device**

The device is `iPhone14` (an iPhone 17 Pro), UDID
`00008150-001A69500C47801C`. It must be **connected and unlocked**.

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
./node_modules/.bin/expo run:ios --device 00008150-001A69500C47801C > /tmp/sp6-build.log 2>&1 &
```

`run:ios` never exits, so poll the log rather than waiting on the process. The
log contains null bytes:

```bash
tail -40 /tmp/sp6-build.log | tr -d '\000'
```

- [ ] **Step 7: Verify on hardware**

Ask the user to check, and write down what they report:

1. Settings shows seven rows in four sections, About at the top with the version.
2. Switching to °F changes every stage temperature in the editor; switching back
   gives the identical numbers.
3. In °F the temperature stepper always moves the number — no tap does nothing.
4. Writing a card in °F mode still produces a card the machine accepts. **This is
   the one thing no test can prove.**
5. The About mark breathes, and scatters and re-forms on tap.
6. Leaving About alone for eight seconds starts the ticker. **Is eight the right
   number?** It is a starting value.
7. With Reduce Motion on: the mark is static and the ticker never starts.
8. Back up my recipes opens the share sheet; save to Files.
9. Restore that file: it reports every recipe as already present.
10. Delete all offers a backup first, then deletes.
11. Restore the saved file into the empty library: every recipe comes back.
12. The links on About open the repository and the issues page.

- [ ] **Step 8: Tune the ticker if the user says so**

If eight seconds is wrong, change `DEFAULT_DELAY_MS` in
`components/AboutTicker.tsx` and commit the change on its own with the reason.

---

### Task 26: Open the pull request

- [ ] **Step 1: Push**

```bash
cd /Users/jesperhessius/Dev/xbrw-sp6-settings
git push -u origin sp6-settings
```

- [ ] **Step 2: Write the body to a file**

Heredocs inside `$(cat <<'EOF' ...)` fail in this shell. Write the body to
`/tmp/sp6-pr.md` with a plain heredoc and pass it with `--body-file`.

The body should cover: what shipped, the units invariant and how it is pinned,
that three native modules forced the version bump, what was verified on hardware
and what could not be, and the known gap that Reduce Motion is only provable on
a device.

- [ ] **Step 3: Open it**

```bash
gh pr create --title "Sub-project 6: settings, units, About, backup and restore" \
             --body-file /tmp/sp6-pr.md --base main --head sp6-settings
```

- [ ] **Step 4: Wait for CI**

```bash
gh pr checks --watch
```

All four checks — typecheck, lint, test, expo-doctor — must be green.

- [ ] **Step 5: Hand back**

Report to the user: the PR number, what was verified on the device, the ticker
delay finally chosen, and the two things worth their judgement — whether
**issue #5** (Android never verified on SDK 57, now three native modules further
from verified) should be raised before this merges, and whether the licence
generator's dependency walk should be checked against an independent tool before
the app is submitted.

---

## Self-review notes

**Spec coverage.** Settings screen restructure: Tasks 1–4, 11, 17, 23, 24 —
seven rows in four sections, four module-scope row components, About at the top.
Units: Tasks 5–12 — the module, the setting, the stepper ladder, the render and
edit sites, the range messages, the row, the byte-level round trip. About: Tasks
13–17 — all eight content blocks, the living mark, the ticker, the generated
licences. Backup: Tasks 18, 20–23 — the three `backup.ts` functions, the share
sheet, the document picker, merge-by-default with replace behind a confirmation,
settings offered switched off. Delete all: Tasks 19 and 24, after backup exists.
Every row of the failure table has a test: cancelled (Task 21, 23), unreadable
(21), not a backup (18), future version (18), no recipes (18), all present (22),
no share sheet (21).

**One deliberate deviation from the spec.** The spec names the row components
`ToggleRow`, `ChoiceRow` and `ActionRow`. This plan prefixes them `Settings*`
because `components/` is flat and already holds a `FieldRow`; an unprefixed
`ToggleRow` beside it would not say which screen it belongs to.

**One known coverage gap.** Reduce Motion in `LivingMark` cannot be asserted in a
unit test, because the behaviour lives in a Reanimated shared value. It is on the
device checklist in Task 25 instead, and the mutation step in Task 14 says so
explicitly rather than pretending the test covers it.
