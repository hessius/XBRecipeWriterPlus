import React from "react";
import {fireEvent} from "@testing-library/react-native";

import MachineDot from "@/components/MachineDot";
import {palette} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

describe("MachineDot", () => {
    it("is accent with a ring when connected", async () => {
        const {getByTestId} = await renderWithProviders(
            <MachineDot status="connected" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByTestId("machine-dot").props.style.backgroundColor).toBe("#C86A3B");
        expect(getByTestId("machine-dot-ring")).toBeTruthy();
    });

    it("is grey and ringless when out of range", async () => {
        const {getByTestId, queryByTestId} = await renderWithProviders(
            <MachineDot status="disconnected" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByTestId("machine-dot").props.style.backgroundColor).toBe(palette.muted);
        expect(queryByTestId("machine-dot-ring")).toBeNull();
    });

    it("is half-lit while connecting", async () => {
        const {getByTestId} = await renderWithProviders(
            <MachineDot status="connecting" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByTestId("machine-dot").props.style.opacity).toBeCloseTo(0.5, 1);
    });

    it("says which state it is in, for a screen reader", async () => {
        const {getByLabelText} = await renderWithProviders(
            <MachineDot status="connected" accent="#C86A3B" onPress={jest.fn()} />
        );
        expect(getByLabelText("Machine connected")).toBeTruthy();
    });

    it("opens on a press", async () => {
        const onPress = jest.fn();
        const {getByLabelText} = await renderWithProviders(
            <MachineDot status="connected" accent="#C86A3B" onPress={onPress} />
        );
        await fireEvent.press(getByLabelText("Machine connected"));
        expect(onPress).toHaveBeenCalled();
    });
});
