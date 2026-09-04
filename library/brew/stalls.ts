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

    const startMl = mine[0].water;
    const stalls: Stall[] = [];

    // Where the water last rose, and whether we have since seen it sitting
    // still. `flatSeen` is what separates a stall from a quiet radio.
    let anchorAt = mine[0].at;
    let anchorMl = mine[0].water;
    let flatSeen = 0;

    const close = (endAt: number): void => {
        const seconds = (endAt - anchorAt) / 1000;
        if (flatSeen > 0 && seconds >= minSeconds) {
            stalls.push({atMl: round1(anchorMl - startMl), seconds: round1(seconds)});
        }
    };

    for (let i = 1; i < mine.length; i++) {
        const s = mine[i];
        if (s.water - anchorMl > NOISE_FLOOR_ML) {
            close(s.at);
            anchorAt = s.at;
            anchorMl = s.water;
            flatSeen = 0;
        } else {
            flatSeen++;
        }
    }

    // A stall that has not ended yet, so the rung can draw it growing. Only
    // while the stage still owes water: flat water at the target is the pause.
    const last = mine[mine.length - 1];
    if (last.water - startMl + NOISE_FLOOR_ML < targetMl) close(last.at);

    return stalls;
}

/** One decimal. Millilitres arrive from a scale and carry more than they mean. */
function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
