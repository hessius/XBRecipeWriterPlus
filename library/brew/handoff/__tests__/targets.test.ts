import {
    canHandOff,
    HANDOFF_TARGETS,
    type HandoffTarget
} from "@/library/brew/handoff/targets";

describe("handoff targets", () => {
    it("allows only completed brews to be handed over", () => {
        expect(canHandOff("done")).toBe(true);
        expect(canHandOff("endedOnMachine")).toBe(false);
        expect(canHandOff("cancelled")).toBe(false);
        expect(canHandOff("lostContact")).toBe(false);
        expect(canHandOff("failed")).toBe(false);
    });

    it("keeps user-facing target copy dash-free", () => {
        const copy: (keyof Pick<
            HandoffTarget,
            "name" | "buttonLabel" | "credit" | "siteAccessibilityLabel"
        >)[] = [
            "name",
            "buttonLabel",
            "credit",
            "siteAccessibilityLabel"
        ];

        for (const target of HANDOFF_TARGETS) {
            for (const key of copy) {
                expect(target[key]).not.toMatch(/[-–—]/);
            }
        }
    });

    it("carries Beanconqueror's project site as the link target", () => {
        expect(HANDOFF_TARGETS[0].siteUrl).toBe("https://beanconqueror.com");
    });
});
