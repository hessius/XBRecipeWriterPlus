import React from "react";
import {Text} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import FieldRow from "@/components/FieldRow";
import SegmentedRow from "@/components/SegmentedRow";
import {renderWithProviders} from "@/test-utils/render";

describe("FieldRow", () => {
    it("draws the label and the value", async () => {
        await renderWithProviders(
            <FieldRow topic="ratio"><Text>16</Text></FieldRow>
        );

        expect(screen.getByText("Ratio")).toBeTruthy();
        expect(screen.getByText("16")).toBeTruthy();
    });

    it("keeps the one-line hint out of the way unless it is asked for", async () => {
        await renderWithProviders(
            <FieldRow topic="ratio"><Text>16</Text></FieldRow>
        );

        // Nine of these turned the deck into prose on a phone and pushed the
        // values off the bottom, so the hint is off unless the setting is on.
        expect(screen.queryByText("Whole numbers only. Sets the target volume."))
            .toBeNull();
    });

    it("draws the one-line hint when it is asked for", async () => {
        await renderWithProviders(
            <FieldRow topic="ratio" showHint><Text>16</Text></FieldRow>
        );

        expect(screen.getByText("Whole numbers only. Sets the target volume."))
            .toBeTruthy();
    });

    it("appends a note to the label", async () => {
        await renderWithProviders(
            <FieldRow topic="grindSize" note="Pourover"><Text>47</Text></FieldRow>
        );

        expect(screen.getByText("Grind size · Pourover")).toBeTruthy();
    });

    it("draws the note whether or not the hint is asked for", async () => {
        // The note is not a hint. Hints are opt-in and off by default, so
        // gating the note behind them would hide it from most users, which is
        // the whole point of drawing it.
        await renderWithProviders(
            <FieldRow topic="grindSize" showHint note="French press">
                <Text>60</Text>
            </FieldRow>
        );

        expect(screen.getByText("Grind size · French press")).toBeTruthy();
        expect(screen.getByText("40 to 80. Lower is finer.")).toBeTruthy();
    });

    it("carries no help affordance of its own", async () => {
        // The markers were tried and removed: fifteen small unanswered
        // questions dotted over a screen someone was trying to work on. The
        // long form is one entry in the overflow now, so nothing on this row
        // opens anything.
        await renderWithProviders(
            <FieldRow topic="grinder" showHint><Text>On</Text></FieldRow>
        );

        expect(screen.queryByLabelText("What is Grinder?")).toBeNull();
        expect(screen.queryByText(/There is no better way to disable/)).toBeNull();
    });
});

describe("SegmentedRow", () => {
    const OPTIONS = [
        {value: "1", label: "On"},
        {value: "0", label: "Off"}
    ];

    it("marks the selected option and reports a change", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <SegmentedRow topic="grinder" value="1" options={OPTIONS} onChange={onChange}/>
        );

        expect(screen.getByLabelText("On").props.accessibilityState.checked).toBe(true);

        await fireEvent.press(screen.getByLabelText("Off"));

        expect(onChange).toHaveBeenCalledWith("0");
    });
});
