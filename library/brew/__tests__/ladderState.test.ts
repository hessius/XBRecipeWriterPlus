import {ladderFrontier} from "@/library/brew/ladderState";

describe("where a finished brew's ladder stops", () => {
    it("marks every stage done when the brew finished", () => {
        // 4 leaves all of 0..3 below the frontier, which is `done`.
        expect(ladderFrontier("done", [40, 70, 70, 70])).toBe(4);
    });

    it("stops at the stage a failed brew stopped in", () => {
        // Poured 1 and part of 2. Index 1 is the frontier, so stage 2 draws as
        // the one it stopped in and stages 3 and 4 draw as never reached --
        // which used to be four full bars.
        expect(ladderFrontier("failed", [40, 30, 0, 0])).toBe(1);
    });

    it("stops at the first stage when a brew died before pouring", () => {
        expect(ladderFrontier("failed", [0, 0, 0, 0])).toBe(0);
        expect(ladderFrontier("cancelled", [])).toBe(0);
    });

    it("marks every stage done on a cancelled brew that poured them all", () => {
        // Stopped after the last drop rather than during: nothing is pending.
        expect(ladderFrontier("cancelled", [40, 70])).toBe(2);
    });
});
