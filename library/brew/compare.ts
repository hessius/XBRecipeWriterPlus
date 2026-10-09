import type {StoredBrew} from "@/library/BrewDatabase";

import {drawdownSeconds, numeric, poursFromPlan, type BrewSample,
        type PlanStage} from "./BrewRecord";
import {resolvedOrigin, resolvedProcess} from "./beanTags";
import {formatBrewDuration} from "./brewFormat";
import {countsAsBrewed, isMeasured} from "./brewPopulation";
import {
    livePoints,
    plannedSeconds,
    planPoints,
    splitAtPauses,
    toPath,
    type Box,
    type Point
} from "./brewShape";
import {intervalExtent, type PauseInterval} from "./pauseIntervals";
import {NOISE_FLOOR_ML} from "./stalls";
import {maxRateOf, retrospectiveFlowSeries, type FlowPoint} from "./flowRate";

/**
 * Two brews of one recipe, held against each other.
 *
 * Pure, and pointedly so: everything on this screen that can be got wrong can
 * be got wrong here, where a test can catch it without a machine. The drawing
 * is the part that needs real brews, so as little as possible of the thinking
 * happens there.
 *
 * `StoredBrew` is imported as a type only. `BrewDatabase` pulls in expo-sqlite,
 * and this module must stay importable by a plain node test.
 */

/**
 * How far two brews' water may differ and still count as the same pour.
 *
 * Six times the scale's noise floor, which is why it is written as a multiple
 * of it rather than as a 3 somebody has to take on trust. Whether six is the
 * right multiple is a hardware question rather than an arithmetic one, exactly
 * as `TARGET_TOLERANCE_ML` in `stalls.ts` says of its own figure. It wants
 * checking against two real brews of one recipe.
 */
export const COMPARE_WATER_TOLERANCE_ML = NOISE_FLOOR_ML * 6;

/**
 * The same disclaimer, for the clock.
 *
 * Chosen rather than derived: there is no clock equivalent of the scale's
 * noise floor to build it out of. Five seconds is about the difference two
 * brews of one recipe drift by without anything having gone wrong, and it too
 * wants checking against real brews.
 */
export const COMPARE_TIME_TOLERANCE_SECONDS = 5;

export type PourVerdict = "same" | "stalled" | "differed" | "incomplete" | "unwatched";

/**
 * When the pour started.
 *
 * The first drop, not waking: grinding is not pouring, and a brew that ground
 * for a minute longer poured no differently. `pouringAt` is missing or 0 on
 * rows written before the column existed, and also on a brew that never got as
 * far as pouring; both fall back to `startedAt`, which is the only instant
 * such a row has. Exported so the screens read the same instant this does.
 */
export function pourStartMs(record: StoredBrew): number {
    const pouringAt = record.pouringAt;
    return typeof pouringAt === "number" && pouringAt > 0 ? pouringAt : record.startedAt;
}

/** How long the pour took, in seconds. */
export function pourDurationSeconds(record: StoredBrew): number {
    return Math.max(0, (record.endedAt - pourStartMs(record)) / 1000);
}

function stalled(record: StoredBrew): boolean {
    return (record.stalls ?? []).some((stage) => stage.length > 0);
}

/**
 * Whether the two brews poured alike, and what to say about it.
 *
 * The order of the tests is the point. A brew that stopped is not a brew that
 * differed, and saying "these differed by 90 ml" about a cancelled brew is
 * true and useless. A brew nobody watched is the same trap one step further
 * in: `unobservedBrew` writes outcome `done` with zeroes for water, cup and
 * time, so it passes `countsAsBrewed` and would be reported as having poured
 * 250 ml less than the brew beside it. A stall is likewise its own answer
 * rather than a cause of a difference in the totals.
 */
