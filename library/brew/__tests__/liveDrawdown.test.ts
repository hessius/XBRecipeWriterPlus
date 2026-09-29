import type {BrewSample} from "@/library/brew/BrewRecord";
import {
    DRAWDOWN_OPEN_MARGIN_MS,
    liveDrawdown,
    liveDrawdownFrom
} from "@/library/brew/liveDrawdown";
import type {BrewPhase} from "@/library/machine/Machine";

function sample(at: number, water: number, cup: number, pour = 1): BrewSample {
    return {at, water, cup, pour};
}

function finalPour(): BrewSample[] {
    return pourFor(6, {water: 3, cup: 2, pour: 1});
}

function pourFor(
    seconds: number,
    rates: {water: number; cup: number; pour: number},
    start: {at: number; water: number; cup: number} = {at: 0, water: 0, cup: 0}
): BrewSample[] {
    const out: BrewSample[] = [];
    for (let i = 1; i <= seconds * 10; i++) {
        out.push(sampleFrame(i, rates, start));
    }
    return out;
}

function pourFrames(
    frames: number,
    rates: {water: number; cup: number; pour: number},
    start: {at: number; water: number; cup: number} = {at: 0, water: 0, cup: 0}
): BrewSample[] {
    const out: BrewSample[] = [];
    for (let i = 1; i <= frames; i++) {
        out.push(sampleFrame(i, rates, start));
    }
    return out;
}

function sampleFrame(
    i: number,
    rates: {water: number; cup: number; pour: number},
    start: {at: number; water: number; cup: number}
): BrewSample {
    return sample(
        start.at + i * 100,
        start.water + rates.water * (i / 10),
        start.cup + rates.cup * (i / 10),
        rates.pour
    );
}

function flatWater(start: BrewSample, seconds: number, pour = start.pour): BrewSample[] {
    const out: BrewSample[] = [];
    for (let i = 1; i <= seconds * 10; i++) {
        out.push(sample(
            start.at + i * 100,
            start.water,
            start.cup + i * 0.2,
            pour
        ));
    }
    return out;
}

function noisyPlateau(start: BrewSample, seconds: number): BrewSample[] {
    const wobble = [0.2, -0.1, 0.4, 0.1, 0.3, -0.2, 0.5, 0];
    const out: BrewSample[] = [];
    for (let i = 1; i <= seconds * 10; i++) {
        out.push(sample(
            start.at + i * 100,
            start.water + wobble[i % wobble.length],
            start.cup + i * 0.2,
            start.pour
        ));
    }
    return out;
}

function drawdown(
    samples: BrewSample[],
    elapsedSeconds: number,
    phaseName: BrewPhase["name"],
    stages = 1,
    finalStageTargetMl = 18
) {
    return liveDrawdown({
        samples,
        stages,
        elapsedSeconds,
        phaseName,
        running: true,
        finalStageTargetMl,
    });
}

describe("liveDrawdownFrom", () => {
    it("does not retake the boundary for a noisy drawdown plateau", () => {
        const poured = finalPour();
        const lastPour = poured[poured.length - 1];
        const stream = [...poured, ...noisyPlateau(lastPour, 12)];

        expect(liveDrawdownFrom(stream, 1)).toBe(lastPour.at);
    });

    it("keeps the noise headroom when a legal pour stops off ratchet cadence", () => {
        const poured = pourFrames(59, {water: 3, cup: 2, pour: 1});
        const lastPour = poured[poured.length - 1];
        const stream = [...poured, ...noisyPlateau(lastPour, 12)];

        expect(liveDrawdownFrom(stream, 1)).toBe(5800);
    });

    it("tracks only the final brew stage", () => {
        const stageOne = [
            sample(1000, 20, 8, 1),
            sample(2000, 40, 16, 1),
            sample(3000, 40.2, 20, 1),
        ];

        expect(liveDrawdownFrom(stageOne, 2)).toBe(0);
    });
});

