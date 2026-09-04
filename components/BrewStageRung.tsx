import React from "react";
import {View} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern} from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {pauseSeconds} from "@/library/brew/brewShape";
import {rungSegments, type Segment} from "@/library/brew/rungGeometry";
import type {Stall} from "@/library/brew/stalls";
import type Pour from "@/library/Pour";

/**
 * Where a stage stands.
 *
 * `active` covers both pouring and resting; which one it is follows from
 * whether the water is still owed, so a caller cannot get the two out of step
 * with the numbers it is passing.
 */
export type RungState = "done" | "active" | "pending";

type Props = {
    pour: Pour;
    /** Zero-based; the rung numbers itself from one. */
    index: number;
    state: RungState;
    accent: string;
    /** The longest stage in the recipe, stalls included. Shared, or the lane means nothing. */
    laneSeconds: number;
    /** The elastic bar height. Between 9 and 15; the ladder decides. */
    barHeight: number;
    /** Millilitres delivered in this stage. */
    delivered: number;
    /** Seconds into the planned rest. */
    pauseElapsed: number;
    stalls: Stall[];
    testID?: string;
};

/** The dimmed opacity of a stage that has not happened. */
const PENDING_OPACITY = 0.45;

/** One spoken sentence for a rung, for VoiceOver / TalkBack. */
function buildLabel(pour: Pour, index: number, stalls: Stall[]): string {
    const stage = `Stage ${String(index + 1).padStart(2, "0")}`;
    const kind = glyphForPattern(pour.pourPattern);
    const pattern = kind === "agitation" ? "agitation"
        : kind === "centered" ? "centred pour"
        : `${kind} pour`;
    const temp = `${Math.max(pour.temperature, 0)} degrees`;
    const vol = `${Math.max(pour.volume, 0)} millilitres`;
    const pauseSec = Math.round(pauseSeconds(pour));
    const pause = pauseSec > 0 ? `, then ${pauseSec} seconds pause` : "";

    const before = pour.getAgitationBefore();
    const after = pour.getAgitationAfter();
    let agitation = "";
    if (before && after) agitation = ", agitates before and after";
    else if (before) agitation = ", agitates before";
    else if (after) agitation = ", agitates after";

    let held = "";
    if (stalls.length === 1) {
        held = `, held once, ${Math.round(stalls[0].seconds)} seconds`;
    } else if (stalls.length > 1) {
        const total = Math.round(stalls.reduce((sum, s) => sum + s.seconds, 0));
        held = `, held ${stalls.length} times, ${total} seconds in all`;
    }

    return `${stage}, ${pattern}, ${temp}, ${vol}${pause}${agitation}${held}`;
}

/** The colour a segment's filled part takes. */
function fillColour(kind: Segment["kind"], accent: string, done: boolean): string {
    if (kind === "stall") return palette.warn;
    return done ? palette.muted : accent;
}

/** `41/70 ml` while pouring, `14 s left` while resting. */
function readout(pour: Pour, delivered: number, pauseElapsed: number): string {
    const target = Math.max(pour.volume, 0);
    const rest = pauseSeconds(pour);
    if (delivered >= target && rest > 0) {
        return `${Math.max(0, Math.round(rest - pauseElapsed))} s left`;
    }
    return `${Math.round(delivered)}/${target} ml`;
}

/**
 * One stage, as a lane.
 *
 * The lane is `flex: 1` and takes the whole row: it was a hard-coded 120 pt,
 * which is what left a four-stage brew mostly black. Its pieces are sized in
 * seconds on a scale shared with every other rung, so a stage that stalled
 * sticks out past its neighbours by exactly the time it lost.
 */
export default function BrewStageRung({
    pour, index, state, accent, laneSeconds, barHeight, delivered, pauseElapsed,
    stalls, testID
}: Props) {
    const segments = rungSegments({pour, delivered, pauseElapsed, stalls});
    const span = laneSeconds > 0 ? laneSeconds : 1;
    const used = segments.reduce((sum, s) => sum + s.seconds, 0);
    // The slack is the difference between this stage and the longest one. It
    // is a real, empty part of the lane: a short stage should look short.
    const slack = Math.max(0, span - used);
    const done = state === "done";
    const radius = barHeight / 2;

    return (
        <XStack
            testID={testID}
            accessibilityLabel={buildLabel(pour, index, stalls)}
            accessible
            alignItems="center"
            gap="$2"
            style={{opacity: state === "pending" ? PENDING_OPACITY : 1}}
        >
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                           color={state === "active" ? accent : palette.dim}>
                {String(index + 1).padStart(2, "0")}
            </DotMatrixText>

            <PourGlyph
                kind={glyphForPattern(pour.pourPattern)}
                accent={state === "active" ? accent : palette.dim}
                size={14}
            />

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {`${Math.max(pour.temperature, 0)}°`}
            </DotMatrixText>

            <XStack testID="rung-lane" style={{flex: 1}} height={barHeight}
                    alignItems="center">
                {segments.map((segment, i) => (
                    <View
                        key={`segment-${i}`}
                        testID={`segment-${i}`}
                        style={{
                            flex: Math.max(segment.seconds, 0.001),
                            height: barHeight,
                            borderRadius: radius,
                            borderWidth: segment.kind === "pause" ? 1 : 0,
                            borderStyle: segment.kind === "pause" ? "dashed" : "solid",
                            borderColor: palette.line,
                            backgroundColor: segment.kind === "stall"
                                ? palette.warn
                                : palette.raised,
                            overflow: "hidden",
                            flexDirection: "row"
                        }}
                    >
                        <View
                            testID={`segment-fill-${i}`}
                            style={{
                                flex: Math.max(0, Math.min(1, segment.fill)),
                                height: barHeight,
                                borderRadius: radius,
                                backgroundColor: fillColour(segment.kind, accent, done)
                            }}
                        />
                        <View style={{flex: 1 - Math.max(0, Math.min(1, segment.fill))}} />
                    </View>
                ))}
                {slack > 0 && <View testID="rung-slack" style={{flex: slack}} />}
            </XStack>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {state === "pending"
                    ? `${Math.max(pour.volume, 0)} ml`
                    : readout(pour, delivered, pauseElapsed)}
            </DotMatrixText>
        </XStack>
    );
}
