// components/BrewStageLadder.tsx
import React, {useEffect, useRef, useState} from "react";
import {ScrollView, View} from "react-native";
import {YStack} from "tamagui";

import BrewBypassRung from "@/components/BrewBypassRung";
import type {BypassView} from "@/library/brew/bypassState";
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
    /**
     * Whether the ladder should stretch to fill its parent with `flex: 1` and
     * centre the rungs vertically (`justifyContent: "center"`).
     *
     * Set `true` only when the parent has a bounded height — `flex: 1` inside
     * an auto-height container (e.g. a `ViewShot`) collapses to zero, and
     * `justifyContent: "center"` then stacks every rung on top of the last.
     * The component cannot detect this itself, so the caller must say.
     *
     * Ignored when `scrolls === true`.
     */
    fill: boolean;
    /** Millilitres delivered, index-aligned with `pours`. */
    stageWater: number[];
    /** Index-aligned with `pours`. */
    stalls: Stall[][];
    /** Seconds into the live stage's planned rest. */
    pauseElapsed: number;
    /** The stage whose detail is open, or `null`. */
    selectedIndex?: number | null;
    /** Absent makes the rungs inert, which is what the live screen and the export want. */
    onSelectStage?: (index: number) => void;
    /**
     * The bypass, if this brew has one. Absent means no closing rung — which
     * is every recipe without a bypass and every record written before the
     * bypass was drawn at all.
     */
    bypass?: BypassView;
};

/**
 * The stages, as a ladder.
 *
 * The lane inside a rung is `flex: 1` and the whole ladder grows into whatever
 * height it is given, so a four-stage recipe on a large phone fills the screen
 * and a nine-stage one sits at every floor and scrolls.
 */
export default function BrewStageLadder({
    pours, accent, activeIndex, barHeight, rungGap, scrolls, fill, stageWater, stalls,
    pauseElapsed, selectedIndex = null, onSelectStage, bypass
}: Props) {
    const scroller = useRef<ScrollView>(null);
    // Maps rung index → measured y-offset relative to the ScrollView content.
    const rungY = useRef<Record<number, number>>({});

    /**
     * What the ladder was given, and what it actually needs.
     *
     * `scrolls` is a prediction made by `allocateBands` from stage count alone,
     * and it under-counts: it models a rung as `barHeight + rungGap`, but a rung
     * also carries a number and a volume, and text does not shrink with the bar.
     * Past about a dozen stages the real content is taller than the arithmetic
     * says, `scrolls` stays false, and the ladder is laid out centred in a box
     * too small for it -- which overflows *both* ends at once and drew stage
     * bars over the trace above and over the figures below.
     *
     * Measuring instead of predicting removes the whole class: whatever the
     * rungs turn out to need, the ladder scrolls exactly when it does not fit.
     * `scrolls` is kept as the opening guess so a ladder that is obviously too
     * long does not render once un-scrollable before the measurement lands.
     */
    const [boxHeight, setBoxHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    // A tolerance, because a measured content height can land a fraction of a
    // point above its container without a pixel being out of place.
    const overflows = scrolls || (boxHeight > 0 && contentHeight > boxHeight + 1);

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
                    selected={selectedIndex === index}
                    onPress={onSelectStage ? () => onSelectStage(index) : undefined}
                />
            </View>
        );
    });

    // Below the stages, and outside the map, because it is not one of them: it
    // has no pour, no agitation and no pause, and folding it into the loop
    // would mean inventing a `Pour` that does not exist.
    const closing = bypass === undefined ? null : (
        <View key="row-bypass" testID="row-bypass"
              style={{paddingVertical: rungGap / 2}}>
            <BrewBypassRung
                testID="rung-bypass"
                volume={bypass.volume}
                temperature={bypass.temperature}
                delivered={bypass.delivered}
                state={bypass.state}
                accent={accent}
                laneSeconds={laneSeconds}
                barHeight={barHeight}
            />
        </View>
    );

    // An unbounded parent, so there is nothing to scroll within and nothing to
    // measure against: `flex: 1` inside an auto-height container collapses to
    // zero. This is the share-card path, which is rendered at whatever size it
    // needs and never seen at a fixed one.
    if (!fill) {
        return (
            <YStack testID="ladder">
                {rows}
                {closing}
            </YStack>
        );
    }

    // Only a ladder that cannot fit may actually scroll: a live ScrollView
    // swallows the drag that dismisses the modal, so `scrollEnabled` is the
    // measurement rather than a constant.
    //
    // Centred while it fits, top-aligned once it does not. `allocateBands`
    // fills the screen exactly from four stages up, but at two or three the
    // ceilings bite and there is height left over; pooled at the foot it reads
    // as a layout that ran out, and split around the ladder it reads as margin.
    // `flexGrow: 1` is what gives the centring something to centre in.
    return (
        <ScrollView testID="ladder-scroll" ref={scroller} style={{flex: 1}}
                    scrollEnabled={overflows}
                    onLayout={(e) => setBoxHeight(e.nativeEvent.layout.height)}
                    onContentSizeChange={(_, height) => setContentHeight(height)}
                    contentContainerStyle={{
                        flexGrow:       1,
                        justifyContent: overflows ? "flex-start" : "center"
                    }}>
            <View testID="ladder">{rows}{closing}</View>
        </ScrollView>
    );
}
