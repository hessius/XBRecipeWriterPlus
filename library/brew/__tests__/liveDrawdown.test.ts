import type {BrewSample} from "@/library/brew/BrewRecord";
import {
    DRAWDOWN_OPEN_MARGIN_MS,
    liveDrawdown,
    liveDrawdownFrom
} from "@/library/brew/liveDrawdown";

function sample(at: number, water: number, cup: number, pour = 1): BrewSample {
    return {at, water, cup, pour};
}

function finalPour(): BrewSample[] {
    return [
        sample(1000, 10, 4),
        sample(2000, 20, 8),
        sample(3000, 30, 12),
        sample(4000, 40, 16),
        sample(5000, 50, 20),
        sample(6000, 60, 24),
    ];
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

describe("liveDrawdownFrom", () => {
    it("does not retake the boundary for a noisy drawdown plateau", () => {
        const poured = finalPour();
        const lastPour = poured[poured.length - 1];
        const stream = [...poured, ...noisyPlateau(lastPour, 12)];

        expect(liveDrawdownFrom(stream, 1)).toBe(lastPour.at);
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

        expect(liveDrawdown(stream, 1, 6, true)).toEqual({
            drawdownAt: 6000,
            drawdown: null,
            reserveDrawdown: true,
        });
    });

    it("opens after a margin of flat water, not at the boundary sample", () => {
        const poured = finalPour();
        const lastPour = poured[poured.length - 1];
        const almostOpen = [
            ...poured,
            sample(lastPour.at + DRAWDOWN_OPEN_MARGIN_MS - 100, 60.2, 25, 1),
        ];
        const open = [
            ...poured,
            sample(lastPour.at + DRAWDOWN_OPEN_MARGIN_MS, 60.2, 25, 1),
        ];

        expect(liveDrawdown(almostOpen, 1, 6.9, true).drawdown).toBeNull();
        expect(liveDrawdown(open, 1, 7, true).drawdown).toBe(1);
    });

    it("keeps counting through a bypass sample", () => {
        const poured = finalPour();
        const lastPour = poured[poured.length - 1];
        const stream = [
            ...poured,
            ...noisyPlateau(lastPour, 2),
            sample(9000, 75, 39, 2),
        ];

        expect(liveDrawdown(stream, 1, 9, true)).toEqual({
            drawdownAt: lastPour.at,
            drawdown: 3,
            reserveDrawdown: true,
        });
    });

    it("reserves no row before the final stage has produced a boundary", () => {
        const stream = [
            sample(1000, 20, 8, 1),
            sample(2000, 40, 16, 1),
            sample(3000, 40.2, 20, 1),
        ];

        expect(liveDrawdown(stream, 2, 3, true)).toEqual({
            drawdownAt: 0,
            drawdown: null,
            reserveDrawdown: false,
        });
    });
});
