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
