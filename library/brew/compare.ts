import type {StoredBrew} from "@/library/BrewDatabase";

import type {BrewSample, PlanStage} from "./BrewRecord";
import {countsAsBrewed} from "./brewPopulation";
import {livePoints, type Point} from "./brewShape";

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
 * Six times the scale's 0.5 ml noise floor. Whether it is the right number is
 * a hardware question rather than an arithmetic one, exactly as
 * `TARGET_TOLERANCE_ML` in `stalls.ts` says of its own figure. It wants
 * checking against two real brews of one recipe.
 */
export const COMPARE_WATER_TOLERANCE_ML = 3;

/** The same disclaimer, for the clock. */
export const COMPARE_TIME_TOLERANCE_SECONDS = 5;

export type PourVerdict = "same" | "stalled" | "differed" | "incomplete";

/**
 * How long the pour took.
 *
 * From the first drop, not from waking: grinding is not pouring, and a brew
 * that ground for a minute longer poured no differently. The same fallback the
 * record screen uses, for rows written before `pouringAt` existed.
 */
export function pourDurationSeconds(record: StoredBrew): number {
    const pouringAt = record.pouringAt;
    const pouredFrom = typeof pouringAt === "number" && pouringAt > 0
        ? pouringAt
        : record.startedAt;
    return Math.max(0, (record.endedAt - pouredFrom) / 1000);
}

function stalled(record: StoredBrew): boolean {
    return (record.stalls ?? []).some((stage) => stage.length > 0);
}

/**
 * Whether the two brews poured alike, and what to say about it.
 *
 * The order of the tests is the point. A brew that stopped is not a brew that
 * differed, and saying "these differed by 90 ml" about a cancelled brew is
 * true and useless. A stall is likewise its own answer rather than a cause of
 * a difference in the totals.
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
            why: `One brew poured for ${Math.round(seconds)} seconds longer.`
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

export function planDrift(
    subject: PlanStage[] | undefined, reference: PlanStage[] | undefined
): {grade: PlanDrift; fields: string[]} {
    if (subject === undefined || reference === undefined) {
        return {grade: "none", fields: []};
    }
    if (subject.length !== reference.length) {
        return {grade: "shape", fields: ["stages"]};
    }

    const fields: string[] = [];
    for (const field of [...SHAPE_FIELDS, ...DETAIL_FIELDS]) {
        const differs = subject.some((stage, i) => stage[field] !== reference[i][field]);
        if (differs) fields.push(field);
    }

    const shape = fields.some(
        (field) => (SHAPE_FIELDS as readonly string[]).includes(field)
    );
    const grade: PlanDrift = shape ? "shape" : fields.length > 0 ? "detail" : "none";
    return {grade, fields};
}

/** One line of the ledger. `shared` means the two brews agree. */
export type CompareRow = {label: string; a: string; b: string; shared: boolean};

export type BrewUnderComparison = {record: StoredBrew; samples: BrewSample[]};

export type Comparison = {
    subject: StoredBrew;
    reference: StoredBrew;
    pour: {verdict: PourVerdict; why: string};
    drift: {grade: PlanDrift; fields: string[]};
    rows: CompareRow[];
    cupGap: Point[];
};

/** What a row says where a brew never recorded the figure. */
export const NOT_RECORDED = "not recorded";

/** The value of a curve at a whole second, linearly between its samples. */
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
 * It stops where the shorter stream stops. Extrapolating past the end of a
 * brew would draw a gap that grew after one of the brews was over.
 */
export function cupGap(subject: BrewSample[], reference: BrewSample[]): Point[] {
    const a = livePoints(subject, "cup");
    const b = livePoints(reference, "cup");
    if (a.length < 2 || b.length < 2) return [];
    const end = Math.floor(Math.min(a[a.length - 1].t, b[b.length - 1].t));
    const gap: Point[] = [];
    for (let t = 0; t <= end; t++) {
        const here = valueAt(a, t);
        const there = valueAt(b, t);
        if (here === null || there === null) continue;
        gap.push({t, v: Math.round((here - there) * 10) / 10});
    }
    return gap;
}

/** `2:06`. Floored, as everywhere else: 2:07 at 2:06.6 is wrong. */
function clock(seconds: number): string {
    const whole = Math.floor(Math.max(0, seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

type Field = {label: string; read: (record: StoredBrew) => string | null};

/**
 * The ledger, in the order it is read.
 *
 * What the brew did first, then what it was made with, then what the user
 * thought of it. A row neither brew recorded is dropped; a row one of them
 * recorded is kept, because "this one has a grind and that one does not" is
 * itself a difference worth seeing.
 */
const FIELDS: Field[] = [
    {label: "OUTCOME", read: (r) => r.outcome},
    {label: "TIME", read: (r) => clock(pourDurationSeconds(r))},
    {label: "WATER", read: (r) => `${Math.round(r.waterTotal)} ml`},
    {label: "CUP", read: (r) => `${Math.round(r.cupTotal)} ml`},
    {
        label: "BYPASS",
        read: (r) => r.bypass === undefined ? null : `${Math.round(r.bypass.delivered)} ml`
    },
    {label: "DOSE", read: (r) => r.dose === undefined ? null : `${r.dose} g`},
    {label: "RATIO", read: (r) => r.ratio === undefined ? null : `1:${r.ratio}`},
    {label: "GRIND", read: (r) => r.grindSize === undefined ? null : String(r.grindSize)},
    {label: "RPM", read: (r) => r.grinderRpm === undefined ? null : String(r.grinderRpm)},
    {label: "RATING", read: (r) => !r.rating ? null : `${r.rating} of 5`},
    {label: "ORIGIN", read: (r) => r.origin ?? null},
    {label: "ROAST", read: (r) => r.roast ?? null},
    {label: "PROCESS", read: (r) => r.process ?? null},
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
    return {
        subject: subject.record,
        reference: reference.record,
        pour: pourVerdict(subject.record, reference.record),
        drift: planDrift(subject.record.plan, reference.record.plan),
        rows: ledger(subject.record, reference.record),
        cupGap: cupGap(subject.samples, reference.samples)
    };
}
