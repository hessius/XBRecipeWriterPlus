# Package 5 — the drawer reveal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach both swipe trays instead of one, and stop teaching a lesson the
user has already learned.

**Architecture:** The cadence becomes a pure policy module in `library/`, with
its counters in the settings table as four scalar keys. The row component gains
a direction and a delay so the home screen can stagger two rows, and a manual
open signal so the policy can retire itself. The two bounce timings move into
`constants/motion.ts`.

**Tech stack:** TypeScript, React Native, Expo SDK 57, Tamagui,
`react-native-gesture-handler`'s `ReanimatedSwipeable`, expo-sqlite, Jest with
`@testing-library/react-native` v14.

---

## Background an engineer needs before starting

The home screen (`app/index.tsx`) lists recipes as swipeable rows. Each row has
**two** trays: swiping right reveals the *action* tray (BREW, SHARE, WRITE) and
swiping left reveals the *management* tray (copy, delete, favourite). To teach
that the trays exist, the first row bounces one tray open on launch.

Two problems. It runs on **every** launch, which is nagging. And it reveals only
the action tray, so the management tray stays undiscovered.

Read `components/SwipeableRecipeRow.tsx:171-202` before you start. The existing
comment there argues against bouncing both trays, and it is right about the
thing it describes: wobbling **one card** left then right reads as a glitch.
This plan does not do that. It bounces **two different rows**, one tray each,
staggered. Row one is already the action tray; row two becomes the management
tray. You must update that comment so it describes what the code now does.

Also note `components/SwipeableRecipeRow.tsx:187-196`: `onBounced` is reported
from the **closing** timer, not the opening one, and the comment explains that
reporting it early retired the lesson mid-flight and left the tray stuck open.
This plan moves the bookkeeping out of that callback entirely, but the closing
timer must keep closing the tray.

### How settings work here

`library/Settings.ts` holds `DEFAULTS`, the single list of every setting key.
Values are stored as JSON strings in a `settings` table. `Settings.get()`
validates a stored value with `typeof parsed !== typeof DEFAULTS[key]`.

**That check is only safe for scalars.** `typeof` on any object, array or `null`
is `"object"`, so a malformed structured value would pass validation and reach
consumers. This is why the policy below persists **four scalar keys** rather
than one record. Do not "tidy" them into an object.

Adding a key has a contract: it must appear in `DEFAULTS` **and** in
`settingsSnapshot()` in `app/settings.tsx`, or be listed in `NOT_IN_BACKUP`.
`settingsSnapshot()` returns `Record<Exclude<SettingKey, BackupExcluded>, unknown>`,
so omitting a key is a **compile error**, and `library/__tests__/backup.test.ts`
pins the other half.

These four counters describe one device's learning history. They are **not**
backup material: restoring somebody's phone should not re-arm or suppress a
hint based on a different device. Put all four in `NOT_IN_BACKUP`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `library/drawerHint.ts` | **Create.** Pure cadence policy: thresholds, re-arm, decide, record. No React, no database. |
| `library/__tests__/drawerHint.test.ts` | **Create.** The policy's whole truth table. |
| `library/Settings.ts` | **Modify.** Four new scalar keys, all in `NOT_IN_BACKUP`. |
| `app/settings.tsx` | **Modify.** Nothing, if the keys are backup-excluded. Verify it still compiles. |
| `constants/motion.ts` | **Modify.** `BOUNCE_OPEN_DELAY`, `BOUNCE_CLOSE_DELAY` (retuned to 800), and `STAGGER.drawerHint`. |
| `hooks/useDrawerHint.ts` | **Create.** Binds the policy to settings and decides once per mount. |
| `hooks/__tests__/useDrawerHint.test.ts` | **Create.** |
| `components/SwipeableRecipeRow.tsx` | **Modify.** `hintTray` / `hintDelayMs` props replace `bounceOnMount`; manual-open signal; timings from `constants/motion.ts`. |
| `app/index.tsx` | **Modify.** Wire two staggered rows through the hook. |

---

## Task 0: Branch and baseline

**Files:** none.

- [ ] **Step 1: Branch off main**

```bash
cd /Users/jesperhessius/Dev/XBRecipeWriterPlus
git fetch origin
git checkout -b feat/package-5-drawer-reveal origin/main
```