export function pourVerdict(
    subject: StoredBrew, reference: StoredBrew
): {verdict: PourVerdict; why: string} {
    const unfinished = [subject, reference].filter((r) => !countsAsBrewed(r));
    if (unfinished.length > 0) {
        return {
            verdict: "incomplete",
            why: unfinished.length === 2
                ? "Neither brew finished, so there is no pour to compare."
                : "One brew did not finish, so the pours cannot be compared."
        };
    }

    const unwatched = [subject, reference].filter((r) => !isMeasured(r));
    if (unwatched.length > 0) {
        return {
            verdict: "unwatched",
            why: unwatched.length === 2
                ? "Neither brew was watched, so there are no figures to compare."
                : "One brew was logged by hand, so there is nothing to compare the pour with."
        };
    }

    const stalls = [subject, reference].filter(stalled);
    if (stalls.length > 0) {
        return {
            verdict: "stalled",
            why: stalls.length === 2
                ? "Both brews stalled, so neither poured to plan."
                : "One brew stalled, so it did not pour to plan."
        };
    }

    const water = Math.abs(subject.waterTotal - reference.waterTotal);
    if (water > COMPARE_WATER_TOLERANCE_ML) {
        return {
            verdict: "differed",
            why: `The brews delivered ${Math.round(water)} ml of water apart.`
        };
    }

    const seconds = Math.abs(
        pourDurationSeconds(subject) - pourDurationSeconds(reference)
    );
    if (seconds > COMPARE_TIME_TOLERANCE_SECONDS) {
        return {
            verdict: "differed",
            why: `The brews poured ${Math.round(seconds)} seconds apart.`
        };
    }

    return {
        verdict: "same",
        why: "Both brews poured the same water on the same schedule."
    };
}

export type PlanDrift = "none" | "detail" | "shape";

/**
 * The plan fields that move the drawn staircase.
 *
 * Exactly the fields `planPoints` in `brewShape.ts` reads: `volume` sets each
 * step's rise, `flowRate` its run through `pourSeconds`, and `pauseTime` the
 * plateau after it. A difference in one of these makes two plans genuinely
 * incomparable on one line.
 *
 * ADDING A FIELD TO `PlanStage`? Decide which list it belongs in. A field in
 * neither is silently ignored by the drift grade, which is how a real
 * difference comes to be presented as none.
 */
const SHAPE_FIELDS = ["volume", "flowRate", "pauseTime"] as const;

/** Changes the coffee without moving the line. */
const DETAIL_FIELDS = ["temperature", "pourPattern", "agitation"] as const;

/**
 * The field name used where the plans have different numbers of stages.
 *
 * Every other entry in `fields` is a key of `PlanStage`. This one is not, and
 * a consumer wording the fields has to say something else about it: no single
 * stage differs, the plans are shaped differently.
 */
export const PLAN_STAGE_COUNT_FIELD = "stages";

export type PlanStageField = keyof PlanStage | typeof PLAN_STAGE_COUNT_FIELD;

function planStageValue(stage: PlanStage, field: keyof PlanStage, index: number): number {
    switch (field) {
        case "flowRate":
        case "pauseTime":
            // Mirrors `poursFromPlan`, so drift grading agrees with the plan
            // line old rows draw after hydration.
            return numeric(stage[field]) ? stage[field] : 0;
        case "pourNumber":
            return numeric(stage.pourNumber) ? stage.pourNumber : index + 1;
        default:
            return stage[field];
    }
}

export function planDrift(
    subject: PlanStage[] | undefined, reference: PlanStage[] | undefined
): {grade: PlanDrift; fields: PlanStageField[]} {
    // A row written before `plan` existed has nothing to disagree with. An
    // absence is not a difference, and grading it as one would banner every
    // old brew in the history with a drift it cannot show.
    if (subject === undefined || reference === undefined) {
        return {grade: "none", fields: []};
    }
    if (subject.length !== reference.length) {
        return {grade: "shape", fields: [PLAN_STAGE_COUNT_FIELD]};
    }

    const fields: PlanStageField[] = [];
    for (const field of [...SHAPE_FIELDS, ...DETAIL_FIELDS]) {
        const differs = subject.some(
            (stage, i) => planStageValue(stage, field, i)
                !== planStageValue(reference[i], field, i)
        );
        if (differs) fields.push(field);
    }

    const shape = fields.some(
        (field) => (SHAPE_FIELDS as readonly PlanStageField[]).includes(field)
    );
    const grade: PlanDrift = shape ? "shape" : fields.length > 0 ? "detail" : "none";
    return {grade, fields};
}

/** One line of the ledger. `shared` means the two brews agree. */
export type CompareRow = {label: string; a: string; b: string; shared: boolean};

export type BrewUnderComparison = {record: StoredBrew; samples: BrewSample[]};

export function hasTrace({record, samples}: BrewUnderComparison): boolean {
    return record.hasStream && samples.length >= 2;
}

export function lastSecond(samples: BrewSample[]): number {
    return samples.reduce(
        (latest, sample) => Math.max(latest, sample.at / 1000),
        0
    );
}

export function planTop(record: StoredBrew): number {
    const points = planPoints(poursFromPlan(record.plan));
    return points.length === 0 ? 0 : points[points.length - 1].v;
}

