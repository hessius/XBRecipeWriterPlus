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
    stages = 1
) {
    return liveDrawdown(samples, stages, elapsedSeconds, phaseName, true);
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

        expect(drawdown(stream, 6, "pouring")).toEqual({
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

    it("opens once the final pour has ended", () => {
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

        expect(drawdown(almostOpen, 6.9, "settling").drawdown).toBeNull();
        expect(drawdown(open, 7, "settling").drawdown).toBeGreaterThanOrEqual(1);
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

        expect(liveDrawdown(stream, 2, 3, "pouring", true)).toEqual({
            drawdownAt: 0,
            drawdown: null,
            reserveDrawdown: false,
        });
    });
});
