import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";

import TagSection from "@/components/TagSection";
import {renderWithProviders} from "@/test-utils/render";

describe("TagSection", () => {
    it("shows every tag the recipe has", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Light", "Morning"]} known={[]} onChange={onChange}/>
        );

        expect(screen.getByText("Light")).toBeTruthy();
        expect(screen.getByText("Morning")).toBeTruthy();
    });

    // A recipe with no tags is the normal case and by far the commonest. It
    // must not look like a form somebody abandoned half-filled.
    it("says nothing at all when the recipe has no tags", async () => {
        const onChange = jest.fn();
        await renderWithProviders(<TagSection tags={[]} known={[]} onChange={onChange}/>);

        expect(screen.queryByText(/no tags/i)).toBeNull();
        expect(screen.queryByText(/add a tag/i)).toBeNull();
        expect(screen.getByLabelText("Add a tag")).toBeTruthy();
    });

    it("reports the remaining tags when one is removed", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Light", "Morning"]} known={[]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Remove tag Light"));

        expect(onChange).toHaveBeenCalledWith(["Morning"]);
    });

    it("reports the new tag appended when one is typed", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Morning"]} known={[]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Washed");
        await fireEvent(screen.getByLabelText("New tag"), "submitEditing",
                        {nativeEvent: {text: "Washed"}});

        expect(onChange).toHaveBeenCalledWith(["Morning", "Washed"]);
    });

    it("offers a matching tag from elsewhere in the library", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={[]} known={["Wash day", "Morning"]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Was");

        expect(screen.getByLabelText("Use tag Wash day")).toBeTruthy();
        expect(screen.queryByLabelText("Use tag Morning")).toBeNull();
    });

    it("offers a matching word from the coffee vocabulary", async () => {
        const onChange = jest.fn();
        await renderWithProviders(<TagSection tags={[]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Was");

        expect(screen.getByLabelText("Use tag Washed")).toBeTruthy();
    });

    // Offering a tag the recipe already has is an action with no effect, and
    // the user cannot tell that until they tap it.
    it("does not offer a tag the recipe already has", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Washed"]} known={[]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Was");

        expect(screen.queryByLabelText("Use tag Washed")).toBeNull();
    });

    it("adds a tag when its suggestion is tapped", async () => {
        const onChange = jest.fn();
        await renderWithProviders(<TagSection tags={[]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Nat");
        await fireEvent.press(screen.getByLabelText("Use tag Natural"));

        expect(onChange).toHaveBeenCalledWith(["Natural"]);
    });

    // The section adds no rules of its own: setTags is the authority, and a
    // second opinion here would give the user two different answers about the
    // same tag depending on how it arrived. It passes the blank on and lets
    // setTags drop it, which it does.
    it("does not report anything for an empty submission", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Morning"]} known={[]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent(screen.getByLabelText("New tag"), "submitEditing",
                        {nativeEvent: {text: "   "}});

        expect(onChange).not.toHaveBeenCalled();
    });

    it("stops offering to add once the recipe is full", async () => {
        const onChange = jest.fn();
        const full = Array.from({length: 20}, (_, i) => `tag-${i}`);
        await renderWithProviders(<TagSection tags={full} known={[]} onChange={onChange}/>);

        expect(screen.queryByLabelText("Add a tag")).toBeNull();
    });
});
