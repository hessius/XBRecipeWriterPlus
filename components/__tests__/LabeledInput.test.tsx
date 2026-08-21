import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import LabeledInput from "@/components/LabeledInput";

describe("LabeledInput", () => {
    it("shows the label and the initial value", async () => {
        await renderWithProviders(
            <LabeledInput label="Title" initialValue="Ethiopia" maxLength={40}/>
        );

        expect(screen.getByText("Title")).toBeTruthy();
        expect(screen.getByDisplayValue("Ethiopia")).toBeTruthy();
    });

    it("reports the edited value when there is no validator", async () => {
        const onValidEdit = jest.fn().mockResolvedValue(undefined);
        await renderWithProviders(
            <LabeledInput label="Title" initialValue="" maxLength={40} onValidEditFunction={onValidEdit}/>
        );

        await fireEvent.changeText(screen.getByDisplayValue(""), "Kenya");

        expect(onValidEdit).toHaveBeenCalledWith("Title", "Kenya");
    });

    it("passes the pour number through when one is given", async () => {
        const onValidEdit = jest.fn().mockResolvedValue(undefined);
        await renderWithProviders(
            <LabeledInput label="Volume" initialValue="" maxLength={4} pourNumber={2}
                          onValidEditFunction={onValidEdit}/>
        );

        await fireEvent.changeText(screen.getByDisplayValue(""), "60");

        expect(onValidEdit).toHaveBeenCalledWith("Volume", "60", 2);
    });

    it("surfaces the error message and notifies the parent when validation fails", async () => {
        const setError = jest.fn();
        const onValidEdit = jest.fn().mockResolvedValue(undefined);
        await renderWithProviders(
            <LabeledInput label="XID" initialValue="" maxLength={8} errorMessage="XID must be 8 characters"
                          validateInput={(v) => v.length === 8}
                          setErrorFunction={setError}
                          onValidEditFunction={onValidEdit}/>
        );

        await fireEvent.changeText(screen.getByDisplayValue(""), "abc");

        expect(setError).toHaveBeenCalledWith(true);
        expect(screen.getByText("Error: XID must be 8 characters")).toBeTruthy();
        expect(onValidEdit).not.toHaveBeenCalled();
    });

    it("clears the error and reports the value once input becomes valid again", async () => {
        const setError = jest.fn();
        const onValidEdit = jest.fn().mockResolvedValue(undefined);
        await renderWithProviders(
            <LabeledInput label="XID" initialValue="" maxLength={8} errorMessage="XID must be 8 characters"
                          validateInput={(v) => v.length === 8}
                          setErrorFunction={setError}
                          onValidEditFunction={onValidEdit}/>
        );

        await fireEvent.changeText(screen.getByDisplayValue(""), "abc");
        await fireEvent.changeText(screen.getByDisplayValue("abc"), "abcdefgh");

        expect(setError).toHaveBeenLastCalledWith(false);
        expect(screen.queryByText("Error: XID must be 8 characters")).toBeNull();
        // Recovering from an invalid value must still report the edit; this used to
        // be dropped because the check read the previous render's `validated`.
        expect(onValidEdit).toHaveBeenCalledWith("XID", "abcdefgh");
    });
});