export type CompareAxis = {
    maxT: number;
    maxV: number;
    /** The larger retained peak flow rate across both brews, or 0 without streams. */
    maxRate: number;
    subjectRate: FlowPoint[];
    referenceRate: FlowPoint[];
    subjectPours: ReturnType<typeof poursFromPlan>;
    referencePours: ReturnType<typeof poursFromPlan>;
    /** Each lane's own recorded pauses; empty where that lane draws no trace. */
    subjectPauses: PauseInterval[];
    referencePauses: PauseInterval[];
};

// A lane with no drawn trace has no band to draw and must not stretch the
// other lane's axis, so its stored intervals stay record metadata only.
function drawnPauses(brew: BrewUnderComparison): PauseInterval[] {
    return hasTrace(brew) ? brew.record.pauseIntervals ?? [] : [];
}

function rateSeriesFor({record, samples}: BrewUnderComparison): FlowPoint[] {
    if (!record.hasStream || samples.length === 0) return [];
    return retrospectiveFlowSeries(samples, record.pours);
}

/**
 * The one axis both brews share.
 *
 * Separate lanes are only honest if one second and one millilitre occupy the
 * same pixels in both. The streams can be long, so the stream extent is found
 * with a reduce rather than by spreading every sample onto the call stack.
 */
export function compareAxis(
    subject: BrewUnderComparison,
    reference: BrewUnderComparison
): CompareAxis {
    const subjectPours = poursFromPlan(subject.record.plan);
    const referencePours = poursFromPlan(reference.record.plan);
    const subjectRate = rateSeriesFor(subject);
    const referenceRate = rateSeriesFor(reference);
    const subjectPauses = drawnPauses(subject);
    const referencePauses = drawnPauses(reference);
    return {
        maxT: Math.max(
            1,
            lastSecond(subject.samples),
            lastSecond(reference.samples),
            plannedSeconds(subjectPours),
            plannedSeconds(referencePours),
            intervalExtent(subjectPauses),
            intervalExtent(referencePauses)
        ),
        maxV: Math.max(
            1,
            subject.record.waterTotal,
            reference.record.waterTotal,
            planTop(subject.record),
            planTop(reference.record)
        ),
        maxRate: Math.max(maxRateOf(subjectRate), maxRateOf(referenceRate)),
        subjectRate,
        referenceRate,
        subjectPours,
        referencePours,
        subjectPauses,
        referencePauses
    };
}

export function planPath(record: StoredBrew, box: Box): string {
    return toPath(planPoints(poursFromPlan(record.plan)), box);
}

export type Comparison = {
    subject: StoredBrew;
    reference: StoredBrew;
    pour: {verdict: PourVerdict; why: string};
    drift: {grade: PlanDrift; fields: PlanStageField[]};
    rows: CompareRow[];
    cupGap: Point[];
    cupGapRuns: Point[][];
};

/** What a row says where a brew never recorded the figure. */
export const NOT_RECORDED = "not recorded";

/**
 * The value of a curve at a whole second, linearly between its samples.
 *
 * Assumes `t` ascends. `livePoints` declines to sort or de-duplicate, on the
 * grounds that the recorder appends in order, and this inherits that: a stream
 * that went backwards would be interpolated against the wrong segment rather
 * than rejected.
 */
function valueAt(points: Point[], t: number): number | null {
    if (points.length === 0) return null;
    if (t < points[0].t || t > points[points.length - 1].t) return null;
    for (let i = 1; i < points.length; i++) {
        if (points[i].t < t) continue;
        const from = points[i - 1];
        const to = points[i];
        const span = to.t - from.t;
        if (span <= 0) return to.v;
        return from.v + ((t - from.t) / span) * (to.v - from.v);
    }
    return points[points.length - 1].v;
}

/**
 * Subject minus reference, on a one second grid.
 *
 * Both streams are already zeroed on the first drop: `livePoints` reads
 * `sample.at` straight, and the recorder writes it relative to `pouringAt`. So
 * there is no alignment to invent, only a common grid to interpolate onto,
 * because two brews do not sample at the same instants.
 *
 * The grid starts at 0 whatever the streams do, so a stream whose first sample
 * arrives late yields a gap that begins at the second it begins, not at 0. The
 * seconds before it are missing rather than zero, which is the truth: nobody
 * knows what the difference was before one of the brews was being watched.
 *
 * It stops where the shorter stream stops. Extrapolating past the end of a
 * brew would draw a gap that grew after one of the brews was over.
 */
