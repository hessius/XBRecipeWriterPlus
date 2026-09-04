import {useEffect, useState} from "react";
import {AccessibilityInfo} from "react-native";
import {Easing} from "react-native-reanimated";

/**
 * Single source of truth for motion timing.
 *
 * `fast` is feedback, not decoration. `deliberate` is reserved for the two
 * ceremonies — scanning a card and writing one — which are the only moments
 * where the app should feel like it is taking its time. `hold` is not a
 * transition at all: it is how long something rests before it leaves.
 */
export const DURATION = {
    fast:       120,
    base:       240,
    hold:       320,
    deliberate: 400
} as const;

/** Timing curves, for anything the system drives. */
export const EASING = {
    /** Entering. */
    out:   Easing.bezier(0.2, 0.85, 0.3, 1),
    /** Leaving. */
    in:    Easing.bezier(0.7, 0, 0.85, 0.15),
    /** Continuous or looping motion. */
    inOut: Easing.bezier(0.45, 0, 0.25, 1),
    /**
     * Constant speed, for motion with no beginning or end.
     *
     * The three curves above all shape a transition between two resting states,
     * which is what almost everything here is. A marquee and a sweeping
     * highlight are not transitions: they pass through the screen rather than
     * settling on it, and easing one makes it appear to slow down in the middle
     * for no reason the viewer can see. Kept here rather than reached for
     * directly from `react-native-reanimated` so that this module remains the
     * whole answer to "what curves does this app use".
     */
    linear: Easing.linear
} as const;

/**
 * Delays between the parts of one composite animation.
 *
 * Here rather than beside the component that uses it, because this module is
 * the single source of motion timing and a stagger is timing: an icon whose
 * dots light 12 ms apart has to stay in step with everything else if these
 * numbers are ever retuned.
 */
export const STAGGER = {
    /** Between consecutive dots of a `DotIcon` lighting up. */
    dot: 12
} as const;

/**
 * The About screen's attract mode, and any other long-period idle decoration.
 *
 * An order of magnitude longer than everything above, and deliberately so: this
 * is idle decoration that rewards a user for lingering, not feedback on
 * something they did. It lives here anyway, for the same reason `STAGGER` does
 * — this module is the single source of motion timing, and a value that is not
 * in it cannot participate when the app's motion is retuned.
 */
export const ATTRACT = {
    /**
     * How long the About screen must sit untouched before the ticker starts.
     *
     * Long enough that somebody who came to read a version number and leave
     * never meets it.
     */
    tickerDelay: 8000,
    /**
     * Marquee speed, in points per second.
     *
     * A speed rather than a duration, because the phrases differ in length and
     * timing them all the same would run a long one late for its own gap.
     */
    tickerSpeed: 46,
    /**
     * The empty band between one phrase leaving and the next arriving.
     *
     * The pause is what makes each line land as a separate thought. Without it
     * the band is a wall of moving text and none of it gets read.
     */
    tickerGap: 1400,
    /** One full rise and fall of the mark's breath. */
    breath: 2400,
    /** How long the glimmer takes to cross the mark. */
    glimmer: 1100,
    /**
     * How long the mark rests between glimmers.
     *
     * Several times the sweep itself. A shimmer that runs continuously is a
     * loading indicator and the eye stops seeing it; one that arrives now and
     * then is caught in peripheral vision and reads as alive.
     */
    glimmerRest: 4400,
    /** The mark coming apart under a tap, and settling back. */
    tap: 220,
    tapHold: 120,

    /**
     * Brew-chart pre-pour animation timings.
     *
     * These three drive the waking/sending/grinding phases of the trace
     * animation. They are a full order of magnitude longer than UI feedback
     * timings: the chart is passive decoration while the machine is getting
     * ready, not a response to a tap.
     */
    /** One full breath of the waiting trace. Slow enough to read as breathing. */
    brewBreath: 3400,
    /** One pass of the travelling send-head across the trace. */
    brewTravel: 1400,
    /** The grinder's flicker period. Fast and uneven-feeling, which is what grinding is. */
    brewFlicker: 420,

    /**
     * How long the `++` wordmark tint lasts after launch.
     *
     * Long enough to be read once; after that the three characters compete
     * with the recipe list's accents and are better left unsaturated.
     * Once per session, timed from app load.
     */
    wordmarkFadeDelay: 10_000,
    /**
     * The shortest gap between two replays of the wordmark's tint.
     *
     * Without it, a fast scroll up and down strobes the one piece of brand
     * colour in the app, which is the opposite of a nod. An expansion that
     * arrives sooner than this settles to the muted `++` without replaying,
     * silently.
     *
     * A judgement, not a measurement, and here rather than in the component so
     * it is tunable in the one place motion is tuned.
     */
    wordmarkReplayFloor: 2000,
    /**
     * How long the replayed tint holds at full before falling away.
     *
     * The launch tint holds for ten seconds because it is being read. This one
     * is being noticed, which takes less.
     */
    wordmarkReplayHold: 600
} as const;

/** Spring configs, for anything a finger drives. */export const SPRING = {
    /** Cards, sheets, anything with weight. */
    gentle: {damping: 20, stiffness: 160, mass: 1},
    /** Toggles and small controls. */
    snappy: {damping: 22, stiffness: 300, mass: 0.8}
} as const;

/**
 * Whether the OS has Reduce Motion enabled.
 *
 * Every animation in the app honours this by degrading to a cross-fade — never
 * to nothing. A user who has disabled motion must still see that something
 * changed.
 */

/**
 * Last known value, shared by every hook instance.
 *
 * There is no synchronous accessor for this setting, so the first read is always
 * asynchronous and a hook necessarily starts at some assumed value. Seeding from
 * a cache means only the very first instance in the app's lifetime can be wrong,
 * rather than every mount: without it, a component that animates on mount would
 * start its full animation and then snap into the cross-fade a frame later,
 * which is worse for a Reduce Motion user than either path alone.
 */
let cachedReducedMotion = false;

export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(cachedReducedMotion);

    useEffect(() => {
        let cancelled = false;
        let superseded = false;

        const apply = (enabled: boolean) => {
            cachedReducedMotion = enabled;
            if (!cancelled) {
                setReduced(enabled);
            }
        };

        // Subscribe before the initial read, not after. The read crosses to
        // native, so the user can flip the switch while it is in flight; if that
        // happens the event carries the newer value and the resolving promise
        // must not overwrite it. Last writer would otherwise win over last value.
        const subscription = AccessibilityInfo.addEventListener(
            "reduceMotionChanged",
            (enabled) => {
                superseded = true;
                apply(enabled);
            }
        );

        // Reading an OS accessibility setting: an external system, which is what
        // effects are for.
        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => {
                if (!superseded) {
                    apply(enabled);
                }
            })
            .catch(() => {
                // An unavailable setting is not a reason to fail. Assume motion is
                // fine. No state is written here, so `cancelled` has nothing to
                // guard.
            });

        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);

    return reduced;
}
