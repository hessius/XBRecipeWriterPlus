import React from "react";
import {screen, fireEvent} from "@testing-library/react-native";

import RestoreSheet from "@/components/RestoreSheet";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

const PAYLOAD = {
    recipes: [recipeNamed("A", "u1"), recipeNamed("B", "u2")],
    settings: {temperatureUnit: "F"},
    skipped: 0,
    appVersion: "2.6.0",
    exportedAt: "2026-08-26T21:00:00.000Z"
};

describe("RestoreSheet", () => {
    it("says how much would be added and how much is already there", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[recipeNamed("A", "u1")]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByText(/1 new recipe/i)).toBeTruthy();
        expect(screen.getByText(/1 .*already/i)).toBeTruthy();
    });

    it("merges by default, because merging cannot lose anything", async () => {
        const onRestore = jest.fn();
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[recipeNamed("A", "u1")]}
                          onCancel={() => {}} onRestore={onRestore}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /add.*librar/i}));

        expect(onRestore).toHaveBeenCalledWith({replace: false, includeSettings: false});
    });

    it("offers the backup's settings, switched off", async () => {
        // Restoring someone else's library should not silently change your
        // preferences, so taking their settings is opt-in.
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByLabelText(/settings from this backup/i)
            .props.accessibilityState.checked).toBe(false);
    });

    it("carries the settings choice out", async () => {
        const onRestore = jest.fn();
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[]}
                          onCancel={() => {}} onRestore={onRestore}/>
        );

        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add.*librar/i}));

        expect(onRestore).toHaveBeenCalledWith({replace: false, includeSettings: true});
    });

    it("keeps replace behind its own confirmation", async () => {
        // A second way to destroy a library must not be one tap away from the
        // safe one.
        const onRestore = jest.fn();
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[recipeNamed("A", "u1")]}
                          onCancel={() => {}} onRestore={onRestore}/>
        );

        await fireEvent.press(screen.getByRole("button", {name: /replace/i}));
        expect(onRestore).not.toHaveBeenCalled();
        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();

        await fireEvent.press(screen.getByRole("button", {name: /yes, replace/i}));
        expect(onRestore).toHaveBeenCalledWith({replace: true, includeSettings: false});
    });

    it("does not offer to replace an empty library", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD} existing={[]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.queryByRole("button", {name: /replace/i})).toBeNull();
    });

    it("reports entries it could not read", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={{...PAYLOAD, skipped: 3}} existing={[]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByText(/3 .*could not be read/i)).toBeTruthy();
    });

    it("says plainly when there is nothing to add", async () => {
        await renderWithProviders(
            <RestoreSheet open payload={PAYLOAD}
                          existing={[recipeNamed("A", "u1"), recipeNamed("B", "u2")]}
                          onCancel={() => {}} onRestore={() => {}}/>
        );

        expect(screen.getByText(/already in your library/i)).toBeTruthy();
    });
});
