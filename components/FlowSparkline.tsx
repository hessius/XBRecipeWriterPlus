import {View} from "react-native";
import Svg, {Path} from "react-native-svg";

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
    const y = (value: number) =>
        span === 0 ? HEIGHT / 2 : HEIGHT - ((value - min) / span) * HEIGHT;
    const x = (index: number) => (index / (values.length - 1)) * WIDTH;

    const d = values
        .map((value, index) =>
            `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(value).toFixed(2)}`
        )
        .join(" ");

    return (
        <View accessible={false} pointerEvents="none">
            <Svg width={WIDTH} height={HEIGHT}>
                <Path
                    testID="flow-sparkline-path"
                    d={d}
                    fill="none"
                    {...channelStyle("cup", {accent})}
                />
            </Svg>
        </View>
    );
}
