import {AccessibilityInfo} from "react-native";
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {DURATION, useReducedMotion} from "@/constants/motion";

describe("DURATION", () => {
    it("keeps every duration inside the band a user reads as movement", () => {
        // Below about 80ms a transition reads as a jump rather than a movement,
        // and above about 500ms it reads as lag. This is the assertion that
        // bites: an ordering check alone still passes if `fast` is retuned to
        // 1ms, which would silently disable every feedback animation in the app.
        for (const ms of Object.values(DURATION)) {
            expect(ms).toBeGreaterThanOrEqual(80);
            expect(ms).toBeLessThanOrEqual(500);
        }

        expect(DURATION.fast).toBeLessThan(DURATION.base);
        expect(DURATION.base).toBeLessThan(DURATION.deliberate);
    });
});

describe("useReducedMotion", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    // These two leave AccessibilityInfo.addEventListener alone, so the real
    // subscription is created and the effect's cleanup runs for real at unmount.
    // Breaking `subscription.remove()` fails them both; a stubbed subscription
    // would throw that coverage away.
    it("reads the OS setting on mount", async () => {
        const read = jest
            .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
            .mockResolvedValue(false);

        // renderHook is async in Testing Library v14, like render and fireEvent.
        // Without the await, destructuring yields undefined rather than failing
        // loudly.
        const {result} = await renderHook(() => useReducedMotion());

        await waitFor(() => expect(read).toHaveBeenCalled());
        // Asserting the call matters: false is also the initial state, so
        // checking the value alone would pass against a hook that read nothing.
        expect(result.current).toBe(false);
    });

    it("reports true when the OS has motion reduced", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

        const {result} = await renderHook(() => useReducedMotion());

        await waitFor(() => expect(result.current).toBe(true));
    });

    // The rest capture the change handler, which does require stubbing
    // addEventListener.
    function captureHandler() {
        let handler: ((enabled: boolean) => void) | undefined;
        jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
            (_event, listener) => {
                handler = listener as (enabled: boolean) => void;
                return {remove: jest.fn()} as never;
            }
        );
        return () => handler;
    }

    it("follows the setting being toggled while the app is open", async () => {
        const handlerOf = captureHandler();
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

        const {result} = await renderHook(() => useReducedMotion());
        await waitFor(() => expect(result.current).toBe(false));

        await act(async () => handlerOf()?.(true));

        expect(result.current).toBe(true);
    });

    it("does not let the initial read overwrite a newer change event", async () => {
        // The read crosses to native, so a user can flip the switch while it is
        // in flight. If the stale promise wins, the hook reports the value the
        // setting had before the user changed it, and keeps reporting it until
        // the next toggle.
        const handlerOf = captureHandler();
        let settle: (enabled: boolean) => void = () => {};
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(
            new Promise((resolve) => {
                settle = resolve;
            })
        );

        const {result} = await renderHook(() => useReducedMotion());

        await act(async () => handlerOf()?.(true));
        await act(async () => {
            settle(false);
        });

        expect(result.current).toBe(true);
    });

    it("starts a later mount from the last known value", async () => {
        // The whole point of the module-level cache. A component that animates
        // on mount must not start its full animation and then snap into the
        // cross-fade once the async read lands; only the very first hook in the
        // app's lifetime is allowed to be wrong.
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
        const first = await renderHook(() => useReducedMotion());
        await waitFor(() => expect(first.result.current).toBe(true));
        first.unmount();

        // Never resolves, so the cache is the only thing that can supply a value.
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(
            new Promise(() => {})
        );
        const second = await renderHook(() => useReducedMotion());

        expect(second.result.current).toBe(true);
    });
});
