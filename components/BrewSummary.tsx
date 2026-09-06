import React from "react";
import {StyleSheet, View} from "react-native";
import {Text, YStack} from "tamagui";

import BrewFigures from "@/components/BrewFigures";
import BrewStageLadder from "@/components/BrewStageLadder";
import BrewTrace from "@/components/BrewTrace";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {SCREEN_PADDING} from "@/constants/layout";
import {SUMMARY_BANDS} from "@/library/brew/bands";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {Stall} from "@/library/brew/stalls";
import type Pour from "@/library/Pour";

const TRACE_HEIGHT = 150;

/**
 * The margin around the captured content, in points.
 *
 * A ViewShot renders only what is inside it, so the exported PNG had no
 * breathing room at all — the figures sat hard against the edge. This is added
 * to the screen padding so the image has a border of its own.
 */
export const CAPTURE_MARGIN = 12;

type Props = {
    recipeName: string;
    hasStream: boolean;
    samples: BrewSample[];
    stages: Pour[];
    accent: string;
    width: number;
    plannedSeconds: number;
    water: number;
    cup: number;
    seconds: number;
    activeIndex: number | null;
    stageWater: number[];
    stalls: Stall[][];
    /** True when the recipe is gone and no stage snapshot was kept. */
    stagesUnavailable: boolean;
    /** A short Doto line about how the brew ended, when there is one to make. */
    note?: string;
};

/**
 * The shared brew summary: recipe name, trace, figures and stage ladder.
 *
 * This is the single source of truth for how a finished brew looks, both on
 * the record screen and — captured to a PNG — in the export. Everything worth
 * sharing lives inside here, including its own background and padding, because
 * a capture inherits neither margin nor background from its ancestors: outside
 * it, the PNG came out edge-to-edge on white, which made the dot-matrix
 * figures near-invisible.
 */
export default function BrewSummary({
    recipeName, hasStream, samples, stages, accent, width, plannedSeconds,
    water, cup, seconds, activeIndex, stageWater, stalls, stagesUnavailable,
    note
}: Props) {
    // The drawable width inside the capture's own padding.
    const traceWidth = width - (SCREEN_PADDING + CAPTURE_MARGIN) * 2;

    return (
        <View testID="brew-capture" style={styles.capture}>
            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.4}
                           color={palette.dim} numberOfLines={1}
                           style={{marginBottom: 12}}>
                {recipeName}
            </DotMatrixText>

            {hasStream ? (
                <BrewTrace
                    pours={[]}
                    samples={samples}
                    accent={accent}
                    width={traceWidth}
                    height={TRACE_HEIGHT}
                    plannedSeconds={plannedSeconds}
                    planOpacity={0}
                    planColor={palette.muted}
                    planDashed={false}
                />
            ) : (
                <YStack height={TRACE_HEIGHT} alignItems="center"
                        justifyContent="center">
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.6}
                                   color={palette.muted}>
                        NO TRACE KEPT
                    </DotMatrixText>
                    <Text color={palette.muted} fontSize={12} marginTop="$2"
                          textAlign="center">
                        No trace was kept for this brew.
                    </Text>
                </YStack>
            )}

            {note !== undefined && (
                <DotMatrixText testID="brew-summary-note" fontSize={11}
                               weight="bold" letterSpacing={1.6}
                               color={palette.warn} style={{marginBottom: 8}}>
                    {note}
                </DotMatrixText>
            )}

            <BrewFigures
                water={water}
                cup={cup}
                seconds={seconds}
                accent={accent}
            />
            {/* Spaced by hand: the capture has no gap, so the trace and the
                figures stay flush the way they were on screen. */}
            <YStack marginTop="$3">
            {stagesUnavailable ? (
                <DotMatrixText fontSize={11} letterSpacing={1.2} color={palette.muted}>
                    Recipe deleted. Stages not available.
                </DotMatrixText>
            ) : (
                <BrewStageLadder
                    pours={stages}
                    accent={accent}
                    activeIndex={activeIndex}
                    // From bands.ts, not literals: the live screen sizes its
                    // ladder from a measured flex height, but a summary renders
                    // inside a ViewShot with fill={false} and has none. The
                    // soft-cap band set gives the same thick, proportional bars
                    // a well-filled live ladder settles at — see SUMMARY_BANDS.
                    barHeight={SUMMARY_BANDS.barHeight}
                    rungGap={SUMMARY_BANDS.rungGap}
                    scrolls={false}
                    fill={false}
                    stageWater={stageWater}
                    stalls={stalls}
                    pauseElapsed={0}
                />
            )}
            </YStack>
        </View>
    );
}

const styles = StyleSheet.create({
    /**
     * The captured subtree needs its own background and padding: a ViewShot
     * renders what is inside it, so anything the screen supplies from further
     * out is simply not in the PNG. The extra margin gives the image a border.
     */
    capture: {
        backgroundColor: palette.base,
        padding:         SCREEN_PADDING + CAPTURE_MARGIN
    }
});
