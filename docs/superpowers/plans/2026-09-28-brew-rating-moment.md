# The rating moment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask for a brew's rating when the user next opens the app rather than only at the machine, and stop a later rating from silently failing to reach Beanconqueror.

**Architecture:** A pure rule (`library/brew/ratingPrompt.ts`) decides whether the most recent watched brew is worth asking about. A hook (`hooks/useRatingPrompt.ts`) supplies it with a candidate read on mount and on app foreground. `LiveBrewBar` becomes the arbiter of the bottom slot, drawing the live mini bar when a run exists and a new `BrewRatingBar` otherwise. Ratings are written through the existing `BrewDatabase.judge`. Separately, a `sentAt` column makes the Beanconqueror door able to say a brew was already handed over, and the stars are offered before a send so the verdict usually travels with the brew.

**Tech Stack:** TypeScript, React Native, Expo SDK 57, Tamagui, expo-sqlite (sync), Jest with jest-expo, @testing-library/react-native v14.

**Spec:** `docs/superpowers/specs/2026-09-28-brew-rating-moment-design.md`

**House rules that apply to every task:**
- No em dashes and no hyphens used as dashes in user-facing copy, including accessibility labels.
- All colour from `constants/colors.ts`, all timing from `constants/motion.ts`.
- React Compiler is on: no hand-written `useMemo`/`useCallback`, no component declared inside another component, no `setState` in an effect body that runs on render.
- `render`, `fireEvent` and `renderHook` from `@testing-library/react-native` are **async**. Always `await` them. Always render through `renderWithProviders` from `test-utils/render.tsx`.
- Run the whole file's tests with `npx jest <path>`; a single test with `-t "<name>"`.

---

### Task 1: The rule for whether to ask

**Files:**
- Create: `library/brew/ratingPrompt.ts`
- Test: `library/brew/__tests__/ratingPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/brew/__tests__/ratingPrompt.test.ts`:

```ts
import {brewToRate, RATING_PROMPT_WINDOW_MS} from "@/library/brew/ratingPrompt";
import type {StoredBrew} from "@/library/BrewDatabase";

const NOW = 1_700_000_000_000;

function brew(over: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "b1",
        recipeUuid: "r1",
        recipeName: "Morning Bloem",
        accent: "#ff8800",
        startedAt: NOW - 20 * 60_000,
        pouringAt: NOW - 19 * 60_000,
        endedAt: NOW - 60_000,
        outcome: "done",
        failure: null,
        pours: 3,
        waterTotal: 260,
        cupTotal: 244,
        heldSeconds: 0,
        rating: 0,
        note: "",
        pinned: false,
        hasStream: true,
        ...over
    } as StoredBrew;
}

const ASK = {now: NOW, dismissedId: "", enabled: true};

describe("brewToRate", () => {
    it("asks about a finished, watched, unrated brew", () => {
        const candidate = brew();
        expect(brewToRate({brew: candidate, ...ASK})).toBe(candidate);
    });

    it("has nothing to ask about when there is no brew", () => {
        expect(brewToRate({brew: null, ...ASK})).toBeNull();
    });

    it("does not ask about a brew that is already rated", () => {
        expect(brewToRate({brew: brew({rating: 4}), ...ASK})).toBeNull();
    });

    it("does not ask about a brew that never made a cup", () => {
        expect(brewToRate({brew: brew({outcome: "cancelled"}), ...ASK})).toBeNull();
    });

    it("does not ask about a brew nobody watched", () => {
        expect(brewToRate({brew: brew({watched: false}), ...ASK})).toBeNull();
    });

    it("does not ask again once the question was dismissed", () => {
        expect(brewToRate({brew: brew(), ...ASK, dismissedId: "b1"})).toBeNull();
    });

    it("does not ask when the user has turned the question off", () => {
        expect(brewToRate({brew: brew(), ...ASK, enabled: false})).toBeNull();
    });

    it("still asks a moment inside the window", () => {
        const candidate = brew({endedAt: NOW - RATING_PROMPT_WINDOW_MS + 1_000});
        expect(brewToRate({brew: candidate, ...ASK})).toBe(candidate);
    });

    it("stops asking once the window has passed", () => {
        const candidate = brew({endedAt: NOW - RATING_PROMPT_WINDOW_MS - 1_000});
        expect(brewToRate({brew: candidate, ...ASK})).toBeNull();
    });

    it("ignores a brew that claims to have ended in the future", () => {
        expect(brewToRate({brew: brew({endedAt: NOW + 60_000}), ...ASK})).toBeNull();
    });

    it("counts sixteen hours as the window", () => {
        expect(RATING_PROMPT_WINDOW_MS).toBe(16 * 60 * 60 * 1000);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/brew/__tests__/ratingPrompt.test.ts`
Expected: FAIL, "Cannot find module '@/library/brew/ratingPrompt'".

- [ ] **Step 3: Write the rule**

Create `library/brew/ratingPrompt.ts`:

```ts
import {isMeasured} from "@/library/brew/brewPopulation";
import type {StoredBrew} from "@/library/BrewDatabase";

/**
 * How long a brew is still worth asking about.
 *
 * Sixteen hours: long enough that a brew made at breakfast is still asked
 * about in the evening, short enough that yesterday's is not. A question that
 * outlives the memory of the cup is a question nobody can answer.
 */
export const RATING_PROMPT_WINDOW_MS = 16 * 60 * 60 * 1000;

export type RatingPromptInput = {
    /** The most recent brew the app watched, whatever state it is in. */
    brew: StoredBrew | null;
    now: number;
    /** The id whose question was already dismissed. Empty when none was. */
    dismissedId: string;
    /** The user's `askForRatings` preference. */
    enabled: boolean;
};

/**
 * The brew worth asking about, if there is one.
 *
 * Given the most recent watched brew rather than a filtered candidate, so that
 * "only the most recent brew is ever asked about" is a property of this
 * function rather than of a query somewhere else. A recent brew that was
 * already rated therefore ends the matter: it does not fall through to an
 * older unrated one, and that is the intended behaviour, not an omission. What
 * is being fixed is a badly timed question, not a backlog of unanswered ones.
 */
export function brewToRate(input: RatingPromptInput): StoredBrew | null {
    const {brew, now, dismissedId, enabled} = input;
    if (!enabled || brew === null) return null;
    // `isMeasured` is countable and watched together: a refusal before anything
    // was sent writes no row at all, a cancelled brew is history but not a cup,
    // and a hand-logged row was rated at the moment somebody created it.
    if (!isMeasured(brew)) return null;
    if ((brew.rating ?? 0) > 0) return null;
    if (brew.id === dismissedId) return null;
    // A row that claims the future is a clock that moved, not a brew that has
    // not happened. Asking about it would leave the question up for sixteen
    // hours past whenever the clock settles.
    if (brew.endedAt > now) return null;
    if (now - brew.endedAt >= RATING_PROMPT_WINDOW_MS) return null;
    return brew;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/brew/__tests__/ratingPrompt.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Mutation check**

Change `if (now - brew.endedAt >= RATING_PROMPT_WINDOW_MS)` to `> `, re-run, and confirm no test flips (the boundary tests sit 1 s either side, which is deliberate). Then change `RATING_PROMPT_WINDOW_MS` to `8 * 60 * 60 * 1000` and confirm two tests fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add library/brew/ratingPrompt.ts library/brew/__tests__/ratingPrompt.test.ts
git commit -m "Decide which brew is still worth asking about

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: The brew the rule is asked about

**Files:**
- Modify: `library/BrewDatabase.ts` (add one public method near `brewOn`, around line 700)
- Test: `library/__tests__/BrewDatabaseLastWatched.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/BrewDatabaseLastWatched.test.ts`. Use the real SQLite helper, never a `jest.mock("expo-sqlite")`: a mock that pattern-matches query strings cannot fail on wrong SQL.

```ts
import {createTestDatabase} from "@/test-utils/sqlite";
import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord} from "@/library/brew/BrewRecord";