export function cupGap(
    subject: BrewSample[], reference: BrewSample[],
    subjectPauses: readonly PauseInterval[] = [],
    referencePauses: readonly PauseInterval[] = []
): Point[] {
    return cupGapRuns(subject, reference, subjectPauses, referencePauses).flat();
}

type ObservedOverlap = {a: Point[]; b: Point[]; from: number; to: number};

function observedOverlaps(
    subject: Point[], reference: Point[],
    subjectPauses: readonly PauseInterval[], referencePauses: readonly PauseInterval[]
): ObservedOverlap[] {
    const overlaps: ObservedOverlap[] = [];
    const subjectRuns = splitAtPauses(subject, subjectPauses);
    const referenceRuns = splitAtPauses(reference, referencePauses);
    for (const a of subjectRuns) {
        if (a.length < 2) continue;
        for (const b of referenceRuns) {
            if (b.length < 2) continue;
            const from = Math.max(a[0].t, b[0].t);
            const to = Math.min(a[a.length - 1].t, b[b.length - 1].t);
            if (to > from) overlaps.push({a, b, from, to});
        }
    }
    return overlaps;
}

/** Separate one-second difference runs; a missing span is never a connecting segment. */
export function cupGapRuns(
    subject: BrewSample[], reference: BrewSample[],
    subjectPauses: readonly PauseInterval[] = [],
    referencePauses: readonly PauseInterval[] = []
): Point[][] {
    return observedOverlaps(
        livePoints(subject, "cup"), livePoints(reference, "cup"), subjectPauses, referencePauses
    ).map(({a, b, from, to}) => {
        const gap: Point[] = [];
        for (let t = Math.ceil(from); t <= Math.floor(to); t++) {
            const here = valueAt(a, t);
            const there = valueAt(b, t);
            if (here !== null && there !== null) {
                gap.push({t, v: Math.round((here - there) * 10) / 10});
            }
        }
        return gap;
    }).filter((run) => run.length > 0);
}

function clipAt(points: Point[], end: number): Point[] {
    if (points.length < 2 || end < points[0].t) return [];
    const clipped: Point[] = [];
    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (point.t < end) {
            clipped.push(point);
            continue;
        }
        if (point.t === end) {
            clipped.push(point);
            return clipped;
        }

        const v = valueAt(points, end);
        if (v === null) return [];
        clipped.push({t: end, v: Math.round(v * 10) / 10});
        return clipped;
    }
    return clipped;
}

/**
 * The polygon between two cup curves, in data coordinates.
 *
 * It runs out along the subject and back along the reference, clipped to the
 * span both streams watched. Past the shorter stream there is no comparison to
 * fill, so this uses the same common-extent rule as `cupGap`.
 */
export function gapBand(subject: Point[], reference: Point[]): Point[] {
    return gapBands(subject, reference)[0] ?? [];
}

function clipSpan(points: Point[], from: number, to: number): Point[] {
    const clipped = clipAt(points, to).filter((point) => point.t >= from);
    if (clipped.length > 0 && clipped[0].t > from) {
        const v = valueAt(points, from);
        if (v !== null) clipped.unshift({t: from, v: Math.round(v * 10) / 10});
    }
    return clipped;
}

/** One closed polygon per shared observed span, never across an automatic gap. */
export function gapBands(
    subject: Point[], reference: Point[],
    subjectPauses: readonly PauseInterval[] = [],
    referencePauses: readonly PauseInterval[] = []
): Point[][] {
    return observedOverlaps(subject, reference, subjectPauses, referencePauses)
        .map(({a, b, from, to}) => [
            ...clipSpan(a, from, to), ...clipSpan(b, from, to).reverse()
        ]);
}

/**
 * What each outcome is called in front of a user.
 *
 * `BrewOutcome` is camelCase because it is a stored value, and a ledger is not
 * the place to show somebody the word `endedOnMachine`. The words live here
 * rather than in `constants/brewCopy.ts` because that module reaches into
 * `library/machine/Machine`, and this one must stay importable by a plain node
 * test. Four words is a cheap price for that.
 */
const OUTCOME_WORD: Record<string, string> = {
    done: "finished",
    endedOnMachine: "ended on the machine",
    cancelled: "cancelled",
    lostContact: "lost contact",
    failed: "failed"
};

type Field = {label: string; read: (record: StoredBrew) => string | null};

