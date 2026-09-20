import appConfig from "@/app.json";
import {brewNote} from "@/library/brew/brewNote";
import {stageSpans} from "@/library/brew/brewShape";
import {
    grinderRan,
    numeric,
    poursFromPlan,
    type BrewSample
} from "@/library/brew/BrewRecord";
import {DEVICE_NAME} from "@/library/brew/handoff/device";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {PodCoffee} from "@/library/podCoffee";

const REPOSITORY_URL = "https://github.com/hessius/XBRecipeWriterPlus";
const SOURCE_NAME = "XBRecipeWriter++";

type Quantity<Unit extends string> = {
    value: number;
    unit: Unit;
};

export type HandoffFlow = {
    fidelity: "full" | "downsampled";
    /** Milliseconds since brew start, delta-coded. */
    t: number[];
    /** Water dispensed in 0.1 g, delta-coded. */
    waterDispensed: number[];
    /** Cup weight in 0.1 g, delta-coded. */
    weight: number[];
    /** Measured temperature only. XBRW++ has no measured temperature stream. */
    temperature?: number[];
};

export type HandoffMetric = {
    key: string;
    name: string;
    unit: string;
    kind: "target" | "measured";
    /** Absolute milliseconds since brew start. */
    t: number[];
    v: number[];
};

export type HandoffBrew = {
    date: string;
    doseIn?: Quantity<"g">;
    waterIn: Quantity<"ml">;
    beverageOut: Quantity<"g">;
    /** Seconds. */
    brewTime: number;
    /** Stage 1 target temperature, °C. */
    temperature?: number;
    ratio?: number;
    grindSize?: string;
    grinderRpm?: number;
    grinderName?: string;
    preparationMethod: string;
    /** Seconds; stage 1 pause, not a measurement. */
    bloomTime?: number;
    /** Seconds from brew start to first non-zero cup reading. */
    firstDripTime?: number;
    note: string;
};

export type HandoffImported = {
    source: "xbrw";
    sourceName: typeof SOURCE_NAME;
    sourceUrl: typeof REPOSITORY_URL;
    device: typeof DEVICE_NAME;
    schema: 1;
    params: Record<string, unknown>;
};

export type HandoffEnvelope = {
    v: 1;
    app: {
        name: string;
        version: string;
    };
    brew: HandoffBrew;
    bean?: PodCoffee;
    flow?: HandoffFlow;
    metrics?: HandoffMetric[];
    imported: HandoffImported;
};

export function buildEnvelope(brew: StoredBrew, samples: BrewSample[]): HandoffEnvelope {
    const firstStage = Array.isArray(brew.plan) ? brew.plan[0] : undefined;
    const firstDrip = firstDripTime(samples);
    const flow = brew.hasStream && samples.length > 0 ? flowFromSamples(samples) : undefined;
    const metrics = metricsFromPlan(brew.plan);
    const ranGrinder = grinderRan(brew);

    return {
        v: 1,
        app: {
            name: appConfig.expo.name,
            // `expo-constants` is runtime state; the static app config is the value Jest and native builds share.
            version: appConfig.expo.version
        },
        brew: {
            date: new Date(brew.startedAt).toISOString(),
            ...(numeric(brew.dose) ? {doseIn: {value: brew.dose, unit: "g" as const}} : {}),
            waterIn: {value: brew.waterTotal, unit: "ml"},
            beverageOut: {value: brew.cupTotal, unit: "g"},
            brewTime: secondsFromMilliseconds(brew.endedAt - brew.startedAt),
            ...(numeric(firstStage?.temperature) ? {temperature: firstStage.temperature} : {}),
            ...(numeric(brew.ratio) ? {ratio: brew.ratio} : {}),
            ...(ranGrinder && numeric(brew.grindSize) ? {grindSize: String(brew.grindSize)} : {}),
            ...(ranGrinder && numeric(brew.grinderRpm) ? {grinderRpm: brew.grinderRpm} : {}),
            ...(ranGrinder ? {grinderName: DEVICE_NAME} : {}),
            preparationMethod: DEVICE_NAME,
            // A bloom is inferred from the first programmed wait, not measured by the machine.
            ...(numeric(firstStage?.pauseTime) && firstStage.pauseTime > 0
                ? {bloomTime: firstStage.pauseTime}
                : {}),
            ...(firstDrip !== undefined ? {firstDripTime: firstDrip} : {}),
            note: brewNote(brew)
        },
        ...(brew.coffee !== undefined ? {bean: brew.coffee} : {}),
        ...(flow !== undefined ? {flow} : {}),
        ...(metrics.length > 0 ? {metrics} : {}),
        imported: {
            source: "xbrw",
            sourceName: SOURCE_NAME,
            sourceUrl: REPOSITORY_URL,
            // Keep the device label in the shared constant; its comment owns the model-name policy.
            device: DEVICE_NAME,
            schema: 1,
            params: importedParams(brew)
        }
    };
}

function secondsFromMilliseconds(milliseconds: number): number {
    return Math.round(Math.max(0, milliseconds) / 100) / 10;
}

function firstDripTime(samples: BrewSample[]): number | undefined {
    const first = samples.find((sample) => sample.cup > 0);
    return first === undefined ? undefined : secondsFromMilliseconds(first.at);
}

function deltaCode(values: number[]): number[] {
    let previous = 0;
    return values.map((value) => {
        const delta = value - previous;
        previous = value;
        return delta;
    });
}

function flowFromSamples(samples: BrewSample[]): HandoffFlow {
    return {
        fidelity: "full",
        t: deltaCode(samples.map((sample) => Math.round(sample.at))),
        waterDispensed: deltaCode(samples.map((sample) => Math.round(sample.water * 10))),
        weight: deltaCode(samples.map((sample) => Math.round(sample.cup * 10)))
    };
}

function metricsFromPlan(plan: StoredBrew["plan"]): HandoffMetric[] {
    const pours = poursFromPlan(plan);
    if (pours.length === 0) return [];
    const spans = stageSpans(pours);
    const t: number[] = [];
    const v: number[] = [];

    pours.forEach((pour, index) => {
        t.push(Math.round(spans[index].start * 1000), Math.round(spans[index].end * 1000));
        v.push(pour.temperature, pour.temperature);
    });

    return [{
        key: "targetTemperature",
        name: "Target temp",
        unit: "°C",
        kind: "target",
        t,
        v
    }];
}

function importedParams(brew: StoredBrew): Record<string, unknown> {
    return {
        ...(Array.isArray(brew.plan) && brew.plan.length > 0 ? {plan: brew.plan} : {}),
        ...(Array.isArray(brew.stageWater) && brew.stageWater.length > 0
            ? {stageWater: brew.stageWater}
            : {}),
        ...(Array.isArray(brew.stalls) && brew.stalls.length > 0 ? {stalls: brew.stalls} : {}),
        ...(brew.bypass !== undefined ? {bypass: brew.bypass} : {})
    };
}
