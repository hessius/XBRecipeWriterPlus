import {screen} from "@testing-library/react-native";

import FlowSparkline from "@/components/FlowSparkline";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

function sparklinePath() {
    return screen.getByTestId("flow-sparkline-path", {includeHiddenElements: true});
}

describe("FlowSparkline", () => {
    it("draws a path once there are two points", async () => {
        await renderWithProviders(
            <FlowSparkline values={[1, 2, 1.5, 2.5]} accent={palette.brand} />
        );

        expect(sparklinePath()).toBeTruthy();
    });

    it("scales the series across the sparkline box", async () => {
        await renderWithProviders(
            <FlowSparkline values={[1, 2, 3]} accent={palette.brand} />
        );

        expect(sparklinePath().props.d)
            .toBe("M1.00 19.00 L48.00 10.00 L95.00 1.00");
    });

    it("draws a flat series through the middle instead of the floor", async () => {
        await renderWithProviders(
            <FlowSparkline values={[2, 2]} accent={palette.brand} />
        );

        expect(sparklinePath().props.d)
            .toBe("M1.00 10.00 L95.00 10.00");
    });

    it("keeps sub-noise wobble small instead of stretching it to the box", async () => {
        await renderWithProviders(
            <FlowSparkline values={[1.95, 2.05, 1.95]} accent={palette.brand} />
        );

        expect(sparklinePath().props.d)
            .toBe("M1.00 11.80 L48.00 8.20 L95.00 11.80");
    });

    it("draws nothing at all below two points", async () => {
        await renderWithProviders(
            <FlowSparkline values={[2]} accent={palette.brand} />
        );

        expect(screen.queryByTestId("flow-sparkline-path")).toBeNull();
    });

    it("draws nothing when there is no series", async () => {
        await renderWithProviders(
            <FlowSparkline values={[]} accent={palette.brand} />
        );

        expect(screen.queryByTestId("flow-sparkline-path")).toBeNull();
    });
});
