import type {BrewSample} from "@/library/brew/BrewRecord";
import {STAGE_SHORT_ML, stageStory} from "@/library/brew/stageStory";
import type {Stall} from "@/library/brew/stalls";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";

/** `at` in seconds for readability; the type wants milliseconds. */
function sample(seconds: number, water: number, pour: number): BrewSample {
    return {at: seconds * 1000, water, cup: water * 0.9, pour};
}

/** A plan stage. Volume and temperature are what the story reads. */
function stage(volume: number, temperature = 92): Pour {
    return new Pour(1, volume, temperature, 32,
        AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 0);
}

describe("stageStory", () => {
    it("reports the plan and the stage number one-based", () => {
        const story = stageStory({
            index: 2, stage: stage(45, 94), deliveredMl: 45,
            stalls: [], samples: [], hasStream: false
        });
        expect(story.stageNumber).toBe(3);
        expect(story.plannedMl).toBe(45);
        expect(story.temperature).toBe(94);
    });

    describe("stopped short", () => {
        it("calls a stage well under plan short, with the shortfall", () => {
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 39,
                stalls: [], samples: [], hasStream: false
            });
            expect(story.stoppedShort).toBe(true);
            expect(story.shortfallMl).toBe(6);
        });

        it("does not call a stage a hair under plan short", () => {
            // 45 planned, 41 delivered -> 4 ml short, inside tolerance.
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 41,
                stalls: [], samples: [], hasStream: false
            });
            expect(story.stoppedShort).toBe(false);
            expect(story.shortfallMl).toBe(4);
        });

        it("treats a shortfall exactly at the threshold as not short", () => {
            // 45 planned, 40 delivered -> exactly 5 ml short. The comparison is
            // strict, matching finalOutcome's `> ENDED_EARLY_ML`. Pinned to the
            // literal 40, not to the constant, so moving the threshold fails
            // this on purpose.
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 40,
                stalls: [], samples: [], hasStream: false
            });
            expect(story.shortfallMl).toBe(5);
            expect(story.stoppedShort).toBe(false);
        });

        it("calls one millilitre past the threshold short", () => {
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 38.9,
                stalls: [], samples: [], hasStream: false
            });
            expect(story.stoppedShort).toBe(true);
        });

        it("never reports a negative shortfall when a stage overshoots", () => {
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 47,
                stalls: [], samples: [], hasStream: false
            });
            expect(story.shortfallMl).toBe(0);
            expect(story.stoppedShort).toBe(false);
        });

        it("keeps the threshold below the brew-level fifteen", () => {
            // The stage figure exists precisely because the whole-brew number is
            // too coarse for one stage. If they were ever equated this fails.
            expect(STAGE_SHORT_ML).toBeLessThan(15);
        });
    });

    describe("holds", () => {
        it("passes the stalls through and totals their seconds", () => {
            const stalls: Stall[] = [{atMl: 12, seconds: 4}, {atMl: 30, seconds: 2.5}];
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 45,
                stalls, samples: [], hasStream: false
            });
            expect(story.holds).toEqual(stalls);
            expect(story.totalHeldSeconds).toBe(6.5);
        });

        it("totals to zero with no holds", () => {
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 45,
                stalls: [], samples: [], hasStream: false
            });
            expect(story.totalHeldSeconds).toBe(0);
        });
    });

    describe("timing", () => {
        it("takes the stage's own first and last sample, in seconds", () => {
            // Two stages in one stream. Stage 2 (index 1) runs 10 s to 25 s;
            // stage 1's samples must not leak in.
            const samples = [
                sample(0, 0, 1), sample(5, 20, 1), sample(10, 40, 1),
                sample(15, 55, 2), sample(25, 90, 2)
            ];
            const story = stageStory({
                index: 1, stage: stage(50), deliveredMl: 50,
                stalls: [], samples, hasStream: true
            });
            expect(story.timing).toEqual({available: true, startSec: 15, endSec: 25});
        });

        it("is unavailable when the stream was not kept", () => {
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 45,
                stalls: [], samples: [], hasStream: false
            });
            expect(story.timing).toEqual({available: false});
        });

        it("is unavailable when the stage never ran, even with a stream", () => {
            // The stream exists but has no sample for this stage's pour.
            const samples = [sample(0, 0, 1), sample(5, 20, 1)];
            const story = stageStory({
                index: 2, stage: stage(45), deliveredMl: 0,
                stalls: [], samples, hasStream: true
            });
            expect(story.timing).toEqual({available: false});
        });

        it("does not trust samples when hasStream is false", () => {
            // A contradictory input: samples present but the flag says the
            // stream was swept. The flag wins, because it is what the record
            // itself asserts about retention.
            const samples = [sample(0, 0, 1), sample(5, 20, 1)];
            const story = stageStory({
                index: 0, stage: stage(45), deliveredMl: 20,
                stalls: [], samples, hasStream: false
            });
            expect(story.timing).toEqual({available: false});
        });
    });
});
