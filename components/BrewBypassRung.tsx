import React from "react";
import {View} from "react-native";
import {XStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {bypassSeconds} from "@/library/brew/brewShape";
import type {BypassRungState} from "@/library/brew/bypassState";

type Props = {
    volume: number;
    temperature: number;
    delivered: number;
    state: BypassRungState;
    accent: string;
    /** The longest stage in the recipe. Shared, or the lane means nothing. */
    laneSeconds: number;
    barHeight: number;
    testID?: string;
};

/** The dimmed opacity of a bypass that has not happened. Matches BrewStageRung. */
const PENDING_OPACITY = 0.45;

/**
 * Bypass water, as the closing rung of the brew ladder.
 *
 * The dashed outline is the editor's — `components/BypassRung.tsx` draws the
 * same mark for the same thing — so the reader learns it once and it means
 * bypass in the editor, on the trace and here.
 *
 * The lane is deliberately on the same seconds scale as the stages, and a 5 ml
 * bypass is therefore a very short bar. That is honest: it takes about a second
 * and a half, and a bar padded out to look important would say otherwise.
 *
 * `waiting` is the state that had to exist. The machine lets the dripper finish
 * before it dispenses, and that gap ran to 61 s in the capture this was written
 * from. It is not a stall and is never drawn as one.
 */
export default function BrewBypassRung({
    volume, temperature, delivered, state, accent, laneSeconds, barHeight, testID
}: Props) {
    const target = Math.max(volume, 0);
    const seconds = bypassSeconds(target);
    const span = laneSeconds > 0 ? laneSeconds : 1;
    const slack = Math.max(0, span - seconds);
    const fill = target > 0 ? Math.max(0, Math.min(1, delivered / target)) : 0;
    const lit = state === "filling" || state === "done";
    const radius = barHeight / 2;

    const readout = state === "pending" ? `${target} ml`
        : state === "waiting" ? "WAITING"
        : `${Math.round(delivered)}/${target} ml`;

    const label = `Bypass water, ${Math.max(temperature, 0)} degrees, `
        + `${target} millilitres, `
        + (state === "pending" ? "not yet"
           : state === "waiting" ? "waiting for the drawdown"
           : state === "filling" ? "adding"
           : "delivered");

    return (
        <XStack
            testID={testID}
            accessible
            accessibilityLabel={label}
            alignItems="center"
            gap="$2"
            paddingHorizontal="$2"
            marginHorizontal="$-2"
            style={{opacity: state === "pending" ? PENDING_OPACITY : 1}}
        >
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                           color={lit ? palette.info : palette.dim}>
                BY
            </DotMatrixText>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {`${Math.max(temperature, 0)}°`}
            </DotMatrixText>

            <XStack style={{flex: 1}} height={barHeight} alignItems="center">
                <View
                    testID="bypass-rung-lane"
                    style={{
                        flex: Math.max(seconds, 0.001),
                        height: barHeight,
                        borderRadius: radius,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: lit ? accent : palette.line,
                        overflow: "hidden",
                        flexDirection: "row"
                    }}
                >
                    <View
                        testID="bypass-rung-fill"
                        style={{
                            flex: fill,
                            height: barHeight,
                            borderRadius: radius,
                            backgroundColor: accent
                        }}
                    />
                    <View style={{flex: 1 - fill}} />
                </View>
                {slack > 0 && <View testID="bypass-rung-slack" style={{flex: slack}} />}
            </XStack>

            <DotMatrixText fontSize={12} weight="bold" color={palette.dim}>
                {readout}
            </DotMatrixText>
        </XStack>
    );
}
