// components/BrewStageLadder.tsx
import React, {useEffect, useRef} from "react";
import {ScrollView, View} from "react-native";
import {YStack} from "tamagui";

import BrewStageRung, {type RungState} from "@/components/BrewStageRung";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import {rungSegments} from "@/library/brew/rungGeometry";
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
    /** From `allocateBands`. */
    barHeight: number;
    rungGap: number;
    /** True when the bands are at their floors and the list will not fit. */
    scrolls: boolean;
    /** Millilitres delivered, index-aligned with `pours`. */
    stageWater: number[];
    /** Index-aligned with `pours`. */
    stalls: Stall[][];
    /** Seconds into the live stage's planned rest. */
    pauseElapsed: number;
};

/**
 * The stages, as a ladder.
 *
 * The lane inside a rung is `flex: 1` and the whole ladder grows into whatever
 * height it is given, so a four-stage recipe on a large phone fills the screen
 * and a nine-stage one sits at every floor and scrolls.
 */
export default function BrewStageLadder({
    pours, accent, activeIndex, barHeight, rungGap, scrolls, stageWater, stalls,
    pauseElapsed
}: Props) {
    const scroller = useRef<ScrollView>(null);
    // Maps rung index → measured y-offset relative to the ScrollView content.
    const rungY = useRef<Record<number, number>>({});

    // One scale for every rung, or a lane says nothing about its neighbours.
    // Stalls are in it: that is what makes a stage that struggled stick out
    // past the ones that did not, by exactly the time it lost.
    const laneSeconds = pours.reduce((widest, pour, i) => {
        const spent = rungSegments({
            pour,
            delivered: stageWater[i] ?? 0,
            pauseElapsed: i === activeIndex ? pauseElapsed : 0,
            stalls: stalls[i] ?? []
        }).reduce((sum, segment) => sum + segment.seconds, 0);
        return Math.max(widest, pourSeconds(pour) + pauseSeconds(pour), spent);
    }, 0);

    useEffect(() => {
        // Sentinels: null = not yet started, pours.length = brew finished.
        // Only scroll for a genuinely live stage.
        if (activeIndex === null || activeIndex < 0 || activeIndex >= pours.length) return;
        const y = rungY.current[activeIndex];
        if (y === undefined) return;
        // A small lead keeps the active rung from sitting flush at the top edge.
        scroller.current?.scrollTo({y: Math.max(0, y - 8), animated: true});
    }, [activeIndex, pours.length]);

    const rows = pours.map((pour, index) => {
        const state: RungState =
            activeIndex === null ? "pending"
            : index < activeIndex ? "done"
            : index === activeIndex ? "active"
            : "pending";

        return (
            <View
                key={`row-${index}`}
                testID={`row-${index}`}
                style={{paddingVertical: rungGap / 2}}
                onLayout={(e) => { rungY.current[index] = e.nativeEvent.layout.y; }}
            >
                <BrewStageRung
                    testID={`rung-${index}`}
                    pour={pour}
                    index={index}
                    state={state}
                    accent={accent}
                    laneSeconds={laneSeconds}
                    barHeight={barHeight}
                    delivered={stageWater[index] ?? 0}
                    pauseElapsed={index === activeIndex ? pauseElapsed : 0}
                    stalls={stalls[index] ?? []}
                />
            </View>
        );
    });

    // Only a ladder that cannot fit is allowed to scroll. A ScrollView that
    // never scrolls still swallows the drag that dismisses the modal.
    if (!scrolls) return <YStack testID="ladder" flex={1}>{rows}</YStack>;

    return (
        <ScrollView ref={scroller} style={{flex: 1}}>
            <View testID="ladder">{rows}</View>
        </ScrollView>
    );
}
