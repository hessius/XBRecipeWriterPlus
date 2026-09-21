// Produces the vendor-neutral description of a finished brew: recipe figures,
// planned targets, measured flow and provenance. This module knows what a brew
// is and nothing about transport. Compression and chunking belong to the codec
// layer. What thinning means lives here, because thinning a delta-coded array
// is only correct after decoding it. Whether and when to thin is policy and
// lives in the codec: encode.ts calls downsample and never reads flow.t.
import appConfig from "@/app.json";
import {brewNote} from "@/library/brew/brewNote";
import {stageSpans} from "@/library/brew/brewShape";
import {
    grinderRan,
    isRating,
    numeric,
    poursFromPlan,
    type BrewSample,
    type PlanStage
} from "@/library/brew/BrewRecord";
import {DEVICE_NAME} from "@/library/brew/handoff/device";
import type {BackfilledField} from "@/library/brew/handoff/backfill";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {PodCoffee} from "@/library/podCoffee";

const REPOSITORY_URL = "https://github.com/hessius/XBRecipeWriterPlus";
const SOURCE_NAME = "XBRecipeWriter++";
const MIN_SAMPLE_INTERVAL_MS = 1_000; // 1 Hz floor

type Quantity<Unit extends string> = {
    value: number;
    unit: Unit;
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

export type HandoffFlow = {
    fidelity: "full" | "downsampled";
    /** Milliseconds since brew start, delta-coded. */
    t: number[];
    /** Water dispensed in 0.1 g, delta-coded. */
    waterDispensed: number[];
    /** Cup weight in 0.1 g, delta-coded. */
    weight: number[];
    /** Absolute, not delta-coded. XBRW++ emits no measured temperature today, so this branch is untested. */
    temperature?: number[];
};

export type HandoffMetric = {
    key: string;
    name: string;
    unit: string;
    /** "target" and "measured" are different claims; merging them misrepresents a plan as a reading. */
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
    /**
     * Whole stars out of `MAX_RATING`, and only when the user gave one. Absent
     * rather than 0 for an unrated brew: 0 is a verdict on this scale, and a
     * reader that took it literally would file every unrated brew as the worst
     * cup its owner has ever had.
     */
    rating?: number;
    note: string;
};

export type HandoffImported = {
    source: "xbrw";
    sourceName: string;
    sourceUrl?: string;
    device?: string;
    schema: 1;
    params: Record<string, unknown>;
};

export function buildEnvelope(
    brew: StoredBrew,
    samples: BrewSample[],
    backfilled: BackfilledField[] = []
): HandoffEnvelope {
    const flow = brew.hasStream && samples.length > 0 ? flowFromSamples(samples) : undefined;
    const metrics = metricsFromPlan(brew.plan);

    return {
        v: 1,
        app: {
            name: appConfig.expo.name,
            // `expo-constants` is runtime state; the static app config is the value Jest and native builds share.
            version: appConfig.expo.version
        },
        brew: brewFigures(brew, samples, backfilled),
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

function brewFigures(
    brew: StoredBrew,
    samples: BrewSample[],
    backfilled: BackfilledField[]
): HandoffBrew {
    const firstStage = Array.isArray(brew.plan) ? brew.plan[0] : undefined;
    const firstDrip = firstDripTime(samples);
    const grinderDidRun = grinderRan(brew);

    return {
        date: new Date(brew.startedAt).toISOString(),
        ...(numeric(brew.dose) ? {doseIn: {value: brew.dose, unit: "g" as const}} : {}),
        waterIn: {value: brew.waterTotal, unit: "ml"},
        beverageOut: {value: brew.cupTotal, unit: "g"},
        brewTime: secondsFromMilliseconds(brew.endedAt - brew.startedAt),
        ...(numeric(firstStage?.temperature) ? {temperature: firstStage.temperature} : {}),
        ...(numeric(brew.ratio) ? {ratio: brew.ratio} : {}),
        ...(grinderDidRun && numeric(brew.grindSize) ? {grindSize: String(brew.grindSize)} : {}),
        ...(grinderDidRun && numeric(brew.grinderRpm) ? {grinderRpm: brew.grinderRpm} : {}),
        ...(grinderDidRun ? {grinderName: DEVICE_NAME} : {}),
        preparationMethod: DEVICE_NAME,
        ...(numeric(firstStage?.pauseTime) && firstStage.pauseTime > 0
            ? {bloomTime: firstStage.pauseTime}
            : {}),
        ...(firstDrip !== undefined ? {firstDripTime: firstDrip} : {}),
        ...(isRating(brew.rating) && brew.rating > 0 ? {rating: brew.rating} : {}),
        note: brewNote(brew, backfilled)
    };
}

function secondsFromMilliseconds(milliseconds: number): number {
    // A device clock correction can leave endedAt earlier than startedAt on imported records.
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

function tenths(value: number): number {
    return Math.round(value * 10);
}

function flowFromSamples(samples: BrewSample[]): HandoffFlow {
    return {
        fidelity: "full",
        t: deltaCode(samples.map((sample) => Math.round(sample.at))),
        waterDispensed: deltaCode(samples.map((sample) => tenths(sample.water))),
        weight: deltaCode(samples.map((sample) => tenths(sample.cup)))
    };
}

/**
 * Returns a thinner copy of flow, or null when there is nothing useful to thin
 * or thinning would breach the 1 Hz floor. Below roughly one sample per second
 * the trace stops reading as a trace. Callers treat both null cases the same:
 * stop the ladder and drop flow rather than ship a misleading line.
 */
export function downsample(flow: HandoffFlow, factor: number): HandoffFlow | null {
    if (factor <= 1 || flow.t.length < 2) return null;

    // Drop samples only after decoding; dropping entries from a delta array silently changes totals and shifts the trace.
    const times = decodeDeltas(flow.t);
    const indices = times
        .map((_time, index) => index)
        .filter((index) => index % factor === 0);
    if (indices.length < 2) return null;

    const retainedTimes = indices.map((index) => times[index]);
    const meanInterval = (retainedTimes[retainedTimes.length - 1] - retainedTimes[0])
        / (retainedTimes.length - 1);
    if (meanInterval > MIN_SAMPLE_INTERVAL_MS) return null;
    const temperature = flow.temperature;

    return {
        fidelity: "downsampled",
        t: deltaCode(retainedTimes),
        waterDispensed: deltaCode(retainDecoded(flow.waterDispensed, indices)),
        weight: deltaCode(retainDecoded(flow.weight, indices)),
        ...(temperature !== undefined
            ? {temperature: indices.map((index) => temperature[index])}
            : {})
    };
}

function decodeDeltas(values: number[]): number[] {
    const out: number[] = [];
    let total = 0;
    values.forEach((value) => {
        total += value;
        out.push(total);
    });
    return out;
}

function retainDecoded(values: number[], indices: number[]): number[] {
    const decoded = decodeDeltas(values);
    return indices.map((index) => decoded[index]);
}

function metricsFromPlan(plan: StoredBrew["plan"]): HandoffMetric[] {
    const pours = poursFromPlan(plan);
    if (pours.length === 0) return [];
    const spans = stageSpans(pours);
    const t: number[] = [];
    const v: number[] = [];

    pours.forEach((pour, index) => {
        // Repeat v at absolute-ms boundaries so linear renderers draw flats, then jumps; flow.t is delta-coded.
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

function planWithoutPourNumbers(plan: PlanStage[]): Omit<PlanStage, "pourNumber">[] {
    return plan.map(({pourNumber: _pourNumber, ...stage}) => stage);
}

function importedParams(brew: StoredBrew): Record<string, unknown> {
    const plan = Array.isArray(brew.plan) ? planWithoutPourNumbers(brew.plan) : undefined;

    return {
        // The stage index already carries pourNumber as index + 1, so omit it from the repeated payload.
        ...(plan !== undefined && plan.length > 0 ? {plan} : {}),
        ...(Array.isArray(brew.stageWater) && brew.stageWater.length > 0
            ? {stageWater: brew.stageWater}
            : {}),
        ...(Array.isArray(brew.stalls) && brew.stalls.length > 0 ? {stalls: brew.stalls} : {}),
        ...(brew.bypass !== undefined ? {bypass: brew.bypass} : {})
    };
}
