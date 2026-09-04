// components/BrewStageLadder.tsx
import React, {useEffect, useRef} from "react";
import {ScrollView, View} from "react-native";
import {XStack, YStack} from "tamagui";

import BrewStageRung, {type RungState} from "@/components/BrewStageRung";
import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern, type GlyphKind} from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import type {Stall} from "@/library/brew/stalls";
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
    /**
     * Millilitres delivered per stage, 1:1 with `pours`.
     *
     * Optional because Task 11 is what wires the real values through from
     * `useBrewRun`. Until then a finished stage is assumed to have had all of
     * its water, which is true, and a live one none, which is not -- the live
     * fill is deliberately wrong for one task rather than faked from elapsed
     * time, because a plausible-looking wrong fill is the thing that made the
     * old ladder unreadable on hardware.
     */
    stageWater?: number[];
    /** Seconds into the live stage's planned rest. Task 11 wires it. */
    pauseElapsed?: number;
    /** Stalls per stage, 1:1 with `pours`. Task 11 wires them. */
    stalls?: Stall[][];
    holding?: boolean;
};

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
    pours, accent, activeIndex, stageElapsed, stageWater, pauseElapsed = 0,
    stalls, holding = false
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

        rows.push(
            <View
                key={`row-${index}`}
                testID={`row-${index}`}
                onLayout={e => { rungY.current[index] = e.nativeEvent.layout.y; }}
            >
                <BrewStageRung
                    testID={`rung-${index}`}
                    pour={pour}
                    index={index}
                    state={state}
                    accent={accent}
                    laneSeconds={laneSeconds}
                    barHeight={11}
                    delivered={stageWater?.[index]
                        ?? (state === "done" ? Math.max(pour.volume, 0) : 0)}
                    pauseElapsed={state === "active" ? pauseElapsed
                        : state === "done" ? pauseSeconds(pour) : 0}
                    stalls={stalls?.[index] ?? []}
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
                                HOLDING: THE CUP IS BEHIND
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
            <View testID="ladder">{rows}</View>
        </ScrollView>
    );
}
