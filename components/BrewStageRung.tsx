// components/BrewStageRung.tsx
import React from "react";
import {View} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph, {glyphForPattern} from "@/components/PourGlyph";
import {palette} from "@/constants/colors";
import {pauseSeconds, pourSeconds} from "@/library/brew/brewShape";
import type Pour from "@/library/Pour";

/** Where a stage stands relative to the live one. */
export type RungState = "done" | "active" | "pending";

type Props = {
    pour: Pour;
    /** Zero-based; the rung numbers itself from one. */
    index: number;
    state: RungState;
    accent: string;
    /** The widest stage in the recipe. Shared, or the lane means nothing. */
    laneSeconds: number;
    laneWidth: number;
    /** 0 to 1 through this stage. 1 for a stage that is done. */
    progress: number;
    holding?: boolean;
    testID?: string;
};

const LANE_HEIGHT = 8;

/** One spoken sentence for a rung, for VoiceOver / TalkBack. */
function buildLabel(pour: Pour, index: number): string {
    const stage = `Stage ${String(index + 1).padStart(2, "0")}`;
    const kind = glyphForPattern(pour.pourPattern);
    // Keep the word the glyph already uses ("Spiral pour" → "spiral pour").
    const pattern = kind === "agitation" ? "agitation" : `${kind} pour`;
    const temp = `${Math.max(pour.temperature, 0)} degrees`;
    const vol = `${Math.max(pour.volume, 0)} millilitres`;
    const pourSec = Math.round(pourSeconds(pour));
    const pauseSec = Math.round(pauseSeconds(pour));
    const before = pour.getAgitationBefore();
    const after = pour.getAgitationAfter();

    let agitation = "";
    if (before && after) agitation = ", agitates before and after";
    else if (before) agitation = ", agitates before";
    else if (after) agitation = ", agitates after";

    const timing = `${pourSec} seconds`;
    const pause = pauseSec > 0 ? `, then ${pauseSec} seconds pause` : "";

    return `${stage}, ${pattern}, ${temp}, ${vol}, ${timing}${pause}${agitation}`;
}

export default function BrewStageRung({
    pour, index, state, accent, laneSeconds, laneWidth, progress,
    holding = false, testID
}: Props) {
    const span = laneSeconds > 0 ? laneSeconds : 1;
    // The lane is a fixed width, so a stage that outgrows the scale is
    // truncated rather than allowed to escape the row.
    const pourWidth = Math.min((pourSeconds(pour) / span) * laneWidth, laneWidth);
    const remaining = laneWidth - pourWidth;
    const pauseWidth = Math.min((pauseSeconds(pour) / span) * laneWidth, remaining);
    // Bit 0 is agitation before, bit 1 after. Two booleans in one byte on the
    // card, and they stay two booleans here. Through `Pour`, which is the only
    // thing that knows its own "never set" sentinel is not both of them.
    const before = pour.getAgitationBefore();
    const after = pour.getAgitationAfter();

    return (
        <XStack
            testID={testID}
            accessibilityLabel={buildLabel(pour, index)}
            accessible
            alignItems="center"
            gap="$2"
            paddingVertical="$1.5"
            style={{opacity: state === "pending" ? 0.45 : 1}}
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

            <View style={{width: laneWidth, height: LANE_HEIGHT, justifyContent: "center"}}>
                <XStack height={LANE_HEIGHT} alignItems="center">
                    <View
                        testID="rung-pour"
                        style={{
                            width: pourWidth,
                            height: LANE_HEIGHT,
                            borderRadius: LANE_HEIGHT / 2,
                            backgroundColor: palette.raised
                        }}
                    />
                    {pauseWidth > 0 && (
                        <View
                            testID="rung-pause"
                            style={{
                                width: pauseWidth,
                                height: LANE_HEIGHT,
                                borderRadius: LANE_HEIGHT / 2,
                                // Hatching is a dashed border rather than an SVG
                                // pattern: one view, and it reads correctly at
                                // 8 px where a pattern fill turns to mush.
                                borderWidth: 1,
                                borderStyle: "dashed",
                                borderColor: palette.line,
                                backgroundColor: "transparent"
                            }}
                        />
                    )}
                </XStack>
                {/* The live fill, over the lane rather than beside it, so the
                    two cannot drift apart by a pixel of layout rounding. */}
                <View
                    testID="rung-fill"
                    style={{
                        position: "absolute",
                        left: 0,
                        width: Math.max(0, Math.min(1, progress)) * laneWidth,
                        height: LANE_HEIGHT,
                        borderRadius: LANE_HEIGHT / 2,
                        backgroundColor: holding ? palette.warn : accent
                    }}
                />
                {before && (
                    <View testID="rung-agitation-before"
                          style={{position: "absolute", left: -3}}>
                        <PourGlyph kind="agitation" accent={palette.dim} size={10} />
                    </View>
                )}
                {after && (
                    <View testID="rung-agitation-after"
                          style={{position: "absolute", left: pourWidth + pauseWidth - 7}}>
                        <PourGlyph kind="agitation" accent={palette.dim} size={10} />
                    </View>
                )}
            </View>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {`${Math.max(pour.volume, 0)} ml`}
            </DotMatrixText>
        </XStack>
    );
}

