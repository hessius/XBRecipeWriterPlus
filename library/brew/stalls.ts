import type {BrewSample} from "./BrewRecord";

/**
 * One moment the water stopped moving while the plan said it should be
 * pouring.
 *
 * `atMl` is the millilitre the stage had reached when it stopped, which is
 * where the rung draws it; `seconds` is how long it lasted, which is how wide
 * the rung draws it.
 */
export type Stall = {atMl: number; seconds: number};

/** Below this a change in the reading is the scale settling, not a pour. */
export const NOISE_FLOOR_ML = 0.5;

/** Below this a gap is the sample rate, not a stall worth naming. */
const MIN_STALL_SECONDS = 2;

/**
 * How close to its target a stage has to get before flat water counts as the
 * planned rest rather than a stall.
 *
 * The noise floor is the wrong measure here. Half a millilitre is what the
 * scale settles by; it is not what a pour lands within. A stage that asked for
 * 40 ml and delivered 39.4 had its whole rest recorded as one stall -- amber
 * painted over a planned pause, and a lane long enough to shrink every other
 * rung on the ladder, since they share a scale.
 *
 * One millilitre: twice the noise floor, enough to cover a pour that lands a
 * shade under, and deliberately no more. Two millilitres would have taken in
 * the 38-of-40 case that `counts from the total before the stage` records as a
 * genuine stall, and overturning that on no evidence is not this fix's job.
 *
 * Whether 1 ml is the right number is a hardware question, not an arithmetic
 * one. It wants checking against a real brew.
 */
const TARGET_TOLERANCE_ML = 1;

/**
 * The brew total as it stood before `stage` began.
 *
 * `water` is a scale reading for the whole brew, never re-tared between
 * stages, so this is what a stage's own millilitres are counted from. Zero for
 * the first stage, and for any stage with nothing before it.
 *
 * @param stage 1-based, matching `BrewSample.pour`
 */
export function stageOriginMl(samples: BrewSample[], stage: number): number {
    let origin: number | null = null;
    for (const s of samples) if (s.pour < stage) origin = s.water;
    return origin ?? 0;
}

/**
 * The stalls in one stage.
 *
 * A stall is water not moving while the stage still owes millilitres. That
 * last clause is the whole definition: it is what makes a planned pause -- flat
 * water *after* the target is reached -- not a stall, without needing the
 * plan's timings at all. Comparing elapsed time against the plan is what made a
 * planned rest raise a warning that then never cleared.
 *
 * A plateau also has to have been *seen*. Weight frames are event-driven and
 * irregularly spaced, so a three-second gap between two rising readings is the
 * machine not reporting rather than the water standing still, and counting it
 * would find a stall in every stage of every brew.
 *
 * @param samples every sample of the brew; this filters by `pour` itself
 * @param stage   1-based, matching `BrewSample.pour`
 * @param targetMl the stage's planned volume
 */
export function stallsInStage(
    samples: BrewSample[], stage: number, targetMl: number,
    minSeconds: number = MIN_STALL_SECONDS
): Stall[] {
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length === 0) return [];

    const startMl = stageOriginMl(samples, stage);
    const stalls: Stall[] = [];

    const push = (anchorAt: number, anchorMl: number, endAt: number,
                  flatSeen: number): void => {
        const seconds = (endAt - anchorAt) / 1000;
        if (flatSeen > 0 && seconds >= minSeconds) {
            stalls.push({atMl: round1(anchorMl - startMl), seconds: round1(seconds)});
        }
    };

    // `scan` reports each rise as it happens, closing whatever plateau came
    // before it.
    const state = scan(mine, push);

    // A stall that has not ended yet, so the rung can draw it growing. Only
    // while the stage still owes water: flat water at the target is the pause.
    const last = mine[mine.length - 1];
    if (last.water - startMl + TARGET_TOLERANCE_ML < targetMl) {
        push(state.anchorAt, state.anchorMl, last.at, state.flatSeen);
    }

    return stalls;
}

/**
 * Walk a stage's samples, tracking where the water last rose.
 *
 * Shared so that the recorded stalls and the live warning cannot drift apart:
 * `anchorAt`/`anchorMl` are the last reading that counted as movement, and
 * `flatSeen` is how many readings have since sat still — the thing that
 * separates a stall from a quiet radio.
 */
function scan(
    mine: BrewSample[],
    onRise?: (anchorAt: number, anchorMl: number, at: number, flatSeen: number) => void
): {anchorAt: number; anchorMl: number; flatSeen: number} {
    let anchorAt = mine[0].at;
    let anchorMl = mine[0].water;
    let flatSeen = 0;

    for (let i = 1; i < mine.length; i++) {
        const s = mine[i];
        if (s.water - anchorMl > NOISE_FLOOR_ML) {
            onRise?.(anchorAt, anchorMl, s.at, flatSeen);
            anchorAt = s.at;
            anchorMl = s.water;
            flatSeen = 0;
        } else {
            flatSeen++;
        }
    }

    return {anchorAt, anchorMl, flatSeen};
}

/**
 * Whether the stage's most recent reading sits inside a stall that has not
 * ended.
 *
 * The same rule as `stallsInStage`, asked of the present moment, and it has to
 * be: this is what raises the live HOLDING warning, and `stallsInStage` is
 * what draws the amber, so answering them two different ways puts the words
 * and the picture at odds.
 *
 * Notably it is *not* a comparison of the last two samples. Weight frames
 * arrive around ten times a second and a pour runs around 3.2 ml/s, so
 * consecutive readings differ by about 0.32 ml — inside the noise floor. Any
 * adjacent-pair test therefore calls a perfectly healthy pour flat, and the
 * warning latches on for the rest of the stage.
 *
 * @param stage 1-based, matching `BrewSample.pour`
 */
export function stalledNow(
    samples: BrewSample[], stage: number, targetMl: number,
    minSeconds: number = MIN_STALL_SECONDS
): boolean {
    const mine = samples.filter((s) => s.pour === stage);
    if (mine.length < 2) return false;

    const startMl = stageOriginMl(samples, stage);
    const last = mine[mine.length - 1];
    // Flat water at or past the target is the planned rest, not a stall.
    if (last.water - startMl + TARGET_TOLERANCE_ML >= targetMl) return false;

    const {anchorAt, flatSeen} = scan(mine);
    return flatSeen > 0 && (last.at - anchorAt) / 1000 >= minSeconds;
}

/** One decimal. Millilitres arrive from a scale and carry more than they mean. */
function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
