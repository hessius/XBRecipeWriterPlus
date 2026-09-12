import React from "react";
import {View} from "react-native";
import Svg, {Path} from "react-native-svg";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern} from "@/components/PourGlyph";
import HatchFill from "@/components/HatchFill";
import {mix, palette} from "@/constants/colors";
import {pauseSeconds} from "@/library/brew/brewShape";
import {rungSegments, seamIndex, type Segment} from "@/library/brew/rungGeometry";
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
    /**
     * Marks this rung as the one whose detail is open.
     *
     * Drawn as a tint on the rung's own row rather than by changing the bar's
     * colour: the bar's colour already carries state (done, active, pending)
     * and stalls, and overloading it would make a selected pending stage
     * indistinguishable from an active one.
     */
    selected?: boolean;
    /** Absent on a rung that is not selectable — the live screen's, and the export's. */
    onPress?: () => void;
    testID?: string;
};

/** The dimmed opacity of a stage that has not happened. */
const PENDING_OPACITY = 0.45;

/**
 * The space between one segment and the next.
 *
 * Water and wait were previously flush, and with the wait filled in the same
 * solid accent they read as one undifferentiated bar. The gap is taken out of
 * the lane rather than out of the shared time scale: every segment loses the
 * same 3 pt, so their widths stay proportional to their seconds.
 */
export const SEGMENT_GAP = 3;

export const AGITATION_WIDTH = 11;
const AGITATION_VIEWBOX_HEIGHT = 14;
const AGITATION_PATH = "M5.5 0 C1 2 10 4.5 5.5 7 C1 9.5 10 12 5.5 14";

/**
 * One agitation mark: a compact wave in the lane's own flow.
 *
 * It owns its whole slot, 11 points wide, so the wave never changes the rung's
 * height and never hangs over the lane's top or bottom edge.
 */
function AgitationMark({colour, barHeight, testID}:
                       {colour: string; barHeight: number; testID: string}) {
    return (
        <View
            testID={testID}
            pointerEvents="none"
            style={{
                width: AGITATION_WIDTH,
                height: barHeight,
                alignItems: "center",
                justifyContent: "center"
            }}
        >
            <Svg
                testID={`${testID}-wave`}
                width={AGITATION_WIDTH}
                height={barHeight}
                viewBox={`0 0 ${AGITATION_WIDTH} ${AGITATION_VIEWBOX_HEIGHT}`}
                preserveAspectRatio="none"
            >
                <Path
                    testID={`${testID}-path`}
                    d={AGITATION_PATH}
                    fill="none"
                    stroke={colour}
                    strokeWidth={2}
                    strokeLinecap="round"
                />
            </Svg>
        </View>
    );
}

/** How far a faint stripe is mixed back toward the background. */
const HATCH_DIM = 0.62;

