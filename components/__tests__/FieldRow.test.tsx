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

    it("offers a help marker only in the marker style, and only when there is detail", async () => {
        await renderWithProviders(
            <FieldRow topic="ratio" helpStyle="markers" onHelp={jest.fn()}>
                <Text>16</Text>
            </FieldRow>
        );

        expect(screen.getByLabelText("What is Ratio?")).toBeTruthy();
    });

    it("shows no marker for a field with nothing more to say", async () => {
        await renderWithProviders(
            <FieldRow topic="temperature" helpStyle="markers" onHelp={jest.fn()}>
                <Text>93</Text>
            </FieldRow>
        );

        expect(screen.queryByLabelText("What is Temperature?")).toBeNull();
    });

    it("shows no marker in the explain style", async () => {
        await renderWithProviders(
            <FieldRow topic="ratio" helpStyle="explain" onHelp={jest.fn()}>
                <Text>16</Text>
            </FieldRow>
        );

        expect(screen.queryByLabelText("What is Ratio?")).toBeNull();
    });

    it("asks for help when the marker is pressed", async () => {
        const onHelp = jest.fn();
        await renderWithProviders(
            <FieldRow topic="grinder" helpStyle="markers" onHelp={onHelp}>
                <Text>On</Text>
            </FieldRow>
        );

        await fireEvent.press(screen.getByLabelText("What is Grinder?"));

        expect(onHelp).toHaveBeenCalledWith("grinder");
    });

    it("unfolds the detail in place when explaining", async () => {
        await renderWithProviders(
            <FieldRow topic="grinder" helpStyle="explain" explaining>
                <Text>On</Text>
            </FieldRow>
        );

        expect(screen.getByText(/There is no better way to disable/)).toBeTruthy();
    });

    it("keeps the detail folded away when not explaining", async () => {
        await renderWithProviders(
            <FieldRow topic="grinder" helpStyle="explain"><Text>On</Text></FieldRow>
        );

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
