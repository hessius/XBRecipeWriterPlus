import React, {useState} from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {Button} from "tamagui";
import {renderWithProviders} from "@/test-utils/render";
import {palette} from "@/constants/colors";
import {MyButtonGroup} from "@/components/MyButtonGroup";

const AGITATION = ["None", "Gentle", "Strong"];

function group(overrides: Partial<React.ComponentProps<typeof MyButtonGroup>> = {}) {
    return {
        size:         "$3",
        label:        "Agitation",
        orientation:  "horizontal",
        onToggle:     jest.fn(),
        buttons:      [0, 1, 2],
        getLabelText: (id: number) => AGITATION[id],
        ...overrides
    } as React.ComponentProps<typeof MyButtonGroup>;
}

describe("MyButtonGroup", () => {
    it("renders the label and one item per button", async () => {
        await renderWithProviders(<MyButtonGroup {...group()} />);

        expect(screen.getByText("Agitation")).toBeTruthy();
        AGITATION.forEach((label) => expect(screen.getByLabelText(label)).toBeTruthy());
    });

    it("reports the selected value", async () => {
        const onToggle = jest.fn();
        await renderWithProviders(<MyButtonGroup {...group({onToggle})} />);

        await fireEvent.press(screen.getByLabelText("Strong"));

        expect(onToggle).toHaveBeenCalledWith("2");
    });

    it("passes size down to the items rather than the group", async () => {
        // Tamagui v2 dropped `size` from ToggleGroup, so it has to reach the items
        // individually. A regression here silently shrinks every toggle.
        await renderWithProviders(<MyButtonGroup {...group({size: "$5"})} />);

        // Tamagui resolves size to concrete style, so that is what we can observe.
        const large = screen.getByLabelText("Gentle").props.style;

        await renderWithProviders(<MyButtonGroup {...group({size: "$2"})} />);
        const small = screen.getAllByLabelText("Gentle").at(-1)!.props.style;

        expect(large.height).toBeGreaterThan(small.height);
    });

    it("keeps the selection when the parent re-renders without changing initialValue", async () => {
        function Parent() {
            const [, force] = useState(0);
            return (
                <>
                    <Button aria-label="rerender" onPress={() => force((n) => n + 1)}>rerender</Button>
                    <MyButtonGroup {...group({initialValue: "1"})} />
                </>
            );
        }

        await renderWithProviders(<Parent/>);
        await fireEvent.press(screen.getByLabelText("Strong"));
        await fireEvent.press(screen.getByLabelText("rerender"));

        expect(screen.getByLabelText("Strong").props.style.backgroundColor).toBe(palette.danger);
    });

    it("adopts a new initialValue supplied by the parent", async () => {
        function Parent() {
            const [initialValue, setInitialValue] = useState("0");
            return (
                <>
                    <Button aria-label="change" onPress={() => setInitialValue("2")}>change</Button>
                    <MyButtonGroup {...group({initialValue})} />
                </>
            );
        }

        await renderWithProviders(<Parent/>);
        expect(screen.getByLabelText("None").props.style.backgroundColor).toBe(palette.danger);

        await fireEvent.press(screen.getByLabelText("change"));

        expect(screen.getByLabelText("Strong").props.style.backgroundColor).toBe(palette.danger);
    });
});