function record(over: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1",
        recipeUuid: "r1",
        recipeName: "Morning Bloem",
        accent: "#ff8800",
        startedAt: 1_000,
        pouringAt: 1_100,
        endedAt: 2_000,
        outcome: "done",
        failure: null,
        pours: 3,
        waterTotal: 260,
        cupTotal: 244,
        heldSeconds: 0,
        ...over
    } as BrewRecord;
}

describe("BrewDatabase.lastWatchedBrew", () => {
    it("has nothing to offer on an empty history", () => {
        const database = new BrewDatabase(createTestDatabase());
        expect(database.lastWatchedBrew()).toBeNull();
    });

    it("returns the most recently ended brew", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.insert(record({id: "old", endedAt: 1_000}), []);
        database.insert(record({id: "new", endedAt: 9_000}), []);
        expect(database.lastWatchedBrew()?.id).toBe("new");
    });

    it("skips a brew that never made a cup", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.insert(record({id: "cup", endedAt: 1_000}), []);
        database.insert(
            record({id: "stopped", endedAt: 9_000, outcome: "cancelled"}), []
        );
        expect(database.lastWatchedBrew()?.id).toBe("cup");
    });

    it("skips a brew logged by hand", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.insert(record({id: "seen", endedAt: 1_000}), []);
        database.insert(
            record({id: "logged", endedAt: 9_000, watched: false, rating: 4}), []
        );
        expect(database.lastWatchedBrew()?.id).toBe("seen");
    });

    it("returns a brew that is already rated, so the rule can end the matter", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.insert(record({id: "unrated", endedAt: 1_000}), []);
        database.insert(record({id: "rated", endedAt: 9_000, rating: 5}), []);
        expect(database.lastWatchedBrew()?.id).toBe("rated");
    });
});
```

If `BrewDatabase`'s constructor does not already accept an injected database, read its signature first and follow whatever `library/__tests__` files using `createTestDatabase` do. Do not change the constructor to suit the test.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/__tests__/BrewDatabaseLastWatched.test.ts`
Expected: FAIL, "database.lastWatchedBrew is not a function".

- [ ] **Step 3: Add the method**

In `library/BrewDatabase.ts`, immediately after the `brewOn` method, add:

```ts
    /**
     * The most recent brew the app watched all the way to a cup.
     *
     * Deliberately not filtered by rating, by age or by whether its question
     * was dismissed. Those are the rating prompt's rules and they live in
     * `library/brew/ratingPrompt.ts`, where a test can drive every one of them
     * without SQLite. This answers only "which brew is the current one?", and
     * the answer being already rated is how the prompt learns there is nothing
     * to ask.
     */
    public lastWatchedBrew(): StoredBrew | null {
        const rows = this.db.getAllSync<BrewRow>(
            `SELECT * FROM brews
             WHERE ${COUNTED_SQL} AND watched = 1
             ORDER BY endedAt DESC LIMIT 1;`
        );
        const row = rows[0];
        return row === undefined ? null : hydrate(row);
    }
```

`COUNTED_SQL` is already imported at the top of the file. `hydrate` and `BrewRow` are module-local and already in scope.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/BrewDatabaseLastWatched.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Mutation check**

Change `ORDER BY endedAt DESC` to `ASC` and confirm "returns the most recently ended brew" fails. Remove `AND watched = 1` and confirm "skips a brew logged by hand" fails. Restore both.

- [ ] **Step 6: Commit**

```bash
git add library/BrewDatabase.ts library/__tests__/BrewDatabaseLastWatched.test.ts
git commit -m "Ask the history which brew is the current one

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: The two settings

**Files:**
- Modify: `library/Settings.ts` (`DEFAULTS`, `BackupExcluded`, `NOT_IN_BACKUP`)
- Modify: `app/settings.tsx` (`settingsSnapshot`, one new toggle row)
- Test: `library/__tests__/backup.test.ts` already holds the exhaustiveness pin; no new test file.

- [ ] **Step 1: Add the keys**

In `library/Settings.ts`, inside `DEFAULTS`, after `animateBrewChart` (or anywhere among the brewing keys), add:

```ts
    /**
     * Offer the last brew's stars in the bottom bar on your next visit.
     *
     * On by default, because the whole point of #142 is that the rating asked
     * for at the machine is asked too early and is therefore not given. Off is
     * here because a bar that appears unbidden and cannot be silenced is a
     * support request waiting to happen: somebody who never rates anything
     * should be able to say so once rather than dismissing a brew at a time.
     */
    askForRatings: true,
    /**
     * The brew whose rating question was dismissed. Empty until one is.
     *
     * One id is all the state there is, because only the most recent brew is
     * ever asked about: a newer brew makes this irrelevant rather than needing
     * a second entry. A column on `brews` would carry the same fact at the
     * cost of a migration and a field on every row that will never read it.
     */
    ratingPromptDismissed: "",
```

Then extend the two backup exclusions:

```ts
export type BackupExcluded =
    "machineDeviceId" | "lastCardRead" | "labsUnlocked" | "beanconquerorHandoff"
    | "ratingPromptDismissed";
export const NOT_IN_BACKUP: readonly SettingKey[] = [
    "machineDeviceId", "lastCardRead", "labsUnlocked", "beanconquerorHandoff",
    "ratingPromptDismissed"
];
```

`ratingPromptDismissed` is excluded because it is a fact about this phone having been shown a question, not a fact about the brew. Restored onto another phone it would suppress a question that phone never asked. `askForRatings` is a preference and belongs in a backup.

- [ ] **Step 2: Run the backup test and watch it fail**

Run: `npx jest library/__tests__/backup.test.ts && npm run typecheck`
Expected: the typecheck FAILS, because `settingsSnapshot()` in `app/settings.tsx` no longer returns every non-excluded key. That failure is the guard working.

- [ ] **Step 3: Carry the preference into the snapshot**

In `app/settings.tsx`, add the binding beside the other `useSetting` calls near line 94:

```ts
    const [askForRatings, setAskForRatings] = useSetting("askForRatings", settings);
```

and add `askForRatings` to the object returned by `settingsSnapshot()`, on the line with `machineAutoStart, animateBrewChart, brewTraceRetention`.

- [ ] **Step 4: Add the row**

In `app/settings.tsx`, in the brewing section that already holds `animateBrewChart` (find it with `grep -n "animateBrewChart" app/settings.tsx`), add immediately after that row:

```tsx
                    <SettingsToggleRow
                        label="Ask how a brew was"
                        description="Shows the last brew's stars along the bottom next time you open the app, for up to 16 hours."
                        value={askForRatings} onChange={setAskForRatings}/>
```

- [ ] **Step 5: Run typecheck and the backup test**

Run: `npm run typecheck && npx jest library/__tests__/backup.test.ts`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add library/Settings.ts app/settings.tsx
git commit -m "Let the rating question be switched off, and remember a dismissal

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: The copy

**Files:**
- Modify: `constants/brewCopy.ts`
- Test: `constants/__tests__/ratingCopy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `constants/__tests__/ratingCopy.test.ts`:

