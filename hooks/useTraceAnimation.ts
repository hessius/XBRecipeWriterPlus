import {useEffect, useState} from "react";

import {ATTRACT, useReducedMotion} from "@/constants/motion";
import {useSetting} from "@/hooks/useSetting";
import {EDGE_EPSILON, flickerMsFor, grindEdgeElapsed, msToNextGrindEdge} from "@/library/brew/grindFlicker";

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
        // as calm. Opacity is deliberately untouched. The nudge is what keeps
        // an elapsed sitting exactly on an edge -- every reading the hook
        // publishes is a multiple of `half` -- from floating just under its own
        // multiple and reading a half-beat behind.
        const on = Math.floor(elapsedMs / flickerMsFor(grindRpm) + EDGE_EPSILON) % 2 === 0;
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

        // The grind flickers as a square wave, and a square wave has nothing to
        // say between its edges. So rather than sample it on a clock and
        // discover each edge a frame or two late -- which quantises every half
        // of the wave to a multiple of the sample period and makes the flicker
        // drift faster then slower on a beat -- the reading is *scheduled*:
        // a self-correcting `setTimeout` aimed at the next true edge, re-armed
        // from the wall clock on each fire so lateness never accumulates. That
        // toggles at one exact rate and wakes the JS thread only at the edges,
        // not sixty times a second to redraw the same thing. `grindEdgeElapsed`
        // holds the published reading on the multiple of `half` it just crossed
        // so React still bails out of re-rendering between edges.
        if (phase === "grinding") {
            const half = flickerMsFor(grindRpm);
            let timer: ReturnType<typeof setTimeout>;
            const arm = () => {
                const ms = Date.now() - start;
                const elapsed = grindEdgeElapsed(ms, half);
                setTicked((prev) => prev !== null && prev.phase === phase && prev.elapsed === elapsed
                    ? prev
                    : {phase, elapsed});
                timer = setTimeout(arm, msToNextGrindEdge(ms, half));
            };
            timer = setTimeout(arm, msToNextGrindEdge(0, half));
            return () => clearTimeout(timer);
        }

        // A breath and a send are smooth ramps, not a wave with edges, so they
        // legitimately want a steady clock and every tick of it draws something
        // new. `pouring` is excluded above: it is the longest phase and draws
        // the same thing at every millisecond, so a timer through it would
        // repaint several hundred points twenty times a second, for minutes,
        // to no visible effect.
        const tick = setInterval(() => setTicked((prev) => {
            const elapsed = Date.now() - start;
            return prev !== null && prev.phase === phase && prev.elapsed === elapsed
                ? prev
                : {phase, elapsed};
        }), 50);
        return () => clearInterval(tick);
    }, [phase, animate, grindRpm]);

    return traceAnimationFor(phase, elapsed, animate, grindRpm);
}

export default useTraceAnimation;
