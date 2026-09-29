import {View} from "react-native";
import Svg, {Path} from "react-native-svg";

import {FLOW_SPARKLINE_MIN_SPAN} from "@/library/brew/flowRate";
import {channelStyle} from "@/library/brew/traceStyle";

export const FLOW_SPARKLINE_WIDTH = 96;
export const FLOW_SPARKLINE_HEIGHT = 20;
export const FLOW_SPARKLINE_MIN_POINTS = 2;

export default function FlowSparkline({
    values, accent
}: {values: number[]; accent: string}) {
    if (values.length < FLOW_SPARKLINE_MIN_POINTS) return null;

    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min;
    const mid = (min + max) / 2;
    const half = Math.max(span / 2, FLOW_SPARKLINE_MIN_SPAN / 2);
    const lower = mid - half;
    const range = half * 2;
    const style = channelStyle("cup", {accent});
    const inset = style.strokeWidth / 2;
    const drawWidth = FLOW_SPARKLINE_WIDTH - inset * 2;
    const drawHeight = FLOW_SPARKLINE_HEIGHT - inset * 2;
    const y = (value: number) =>
        FLOW_SPARKLINE_HEIGHT - inset - ((value - lower) / range) * drawHeight;
    const x = (index: number) => inset + (index / (values.length - 1)) * drawWidth;

    const d = values
        .map((value, index) =>
            `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(value).toFixed(2)}`
        )
        .join(" ");

    return (
        <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={{
                width: FLOW_SPARKLINE_WIDTH,
                height: FLOW_SPARKLINE_HEIGHT,
                flexShrink: 1
            }}
        >
            <Svg
                width="100%"
                height={FLOW_SPARKLINE_HEIGHT}
                viewBox={`0 0 ${FLOW_SPARKLINE_WIDTH} ${FLOW_SPARKLINE_HEIGHT}`}
                preserveAspectRatio="none">
                <Path
                    testID="flow-sparkline-path"
                    d={d}
                    fill="none"
                    {...style}
                />
            </Svg>
        </View>
    );
}