- [ ] **Step 2: Confirm the baseline is green**

```bash
npm run typecheck
npx jest --runTestsByPath components/__tests__/SwipeableRecipeRow.test.tsx
```

Expected: typecheck silent, the row suite passing. If either fails before you
have changed anything, stop and report it.

---

## Task 1: Move the bounce timings into the motion module

The house rule is that a timing not in `constants/motion.ts` cannot take part
when the app's motion is retuned. These two have been exempt by accident. The
close delay also drops from 1000 ms to 800 ms, because today's reveal reads
slightly slow.

**Files:**
- Modify: `constants/motion.ts`
- Modify: `components/SwipeableRecipeRow.tsx:63-64`

- [ ] **Step 1: Add the three values to `constants/motion.ts`**

Append near the other exported scalars (`TYPING_DEBOUNCE_MS` is around `:41`):

```ts
/**
 * How long the drawer hint waits before opening a tray, and before closing it
 * again.
 *
 * The close delay is measured from the same instant as the open delay, not from
 * the open, so the tray is visible for the difference between them: 500 ms.
 *
 * These were local constants in `SwipeableRecipeRow.tsx` and were exempt from
 * the "all timing lives here" rule by accident rather than by argument.
 */
export const BOUNCE_OPEN_DELAY = 300;
export const BOUNCE_CLOSE_DELAY = 800;
```

Then extend the existing `STAGGER` object (around `:78`) so it reads:

```ts
export const STAGGER = {
    dot: 12,
    /**
     * Between the two rows of the drawer hint.
     *
     * Applied to opening *and* closing, so each row is revealed for the same
     * span. Revealing both at once reads as the list coming apart rather than
     * as two trays.
     */
    drawerHint: 180
} as const;
```

- [ ] **Step 2: Point the component at them**

In `components/SwipeableRecipeRow.tsx`, delete lines 63-64:

```ts
const BOUNCE_OPEN_DELAY = 300;
const BOUNCE_CLOSE_DELAY = 1000;
```

and add to the existing import from `@/constants/motion` (create the import if
the file has none):

```ts
import {BOUNCE_CLOSE_DELAY, BOUNCE_OPEN_DELAY} from "@/constants/motion";
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npx jest --runTestsByPath components/__tests__/SwipeableRecipeRow.test.tsx
```

Expected: typecheck silent. The row suite may fail **only** if a test asserts
the old 1000 ms. If one does, update it to import `BOUNCE_CLOSE_DELAY` from
`@/constants/motion` rather than restating the number, and say so in your
report. If it fails for any other reason, stop and report.

- [ ] **Step 4: Commit**

```bash
git add constants/motion.ts components/SwipeableRecipeRow.tsx
git commit -m "$(printf 'Put the bounce timings where timing lives\n\nBoth were local literals in the row, so a retune of the app'"'"'s motion\ncould not reach them. The close delay drops to 800 ms with the move;\nthe reveal read slightly slow.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 2: The cadence policy, as pure functions

This is the whole of the new behaviour, with no React and no database, so the
rules can be read and tested as one truth table.

**The rules, from the spec:**

- Runs **at most once every 3 days**.
- **Retires** after 3 manual drawer opens, or a lifetime cap of 6 appearances,
  whichever comes first. Someone who opens drawers by hand has learned; someone
  who has seen it six times is not going to.
- **Re-arms** when the tray's action signature changes, or after 60 days of
  dormancy. The first covers a tray whose contents changed, which is genuinely
  new to learn. The second covers coming back to an app you had forgotten.

**Files:**
- Create: `library/drawerHint.ts`
- Create: `library/__tests__/drawerHint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/drawerHint.test.ts`:

```ts
import {
    DRAWER_ACTION_SIGNATURE,
    DRAWER_HINT_DORMANCY_MS,
    DRAWER_HINT_INTERVAL_MS,
    DRAWER_HINT_MANUAL_CAP,
    DRAWER_HINT_SHOWN_CAP,
    type DrawerHintState,
    noteHintShown,
    noteManualOpen,
    rearmDrawerHint,
    shouldShowDrawerHint
} from "@/library/drawerHint";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

