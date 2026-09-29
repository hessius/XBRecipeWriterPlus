import {screen} from "@testing-library/react-native";

import FlowSparkline from "@/components/FlowSparkline";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

describe("FlowSparkline", () => {
    it("draws a path once there are two points", async () => {
        await renderWithProviders(
            <FlowSparkline values={[1, 2, 1.5, 2.5]} accent={palette.brand} />
        );

        expect(screen.getByTestId("flow-sparkline-path")).toBeTruthy();
    });

    it("scales the series across the sparkline box", async () => {
        await renderWithProviders(
            <FlowSparkline values={[1, 2, 3]} accent={palette.brand} />
        );

        expect(screen.getByTestId("flow-sparkline-path").props.d)
            .toBe("M0.00 20.00 L48.00 10.00 L96.00 0.00");
    });

    it("draws a flat series through the middle instead of the floor", async () => {
        await renderWithProviders(
            <FlowSparkline values={[2, 2]} accent={palette.brand} />
        );

        expect(screen.getByTestId("flow-sparkline-path").props.d)
            .toBe("M0.00 10.00 L96.00 10.00");
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