/** One spoken sentence for a rung, for VoiceOver / TalkBack. */
function buildLabel(
    pour: Pour, index: number, stalls: Stall[], before: boolean, after: boolean
): string {
    const stage = `Stage ${String(index + 1).padStart(2, "0")}`;
    const kind = glyphForPattern(pour.pourPattern);
    const pattern = kind === "agitation" ? "agitation"
        : kind === "centered" ? "centred pour"
        : `${kind} pour`;
    const temp = `${Math.max(pour.temperature, 0)} degrees`;
    const vol = `${Math.max(pour.volume, 0)} millilitres`;
    const pauseSec = Math.round(pauseSeconds(pour));
    const pause = pauseSec > 0 ? `, then ${pauseSec} seconds pause` : "";

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

/**
 * The two stripe colours for a wait.
 *
 * Faint across the whole wait from the moment the ladder is drawn, so the rests
 * in a recipe are visible before it runs and the ladder reads as a plan and not
 * only as a progress bar; accent over the part that has elapsed.
 */
function hatchColours(accent: string, done: boolean): {dim: string; bright: string} {
    const bright = done ? palette.muted : accent;
    return {dim: mix(bright, palette.base, HATCH_DIM), bright};
}

/**
 * `41/70 ml` while pouring, `14 s left` while resting, `70/70 ml` once done.
 *
 * The countdown belongs to the active stage alone. A done stage is handed a
 * `pauseElapsed` of 0 — the ladder only tracks it for the active index — so
 * without the state in hand this read the full rest back out as time
 * remaining, on every finished rung, forever.
 */
function readout(
    pour: Pour, delivered: number, pauseElapsed: number, state: RungState
): string {
    const target = Math.max(pour.volume, 0);
    const rest = pauseSeconds(pour);
    if (state === "active" && delivered >= target && rest > 0) {
        return `${Math.max(0, Math.round(rest - pauseElapsed))} s left`;
    }
    return `${Math.round(delivered)}/${target} ml`;
}

/**
 * The longest reading this rung will ever show.
 *
 * The lane beside the readout is `flex: 1`, so anything the readout does to its
 * own width moves the lane's edge -- and the readout's text changes on nearly
 * every frame. Reserving the widest form and drawing the current one over it
 * holds the lane still, without depending on the font's metrics.
 */
function widestReadout(pour: Pour): string {
    const target = Math.max(pour.volume, 0);
    const rest = Math.round(pauseSeconds(pour));
    const forms = [`${target} ml`, `${target}/${target} ml`];
    if (rest > 0) forms.push(`${rest} s left`);
    return forms.reduce((a, b) => (b.length > a.length ? b : a));
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
    stalls, selected = false, onPress, testID
}: Props) {
    const segments = rungSegments({pour, delivered, pauseElapsed, stalls});
    const span = laneSeconds > 0 ? laneSeconds : 1;
    const used = segments.reduce((sum, s) => sum + s.seconds, 0);
    // The slack is the difference between this stage and the longest one. It
    // is a real, empty part of the lane: a short stage should look short.
    const slack = Math.max(0, span - used);
    const done = state === "done";
    const radius = barHeight / 2;
    const before = pour.getAgitationBefore();
    const after = pour.getAgitationAfter();
    const markColour = done ? palette.muted : accent;
    // Which gap the after-mark lives in. A stage with no rest has no seam
    // inside the lane, so its mark goes in a gap added past the last segment —
    // and a lane whose very first segment is the rest (a stage that pours no
    // water at all) has no gap before it, so the mark falls back to the head of
    // the lane, which is the same instant.
    const seam = seamIndex(segments);
    const tailMark = after && seam >= segments.length;
    const leadMark = before ? "rung-agitation-before"
                   : after && seam === 0 ? "rung-agitation-after"
                   : null;

    return (
        <XStack
            testID={testID}
            accessibilityLabel={buildLabel(pour, index, stalls, before, after)}
            accessible
            accessibilityRole={onPress ? "button" : undefined}
            accessibilityState={onPress ? {selected} : undefined}
            onPress={onPress}
            alignItems="center"
            gap="$2"
            paddingHorizontal="$2"
            marginHorizontal="$-2"
            borderRadius="$3"
            backgroundColor={selected ? palette.raised : "transparent"}
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
                {leadMark && (
                    <AgitationMark colour={markColour} barHeight={barHeight}
                                   testID={leadMark} />
                )}
                {segments.map((segment, i) => {
                    const fraction = Math.max(0, Math.min(1, segment.fill));
                    const hatch = hatchColours(accent, done);
                    return (
                        <React.Fragment key={`segment-${i}`}>
                        {i > 0 && (
                            after && seam === i
                                ? <AgitationMark colour={markColour} barHeight={barHeight}
                                                 testID="rung-agitation-after" />
                                : <View testID={`gap-${i}`}
                                        style={{width: SEGMENT_GAP, height: barHeight}} />
                        )}
                        <View
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
                            {segment.kind === "pause" ? (
                                <HatchFill
                                    testID={`segment-hatch-${i}`}
                                    dim={hatch.dim}
                                    bright={hatch.bright}
                                    fill={fraction}
                                    height={barHeight}
                                />
                            ) : (
                                <>
                                    <View
                                        testID={`segment-fill-${i}`}
                                        style={{
                                            flex: fraction,
                                            height: barHeight,
                                            borderRadius: radius,
                                            backgroundColor: fillColour(segment.kind, accent, done)
                                        }}
                                    />
                                    <View style={{flex: 1 - fraction}} />
                                </>
                            )}
                        </View>
                        </React.Fragment>
                    );
                })}
                {tailMark && (
                    <AgitationMark colour={markColour} barHeight={barHeight}
                                   testID="rung-agitation-after" />
                )}
                {slack > 0 && <View testID="rung-slack" style={{flex: slack}} />}
            </XStack>

            <View>
                {/* Reserves the width; never read. The rung is one accessible
                    element with its own label, so this is not announced. */}
                <DotMatrixText testID="rung-readout-reserve" fontSize={12}
                               weight="bold" color={palette.dim}
                               style={{opacity: 0}}>
                    {widestReadout(pour)}
                </DotMatrixText>
                <View style={{
                    position: "absolute", top: 0, bottom: 0, right: 0,
                    justifyContent: "center"
                }}>
                    <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                        {state === "pending"
                            ? `${Math.max(pour.volume, 0)} ml`
                            : readout(pour, delivered, pauseElapsed, state)}
                    </DotMatrixText>
                </View>
            </View>
        </XStack>
    );
}