describe("liveDrawdown", () => {
    it("does not open the clock while the final pour is still rising", () => {
        const stream = finalPour();

        expect(drawdown(stream, 6, "pouring", 1, 20)).toEqual({
            drawdownAt: 6000,
            drawdown: null,
            reserveDrawdown: true,
        });
    });

    it("does not open the clock during a stall inside the final pour", () => {
        const poured = pourFor(3, {water: 3, cup: 2, pour: 1});
        const stalled = flatWater(poured[poured.length - 1], 2);
        const stream = [...poured, ...stalled];

        expect(drawdown(stream, 5, "pouring").drawdown).toBeNull();
    });

    it("retakes the boundary when water resumes after a final-pour stall", () => {
        const poured = pourFor(3, {water: 3, cup: 2, pour: 1});
        const stalled = flatWater(poured[poured.length - 1], 2);
        const resumed = pourFor(3, {water: 3, cup: 2, pour: 1}, {
            at: stalled[stalled.length - 1].at,
            water: stalled[stalled.length - 1].water,
            cup: stalled[stalled.length - 1].cup
        });
        const stream = [...poured, ...stalled, ...resumed];

        expect(drawdown(stream, 8, "pouring").drawdownAt).toBe(8000);
    });

    it("opens by phase backstop once a short final pour has ended", () => {
        const poured = finalPour();
        const lastPour = poured[poured.length - 1];
        const almostOpen = [
            ...poured,
            sample(lastPour.at + DRAWDOWN_OPEN_MARGIN_MS - 100, 18, 25, 1),
        ];
        const open = [
            ...poured,
            sample(lastPour.at + DRAWDOWN_OPEN_MARGIN_MS, 18, 25, 1),
        ];

        expect(drawdown(almostOpen, 8, "settling", 1, 20).drawdown).toBeNull();
        expect(drawdown(open, 8.1, "settling", 1, 20).drawdown).toBeGreaterThanOrEqual(2);
    });

    it("keeps counting through a bypass sample", () => {
        const poured = finalPour();
        const lastPour = poured[poured.length - 1];
        const stream = [
            ...poured,
            ...noisyPlateau(lastPour, 2),
            sample(9000, 75, 39, 2),
        ];

        expect(drawdown(stream, 9, "bypass")).toEqual({
            drawdownAt: lastPour.at,
            drawdown: 3,
            reserveDrawdown: true,
        });
    });

    it("opens during pouring when the verified final stage has delivered its plan", () => {
        const stageOne = pourFor(10, {water: 3, cup: 2, pour: 1});
        const stageTwo = pourFor(10, {water: 3, cup: 2, pour: 2}, {
            at: stageOne[stageOne.length - 1].at,
            water: stageOne[stageOne.length - 1].water,
            cup: stageOne[stageOne.length - 1].cup
        });
        const stageThree = pourFor(10, {water: 3, cup: 2, pour: 3}, {
            at: stageTwo[stageTwo.length - 1].at,
            water: stageTwo[stageTwo.length - 1].water,
            cup: stageTwo[stageTwo.length - 1].cup
        });
        const lastPour = stageThree[stageThree.length - 1];
        const stream = [...stageOne, ...stageTwo, ...stageThree, ...flatWater(lastPour, 40)];

        expect(drawdown(stream, 70, "pouring", 3, 30)).toEqual({
            drawdownAt: 29900,
            drawdown: 40.1,
            reserveDrawdown: true,
        });
    });

    it("keeps the verified clock open when bypass fires 61 seconds after water", () => {
        const poured = finalPour();
        const lastPour = poured[poured.length - 1];
        const stream = [
            ...poured,
            ...flatWater(lastPour, 61),
            sample(lastPour.at + 61_100, 23, 42.2, 2),
        ];

        const result = drawdown(stream, 67.1, "bypass");
        expect(result.drawdownAt).toBe(lastPour.at);
        expect(result.drawdown).toBeCloseTo(61.1, 6);
        expect(result.reserveDrawdown).toBe(true);
    });

    it("shows the bypass-less drawdown before done takes the run down", () => {
        const poured = finalPour();
        const stream = [...poured, ...flatWater(poured[poured.length - 1], 13)];

        expect(drawdown(stream, 19, "settling")).toEqual({
            drawdownAt: 6000,
            drawdown: 13,
            reserveDrawdown: true,
        });
        expect(liveDrawdown({
            samples: stream,
            stages: 1,
            elapsedSeconds: 21,
            phaseName: "done",
            running: false,
            finalStageTargetMl: 18,
        })).toEqual({
            drawdownAt: 6000,
            drawdown: null,
            reserveDrawdown: false,
        });
    });

    it("keeps counting through settling", () => {
        const poured = finalPour();
        const stream = [...poured, ...flatWater(poured[poured.length - 1], 4)];

        expect(drawdown(stream, 10, "settling")).toEqual({
            drawdownAt: 6000,
            drawdown: 4,
            reserveDrawdown: true,
        });
    });

    it("reserves no row before the final stage has produced a boundary", () => {
        const stream = [
            sample(1000, 20, 8, 1),
            sample(2000, 40, 16, 1),
            sample(3000, 40.2, 20, 1),
        ];

        expect(liveDrawdown({
            samples: stream,
            stages: 2,
            elapsedSeconds: 3,
            phaseName: "pouring",
            running: true,
            finalStageTargetMl: 18,
        })).toEqual({
            drawdownAt: 0,
            drawdown: null,
            reserveDrawdown: false,
        });
    });
});