/**
 * A figure only a watched brew has.
 *
 * `unobservedBrew` stores zeroes for water, cup and time because there is
 * nowhere else to put "unknown" in a numeric column. Printing those zeroes in
 * a table headed by the user's two brews would state as a fact that a brew
 * they logged by hand delivered no water at all.
 */
function measured(read: (record: StoredBrew) => string | null): Field["read"] {
    return (record) => isMeasured(record) ? read(record) : null;
}

/**
 * The ledger, in the order it is read.
 *
 * What the brew did first, then what it was made with, then what the user
 * thought of it. A row neither brew recorded is dropped; a row one of them
 * recorded is kept, because "this one has a grind and that one does not" is
 * itself a difference worth seeing.
 *
 * POUR rather than TIME, and measured from the first drop, because the history
 * row a user ticks this brew in shows waking to end. Two different numbers
 * under one word would read as a bug; under two words they read as two facts.
 */
const FIELDS: Field[] = [
    {label: "OUTCOME", read: (r) => OUTCOME_WORD[r.outcome] ?? r.outcome},
    {
        label: "POUR",
        read: measured((r) => formatBrewDuration(pourStartMs(r), r.endedAt))
    },
    {label: "WATER", read: measured((r) => `${Math.round(r.waterTotal)} ml`)},
    // Grams, not millilitres. `cupTotal` is a scale reading, and every other
    // surface in the app says so: the history row, the figures block and the
    // handoff envelope all call it grams. Sitting directly under WATER, which
    // really is millilitres, makes this the one row where the wrong unit would
    // be read as a fact rather than a typo.
    {label: "CUP", read: measured((r) => `${Math.round(r.cupTotal)} g`)},
    // Directly under the figures it is read against. How long the bed took to
    // finish is one of the things a person changes a grind to change, so two
    // brews of one recipe with the same water and different drawdowns is the
    // comparison this table exists to make. Floored to whole seconds for the
    // same reason POUR is: a drawdown shown as 23 s at 22.6 is wrong.
    {
        label: "DRAWDOWN",
        read: measured((r) => {
            const seconds = drawdownSeconds(r);
            return seconds === null ? null : `${Math.floor(seconds)} s`;
        })
    },
    {
        label: "BYPASS",
        read: measured(
            (r) => r.bypass === undefined ? null : `${Math.round(r.bypass.delivered)} ml`
        )
    },
    {label: "DOSE", read: (r) => r.dose === undefined ? null : `${r.dose} g`},
    {label: "RATIO", read: (r) => r.ratio === undefined ? null : `1:${r.ratio}`},
    {label: "GRIND", read: (r) => r.grindSize === undefined ? null : String(r.grindSize)},
    {label: "RPM", read: (r) => r.grinderRpm === undefined ? null : String(r.grinderRpm)},
    {label: "RATING", read: (r) => !r.rating ? null : `${r.rating} of 5`},
    {label: "ORIGIN", read: (r) => resolvedOrigin(r) ?? null},
    {label: "ROAST", read: (r) => r.roast ?? null},
    {label: "PROCESS", read: (r) => resolvedProcess(r) ?? null},
    {label: "FERMENT", read: (r) => r.fermentation ?? null},
    {
        label: "TAGS",
        read: (r) => (r.tags ?? []).length === 0 ? null : (r.tags ?? []).join(", ")
    }
];

function ledger(subject: StoredBrew, reference: StoredBrew): CompareRow[] {
    const rows: CompareRow[] = [];
    for (const {label, read} of FIELDS) {
        const a = read(subject);
        const b = read(reference);
        if (a === null && b === null) continue;
        rows.push({
            label,
            a: a ?? NOT_RECORDED,
            b: b ?? NOT_RECORDED,
            shared: a !== null && a === b
        });
    }
    return rows;
}

/** The whole comparison, computed once, for the screen to lay out. */
export function compareBrews(
    subject: BrewUnderComparison, reference: BrewUnderComparison
): Comparison {
    const gapRuns = cupGapRuns(
        hasTrace(subject) ? subject.samples : [],
        hasTrace(reference) ? reference.samples : [],
        drawnPauses(subject), drawnPauses(reference)
    );
    return {
        subject: subject.record,
        reference: reference.record,
        pour: pourVerdict(subject.record, reference.record),
        drift: planDrift(subject.record.plan, reference.record.plan),
        rows: ledger(subject.record, reference.record),
        cupGap: gapRuns.flat(),
        cupGapRuns: gapRuns
    };
}