function state(over: Partial<DrawerHintState> = {}): DrawerHintState {
    return {
        lastShownAt: 0,
        shownCount:  0,
        manualOpens: 0,
        signature:   DRAWER_ACTION_SIGNATURE,
        lastSeenAt:  NOW - DAY,
        ...over
    };
}

describe("the drawer hint's cadence", () => {
    it("shows on a fresh install", () => {
        expect(shouldShowDrawerHint(state(), NOW)).toBe(true);
    });

    it("says nothing again the same day", () => {
        expect(shouldShowDrawerHint(state({lastShownAt: NOW - DAY}), NOW))
            .toBe(false);
    });

    it("waits three days, and speaks on the third", () => {
        const almost = state({lastShownAt: NOW - DRAWER_HINT_INTERVAL_MS + 1});
        const due    = state({lastShownAt: NOW - DRAWER_HINT_INTERVAL_MS});
        expect(shouldShowDrawerHint(almost, NOW)).toBe(false);
        expect(shouldShowDrawerHint(due, NOW)).toBe(true);
    });

    it("retires once the user has opened drawers by hand", () => {
        const learning = state({manualOpens: DRAWER_HINT_MANUAL_CAP - 1});
        const learned  = state({manualOpens: DRAWER_HINT_MANUAL_CAP});
        expect(shouldShowDrawerHint(learning, NOW)).toBe(true);
        expect(shouldShowDrawerHint(learned, NOW)).toBe(false);
    });

    it("gives up after the lifetime cap", () => {
        const nearly = state({shownCount: DRAWER_HINT_SHOWN_CAP - 1});
        const spent  = state({shownCount: DRAWER_HINT_SHOWN_CAP});
        expect(shouldShowDrawerHint(nearly, NOW)).toBe(true);
        expect(shouldShowDrawerHint(spent, NOW)).toBe(false);
    });
});

describe("re-arming", () => {
    it("clears a retired hint when the tray's actions change", () => {
        const spent = state({
            shownCount:  DRAWER_HINT_SHOWN_CAP,
            manualOpens: DRAWER_HINT_MANUAL_CAP,
            lastShownAt: NOW - 1,
            signature:   "something it used to be"
        });
        const armed = rearmDrawerHint(spent, NOW, DRAWER_ACTION_SIGNATURE);

        expect(armed.shownCount).toBe(0);
        expect(armed.manualOpens).toBe(0);
        expect(armed.lastShownAt).toBe(0);
        expect(armed.signature).toBe(DRAWER_ACTION_SIGNATURE);
        expect(shouldShowDrawerHint(armed, NOW)).toBe(true);
    });

    it("leaves a hint alone when the actions are the same", () => {
        const spent = state({shownCount: DRAWER_HINT_SHOWN_CAP});
        expect(rearmDrawerHint(spent, NOW, DRAWER_ACTION_SIGNATURE))
            .toEqual(spent);
    });

    it("clears a retired hint after a long absence", () => {
        const spent = state({
            shownCount: DRAWER_HINT_SHOWN_CAP,
            lastSeenAt: NOW - DRAWER_HINT_DORMANCY_MS
        });
        expect(shouldShowDrawerHint(
            rearmDrawerHint(spent, NOW, DRAWER_ACTION_SIGNATURE), NOW
        )).toBe(true);
    });

    it("does not count a merely long gap as dormancy", () => {
        const spent = state({
            shownCount: DRAWER_HINT_SHOWN_CAP,
            lastSeenAt: NOW - DRAWER_HINT_DORMANCY_MS + 1
        });
        expect(rearmDrawerHint(spent, NOW, DRAWER_ACTION_SIGNATURE))
            .toEqual(spent);
    });
});

