import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";
import {StyleSheet} from "react-native";

import TagSection from "@/components/TagSection";
import {CHIP_HEIGHT} from "@/components/RailChip";
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

        // No empty-state copy: the visible control is enough, and the common
        // case must not read as unfinished.
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

    it("draws the remove glyph as its own minimum-size control", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Carbonic maceration"]} known={[]} onChange={onChange}/>
        );

        expect(screen.getByText("✕")).toBeTruthy();
        expect(StyleSheet.flatten(screen.getByLabelText("Remove tag Carbonic maceration").props.style))
            .toMatchObject({width: CHIP_HEIGHT, height: CHIP_HEIGHT});
    });

    it("lets long chips shrink and wrap inside a row", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Carbonic maceration"]} known={[]} onChange={onChange}/>
        );

        const chipStyle = StyleSheet.flatten(
            screen.getByTestId("tag-chip-carbonic maceration").props.style
        );
        expect(chipStyle).toMatchObject({minHeight: CHIP_HEIGHT, flexShrink: 1});
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
        expect(screen.getByLabelText("New tag")).toBeTruthy();
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

    it("folds a lower-case query when matching library tags", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={[]} known={["Washed"]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "was");

        expect(screen.getByLabelText("Use tag Washed")).toBeTruthy();
    });

    it("folds non-ASCII case when matching library tags", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={[]} known={["café au lait"]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "CAFÉ");

        expect(screen.getByLabelText("Use tag café au lait")).toBeTruthy();
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

    it("does not offer the same tag twice when the library and vocabulary collide", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={[]} known={["Washed"]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "was");

        expect(screen.getAllByLabelText("Use tag Washed")).toHaveLength(1);
    });

    it("caps suggestions before they take over the deck", async () => {
        const onChange = jest.fn();
        const known = Array.from({length: 7}, (_, i) => `tag-${i}`);
        await renderWithProviders(<TagSection tags={[]} known={known} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "tag");

        expect(screen.getByLabelText("Use tag tag-0")).toBeTruthy();
        expect(screen.getByLabelText("Use tag tag-5")).toBeTruthy();
        expect(screen.queryByLabelText("Use tag tag-6")).toBeNull();
    });

    it("lets long suggestions shrink and wrap inside a row", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={[]} known={["Carbonic maceration"]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "car");

        const style = StyleSheet.flatten(
            screen.getByLabelText("Use tag Carbonic maceration").props.style
        );
        expect(style).toMatchObject({minHeight: CHIP_HEIGHT, flexShrink: 1});
    });

    it("adds a tag when its suggestion is tapped", async () => {
        const onChange = jest.fn();
        await renderWithProviders(<TagSection tags={[]} known={[]} onChange={onChange}/>);

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent.changeText(screen.getByLabelText("New tag"), "Nat");
        await fireEvent.press(screen.getByLabelText("Use tag Natural"));

        expect(onChange).toHaveBeenCalledWith(["Natural"]);
    });

    // Deliberate exception to "the section adds no rules of its own": a blank
    // submit is dropped here so a no-op edit does not dirty the recipe. The
    // trim and blank check agree with `setTags`, which is why the exception is
    // safe rather than a second, disagreeing validator.
    it("does not report anything for an empty submission", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Morning"]} known={[]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent(screen.getByLabelText("New tag"), "submitEditing",
                        {nativeEvent: {text: "   "}});

        expect(onChange).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("New tag")).toBeNull();
    });

    it("closes the field on blur", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Morning"]} known={[]} onChange={onChange}/>
        );

        await fireEvent.press(screen.getByLabelText("Add a tag"));
        await fireEvent(screen.getByLabelText("New tag"), "blur");

        expect(screen.queryByLabelText("New tag")).toBeNull();
    });

    it("gives every tag control the house minimum touch height", async () => {
        const onChange = jest.fn();
        await renderWithProviders(
            <TagSection tags={["Morning"]} known={["Washed"]} onChange={onChange}/>
        );

        expect(StyleSheet.flatten(screen.getByLabelText("Add a tag").props.style))
            .toMatchObject({minHeight: CHIP_HEIGHT});

        await fireEvent.press(screen.getByLabelText("Add a tag"));

        expect(StyleSheet.flatten(screen.getByLabelText("New tag").props.style))
            .toMatchObject({minHeight: CHIP_HEIGHT});
        expect(screen.getByLabelText("New tag").props.placeholder).toBeUndefined();
        expect(screen.getByLabelText("New tag").props.placeholderTextColor).toBeUndefined();

        await fireEvent.changeText(screen.getByLabelText("New tag"), "was");

        expect(StyleSheet.flatten(screen.getByLabelText("Use tag Washed").props.style))
            .toMatchObject({minHeight: CHIP_HEIGHT});
    });

    it("stops offering to add once the recipe is full", async () => {
        const onChange = jest.fn();
        const full = Array.from({length: 20}, (_, i) => `tag-${i}`);
        await renderWithProviders(<TagSection tags={full} known={[]} onChange={onChange}/>);

        expect(screen.queryByLabelText("Add a tag")).toBeNull();
    });
});
