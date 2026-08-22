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
    inOut: Easing.bezier(0.45, 0, 0.25, 1)
} as const;

/** Spring configs, for anything a finger drives. */
export const SPRING = {
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
