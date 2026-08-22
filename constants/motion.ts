import {useEffect, useState} from "react";
import {AccessibilityInfo} from "react-native";
import {Easing} from "react-native-reanimated";

/**
 * Single source of truth for motion timing.
 *
 * `fast` is feedback, not decoration. `deliberate` is reserved for the two
 * ceremonies — scanning a card and writing one — which are the only moments
 * where the app should feel like it is taking its time.
 */
export const DURATION = {
    fast:       120,
    base:       240,
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
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        let cancelled = false;

        // Reading an OS accessibility setting: an external system, which is what
        // effects are for.
        AccessibilityInfo.isReduceMotionEnabled()
            .then((enabled) => {
                if (!cancelled) {
                    setReduced(enabled);
                }
            })
            .catch(() => {
                // An unavailable setting is not a reason to fail. Assume motion is fine.
            });

        const subscription = AccessibilityInfo.addEventListener(
            "reduceMotionChanged",
            setReduced
        );

        return () => {
            cancelled = true;
            subscription.remove();
        };
    }, []);

    return reduced;
}