describe("recording what happened", () => {
    it("counts an appearance and stamps when it happened", () => {
        const after = noteHintShown(state(), NOW);
        expect(after.shownCount).toBe(1);
        expect(after.lastShownAt).toBe(NOW);
    });

    it("counts a manual open", () => {
        expect(noteManualOpen(state()).manualOpens).toBe(1);
    });

    it("stops counting manual opens once it has retired", () => {
        const learned = state({manualOpens: DRAWER_HINT_MANUAL_CAP});
        expect(noteManualOpen(learned)).toEqual(learned);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest --runTestsByPath library/__tests__/drawerHint.test.ts
```

Expected: FAIL, because `@/library/drawerHint` does not exist. Report the exact
message.

- [ ] **Step 3: Write the module**

Create `library/drawerHint.ts`:

```ts
/**
 * When to demonstrate the swipe trays, and when to stop.
 *
 * Pure arithmetic over a small record so the whole cadence can be read as one
 * truth table. The state lives in the settings database and the stagger lives
 * in `constants/motion.ts`; neither belongs here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most one demonstration every three days. */
export const DRAWER_HINT_INTERVAL_MS = 3 * DAY_MS;

/**
 * Manual opens after which the hint retires.
 *
 * Somebody who has opened a tray by hand three times has learned the gesture,
 * and a demonstration is then just a thing their list does without being asked.
 */
export const DRAWER_HINT_MANUAL_CAP = 3;

/**
 * Appearances after which the hint retires regardless.
 *
 * Six demonstrations is a fair attempt. Somebody who has not taken it by then
 * is not going to, and continuing reads as nagging.
 */
export const DRAWER_HINT_SHOWN_CAP = 6;

/** Absence after which the app assumes the trays have been forgotten. */
export const DRAWER_HINT_DORMANCY_MS = 60 * DAY_MS;

/**
 * What the trays currently offer.
 *
 * A change here re-arms the hint, because a tray whose contents changed is
 * genuinely a new thing to learn. `components/__tests__/SwipeableRecipeRow.test.tsx`
 * asserts the rendered tiles match this list, so the two cannot drift: add an
 * action without updating this and that test fails.
 */
export const DRAWER_ACTIONS = [
    "brew", "share", "write",
    "copy", "delete", "favourite"
] as const;

export const DRAWER_ACTION_SIGNATURE = DRAWER_ACTIONS.join(",");

export type DrawerHintState = {
    /** Epoch ms of the last demonstration. 0 means it has never run. */
    lastShownAt: number;
    shownCount: number;
    manualOpens: number;
    /** The tray signature in force when these counters were last meaningful. */
    signature: string;
    /** Epoch ms the app was last opened, which is how dormancy is measured. */
    lastSeenAt: number;
};

/**
 * Clear the counters if the lesson has become worth giving again.
 *
 * Separate from `shouldShowDrawerHint` because re-arming *writes* and deciding
 * does not, and a decision that quietly rewrote its own inputs would be very
 * hard to reason about at the call site.
 */
export function rearmDrawerHint(
    state: DrawerHintState, now: number, signature: string
): DrawerHintState {
    const changed = state.signature !== signature;
    const dormant = now - state.lastSeenAt >= DRAWER_HINT_DORMANCY_MS;
    if (!changed && !dormant) return state;

    return {
        lastShownAt: 0,
        shownCount:  0,
        manualOpens: 0,
        signature,
        lastSeenAt:  now
    };
}

/** Whether to demonstrate now. Assumes `rearmDrawerHint` has already run. */
export function shouldShowDrawerHint(state: DrawerHintState, now: number): boolean {
    if (state.manualOpens >= DRAWER_HINT_MANUAL_CAP) return false;
    if (state.shownCount >= DRAWER_HINT_SHOWN_CAP) return false;
    if (state.lastShownAt === 0) return true;
    return now - state.lastShownAt >= DRAWER_HINT_INTERVAL_MS;
}

export function noteHintShown(state: DrawerHintState, now: number): DrawerHintState {
    return {...state, shownCount: state.shownCount + 1, lastShownAt: now};
}

/**
 * Count a tray the user opened themselves.
 *
 * Stops counting at the cap so the number cannot run away on somebody who uses
 * the trays constantly, which would make the stored value meaningless if the
 * cap were ever raised.
 */
export function noteManualOpen(state: DrawerHintState): DrawerHintState {
    if (state.manualOpens >= DRAWER_HINT_MANUAL_CAP) return state;
    return {...state, manualOpens: state.manualOpens + 1};
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx jest --runTestsByPath library/__tests__/drawerHint.test.ts
```

Expected: PASS. Counts double, because the suite runs as two jest projects
(`ios` and `android`). 13 distinct tests report as 26.

- [ ] **Step 5: Commit**

```bash
git add library/drawerHint.ts library/__tests__/drawerHint.test.ts
git commit -m "$(printf 'Decide when the trays are worth demonstrating\n\nOnce every three days, retiring after three manual opens or six\nappearances, re-arming when the tray changes or after sixty days away.\nPure functions so the cadence reads as one truth table.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 3: Persist the counters

**Files:**
- Modify: `library/Settings.ts`
- Verify: `app/settings.tsx`

- [ ] **Step 1: Add four scalar keys to `DEFAULTS`**

In `library/Settings.ts`, add inside the `DEFAULTS` object:

```ts
    /**
     * The drawer hint's learning history for *this device*.
     *
     * Four scalars rather than one record, because `Settings.get` validates
     * with `typeof parsed !== typeof DEFAULTS[key]`, and `typeof` is "object"
     * for an object, an array and `null` alike. A malformed record would pass
     * that check and reach the policy; four numbers and a string cannot.
     *
     * Excluded from backup: these describe what one phone has been shown, and
     * restoring a backup should not tell a new device it has already taught a
     * lesson it has not.
     */
    drawerHintLastShownAt: 0,
    drawerHintShownCount:  0,
    drawerHintManualOpens: 0,
    drawerHintSignature:   "",
    drawerHintLastSeenAt:  0,
```

Note that is **five** keys, not four: `drawerHintLastSeenAt` carries dormancy.

- [ ] **Step 2: Exclude them from backup**

Find `BackupExcluded` and `NOT_IN_BACKUP` in `library/Settings.ts` (around
`:289-293`) and add all five key names, following whatever shape is already
there. Keep the existing entries.

- [ ] **Step 3: Verify the backup contract compiles**

```bash
npm run typecheck
npx jest --runTestsByPath library/__tests__/backup.test.ts
```

Expected: both pass. `settingsSnapshot()` in `app/settings.tsx` returns
`Record<Exclude<SettingKey, BackupExcluded>, unknown>`, so if you excluded the
keys correctly it needs **no** change. If typecheck complains that a key is
missing from the snapshot, you have not added it to `NOT_IN_BACKUP` correctly.
Do not "fix" that by adding the keys to the snapshot instead.

- [ ] **Step 4: Commit**

```bash
git add library/Settings.ts
git commit -m "$(printf 'Remember what this phone has already been shown\n\nFive scalars rather than one record: the settings type check compares\ntypeof against the default, which cannot tell a malformed object from a\ngood one. Kept out of backup, since a restored phone has not been taught\nanything.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 4: Give the row a direction, a delay, and a manual-open signal

**Files:**
- Modify: `components/SwipeableRecipeRow.tsx`
- Modify: `components/__tests__/SwipeableRecipeRow.test.tsx`

- [ ] **Step 1: Replace the props**

In the `Props` type, delete `bounceOnMount?: boolean` and add:

```ts
    /**
     * Which tray to demonstrate on mount, or null for the usual silence.
     *
     * A scalar rather than an options object on purpose: an object literal
     * would be a new value every render and would restart the effect below.
     */
    hintTray?: "action" | "management" | null;
    /** Offset for this row, so two rows can be staggered. */
    hintDelayMs?: number;
    /**
     * The user opened a tray by dragging it.
     *
     * Reported from `onSwipeableOpenStartDrag`, which fires only for a real
     * drag, so the hint's own programmatic open is not miscounted as the user
     * having learned the gesture.
     */
    onManualOpen?: () => void;
```

- [ ] **Step 2: Rewrite the bounce effect**

Replace the whole `useEffect` at `:170-202` with:

```ts
    // The owner rebuilds its callbacks every render, so depending on
    // `onBounced` below would tear down and restart the timers on every render
    // and the card would never come back. The ref keeps the latest callback
    // without making it an input to the effect.
    const bouncedRef = useRef(onBounced);
    bouncedRef.current = onBounced;

    useEffect(() => {
        if (hintTray === null || hintTray === undefined) {
            return;
        }
        // Two trays, two rows, one tray each.
        //
        // Wobbling a single card left and then right would read as a glitch,
        // which is why this used to teach one direction only. Staggering two
        // *different* rows says the same thing without that: the top row shows
        // the action tray, the one below it shows the management tray, and
        // neither card ever moves both ways.
        const open = setTimeout(() => {
            if (hintTray === "action") {
                swipeableRef.current?.openLeft();
            } else {
                swipeableRef.current?.openRight();
            }
        }, BOUNCE_OPEN_DELAY + hintDelayMs);
        const close = setTimeout(() => {
            swipeableRef.current?.close();
            // Closing is reported, opening is not. Reporting from the opening
            // timer once retired the lesson while it was still running: the
            // owner set state, the prop went null, this effect's cleanup ran,
            // and it cleared the very timer that brings the card back. The tray
            // stayed open.
            onBounced?.();
        }, BOUNCE_CLOSE_DELAY + hintDelayMs);
        return () => {
            clearTimeout(open);
            clearTimeout(close);
        };
    }, [hintTray, hintDelayMs]);
```

`onBounced` inside the timer becomes `bouncedRef.current?.()`. Write it that
way; the line above is left readable for the sake of the comment around it.

Assigning to a ref during render is what the React Compiler calls an escape
hatch, and the repo already does it. If `react-hooks/purity` rejects it here,
move the assignment into its own `useEffect(() => {bouncedRef.current = onBounced;})`
with no dependency array and say so in your report.

Give the new props defaults in the destructuring at `:146-163`: replace
`bounceOnMount = false,` with `hintTray = null,` and add `hintDelayMs = 0,` and
`onManualOpen,`.

- [ ] **Step 3: Report a real drag**

On the `<Swipeable` element at `:333`, add:

```ts
                onSwipeableOpenStartDrag={() => onManualOpen?.()}
```

Leave `overshootLeft` / `overshootRight` and the comment above them alone.

- [ ] **Step 4: Write the tests**

Add to `components/__tests__/SwipeableRecipeRow.test.tsx`. Match the file's
existing helper for rendering a row; the snippet below assumes a local `row()`
helper and `renderWithProviders`. If the file names things differently, follow
its convention rather than this literal.

```ts
    it("keeps the tray list and the hint signature in step", async () => {
        await renderWithProviders(row({}));
        for (const action of DRAWER_ACTIONS) {
            expect(screen.getByTestId(`recipe-row-${action}`)).toBeTruthy();
        }
    });
```

Import `DRAWER_ACTIONS` from `@/library/drawerHint`. **Check the real testIDs
on the six action tiles first** and use whatever prefix the component actually
renders; if the tiles have no testIDs, add them in this task, named for the
action.

- [ ] **Step 5: Run and verify**

```bash
npx jest --runTestsByPath components/__tests__/SwipeableRecipeRow.test.tsx
npm run typecheck
```

Typecheck **will** fail in `app/index.tsx`, which still passes `bounceOnMount`.
That is expected and Task 5 fixes it. Report the exact error. Do not fix it here
beyond what Task 5 specifies.

- [ ] **Step 6: Commit**

```bash
git add components/SwipeableRecipeRow.tsx components/__tests__/SwipeableRecipeRow.test.tsx
git commit -m "$(printf 'Let a row be told which tray to show, and when\n\nA direction and a delay instead of a boolean, so two rows can be\nstaggered, and a drag signal so the hint can tell when the gesture has\nbeen learned. Only a real drag counts; the hint'"'"'s own open does not.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 5: Bind the policy to settings, and stagger the two rows

**Files:**
- Create: `hooks/useDrawerHint.ts`
- Create: `hooks/__tests__/useDrawerHint.test.ts`
- Modify: `app/index.tsx`

**The React rules that constrain this hook.** `react-hooks/set-state-in-effect`
and `react-hooks/purity` are **errors** in this repo, and the React Compiler is
on. So: the decision is taken **once**, in a lazy `useState` initialiser, which
only *reads*. The write that records the appearance happens in an effect, which
touches the database rather than state and is therefore allowed. Do not reverse
these.

- [ ] **Step 1: Write the hook**

Create `hooks/useDrawerHint.ts`:

```ts
import {useEffect, useState} from "react";

import {STAGGER, useReducedMotion} from "@/constants/motion";
import {
    DRAWER_ACTION_SIGNATURE,
    type DrawerHintState,
    noteHintShown,
    noteManualOpen,
    rearmDrawerHint,
    shouldShowDrawerHint
} from "@/library/drawerHint";
import {settings} from "@/library/Settings";

function readState(): DrawerHintState {
    return {
        lastShownAt: settings.get("drawerHintLastShownAt"),
        shownCount:  settings.get("drawerHintShownCount"),
        manualOpens: settings.get("drawerHintManualOpens"),
        signature:   settings.get("drawerHintSignature"),
        lastSeenAt:  settings.get("drawerHintLastSeenAt")
    };
}

function writeState(state: DrawerHintState): void {
    settings.set("drawerHintLastShownAt", state.lastShownAt);
    settings.set("drawerHintShownCount", state.shownCount);
    settings.set("drawerHintManualOpens", state.manualOpens);
    settings.set("drawerHintSignature", state.signature);
    settings.set("drawerHintLastSeenAt", state.lastSeenAt);
}

export type DrawerHint = {
    /** Which tray this row should demonstrate, or null for silence. */
    trayFor: (recipeIndex: number) => "action" | "management" | null;
    delayFor: (recipeIndex: number) => number;
    noteManualOpen: () => void;
    dismiss: () => void;
};

/**
 * Decides, once per mount, whether to demonstrate the trays.
 *
 * Taken once rather than per render so the answer cannot change underneath a
 * list that is already animating. The appearance is recorded when the decision
 * is made rather than when the animation finishes, because two rows finish
 * separately and recording on completion would count one lesson twice.
 */
export function useDrawerHint(): DrawerHint {
    const reducedMotion = useReducedMotion();
    const [showing, setShowing] = useState(() => {
        // A reduced-motion user has asked not to be shown animated
        // demonstrations. The trays stay discoverable by swiping.
        if (reducedMotion) return false;
        const armed = rearmDrawerHint(readState(), Date.now(), DRAWER_ACTION_SIGNATURE);
        return shouldShowDrawerHint(armed, Date.now());
    });

    useEffect(() => {
        const now = Date.now();
        const armed = rearmDrawerHint(readState(), now, DRAWER_ACTION_SIGNATURE);
        writeState(showing ? noteHintShown(armed, now) : {...armed, lastSeenAt: now});
        // Runs once: `showing` is decided at mount and only ever turns off, and
        // turning it off must not write a second appearance. `exhaustive-deps`
        // is a warning in this repo, not an error, so leave it to warn rather
        // than silencing it; the warning is the record of the decision.
    }, []);

    return {
        trayFor: (recipeIndex) => {
            if (!showing) return null;
            if (recipeIndex === 0) return "action";
            if (recipeIndex === 1) return "management";
            return null;
        },
        delayFor: (recipeIndex) => (recipeIndex === 1 ? STAGGER.drawerHint : 0),
        noteManualOpen: () => {
            const next = noteManualOpen(readState());
            settings.set("drawerHintManualOpens", next.manualOpens);
            setShowing(false);
        },
        dismiss: () => setShowing(false)
    };
}
```

**Before writing this, check how `library/Settings.ts` actually exports its
singleton.** The import above assumes a `settings` export. If the repo instead
uses a `useSetting` hook or a different accessor, follow that and adjust; do not
invent a new access path. Report what you found.

- [ ] **Step 2: Write the hook's test**

Create `hooks/__tests__/useDrawerHint.test.ts`. Follow the repo's existing
hook-test conventions, and note two things from the repo's own hard-won notes:
`renderHook` from `@testing-library/react-native` v14 is **async** here, so
`await` it or `result` is undefined; and wrap `unmount()` in `await act(...)`.

```ts
import {act, renderHook} from "@testing-library/react-native";

import {useDrawerHint} from "@/hooks/useDrawerHint";

describe("the drawer hint hook", () => {
    it("teaches the action tray on the first row and management on the second", async () => {
        const {result} = await renderHook(() => useDrawerHint());

        expect(result.current.trayFor(0)).toBe("action");
        expect(result.current.trayFor(1)).toBe("management");
        expect(result.current.trayFor(2)).toBeNull();
    });

    it("staggers the second row and not the first", async () => {
        const {result} = await renderHook(() => useDrawerHint());

        expect(result.current.delayFor(0)).toBe(0);
        expect(result.current.delayFor(1)).toBeGreaterThan(0);
    });

    it("stops teaching once a tray has been opened by hand", async () => {
        const {result} = await renderHook(() => useDrawerHint());
        expect(result.current.trayFor(0)).toBe("action");

        await act(async () => {
            result.current.noteManualOpen();
        });

        expect(result.current.trayFor(0)).toBeNull();
    });
});
```

You will need the settings database available. Use `test-utils/sqlite.ts`'s
`createTestDatabase` if the repo's other settings tests do, and reset the
settings table between tests so one test's counters cannot decide another's
outcome. **Check how `library/__tests__/backup.test.ts` or another settings test
sets this up and copy it.** If the hint does not show in a fresh test database,
the most likely cause is `useReducedMotion` returning true under the test
environment; check it and mock it to false if so, reporting that you did.

- [ ] **Step 3: Run the hook test**

```bash
npx jest --runTestsByPath hooks/__tests__/useDrawerHint.test.ts
```

Expected: PASS. If a test passes while `result` is undefined, you have forgotten
an `await`.

- [ ] **Step 4: Wire the home screen**

In `app/index.tsx`:

Delete the local state and its retire function at `:361-371`:

```ts
const [bounceFirstRow, setBounceFirstRow] = useState(true);
...
function retireBounce() {
    setBounceFirstRow(false);
}
```

Add near the other hooks in the component body:

```ts
const drawerHint = useDrawerHint();
```

Replace the two props at `:1486-1487`:

```tsx
                                hintTray={drawerHint.trayFor(item.recipeIndex)}
                                hintDelayMs={drawerHint.delayFor(item.recipeIndex)}
                                onManualOpen={drawerHint.noteManualOpen}
                                onBounced={drawerHint.dismiss}
```

Replace each of the three `setBounceFirstRow(false)` calls at `:1504-1513` with
`drawerHint.dismiss()`, leaving the library mutation beside each one untouched.

- [ ] **Step 5: Verify the whole thing**

```bash
npm run typecheck
npm run lint
npx jest --runTestsByPath app/__tests__/index.test.tsx
```

Expected: typecheck silent, lint 0 errors and about 26 pre-existing warnings,
the home screen suite green. If a home screen test asserted the old
every-launch bounce, update it to drive the policy rather than deleting it, and
explain the change in your report.

- [ ] **Step 6: Commit**

```bash
git add hooks/useDrawerHint.ts hooks/__tests__/useDrawerHint.test.ts app/index.tsx
git commit -m "$(printf 'Teach both trays, and stop once they are learned\n\nThe top row shows the action tray and the one below it the management\ntray, 180 ms later, so the second tray stops going undiscovered. The\ncadence comes from the policy rather than from mount, so a user who has\nlearned the gesture is left alone.\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>')"
```

---

## Task 6: The whole gate

**Files:** none.

- [ ] **Step 1: Run all four CI gates**

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Expected: typecheck silent; lint 0 errors and ~26 pre-existing warnings; the
full suite green, which takes about 3.5 minutes; expo-doctor 21/21.

Run the **whole** suite, not only the files you touched. A previous package in
this release missed a failure in `BrewSummary` by running targeted suites only.

- [ ] **Step 2: Check the list still behaves with few recipes**

Reason through, and state in your report, what happens when the library holds
**one** recipe: `trayFor(1)` is never called because no row has
`recipeIndex === 1`, so the management tray simply is not demonstrated and
nothing errors. Confirm there is a test covering a one-recipe library, and add
one if there is not.

- [ ] **Step 3: Report, and stop**

Do **not** push and do **not** open a pull request. Report:

- every gate's real numbers;
- anything you deviated from in this plan and why;
- whether the signature re-arm will fire for existing users on this release.
  It should **not** yet: `DRAWER_ACTIONS` describes today's trays, so a user
  upgrading to this build gets a re-arm only because their stored signature is
  the empty-string default. Say plainly whether that is what you observe,
  because it decides whether every existing user sees one reveal on 2.1.0.

---

## Notes for the reviewer

- The spec says the signature re-arm "fires in this release, because package 6
  changes the tray". Package 6 is **not** in this plan. The re-arm here comes
  from the empty default signature instead, which has the same effect for
  existing users. When package 6 lands and changes the tray, `DRAWER_ACTIONS`
  must be updated with it, and the test in Task 4 Step 4 is what forces that.
- Reduced-motion users never see the hint at all. That is deliberate and in the
  spec: someone who has asked not to be shown animated demonstrations should not
  be shown one, and the trays remain discoverable by swiping.
