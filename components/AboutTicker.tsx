import React, {useEffect, useState} from "react";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {useReducedMotion} from "@/constants/motion";

/** Long enough that nobody reading the screen meets it by accident. */
const DEFAULT_DELAY_MS = 8000;
const LINE_MS = 4200;

type Props = {
    lines: readonly string[];
    /** Overridable so a test does not have to know the production value. */
    delayMs?: number;
};

/**
 * An attract mode.
 *
 * Nothing at all until the screen has been open and untouched for several
 * seconds, then a dot-matrix line cycling underneath the mark, in the register
 * of a 90s crack intro. Idling into a scroller is what that era actually did,
 * and it makes the flourish a reward for lingering rather than a novelty that
 * greets everyone who came to check a version number.
 *
 * Under Reduce Motion it does not start at all. A slower attract mode is still
 * an attract mode, and a user who asked for less movement did not ask for a
 * gentler version of the movement.
 */
export default function AboutTicker({lines, delayMs = DEFAULT_DELAY_MS}: Props) {
    const reduced = useReducedMotion();
    const [started, setStarted] = useState(false);
    const [index, setIndex] = useState(0);
    const silent = reduced || lines.length === 0;

    useEffect(() => {
        if (silent) return;
        const timer = setTimeout(() => setStarted(true), delayMs);
        return () => clearTimeout(timer);
    }, [silent, delayMs]);

    useEffect(() => {
        if (!started || silent) return;
        const timer = setInterval(
            () => setIndex((current) => (current + 1) % lines.length),
            LINE_MS
        );
        return () => clearInterval(timer);
    }, [started, silent, lines.length]);

    if (!started || silent) return null;

    return (
        <DotMatrixText testID="about-ticker" fontSize={11} weight="bold"
                       letterSpacing={2} color={palette.muted}>
            {lines[index % lines.length].toUpperCase()}
        </DotMatrixText>
    );
}
