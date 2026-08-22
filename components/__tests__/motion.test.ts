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
    beforeEach(() => {
        jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({
            remove: jest.fn()
        } as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("reports false when the OS has motion enabled", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

        const {result} = await renderHook(() => useReducedMotion());

        await waitFor(() => expect(result.current).toBe(false));
    });

    it("reports true when the OS has motion reduced", async () => {
        jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

        const {result} = await renderHook(() => useReducedMotion());

        await waitFor(() => expect(result.current).toBe(true));
    });
});
