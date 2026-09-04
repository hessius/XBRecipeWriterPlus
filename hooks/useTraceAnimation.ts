import {useEffect, useState} from "react";

import {ATTRACT, useReducedMotion} from "@/constants/motion";
import {useSetting} from "@/hooks/useSetting";
import {flickerMsFor} from "@/library/brew/grindFlicker";

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
const BREATH_MS = ATTRACT.brewBreath;
/** One pass of the travelling head. */
const TRAVEL_MS = ATTRACT.brewTravel;

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
    phase: string, elapsedMs: number, animate: boolean, grindRpm: number
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
        const on = Math.floor(elapsedMs / flickerMsFor(grindRpm)) % 2 === 0;
        return {opacity: 1, warmth: on ? 1 : 0.15, headAt: 1, dashed: true};
    }
    return STILL;
}

/** The only phases whose drawing depends on the clock. */
const MOVING = new Set(["waking", "sending", "grinding"]);

/** The same, with a clock attached. */
export function useTraceAnimation(phase: string, grindRpm: number): TraceAnimation {
    const [animateSetting] = useSetting("animateBrewChart");
    const reduced = useReducedMotion();
    const animate = animateSetting && !reduced;
    // The phase a reading was taken in is kept with it. A new phase starts its
    // own clock, and until its first tick arrives the reading from the previous
    // phase is discarded rather than shown — otherwise the head of a send would
    // open three-quarters of the way along, wherever the breath had got to.
    // Derived here rather than reset from the effect, which the compiler
    // forbids.
    const [ticked, setTicked] = useState<{phase: string; elapsed: number} | null>(null);
    const elapsed = ticked !== null && ticked.phase === phase ? ticked.elapsed : 0;

    useEffect(() => {
        // Only three phases move. `pouring` is the longest of them all and
        // draws the same thing at every millisecond, so a timer through it
        // would re-render a chart of several hundred points, twenty times a
        // second, for minutes, to no visible effect.
        if (!animate || !MOVING.has(phase)) return;
        const start = Date.now();
        // The grind is sampled at frame rate; the other two phases are not.
        // Its half-period is 83 ms at the fastest burr, so the old 50 ms clock
        // would put fewer than two readings in each half of the square wave
        // and the flicker would alias into a stutter -- uneven, but from the
        // sampler rather than from the grinder. A breath and a send are slow
        // ramps and stay on the cheaper clock.
        //
        // The cost is bounded in a way `pouring`'s would not be: a grind is
        // about twenty seconds, which is why it is clocked at all and why
        // `pouring`, which is minutes, is deliberately not.
        const period = phase === "grinding" ? 16 : 50;
        const half = flickerMsFor(grindRpm);
        const tick = setInterval(() => setTicked((prev) => {
            const ms = Date.now() - start;
            // Grinding is sampled far faster than its output changes, so the
            // reading is snapped to the edge of the square wave it drives.
            // Returning the previous object unchanged is what lets React bail
            // out of the render: a fresh literal every 16 ms would re-run the
            // whole screen sixty times a second to draw the same thing five
            // times over.
            const elapsed = phase === "grinding" ? Math.floor(ms / half) * half : ms;
            return prev !== null && prev.phase === phase && prev.elapsed === elapsed
                ? prev
                : {phase, elapsed};
        }), period);
        return () => clearInterval(tick);
    }, [phase, animate, grindRpm]);

    return traceAnimationFor(phase, elapsed, animate, grindRpm);
}

export default useTraceAnimation;
