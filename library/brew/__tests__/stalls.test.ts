import type {BrewSample} from "@/library/brew/BrewRecord";
import {stallsInStage} from "@/library/brew/stalls";

/** `at` in seconds for readability; the type wants milliseconds. */
function sample(seconds: number, water: number, pour: number): BrewSample {
    return {at: seconds * 1000, water, cup: water * 0.9, pour};
}

describe("stallsInStage", () => {
    it("finds nothing in a stage where water never stopped", () => {
        const samples = [
            sample(0, 0, 1), sample(1, 4, 1), sample(2, 8, 1),
            sample(3, 12, 1), sample(4, 16, 1)
        ];

        expect(stallsInStage(samples, 1, 16)).toEqual([]);
    });

    it("does not call a planned pause a stall", () => {
        // The stage's target is 16 ml and it got there. Everything flat after
        // that is the pause the recipe asked for.
        const samples = [
            sample(0, 0, 1), sample(2, 8, 1), sample(4, 16, 1),
            sample(6, 16, 1), sample(8, 16, 1), sample(20, 16, 1)
        ];

        expect(stallsInStage(samples, 1, 16)).toEqual([]);
    });

    it("does not call a quiet radio a stall", () => {
        // Three seconds between two readings that both rose. The water was
        // never seen standing still, so nothing here stopped.
        const samples = [
            sample(0, 0, 1), sample(3, 20, 1), sample(6, 45, 1), sample(9, 70, 1)
        ];

        expect(stallsInStage(samples, 1, 70)).toEqual([]);
    });

    it("records where a stall began and how long it lasted", () => {
        const samples = [
            sample(0, 0, 1), sample(1, 5, 1),
            // Ten seconds with the water at 20 ml of a 70 ml stage.
            sample(2, 20, 1), sample(5, 20, 1), sample(11, 20, 1),
            sample(12, 30, 1), sample(15, 70, 1)
        ];

        expect(stallsInStage(samples, 1, 70)).toEqual([{atMl: 20, seconds: 10}]);
    });

    it("records several stalls in one stage, in the order they happened", () => {
        const samples = [
            sample(0, 0, 2), sample(1, 10, 2),
            sample(2, 20, 2), sample(6, 20, 2),
            sample(7, 40, 2), sample(12, 40, 2),
            sample(13, 60, 2), sample(16, 60, 2),
            sample(17, 70, 2)
        ];

        expect(stallsInStage(samples, 2, 70)).toEqual([
            {atMl: 20, seconds: 5},
            {atMl: 40, seconds: 6},
            {atMl: 60, seconds: 4}
        ]);
    });

    it("reports a stall that is still going, so it can grow while it happens", () => {
        const samples = [
            sample(0, 0, 1), sample(2, 20, 1), sample(9, 20, 1)
        ];

        expect(stallsInStage(samples, 1, 70)).toEqual([{atMl: 20, seconds: 7}]);
    });

    it("ignores a stage that has no samples at all", () => {
        expect(stallsInStage([], 3, 40)).toEqual([]);
    });

    it("reads only its own stage", () => {
        const samples = [
            sample(0, 0, 1), sample(2, 20, 1), sample(9, 20, 1), sample(10, 40, 1),
            // Stage 2 continues the running total; the scale is never re-tared
            // between stages, so it picks up from stage 1's 40 ml.
            sample(11, 40, 2), sample(12, 110, 2)
        ];

        // Stage 1 sat at 20 ml from t=2 and had reached 40 by t=10, so its
        // stall is bounded at eight seconds. Stage 2 never stalled, and must
        // not inherit stage 1's.
        expect(stallsInStage(samples, 2, 70)).toEqual([]);
        expect(stallsInStage(samples, 1, 40)).toEqual([{atMl: 20, seconds: 8}]);
    });

    it("counts from the total before the stage, not its first reading", () => {
        // 8 ml arrived between the boundary and stage 2's first frame. Stage 2
        // owes 40 and has had 38, so its flat tail is still a stall -- under
        // the old rule it looked like 30 delivered and the numbers drifted.
        const samples = [
            sample(0, 0, 1), sample(4, 40, 1),
            sample(5, 48, 2), sample(6, 78, 2), sample(12, 78, 2)
        ];

        expect(stallsInStage(samples, 2, 40)).toEqual([{atMl: 38, seconds: 6}]);
    });

    it("ignores drift below the noise floor", () => {
        // A tenth of a millilitre either way is the scale settling, not a pour,
        // so the stall is measured from where the water actually stopped.
        const samples = [
            sample(0, 0, 1), sample(1, 20, 1),
            sample(2, 20.1, 1), sample(3, 20.2, 1), sample(9, 20.3, 1),
            sample(10, 40, 1)
        ];

        expect(stallsInStage(samples, 1, 40)).toEqual([{atMl: 20, seconds: 9}]);
    });
});

describe("a stage that stops just short of its target", () => {
    /** A pour to `endMl` over 12 s, then `restSeconds` of flat water. */
    function shortPour(endMl: number, restSeconds: number) {
        const s = [{at: 0, water: 0, cup: 0, pour: 1}];
        for (let i = 1; i <= 12; i++) {
            s.push({at: i * 1000, water: (endMl * i) / 12, cup: 0, pour: 1});
        }
        for (let i = 1; i <= restSeconds; i++) {
            s.push({at: 12_000 + i * 1000, water: endMl, cup: 0, pour: 1});
        }
        return s;
    }

    it("does not call the planned rest a stall when it lands a shade under", () => {
        // The tolerance used to be the 0.5 ml noise floor, which is what the
        // scale settles by, not what a pour lands within. A stage that wanted
        // 40 ml and delivered 39.4 therefore had its entire 30 s rest recorded
        // as one stall: amber across a planned pause, and a lane long enough
        // to shrink every other rung on the ladder.
        expect(stallsInStage(shortPour(39.4, 30), 1, 40)).toEqual([]);
    });

    it("still catches a stage that genuinely stopped well short", () => {
        // Half the water and then nothing is not a rest, whatever the plan says.
        expect(stallsInStage(shortPour(20, 30), 1, 40)).toHaveLength(1);
    });
});