```ts
import {
    HANDOFF_ALREADY_SENT,
    RATING_CAN_WAIT,
    RATING_PROMPT
} from "@/constants/brewCopy";

const copy = [
    RATING_CAN_WAIT,
    ...Object.values(RATING_PROMPT),
    HANDOFF_ALREADY_SENT("2 March")
];

describe("the rating and handoff copy", () => {
    it("uses no dashes, which read as machine written", () => {
        for (const line of copy) {
            expect(line).not.toMatch(/[\u2013\u2014]/);
            expect(line).not.toMatch(/ - /);
        }
    });

    it("says a rating can wait without naming a screen", () => {
        expect(RATING_CAN_WAIT.toLowerCase()).toContain("later");
    });

    it("names the day a brew went over, and warns about a second", () => {
        const line = HANDOFF_ALREADY_SENT("2 March");
        expect(line).toContain("2 March");
        expect(line.toLowerCase()).toContain("second");
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest constants/__tests__/ratingCopy.test.ts`
Expected: FAIL, the three names are not exported.

- [ ] **Step 3: Add the copy**

Append to `constants/brewCopy.ts`:

```ts
/**
 * The line under the stars on the finished brew screen.
 *
 * The screen asks at the moment the machine stops, which is the moment the user
 * has least to say: the cup is under the spout and has not been tasted. The
 * control stays because somebody who does have an opinion should not have to
 * go looking for a history screen to give it. This line is what makes walking
 * away a choice rather than a loss.
 */
export const RATING_CAN_WAIT = "No rush. You can rate it later.";

/** The rating prompt along the bottom of the app. */
export const RATING_PROMPT = {
    /** Above the stars, on the row with the recipe name. */
    question: "HOW WAS IT",
    /** The bar as a whole, for a screen reader. */
    openLabel: "Open the last brew",
    dismissLabel: "Not now",
    /** The sheet behind a star. */
    sheetTitle: "How was it?",
    sheetDone: "DONE"
} as const;

/**
 * What the Beanconqueror door says once a brew has gone over.
 *
 * Phrased as what this app did rather than what the other app received:
 * opening a deep link proves nothing about installation, understanding or the
 * user cancelling out of it. The second sentence is the honest description of
 * an envelope with no brew id in it, which is why the button is never disabled.
 */
export function HANDOFF_ALREADY_SENT(when: string): string {
    return `Sent ${when}. Sending again adds a second brew over there rather than updating the first.`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest constants/__tests__/ratingCopy.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add constants/brewCopy.ts constants/__tests__/ratingCopy.test.ts
git commit -m "Say that a rating can wait, and that a second send is a second brew

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: The hook that holds the question

**Files:**
- Create: `hooks/useRatingPrompt.ts`
- Test: `hooks/__tests__/useRatingPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useRatingPrompt.test.ts`:

```ts
import {act, renderHook} from "@testing-library/react-native";

import {useRatingPrompt} from "@/hooks/useRatingPrompt";
import {Settings} from "@/library/Settings";
import type {StoredBrew} from "@/library/BrewDatabase";

jest.mock("@/library/Settings", () => {
    const store = new Map<string, unknown>();
    const listeners = new Set<() => void>();
    return {
        ...jest.requireActual("@/library/Settings"),
        Settings: class {
            get = (key: string) =>
                store.has(key)
                    ? store.get(key)
                    : jest.requireActual("@/library/Settings").DEFAULTS[key];
            set = (key: string, value: unknown) => {
                store.set(key, value);
                for (const listener of listeners) listener();
            };
            subscribe = (listener: () => void) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            };
            static reset = () => store.clear();
        }
    };
});

const NOW = 1_700_000_000_000;

function brew(over: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "b1", recipeUuid: "r1", recipeName: "Morning Bloem",
        accent: "#ff8800", startedAt: NOW - 900_000, pouringAt: NOW - 880_000,
        endedAt: NOW - 60_000, outcome: "done", failure: null, pours: 3,
        waterTotal: 260, cupTotal: 244, heldSeconds: 0, rating: 0, note: "",
        pinned: false, hasStream: true, ...over
    } as StoredBrew;
}

function storeWith(candidate: StoredBrew | null) {
    return {
        lastWatchedBrew: jest.fn(() => candidate),
        judge: jest.fn()
    };
}

