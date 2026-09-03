// components/BrewStageLadder.tsx
import React, {useEffect, useRef} from "react";
import {ScrollView, View} from "react-native";
import {XStack, YStack} from "tamagui";

import BrewStageRung, {type RungState} from "@/components/BrewStageRung";
import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern, type GlyphKind} from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

type Props = {
    pours: Pour[];
    accent: string;
    /**
     * The live stage, zero-based. `null` before the brew starts — everything
     * pending — and `pours.length` once it is over, which is how a finished
     * brew in history shows every stage done.
     */
    activeIndex: number | null;
    /** Seconds spent in the live stage. Drives the fill and the re-scale. */
    stageElapsed: number;
    holding?: boolean;
};

const LANE_WIDTH = 120;

const GLYPH_WORDS: [GlyphKind, string][] = [
    ["centered", "CENTRED"],
    ["circular", "CIRCULAR"],
    ["spiral", "SPIRAL"],
    ["agitation", "AGITATION"]
];

function stageSeconds(pour: Pour): number {
    return pourSeconds(pour) + pauseSeconds(pour);
}

/**
 * The stages, as a ladder that scrolls.
 *
 * Not compacted at nine stages — the machine's maximum — because scrolling
 * costs less than legibility, and the auto-scroll usually makes it cost
 * nothing. The open card sits directly beneath its own rung: at the bottom of
 * the list it reads as a footer belonging to no stage in particular.
 */
export default function BrewStageLadder({
    pours, accent, activeIndex, stageElapsed, holding = false
}: Props) {
    const scroller = useRef<ScrollView>(null);
    // Maps rung index → measured y-offset relative to the ScrollView content.
    const rungY = useRef<Record<number, number>>({});

    const planned = pours.reduce((widest, pour) => Math.max(widest, stageSeconds(pour)), 0);
    // Raised by the live stage once it outruns its plan, which is how a hold
    // becomes a growing wedge instead of a bar pinned silently at full.
    const laneSeconds = Math.max(planned, stageElapsed);

    useEffect(() => {
        // Sentinels: null = not yet started, pours.length = brew finished.
        // Only scroll for a genuinely live stage.
        if (activeIndex === null || activeIndex < 0 || activeIndex >= pours.length) return;
        const y = rungY.current[activeIndex];
        if (y === undefined) return;
        // A small lead keeps the active rung from sitting flush at the top edge.
        scroller.current?.scrollTo({y: Math.max(0, y - 8), animated: true});
    }, [activeIndex, pours.length]);

    const rows: React.ReactNode[] = [];
    pours.forEach((pour, index) => {
        const state: RungState =
            activeIndex === null ? "pending"
            : index < activeIndex ? "done"
            : index === activeIndex ? "active"
            : "pending";
        const span = stageSeconds(pour);
        const progress = state === "done"
            ? 1
            : state === "active" && span > 0 ? stageElapsed / span : 0;

        rows.push(
            <View
                key={`row-${index}`}
                testID={`row-${index}`}
                accessibilityValue={{text: state}}
                onLayout={e => { rungY.current[index] = e.nativeEvent.layout.y; }}
            >
                <BrewStageRung
                    testID={`rung-${index}`}
                    pour={pour}
                    index={index}
                    state={state}
                    accent={accent}
                    laneSeconds={laneSeconds}
                    laneWidth={LANE_WIDTH}
                    progress={progress}
                    holding={holding && state === "active"}
                />
            </View>
        );

        if (index === activeIndex) {
            rows.push(
                <YStack
                    key="stage-card"
                    testID="stage-card"
                    backgroundColor={palette.raised}
                    borderRadius="$4"
                    padding="$3"
                    gap="$2"
                    marginBottom="$2"
                >
                    {holding && (
                        <YStack gap="$1">
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                           color={palette.warn}>
                                HOLDING — THE CUP IS BEHIND
                            </DotMatrixText>
                            <DotMatrixText fontSize={11} color={palette.dim}>
                                The machine has stopped the water until the bed drains.
                                It will carry on by itself.
                            </DotMatrixText>
                        </YStack>
                    )}
                    {/* The legend, built into the thing it explains, so the
                        vocabulary is learned in passing. */}
                    {GLYPH_WORDS.map(([kind, word]) => (
                        <XStack key={kind} alignItems="center" gap="$2">
                            <PourGlyph
                                kind={kind}
                                accent={kind === glyphForPattern(pour.pourPattern)
                                    ? accent : palette.dim}
                                size={14}
                            />
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                           color={palette.dim}>
                                {word}
                            </DotMatrixText>
                        </XStack>
                    ))}
                </YStack>
            );
        }
    });

    return (
        <ScrollView ref={scroller}>
            <View testID="ladder" accessibilityValue={{text: String(laneSeconds)}}>{rows}</View>
        </ScrollView>
    );
}
