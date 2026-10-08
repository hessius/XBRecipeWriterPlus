import {act, renderHook} from "@testing-library/react-native";
import {AppState} from "react-native";

import {STAGGER, useReducedMotionState} from "@/constants/motion";
import {useDrawerHint} from "@/hooks/useDrawerHint";
import {DRAWER_ACTION_SIGNATURE} from "@/library/drawerHint";
import {Settings, type SettingKey, type SettingValue, type SettingsStorage} from "@/library/Settings";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

jest.mock("@/constants/motion", () => ({
    ...jest.requireActual("@/constants/motion"),
    useReducedMotionState: jest.fn(() => ({reduced: false, resolved: true}))
}));

const mockReducedMotion = jest.mocked(useReducedMotionState);
const NOW = 1_000_000_000;

function sqliteSettings(
    seed: Partial<Record<SettingKey, SettingValue<SettingKey>>> = {}
): {settings: Settings; db: FakeSQLiteDatabase} {
    const db = createTestDatabase();
    db.execSync(`
        CREATE TABLE settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT
        );
    `);
    const storage: SettingsStorage = {
        read: (key) => {
            const row = db.getFirstSync(
                `SELECT value FROM settings WHERE key = ?;`, [key]
            ) as {value: string | null} | null;
            return row?.value ?? null;
        },
        write: (key, value) => {
            db.runSync(
                `INSERT INTO settings (key, value) VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
                [key, value]
            );
        }
    };
    const settings = new Settings(storage);
    for (const [key, value] of Object.entries(seed) as
        [SettingKey, SettingValue<SettingKey>][]) {
        settings.set(key, value);
    }
    return {settings, db};
}

async function renderDrawerHint(settings: Settings) {
    return renderHook(() => useDrawerHint(settings));
}

function captureAppStateHandler() {
    let handler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
        handler = listener as unknown as (state: string) => void;
        return {remove: jest.fn()} as never;
    });
    return () => handler;
}

describe("useDrawerHint", () => {
    beforeEach(() => {
        jest.useFakeTimers({now: NOW});
        mockReducedMotion.mockReturnValue({reduced: false, resolved: true});
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it("assigns the action tray to the first row and the management tray to the second", async () => {
        const {settings} = sqliteSettings();
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBe("action");
        expect(result.current.trayFor(1)).toBe("management");
        expect(result.current.trayFor(2)).toBeNull();

        await act(async () => { unmount(); });
    });

    it("staggers the second row but not the first", async () => {
        const {settings} = sqliteSettings();
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.delayFor(0)).toBe(0);
        expect(result.current.delayFor(1)).toBe(STAGGER.drawerHint);
        expect(result.current.delayFor(2)).toBe(0);

        await act(async () => { unmount(); });
    });

    it("stops showing and persists the manual-open count when the user opens a tray", async () => {
        const {settings} = sqliteSettings();
        const {result, unmount} = await renderDrawerHint(settings);

        await act(async () => {
            result.current.noteManualOpen();
        });

        expect(result.current.trayFor(0)).toBeNull();
        expect(settings.get("drawerHintManualOpens")).toBe(1);

        await act(async () => { unmount(); });
    });

    it("does not run again after it has already run today", async () => {
        const {settings} = sqliteSettings({
            drawerHintLastShownAt: NOW - 60 * 60 * 1000,
            drawerHintShownCount:  1,
            drawerHintManualOpens: 0,
            drawerHintSignature:   DRAWER_ACTION_SIGNATURE,
            drawerHintLastSeenAt:  NOW - 60 * 60 * 1000
        });
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBeNull();
        expect(settings.get("drawerHintShownCount")).toBe(1);

        await act(async () => { unmount(); });
    });

    it("retires after three manual opens", async () => {
        const {settings} = sqliteSettings({
            drawerHintLastShownAt: 0,
            drawerHintShownCount:  0,
            drawerHintManualOpens: 3,
            drawerHintSignature:   DRAWER_ACTION_SIGNATURE,
            drawerHintLastSeenAt:  NOW - 60 * 60 * 1000
        });
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBeNull();

        await act(async () => { unmount(); });
    });

    it("retires after six appearances", async () => {
        const {settings} = sqliteSettings({
            drawerHintLastShownAt: 0,
            drawerHintShownCount:  6,
            drawerHintManualOpens: 0,
            drawerHintSignature:   DRAWER_ACTION_SIGNATURE,
            drawerHintLastSeenAt:  NOW - 60 * 60 * 1000
        });
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBeNull();

        await act(async () => { unmount(); });
    });

    it("suppresses the animated lesson when reduced motion is enabled", async () => {
        mockReducedMotion.mockReturnValue({reduced: true, resolved: true});
        const {settings} = sqliteSettings();
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBeNull();
        expect(result.current.trayFor(1)).toBeNull();
        expect(settings.get("drawerHintShownCount")).toBe(0);

        await act(async () => { unmount(); });
    });

    it("suppresses a latched lesson when reduced motion arrives after the first render", async () => {
        mockReducedMotion
            .mockReturnValueOnce({reduced: false, resolved: true})
            .mockReturnValue({reduced: true, resolved: true});
        const {settings} = sqliteSettings();
        const {result, rerender, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBe("action");

        await act(async () => { rerender({}); });

        expect(result.current.trayFor(0)).toBeNull();
        expect(result.current.trayFor(1)).toBeNull();
        expect(settings.get("drawerHintShownCount")).toBe(0);

        await act(async () => { unmount(); });
    });

    it("waits to deliver a latched lesson until reduced motion is known", async () => {
        mockReducedMotion
            .mockReturnValueOnce({reduced: false, resolved: false})
            .mockReturnValue({reduced: false, resolved: true});
        const {settings} = sqliteSettings();
        const {result, rerender, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBeNull();
        expect(settings.get("drawerHintShownCount")).toBe(0);

        await act(async () => { rerender({}); });

        expect(result.current.trayFor(0)).toBe("action");
        expect(settings.get("drawerHintShownCount")).toBe(0);

        await act(async () => { unmount(); });
    });

    it("records one appearance for the two-row lesson", async () => {
        const {settings} = sqliteSettings();
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBe("action");
        expect(result.current.trayFor(1)).toBe("management");
        await act(async () => {
            result.current.noteShown();
            result.current.noteShown();
        });

        expect(settings.get("drawerHintShownCount")).toBe(1);

        await act(async () => { unmount(); });
    });

    it("updates lastSeenAt even when this launch does not show the hint", async () => {
        const {settings} = sqliteSettings({
            drawerHintLastShownAt: NOW - 60 * 60 * 1000,
            drawerHintShownCount:  1,
            drawerHintManualOpens: 0,
            drawerHintSignature:   DRAWER_ACTION_SIGNATURE,
            drawerHintLastSeenAt:  NOW - 60 * 60 * 1000
        });
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBeNull();
        expect(settings.get("drawerHintLastSeenAt")).toBe(NOW);

        await act(async () => { unmount(); });
    });

    it("refreshes lastSeenAt on foreground without re-opening the lesson", async () => {
        const handlerOf = captureAppStateHandler();
        const {settings} = sqliteSettings();
        const {result, unmount} = await renderDrawerHint(settings);

        expect(result.current.trayFor(0)).toBe("action");

        await act(async () => {
            result.current.noteManualOpen();
        });
        expect(result.current.trayFor(0)).toBeNull();

        const foregroundedAt = NOW + 5000;
        jest.setSystemTime(foregroundedAt);
        await act(async () => {
            handlerOf()?.("active");
        });

        expect(settings.get("drawerHintLastSeenAt")).toBe(foregroundedAt);
        expect(result.current.trayFor(0)).toBeNull();
        expect(result.current.trayFor(1)).toBeNull();

        await act(async () => { unmount(); });
    });

    it("silences a bounced row without cancelling its sibling", async () => {
        const {settings} = sqliteSettings();
        const {result, unmount} = await renderDrawerHint(settings);

        await act(async () => {
            result.current.noteBounced(0);
        });

        expect(result.current.trayFor(0)).toBeNull();
        expect(result.current.trayFor(1)).toBe("management");

        await act(async () => { unmount(); });
    });
});
