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
/** Roughly a rung plus its padding; only used to aim the auto-scroll. */
const RUNG_HEIGHT = 34;

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

    const planned = pours.reduce((widest, pour) => Math.max(widest, stageSeconds(pour)), 0);
    // Raised by the live stage once it outruns its plan, which is how a hold
    // becomes a growing wedge instead of a bar pinned silently at full.
    const laneSeconds = Math.max(planned, stageElapsed);

    useEffect(() => {
        if (activeIndex === null) return;
        scroller.current?.scrollTo({y: Math.max(0, (activeIndex - 1) * RUNG_HEIGHT), animated: true});
    }, [activeIndex]);

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
            <BrewStageRung
                key={`rung-${index}`}
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
            <View testID="ladder" {...({laneSeconds} as Record<string, unknown>)}>{rows}</View>
        </ScrollView>
    );
}
