import type {BrewSample, PlanStage} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";
import {AGITATION, POUR_PATTERN} from "@/library/Pour";

export const plan: PlanStage[] = [
    {
        pourNumber: 1, volume: 40, temperature: 94, flowRate: 40,
        agitation: AGITATION.BEFORE_ON_AFTER_OFF,
        pourPattern: POUR_PATTERN.SPIRAL, pauseTime: 30
    },
    {
        pourNumber: 2, volume: 100, temperature: 92, flowRate: 50,
        agitation: AGITATION.ALL_OFF,
        pourPattern: POUR_PATTERN.CIRCULAR, pauseTime: 15
    },
    {
        pourNumber: 3, volume: 100, temperature: 90, flowRate: 50,
        agitation: AGITATION.BEFORE_OFF_AFTER_ON,
        pourPattern: POUR_PATTERN.CENTERED, pauseTime: 0
    }
];

export const extendedPlan: PlanStage[] = [
    ...plan,
    {
        pourNumber: 4, volume: 80, temperature: 88, flowRate: 45,
        agitation: AGITATION.ALL_OFF,
        pourPattern: POUR_PATTERN.CENTERED, pauseTime: 0
    }
];

export const samples: BrewSample[] = [
    {at: 0, water: 0, cup: 0, pour: 0},
    {at: 1_000, water: 4.2, cup: 0, pour: 1},
    {at: 2_500, water: 9.7, cup: 1.2, pour: 1},
    {at: 4_500, water: 15.1, cup: 5.8, pour: 1}
];

export function brew(overrides: Partial<StoredBrew> = {}): StoredBrew {
    return {
        id: "brew-1",
        recipeUuid: "recipe-1",
        recipeName: "Gummy Worms",
        accent: "#c8752f",
        startedAt: Date.UTC(2026, 8, 19, 7, 41, 3, 852),
        endedAt: Date.UTC(2026, 8, 19, 7, 44, 11, 852),
        outcome: "done",
        failure: null,
        pours: 3,
        waterTotal: 240,
        cupTotal: 204,
        heldSeconds: 0,
        hasStream: true,
        plan,
        stageWater: [40, 100, 100],
        dose: 15,
        ratio: 16,
        grindSize: 62,
        grinderRpm: 6_400,
        grinderUsed: true,
        coffee: {
            name: "Kenya Sakami Gloria Natural Batian",
            origin: "Nabiswa, Kenya",
            process: "Natural",
            variety: "Batian",
            aromatics: "Cherry・strawberry・blueberry",
            beanMix: "Single Origin",
            note: "A producer narrative.",
            imageUrl: "https://example.com/pod.png"
        },
        ...overrides
    };
}

export function decodeDeltas(values: number[]): number[] {
    const out: number[] = [];
    let total = 0;
    values.forEach((value) => {
        total += value;
        out.push(total);
    });
    return out;
}
