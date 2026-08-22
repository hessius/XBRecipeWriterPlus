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
    // AccessibilityInfo.addEventListener is deliberately NOT mocked. The real one
    // returns a real subscription, so the effect's cleanup runs for real at
    // unmount — breaking `subscription.remove()` fails both tests below. A stub
    // subscription would throw that coverage away.
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("reports false when the OS has motion enabled", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

        // renderHook is async in Testing Library v14, like render and fireEvent.
        // Without the await, destructuring yields undefined rather than failing
        // loudly.
        const {result} = await renderHook(() => useReducedMotion());

        await waitFor(() => expect(result.current).toBe(false));
    });

    it("reports true when the OS has motion reduced", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

        const {result} = await renderHook(() => useReducedMotion());

        await waitFor(() => expect(result.current).toBe(true));
    });
});
