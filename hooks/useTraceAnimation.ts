import {useEffect, useState} from "react";

import {useReducedMotion} from "@/constants/motion";
import {useSetting} from "@/hooks/useSetting";

export type TraceAnimation = {
    /** Multiplier on the plan's stroke opacity. */
    opacity: number;
    /** 0 = the plan's grey, 1 = the recipe's accent. */
    warmth: number;
    /** How far along the curve the lit head has travelled, 0 to 1. */
    headAt: number;
    /** False once the recipe is in the machine and the dashes have fused. */
    dashed: boolean;
};

/** A full breath. Slow enough to read as breathing rather than as blinking. */
const BREATH_MS = 3400;
/** One pass of the travelling head. */
const TRAVEL_MS = 1400;
/** The grinder's flicker. Fast and uneven-feeling, which is what grinding is. */
const FLICKER_MS = 420;

const STILL: TraceAnimation = {opacity: 1, warmth: 0, headAt: 1, dashed: true};

/**
 * What the plan should look like, given a phase and a clock.
 *
 * A pure function of two numbers, so the whole of the milestone's motion design
 * is testable without a frame clock or a mock of Reanimated. The hook below
 * only supplies the clock.
 *
 * With motion off, each phase holds its **end** state rather than disappearing:
 * a screen showing no status at all is worse than one showing a still one.
 */
export function traceAnimationFor(
    phase: string, elapsedMs: number, animate: boolean
): TraceAnimation {
    if (phase === "readyToStart") return {...STILL, dashed: false};
    if (!animate) {
        if (phase === "waking") return STILL;
        if (phase === "sending") return {...STILL, headAt: 1};
        if (phase === "grinding") return {...STILL, warmth: 1};
        return STILL;
    }
    if (phase === "waking") {
        // A raised cosine: 0 at the trough, 1 at the peak, and no corner at
        // either end the way a triangle wave has.
        const breath = (1 - Math.cos((elapsedMs / BREATH_MS) * 2 * Math.PI)) / 2;
        return {opacity: 0.45 + 0.55 * breath, warmth: breath * 0.6, headAt: 1, dashed: true};
    }
    if (phase === "sending") {
        return {opacity: 1, warmth: 0.4, headAt: (elapsedMs % TRAVEL_MS) / TRAVEL_MS,
                dashed: true};
    }
    if (phase === "grinding") {
        // A square wave, not a sine: grinding is loud, and a smooth fade reads
        // as calm. Opacity is deliberately untouched.
        const on = Math.floor(elapsedMs / FLICKER_MS) % 2 === 0;
        return {opacity: 1, warmth: on ? 1 : 0.15, headAt: 1, dashed: true};
    }
    return STILL;
}

/** The same, with a clock attached. */
export function useTraceAnimation(phase: string): TraceAnimation {
    const [animateSetting] = useSetting("animateBrewChart");
    const reduced = useReducedMotion();
    const animate = animateSetting && !reduced;
    // elapsed is updated exclusively inside the interval callback (not
    // synchronously in the effect body), which keeps both lint rules happy.
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!animate) return;
        // Capture the phase-start timestamp inside the effect so the interval
        // callback can derive elapsed without any ref reads during render.
        const start = Date.now();
        // 50 ms is twelve steps of the grinder's flicker and eighty of a
        // breath, which is smooth for an opacity ramp and a fraction of the
        // work of a per-frame driver for a line that is barely moving.
        const tick = setInterval(() => setElapsed(Date.now() - start), 50);
        return () => clearInterval(tick);
    }, [phase, animate]);

    return traceAnimationFor(phase, elapsed, animate);
}

export default useTraceAnimation;