describe("useRatingPrompt", () => {
    beforeEach(() => {
        (Settings as unknown as {reset: () => void}).reset();
        jest.spyOn(Date, "now").mockReturnValue(NOW);
    });
    afterEach(() => jest.restoreAllMocks());

    it("offers the last unrated brew", async () => {
        const store = storeWith(brew());
        const {result} = await renderHook(
            () => useRatingPrompt(store, new Settings())
        );
        expect(result.current.brew?.id).toBe("b1");
    });

    it("offers nothing once the brew is rated", async () => {
        const store = storeWith(brew({rating: 4}));
        const {result} = await renderHook(
            () => useRatingPrompt(store, new Settings())
        );
        expect(result.current.brew).toBeNull();
    });

    it("writes a rating through and puts the question away", async () => {
        const store = storeWith(brew());
        const {result} = await renderHook(
            () => useRatingPrompt(store, new Settings())
        );
        await act(async () => {
            result.current.rate(4);
        });
        expect(store.judge).toHaveBeenCalledWith("b1", {rating: 4});
        expect(result.current.brew).toBeNull();
    });

    it("remembers a dismissal", async () => {
        const store = storeWith(brew());
        const settings = new Settings();
        const {result} = await renderHook(() => useRatingPrompt(store, settings));
        await act(async () => {
            result.current.dismiss();
        });
        expect(result.current.brew).toBeNull();
        expect(settings.get("ratingPromptDismissed")).toBe("b1");
    });

    it("stays quiet when the user has turned the question off", async () => {
        const settings = new Settings();
        settings.set("askForRatings", false);
        const {result} = await renderHook(
            () => useRatingPrompt(storeWith(brew()), settings)
        );
        expect(result.current.brew).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest hooks/__tests__/useRatingPrompt.test.ts`
Expected: FAIL, "Cannot find module '@/hooks/useRatingPrompt'".

- [ ] **Step 3: Write the hook**

Create `hooks/useRatingPrompt.ts`:

```ts
import {useEffect, useState} from "react";
import {AppState} from "react-native";

import {useSetting} from "@/hooks/useSetting";
import {sharedBrewDatabase} from "@/hooks/useBrewHistory";
import {brewToRate} from "@/library/brew/ratingPrompt";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {Settings} from "@/library/Settings";

/** The two things the prompt needs of the database. Injected by tests. */
export type RatingPromptStore = {
    lastWatchedBrew: () => StoredBrew | null;
    judge: (id: string, judgement: {rating?: number; note?: string}) => void;
};

/**
 * The brew the app would like an opinion on, if there is one.
 *
 * The candidate is read when this mounts and when the app comes back to the
 * foreground, and at no other time. That is the feature rather than a
 * limitation: dismissing the live bar at the end of a brew must not hand the
 * slot straight back to a rating question, which reads as the bar refusing to
 * go away. The question waits for your next visit, which is the whole premise.
 *
 * Nothing here writes a rating itself. `judge` is the app's one write path and
 * pins the brew in the same statement, so a verdict whose trace the next sweep
 * would have taken is safe for free.
 */
export function useRatingPrompt(
    store?: RatingPromptStore,
    settings?: Settings
): {brew: StoredBrew | null; rate: (rating: number) => void; dismiss: () => void} {
    const [enabled] = useSetting("askForRatings", settings);
    const [dismissedId, setDismissedId] = useSetting("ratingPromptDismissed", settings);
    const database = () => store ?? sharedBrewDatabase();
    const [seen, setSeen] = useState<StoredBrew | null>(
        () => database().lastWatchedBrew()
    );

    // A subscription, not a seed. The listener sets state from an event, which
    // is exactly what `react-hooks/set-state-in-effect` leaves room for.
    useEffect(() => {
        const subscription = AppState.addEventListener("change", (next) => {
            if (next === "active") setSeen(database().lastWatchedBrew());
        });
        return () => subscription.remove();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const brew = brewToRate({
        brew: seen, now: Date.now(), dismissedId, enabled
    });

    function rate(rating: number): void {
        if (brew === null) return;
        database().judge(brew.id, {rating});
        // Held locally as well as written, so the bar leaves on the same frame
        // rather than waiting for the next foreground to notice.
        setSeen({...brew, rating});
    }

    function dismiss(): void {
        if (brew === null) return;
        setDismissedId(brew.id);
    }

    return {brew, rate, dismiss};
}

export default useRatingPrompt;
```

If `useSetting` does not accept `undefined` for its injected store, give the parameter a default of `sharedSettings()` imported from `@/hooks/useSetting` and pass it through explicitly.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest hooks/__tests__/useRatingPrompt.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Mutation check**

Delete the `setSeen({...brew, rating})` line and confirm "writes a rating through and puts the question away" fails on the second assertion. Restore.

- [ ] **Step 6: Commit**

```bash
git add hooks/useRatingPrompt.ts hooks/__tests__/useRatingPrompt.test.ts
git commit -m "Hold the question until your next visit

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: The note sheet

**Files:**
- Create: `components/BrewNoteSheet.tsx`
- Test: `components/__tests__/BrewNoteSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/BrewNoteSheet.test.tsx`:

```tsx
import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import BrewNoteSheet from "@/components/BrewNoteSheet";
import {renderWithProviders} from "@/test-utils/render";

describe("BrewNoteSheet", () => {
    it("names the brew by its figures", async () => {
        await renderWithProviders(
            <BrewNoteSheet open={true} onOpenChange={() => {}}
                           figures="14:32 · 244 G" recipeName="Morning Bloem"
                           rating={4} note="" onRate={() => {}} onNote={() => {}}/>
        );
        expect(await screen.findByText("14:32 · 244 G")).toBeTruthy();
        expect(screen.getByText("MORNING BLOEM")).toBeTruthy();
    });

    it("reports a note when the field is committed", async () => {
        const onNote = jest.fn();
        await renderWithProviders(
            <BrewNoteSheet open={true} onOpenChange={() => {}}
                           figures="14:32 · 244 G" recipeName="Morning Bloem"
                           rating={4} note="" onRate={() => {}} onNote={onNote}/>
        );
        const field = await screen.findByTestId("judgement-note");
        await fireEvent(field, "endEditing", {nativeEvent: {text: "Sweet"}});
        expect(onNote).toHaveBeenCalledWith("Sweet");
    });

    it("closes when done is pressed", async () => {
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <BrewNoteSheet open={true} onOpenChange={onOpenChange}
                           figures="14:32 · 244 G" recipeName="Morning Bloem"
                           rating={4} note="" onRate={() => {}} onNote={() => {}}/>
        );
        // The sheet's entrance discards a press aimed at a node that is
        // findable but not yet settled, so the press is retried.
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("brew-note-done"));
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/BrewNoteSheet.test.tsx`
Expected: FAIL, "Cannot find module '@/components/BrewNoteSheet'".

- [ ] **Step 3: Write the sheet**

Create `components/BrewNoteSheet.tsx`:

```tsx
import React from "react";
import {XStack, YStack} from "tamagui";

import BrewJudgement from "@/components/BrewJudgement";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {RATING_PROMPT} from "@/constants/brewCopy";
import {onAccent, palette} from "@/constants/colors";

/**
 * Somewhere to say more, once the stars have already been given.
 *
 * The rating is written before this opens, which is what makes the sheet
 * acceptable: dismissing it loses nothing. It is an offer of room, not a form
 * standing between the user and a saved verdict.
 *
 * Not the brew record screen. Being thrown into a whole screen for a five
 * second gesture is the annoyance this feature exists to avoid, and the record
 * is one tap away on the bar itself.
 *
 * The brew is named by its figures first and its recipe second, for the same
 * reason the bar is: a recipe brewed three times this week does not identify
 * which cup is being asked about.
 */
export default function BrewNoteSheet({
    open, onOpenChange, figures, recipeName, rating, note, onRate, onNote
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** `14:32 · 244 G`, already formatted by the caller. */
    figures: string;
    recipeName: string;
    rating: number;
    note: string;
    onRate: (rating: number) => void;
    onNote: (note: string) => void;
}) {
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title={RATING_PROMPT.sheetTitle} heightPercent={44}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <YStack gap="$1">
                    <DotMatrixText fontSize={16} weight="bold" color={palette.text}>
                        {figures}
                    </DotMatrixText>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={palette.dim}>
                        {recipeName.toUpperCase()}
                    </DotMatrixText>
                </YStack>

                <BrewJudgement rating={rating} note={note}
                               onRate={onRate} onNote={onNote}/>

                <XStack
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                    testID="brew-note-done"
                    onPress={() => onOpenChange(false)}
                    height={48} alignItems="center" justifyContent="center"
                    borderRadius="$4"
                    backgroundColor={palette.text}>
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                   color={onAccent.text}>
                        {RATING_PROMPT.sheetDone}
                    </DotMatrixText>
                </XStack>
            </YStack>
        </XbrwSheet>
    );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/BrewNoteSheet.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/BrewNoteSheet.tsx components/__tests__/BrewNoteSheet.test.tsx
git commit -m "Offer room to say more than a number

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: The bar

**Files:**
- Create: `components/BrewRatingBar.tsx`
- Test: `components/__tests__/BrewRatingBar.test.tsx`

The bar is purely presentational. Every decision arrives as a prop; it opens no database and knows nothing about settings.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/BrewRatingBar.test.tsx`:

```tsx
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BrewRatingBar from "@/components/BrewRatingBar";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

function props(over = {}) {
    return {
        recipeName: "Morning Bloem",
        figures: "14:32 · 244 G",
        pours: [new Pour(), new Pour()],
        samples: [],
        accent: "#ff8800",
        onOpen: jest.fn(),
        onRate: jest.fn(),
        onDismiss: jest.fn(),
        ...over
    };
}

describe("BrewRatingBar", () => {
    it("leads with the figures and follows with the recipe", async () => {
        await renderWithProviders(<BrewRatingBar {...props()} />);
        expect(screen.getByText("14:32 · 244 G")).toBeTruthy();
        expect(screen.getByText(/MORNING BLOEM/)).toBeTruthy();
    });

    it("opens the brew when the bar is pressed", async () => {
        const onOpen = jest.fn();
        await renderWithProviders(<BrewRatingBar {...props({onOpen})} />);
        await fireEvent.press(screen.getByLabelText("Open the last brew"));
        expect(onOpen).toHaveBeenCalled();
    });

    it("reports the star that was pressed", async () => {
        const onRate = jest.fn();
        await renderWithProviders(<BrewRatingBar {...props({onRate})} />);
        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
        expect(onRate).toHaveBeenCalledWith(4);
    });

    it("can be put away", async () => {
        const onDismiss = jest.fn();
        await renderWithProviders(<BrewRatingBar {...props({onDismiss})} />);
        await fireEvent.press(screen.getByLabelText("Not now"));
        expect(onDismiss).toHaveBeenCalled();
    });
});
```

Before writing the implementation, run `grep -n "accessibilityLabel" components/BrewStars.tsx` and use whatever label shape it actually produces for a star in the third test. If it differs from `Rate 4 stars`, change the test to match `BrewStars` rather than changing `BrewStars`.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/BrewRatingBar.test.tsx`
Expected: FAIL, "Cannot find module '@/components/BrewRatingBar'".

- [ ] **Step 3: Write the bar**

Create `components/BrewRatingBar.tsx`:

```tsx
import React from "react";
import {Pressable} from "react-native";
import Animated, {FadeIn, SlideOutDown} from "react-native-reanimated";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {XStack, YStack} from "tamagui";

import BrewStars from "@/components/BrewStars";
import BrewTrace from "@/components/BrewTrace";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {RATING_PROMPT} from "@/constants/brewCopy";
import {palette} from "@/constants/colors";
import {DURATION} from "@/constants/motion";
import type {BrewSample} from "@/library/brew/BrewRecord";
import {plannedSeconds} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

const TRACE_WIDTH = 86;
const TRACE_HEIGHT = 34;
/** The live bar's padding, kept identical so the slot does not resize. */
const BAR_PADDING = 10;

/**
 * The last brew, asking how it was.
 *
 * The same height, padding and 86x34 trace as `BrewMiniBar`, so a slot that
 * changes occupant does not change size. It is a sibling rather than a tenth
 * state of that component: every state there is about a machine that is
 * running, and this one is about a machine that stopped an hour ago.
 *
 * The figures lead and the recipe follows. A recipe name does not identify a
 * brew when the same recipe was made three times this week; `14:32 · 244 G`
 * does.
 *
 * Two tap targets, which `BrewMiniBar` deliberately avoids. They are allowed
 * here because they are not two routes to one place: the left opens the brew,
 * the stars answer the question, and a star is visibly a control rather than a
 * label.
 */
export default function BrewRatingBar({
    recipeName, figures, pours, samples, accent, onOpen, onRate, onDismiss
}: {
    recipeName: string;
    /** `14:32 · 244 G`, already formatted by the caller. */
    figures: string;
    pours: Pour[];
    /** The stored stream, or empty where the retention sweep has taken it. */
    samples: BrewSample[];
    accent: string;
    onOpen: () => void;
    onRate: (rating: number) => void;
    onDismiss: () => void;
}) {
    const insets = useSafeAreaInsets();

    return (
        <Animated.View
            entering={FadeIn.duration(DURATION.base)}
            exiting={SlideOutDown.duration(DURATION.base)}
        >
            <XStack
                testID="rating-bar"
                alignItems="center"
                gap="$3"
                padding={BAR_PADDING}
                paddingBottom={insets.bottom + BAR_PADDING}
                backgroundColor={palette.surface}
                borderTopWidth={1}
                borderTopColor={palette.line}
            >
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={RATING_PROMPT.openLabel}
                    onPress={onOpen}
                    style={{flexDirection: "row", alignItems: "center", flex: 1, gap: 12}}
                >
                    <BrewTrace
                        pours={pours}
                        samples={samples}
                        accent={accent}
                        width={TRACE_WIDTH}
                        height={TRACE_HEIGHT}
                        plannedSeconds={plannedSeconds(pours)}
                        compact
                    />
                    <YStack flex={1} gap="$1">
                        <DotMatrixText fontSize={12} weight="bold" color={palette.text}>
                            {figures}
                        </DotMatrixText>
                        <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.4}
                                       color={palette.dim}>
                            {`${recipeName.toUpperCase()} · ${RATING_PROMPT.question}`}
                        </DotMatrixText>
                    </YStack>
                </Pressable>

                {/* Unrated, so `BrewStars` draws all five as a control. */}
                <BrewStars rating={0} onRate={onRate} clearable={false}
                           testID="rating-bar-stars"/>

                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={RATING_PROMPT.dismissLabel}
                    hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                    onPress={onDismiss}
                >
                    <DotIcon name="close" size={14} color={palette.dim} />
                </Pressable>
            </XStack>
        </Animated.View>
    );
}
```

Check `BrewTrace`'s props before writing: if `holding` is required rather than optional, pass `holding={false}`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest components/__tests__/BrewRatingBar.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/BrewRatingBar.tsx components/__tests__/BrewRatingBar.test.tsx
git commit -m "Ask how the last brew was, along the bottom

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: One slot, two occupants

**Files:**
- Modify: `components/LiveBrewBar.tsx`
- Test: `components/__tests__/LiveBrewBar.test.tsx` (create if absent; check first with `ls components/__tests__ | grep -i livebrew`)

- [ ] **Step 1: Write the failing test**

Create or extend `components/__tests__/LiveBrewBar.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import LiveBrewBar from "@/components/LiveBrewBar";
import {renderWithProviders} from "@/test-utils/render";

const liveBrew = {run: null as unknown, dismiss: jest.fn()};
const prompt = {brew: null as unknown, rate: jest.fn(), dismiss: jest.fn()};
let path = "/";

jest.mock("expo-router", () => ({
    ...jest.requireActual("expo-router"),
    usePathname: () => path
}));
jest.mock("@/hooks/useLiveBrew", () => ({
    useLiveBrew: () => liveBrew,
    __esModule: true,
    default: () => liveBrew
}));
jest.mock("@/hooks/useRatingPrompt", () => ({
    useRatingPrompt: () => prompt,
    __esModule: true,
    default: () => prompt
}));

const BREW = {
    id: "b1", recipeUuid: "r1", recipeName: "Morning Bloem", accent: "#ff8800",
    startedAt: 0, pouringAt: 1_000, endedAt: 873_000, outcome: "done",
    failure: null, pours: 2, waterTotal: 260, cupTotal: 244, heldSeconds: 0,
    rating: 0, note: "", pinned: false, hasStream: false, plan: []
};

describe("LiveBrewBar", () => {
    beforeEach(() => {
        path = "/";
        liveBrew.run = null;
        prompt.brew = null;
    });

    it("draws nothing when there is neither a run nor a question", async () => {
        await renderWithProviders(<LiveBrewBar/>);
        expect(screen.queryByTestId("mini-bar")).toBeNull();
        expect(screen.queryByTestId("rating-bar")).toBeNull();
    });

    it("asks how the last brew was when nothing is running", async () => {
        prompt.brew = BREW;
        await renderWithProviders(<LiveBrewBar/>);
        expect(screen.getByTestId("rating-bar")).toBeTruthy();
    });

    it("says nothing about an old brew on the brew screens", async () => {
        prompt.brew = BREW;
        path = "/brewHistory";
        await renderWithProviders(<LiveBrewBar/>);
        expect(screen.queryByTestId("rating-bar")).toBeNull();
    });
});
```

A fourth case, that a live run beats a pending question, needs a full `LiveBrewSnapshot` with a `Recipe` in it. Build it from the fixtures the existing brew tests use (`grep -rn "LiveBrewSnapshot" --include=*.tsx --include=*.ts app components hooks test-utils`) rather than hand-rolling one; if no fixture exists, assert instead that `BrewMiniBar` wins by checking that `rating-bar` is absent while `mini-bar` is present.

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/LiveBrewBar.test.tsx`
Expected: FAIL, no `rating-bar` is ever rendered.

- [ ] **Step 3: Extract the figure line first**

Both the bar and, later, the record screen need `14:32 · 244 G`. Create
`library/brew/brewFigures.ts`:

```ts
/** `14:32`, floored, to match the clock the brew screen draws. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * How long it took and what landed in the cup, as one line.
 *
 * The figures a recipe cannot claim. A recipe name does not identify a brew
 * when the same recipe was made three times this week, so anywhere the app has
 * to say which cup it means, it says this and puts the name second.
 *
 * Timed from the first drop where one was recorded, falling back to the start
 * for a row written before `pouringAt` existed. That fallback is a display
 * convenience and nothing aggregates on it, which is why `TIMED_SQL` refuses
 * the same rows this function still draws.
 */
export function brewFigures(brew: {
    startedAt: number;
    pouringAt?: number | null;
    endedAt: number;
    cupTotal: number;
}): string {
    const from = brew.pouringAt !== undefined && brew.pouringAt !== null
        && brew.pouringAt > 0
        ? brew.pouringAt
        : brew.startedAt;
    return `${clock((brew.endedAt - from) / 1000)} · ${Math.round(brew.cupTotal)} G`;
}
```

with `library/brew/__tests__/brewFigures.test.ts`:

```ts
import {brewFigures} from "@/library/brew/brewFigures";

describe("brewFigures", () => {
    it("times from the first drop and weighs the cup", () => {
        expect(brewFigures({
            startedAt: 0, pouringAt: 1_000, endedAt: 873_000, cupTotal: 243.6
        })).toBe("14:32 · 244 G");
    });

    it("falls back to the start where no first drop was recorded", () => {
        expect(brewFigures({
            startedAt: 0, pouringAt: 0, endedAt: 60_000, cupTotal: 200
        })).toBe("1:00 · 200 G");
    });
});
```

Run: `npx jest library/brew/__tests__/brewFigures.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 4: Add a note write to the hook**

`useRatingPrompt` returns `rate` and `dismiss` but nothing for the note. Add
alongside `rate` in `hooks/useRatingPrompt.ts`:

```ts
    function annotate(note: string): void {
        if (brew === null) return;
        database().judge(brew.id, {note});
        setSeen({...brew, note});
    }
```

Return it with the other two, add it to the hook's declared return type, and add
the matching test to `hooks/__tests__/useRatingPrompt.test.ts`:

```ts
    it("writes a note through", async () => {
        const store = storeWith(brew());
        const {result} = await renderHook(
            () => useRatingPrompt(store, new Settings())
        );
        await act(async () => {
            result.current.annotate("Sweet, a little thin.");
        });
        expect(store.judge).toHaveBeenCalledWith("b1", {note: "Sweet, a little thin."});
    });
```

- [ ] **Step 5: Make the bar an arbiter**

Rewrite `components/LiveBrewBar.tsx`:

```tsx
import React, {useState} from "react";
import {usePathname} from "expo-router";

import BrewMiniBar from "@/components/BrewMiniBar";
import BrewNoteSheet from "@/components/BrewNoteSheet";
import BrewRatingBar from "@/components/BrewRatingBar";
import {useSteadyRouter} from "@/hooks/steadyRouter";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useRatingPrompt} from "@/hooks/useRatingPrompt";
import {resolveAccent} from "@/library/accent";
import {poursFromPlan} from "@/library/brew/BrewRecord";
import {brewFigures} from "@/library/brew/brewFigures";
import type {StoredBrew} from "@/library/BrewDatabase";

/**
 * Whatever the bottom of the app has to say, wherever you are.
 *
 * Mounted beside the navigator rather than inside a screen: a brew you walked
 * away from is still there when you are in Settings or the editor, and the
 * question about the brew you have just drunk has exactly the same shape.
 *
 * One slot, and a live run always wins it. A brew that is happening is time
 * critical and a question about an old one is not, so the question waits until
 * the new brew is over.
 */
/**
 * Where the bar has nothing to add.
 *
 * `brew` is the same brew at full size. The other two are the record it
 * becomes: the modal covers them, and the rating question would be asking
 * about the very brew the screen is already showing.
 */
const SILENT = new Set(["/brew", "/brewRecord", "/brewHistory"]);

export default function LiveBrewBar() {
    const {run, dismiss} = useLiveBrew();
    const prompt = useRatingPrompt();
    const router = useSteadyRouter();
    const pathname = usePathname();
    // The brew the note sheet is about, held here rather than read from the
    // prompt. Rating is what opens the sheet, and a rated brew is no longer a
    // brew the prompt offers -- so a sheet drawn from `prompt.brew` would be
    // unmounted by the very gesture that opened it.
    const [noting, setNoting] = useState<StoredBrew | null>(null);

    if (SILENT.has(pathname)) return null;

    if (run !== null) {
        return (
            <BrewMiniBar
                recipeName={run.recipe.displayName()}
                dose={run.recipe.dosage}
                pours={run.recipe.pours}
                samples={run.samples}
                accent={resolveAccent(run.recipe)}
                phase={run.phase}
                elapsed={run.elapsed}
                holding={run.holding}
                heldSeconds={run.heldSeconds}
                // `view=1`, not the recipe: this opens the run that is already
                // going rather than asking for a new one.
                onOpen={() => router.push("/brew?view=1")}
                onDismiss={dismiss}
            />
        );
    }

    const asking = prompt.brew;
    if (asking === null && noting === null) return null;

    return (
        <>
            {asking !== null && (
                <BrewRatingBar
                    recipeName={asking.recipeName}
                    figures={brewFigures(asking)}
                    pours={poursFromPlan(asking.plan)}
                    samples={[]}
                    accent={asking.accent}
                    onOpen={() => router.push({
                        pathname: "/brewRecord", params: {id: asking.id}
                    })}
                    onRate={(rating) => {
                        // Written first, so dismissing the sheet loses nothing.
                        prompt.rate(rating);
                        setNoting({...asking, rating});
                    }}
                    onDismiss={prompt.dismiss}
                />
            )}
            {noting !== null && (
                <BrewNoteSheet
                    open={true}
                    onOpenChange={() => setNoting(null)}
                    figures={brewFigures(noting)}
                    recipeName={noting.recipeName}
                    rating={noting.rating ?? 0}
                    note={noting.note ?? ""}
                    onRate={(rating) => {
                        prompt.rate(rating);
                        setNoting((was) => was === null ? was : {...was, rating});
                    }}
                    onNote={prompt.annotate}
                />
            )}
        </>
    );
}
```

Two things to settle by reading the code rather than guessing:

1. The push to the record. Copy the exact call shape `app/brewHistory.tsx` uses
   (`grep -n "brewRecord" app/brewHistory.tsx`). Typed routes are on, so the
   param name must match or the typecheck fails.
2. `poursFromPlan` takes `PlanStage[] | undefined` and returns `Pour[]`, so a
   record whose plan the column never held draws an empty trace rather than
   throwing. Confirm the signature before relying on it.

- [ ] **Step 6: Add the test for the sheet surviving its own rating**

Append to `components/__tests__/LiveBrewBar.test.tsx`:

```tsx
    it("keeps the note sheet up after the rating that opened it", async () => {
        prompt.brew = BREW;
        await renderWithProviders(<LiveBrewBar/>);
        await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
        expect(await screen.findByTestId("brew-note-done")).toBeTruthy();
    });
```

Import `fireEvent` at the top of the file.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx jest components/__tests__/LiveBrewBar.test.tsx hooks/__tests__/useRatingPrompt.test.ts library/brew/__tests__/brewFigures.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/LiveBrewBar.tsx components/__tests__/LiveBrewBar.test.tsx hooks/useRatingPrompt.ts hooks/__tests__/useRatingPrompt.test.ts library/brew/brewFigures.ts library/brew/__tests__/brewFigures.test.ts
git commit -m "Give the bottom slot a second reason to exist

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: The line that says a rating can wait

**Files:**
- Modify: `components/BrewJudgement.tsx`
- Modify: `app/brew.tsx` (the `BrewJudgement` at around line 457)
- Test: `components/__tests__/BrewJudgement.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

Add to (or create) `components/__tests__/BrewJudgement.test.tsx`:

```tsx
import React from "react";
import {screen} from "@testing-library/react-native";

import BrewJudgement from "@/components/BrewJudgement";
import {RATING_CAN_WAIT} from "@/constants/brewCopy";
import {renderWithProviders} from "@/test-utils/render";

describe("BrewJudgement", () => {
    it("says nothing about waiting unless asked to", async () => {
        await renderWithProviders(
            <BrewJudgement rating={0} note="" onRate={() => {}} onNote={() => {}}/>
        );
        expect(screen.queryByText(RATING_CAN_WAIT)).toBeNull();
    });

    it("draws the hint it is given", async () => {
        await renderWithProviders(
            <BrewJudgement rating={0} note="" onRate={() => {}} onNote={() => {}}
                           hint={RATING_CAN_WAIT}/>
        );
        expect(screen.getByText(RATING_CAN_WAIT)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest components/__tests__/BrewJudgement.test.tsx`
Expected: FAIL on the second test, the hint is not rendered.

- [ ] **Step 3: Add the optional hint**

In `components/BrewJudgement.tsx`, add `hint?: string;` to the props type and render it under the stars row, above the field:

```tsx
            {hint !== undefined && (
                <Text fontSize={12} color={palette.dim}>{hint}</Text>
            )}
```

Import `Text` from `tamagui`. Extend the component's doc comment with a sentence explaining why the hint is passed in rather than built in: it is true on the finished brew screen, where walking away is a real choice, and untrue on the record screen, where the user has deliberately come back to give it.

- [ ] **Step 4: Pass it on the finished brew screen**

In `app/brew.tsx`, change the `BrewJudgement` render to:

```tsx
                        <BrewJudgement rating={judgement.rating} note={judgement.note}
                                       onRate={judgement.rate}
                                       onNote={judgement.annotate}
                                       hint={RATING_CAN_WAIT}/>
```

and add `RATING_CAN_WAIT` to the existing `@/constants/brewCopy` import.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx jest components/__tests__/BrewJudgement.test.tsx app/__tests__/brew.test.tsx`
Expected: PASS. If `app/__tests__/brew.test.tsx` does not exist, run `npx jest app/__tests__ -t brew` and check nothing regressed.

- [ ] **Step 6: Commit**

```bash
git add components/BrewJudgement.tsx app/brew.tsx components/__tests__/BrewJudgement.test.tsx
git commit -m "Tell the user at the machine that the rating can wait

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Remembering that a brew was sent

**Files:**
- Modify: `library/BrewDatabase.ts` (schema, migration, `BrewRow`, `writeBrewRow`, `hydrate`, new `markSent`)
- Modify: `library/brew/BrewRecord.ts` (`BrewRecord` type gains optional `sentAt`)
- Test: `library/__tests__/BrewDatabaseSentAt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/BrewDatabaseSentAt.test.ts`:

```ts
import {createTestDatabase} from "@/test-utils/sqlite";
import BrewDatabase from "@/library/BrewDatabase";
import type {BrewRecord} from "@/library/brew/BrewRecord";

function record(over: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "b1", recipeUuid: "r1", recipeName: "Morning Bloem", accent: "#ff8800",
        startedAt: 1_000, pouringAt: 1_100, endedAt: 2_000, outcome: "done",
        failure: null, pours: 3, waterTotal: 260, cupTotal: 244, heldSeconds: 0,
        ...over
    } as BrewRecord;
}

describe("sentAt", () => {
    it("is absent on a brew nobody has handed over", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.insert(record(), []);
        expect(database.get("b1")?.sentAt).toBeUndefined();
    });

    it("is remembered once a brew has been handed over", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.insert(record(), []);
        database.markSent("b1", 5_000);
        expect(database.get("b1")?.sentAt).toBe(5_000);
    });

    it("moves to the most recent send", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.insert(record(), []);
        database.markSent("b1", 5_000);
        database.markSent("b1", 9_000);
        expect(database.get("b1")?.sentAt).toBe(9_000);
    });

    it("survives a restore, so a second phone knows too", () => {
        const database = new BrewDatabase(createTestDatabase());
        database.restore([record({sentAt: 5_000})]);
        expect(database.get("b1")?.sentAt).toBe(5_000);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest library/__tests__/BrewDatabaseSentAt.test.ts`
Expected: FAIL, "database.markSent is not a function".

- [ ] **Step 3: Add the column**

In `library/BrewDatabase.ts`:

1. In the `CREATE TABLE IF NOT EXISTS brews` block, add before `hasStream INTEGER NOT NULL`:

```
                sentAt INTEGER NOT NULL DEFAULT 0,
```

2. Beside the other `ALTER TABLE` migrations, add one more in the same try/catch shape (Expo's SQLite has no portable `ADD COLUMN IF NOT EXISTS`, which is why the failure is caught rather than avoided):

```ts
    // 0 on every row written before the app could tell you it had handed a
    // brew over, which reads as "not sent" -- the same thing those rows would
    // have said if asked.
    try {
        db.execSync("ALTER TABLE brews ADD COLUMN sentAt INTEGER NOT NULL DEFAULT 0;");
    } catch {
        // Already there.
    }
```

3. In `BrewRow`, add:

```ts
    /** 0 on a brew never handed over, and on rows written before the column. */
    sentAt: number | null;
```

4. In `writeBrewRow`, add `sentAt` to the column list (before `hasStream`), a `?` to the `VALUES` list, and to the parameters, before `hasStream ? 1 : 0`:

```ts
                record.sentAt ?? 0,
```

Count the placeholders after editing. The `VALUES` list must have exactly as many `?` as there are columns named.

5. In `hydrate`, before `hasStream`:

```ts
        ...(row.sentAt !== null && row.sentAt > 0 ? {sentAt: row.sentAt} : {}),
```

Emitted only when set, matching how `watched` and the grinder fields already behave, so a brew that was never sent round-trips byte for byte as it did before the column existed.

6. A new public method, beside `setPinned`:

```ts
    /**
     * Record that this brew was handed to another app, and when.
     *
     * A timestamp rather than a count: what the copy needs to say is that this
     * has been over there before, and the last time is the more useful of the
     * two facts. It means "we opened the link", never "they received it":
     * opening a deep link proves nothing about whether the other app was
     * installed, understood the envelope, or was cancelled out of. Every piece
     * of copy built on this is phrased as what this app did.
     */
    public markSent(id: string, at: number): void {
        this.db.runSync("UPDATE brews SET sentAt = ? WHERE id = ?;", [at, id]);
    }
```

7. In `library/brew/BrewRecord.ts`, add to the `BrewRecord` type, beside `pinned`:

```ts
    /** When this brew was last handed to another app. Absent until it was. */
    sentAt?: number;
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx jest library/__tests__/BrewDatabaseSentAt.test.ts && npm run typecheck`
Expected: PASS, 4 tests, typecheck clean.

- [ ] **Step 5: Check nothing else broke**

Run: `npx jest library/__tests__ library/brew/__tests__`
Expected: PASS. The round-trip and backup tests are the ones at risk from a new column.

- [ ] **Step 6: Commit**

```bash
git add library/BrewDatabase.ts library/brew/BrewRecord.ts library/__tests__/BrewDatabaseSentAt.test.ts
git commit -m "Remember that a brew was handed over

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Writing the send down

**Files:**
- Modify: `hooks/useBrewHandoff.ts`
- Modify: `hooks/useBrewBatchHandoff.ts`
- Test: `hooks/__tests__/useBrewHandoff.test.ts` (extend; create if absent)

- [ ] **Step 1: Write the failing test**

Add to `hooks/__tests__/useBrewHandoff.test.ts`. Read the existing file first and follow whatever it already does to fake `Linking.openURL` and the export source. The new case:

```ts
    it("records that the brew went over", async () => {
        const markSent = jest.fn();
        // ... existing arrangement that makes `send()` reach Linking.openURL,
        // with `markSent` injected in place of the shared database's method.
        await act(async () => {
            await result.current.send();
        });
        expect(markSent).toHaveBeenCalledWith("b1", expect.any(Number));
    });
```

If the hook currently reaches `sharedBrewDatabase()` only indirectly, add an optional last parameter for the store in the same shape `useBrewHistory` uses:

```ts
export type HandoffStore = {markSent: (id: string, at: number) => void};
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx jest hooks/__tests__/useBrewHandoff.test.ts`
Expected: FAIL, `markSent` never called.

- [ ] **Step 3: Record the send**

In `hooks/useBrewHandoff.ts`, inside the successful branch of the `Linking.openURL` try, after the `await`:

```ts
                // Recorded after the link opened, not before: a failure to open
                // is the one case where nothing can have been received, and a
                // brew marked sent that never left would make the warning on
                // the record screen a lie.
                (store ?? sharedBrewDatabase()).markSent(opened.record.id, Date.now());
```

Import `sharedBrewDatabase` from `@/hooks/useBrewHistory`.

In `hooks/useBrewBatchHandoff.ts`, do the same for every brew in the selection after its single link opens. Read the file to see whether it opens one link for the whole batch (in which case mark all the ids in the batch) or one per brew.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest hooks/__tests__/useBrewHandoff.test.ts hooks/__tests__/useBrewBatchHandoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/useBrewHandoff.ts hooks/useBrewBatchHandoff.ts hooks/__tests__
git commit -m "Write down when a brew went to Beanconqueror

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: The door tells the truth, and asks first

**Files:**
- Modify: `app/brewRecord.tsx`
- Test: `app/__tests__/brewRecord.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Add to `app/__tests__/brewRecord.test.tsx`, following the file's existing arrangement helpers and its `pressOnSheet` retry helper:

```tsx
    it("says nothing about a previous send on a brew that never went", async () => {
        // arrange a record with no sentAt, handoff enabled
        expect(screen.queryByText(/Sending again/)).toBeNull();
    });

    it("warns that a second send is a second brew", async () => {
        // arrange a record with sentAt set
        expect(await screen.findByText(/Sending again/)).toBeTruthy();
    });

    it("offers the stars before sending an unrated brew", async () => {
        // arrange an unrated, watched, done record with handoff enabled and a
        // coffee already known, so the bean sheet does not interpose
        await pressOnSheet(() => screen.getByLabelText(/Beanconqueror/));
        expect(await screen.findByTestId("brew-note-done")).toBeTruthy();
    });

    it("sends anyway when the stars are skipped", async () => {
        // same arrangement, then press the skip control
        await pressOnSheet(() => screen.getByTestId("send-without-rating"));
        expect(openURL).toHaveBeenCalled();
    });
```

Fill the arrangement comments in from the patterns already in the file. Do not invent a new fixture shape; use `makeBrewRecordFixture` from `test-utils/brewRecordMocks.ts` at the call site, and **do not add fields to the shared fixture defaults**, which has broken unrelated test files here before.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx jest app/__tests__/brewRecord.test.tsx`
Expected: the four new tests FAIL.

- [ ] **Step 3: Add the line and the sheet**

In `app/brewRecord.tsx`:

1. Under the handoff `ExportButton`, inside the same `XStack`'s parent `YStack`:

```tsx
                            {record.sentAt !== undefined && record.sentAt > 0 && (
                                <Text fontSize={12} color={palette.dim}>
                                    {HANDOFF_ALREADY_SENT(
                                        new Date(record.sentAt).toLocaleDateString()
                                    )}
                                </Text>
                            )}
```

2. Change the handoff button's `onPress` so an unrated brew is asked about first:

```tsx
                                          onPress={() => {
                                              // Asked before the link, not after:
                                              // an envelope carries no brew id,
                                              // so a rating given later cannot
                                              // reach the row over there. This
                                              // is the fix; the warning above is
                                              // only the apology.
                                              if ((record.rating ?? 0) === 0) {
                                                  setRatingBeforeSend(true);
                                                  return;
                                              }
                                              if (handoffCoffee(record, recipe) === undefined) {
                                                  setNamingBean(true);
                                                  return;
                                              }
                                              void sendHandoff();
                                          }}
```

3. Add the state and the sheet, reusing `BrewNoteSheet` with one extra control. Rather than growing that component a second purpose, wrap it: render `BrewNoteSheet` and, when `ratingBeforeSend` is true, give it a `footer` prop holding the send control. Add the optional prop to `components/BrewNoteSheet.tsx`:

```tsx
    /** An extra control under DONE. Used by the pre-send ask. */
    footer?: React.ReactNode;
```

rendered after the DONE control, and document that the sheet itself never sends: it collects, and the caller decides what happens next.

In `app/brewRecord.tsx`:

```tsx
    const [ratingBeforeSend, setRatingBeforeSend] = useState(false);

    function continueSend() {
        setRatingBeforeSend(false);
        if (handoffCoffee(record, recipe) === undefined) {
            setNamingBean(true);
            return;
        }
        void sendHandoff();
    }
```

and, beside the other sheets at the bottom of the screen:

```tsx
            <BrewNoteSheet
                open={ratingBeforeSend}
                onOpenChange={(open) => {
                    // Closing by any route continues to the send. The sheet is
                    // an opportunity to do better, never a gate: the user asked
                    // to send, and the send is what must happen.
                    if (!open) continueSend();
                }}
                figures={figures}
                recipeName={record.recipeName}
                rating={judgement.rating}
                note={judgement.note}
                onRate={judgement.rate}
                onNote={judgement.annotate}
                footer={
                    <XStack accessibilityRole="button"
                            accessibilityLabel="Send without rating it"
                            testID="send-without-rating"
                            onPress={continueSend}
                            height={44} alignItems="center" justifyContent="center">
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                       color={palette.dim}>
                            SEND WITHOUT RATING
                        </DotMatrixText>
                    </XStack>
                }/>
```

`figures` is `brewFigures(record)` from `library/brew/brewFigures.ts`, built in
Task 8 and already used by the bar. Import it here rather than formatting the
line a second time.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx jest app/__tests__/brewRecord.test.tsx components/__tests__/BrewNoteSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/brewRecord.tsx components/BrewNoteSheet.tsx app/__tests__/brewRecord.test.tsx
git commit -m "Ask for the stars on the way to Beanconqueror, and admit a second send

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 13: The whole gate

**Files:** none

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 errors. 17 warnings is the correct number on this tree (16 `no-require-imports` plus one unused `Pour`); any new warning is yours and should be fixed rather than accepted.

- [ ] **Step 3: The full suite**

Run: `npx jest --runInBand`
Expected: PASS, every suite. Takes two to three minutes.

- [ ] **Step 4: Dependency health**

Run: `npx expo-doctor`
Expected: 21/21. This is a hard failure in CI.

- [ ] **Step 5: Update the spec's status line**

Change the second line of `docs/superpowers/specs/2026-09-28-brew-rating-moment-design.md` from `Status: designed, not yet built.` to `Status: built.` and add a short paragraph at the end noting anything that was built differently from the design, with the reason.

- [ ] **Step 6: Commit and open the pull request**

```bash
git add docs/superpowers/specs/2026-09-28-brew-rating-moment-design.md
git commit -m "Describe the rating moment that was built

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin brew-rating-moment
```

Then open the PR with `gh pr create -R hessius/XBRecipeWriterPlus --body-file <file>`. Always pass `-R`, because `gh` resolves this checkout to the upstream fork. Write the body to a file rather than a heredoc: apostrophes break the inline form.

---

## What still needs a real device

Nothing here touches NFC, so no card is needed. Two things want a look on hardware:

- The bar sits on the home indicator and shares its slot with the live bar. Check that the two are the same height and that the slot does not jump when one replaces the other.
- The note sheet is opened from a bar mounted above the navigator. Check that it appears over everything, that the keyboard lifts the field, and that dismissing it by dragging leaves the rating saved.
