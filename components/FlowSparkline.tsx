import {View} from "react-native";
import Svg, {Path} from "react-native-svg";

import {FLOW_SPARKLINE_MIN_SPAN} from "@/library/brew/flowRate";
import {channelStyle} from "@/library/brew/traceStyle";

const WIDTH = 96;
const HEIGHT = 20;

export default function FlowSparkline({
    values, accent
}: {values: number[]; accent: string}) {
    if (values.length < 2) return null;

    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min;
    const mid = (min + max) / 2;
    const half = Math.max(span / 2, FLOW_SPARKLINE_MIN_SPAN / 2);
    const lower = mid - half;
    const range = half * 2;
    const style = channelStyle("cup", {accent});
    const inset = style.strokeWidth / 2;
    const drawWidth = WIDTH - inset * 2;
    const drawHeight = HEIGHT - inset * 2;
    const y = (value: number) =>
        HEIGHT - inset - ((value - lower) / range) * drawHeight;
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
        >
            <Svg width={WIDTH} height={HEIGHT}>
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
