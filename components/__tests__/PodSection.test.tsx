import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import PodSection from "@/components/PodSection";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipeWith(over: Partial<Recipe> = {}): Recipe {
    return Object.assign(new Recipe(), over);
}

function props(over: Partial<React.ComponentProps<typeof PodSection>> = {}) {
    return {
        recipe:             recipeWith(),
        showHint:           false,
        showAvatar:         true,
        xidLookupFailed:    false,
        externalEpoch:      0,
        onXidFocusChange:   jest.fn(),
        onInputErrorChange: jest.fn(),
        onDraft:            jest.fn(),
        onCommit:           jest.fn(),
        onFollowPod:        jest.fn(),
        ...over
    };
}

/** Linked and following the pod: a pod name, and no name of its own. */
function linked(over: Partial<Recipe> = {}): Recipe {
    return recipeWith({xid: "CGL12", xbloomName: "Ethiopia Guji", ...over});
}

describe("PodSection", () => {
    it("draws the ID field even for a recipe with no pod", async () => {
        // Always there, because someone hunting for the field needs it in a
        // fixed place rather than in a section that appears once they have
        // already found the answer.
        await renderWithProviders(<PodSection {...props()}/>);

        expect(screen.getByLabelText("Recipe ID")).toBeTruthy();
        expect(screen.getByTestId("pod-none")).toBeTruthy();
        expect(screen.queryByTestId("pod-linked")).toBeNull();
    });

    it("gives the empty ID field a visible resting affordance", async () => {
        // RNTL cannot see the field on glass, only the rendered props that make
        // it visible on device. Removing the raised fill or example placeholder
        // is the production edit that should break this test.
        await renderWithProviders(<PodSection {...props()}/>);

        const input = screen.getByLabelText("Recipe ID");

        expect(input.props.placeholder).toBe("CGL12");
        expect(input.props.placeholderTextColor).toBe(palette.muted);
        expect(input).toHaveStyle({
            backgroundColor: palette.raised,
            borderColor:     palette.control,
            borderWidth:     1,
            borderRadius:    9
        });
    });

    it("shows the pod it is following, and says so", async () => {
        await renderWithProviders(<PodSection {...props({recipe: linked()})}/>);

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
        expect(screen.getByTestId("pod-following")).toBeTruthy();
        expect(screen.queryByTestId("pod-use-name")).toBeNull();
    });

    it("offers the pod name back to a recipe that was renamed", async () => {
        await renderWithProviders(
            <PodSection {...props({recipe: linked({name: "Sunday"})})}/>
        );

        expect(screen.getByTestId("pod-use-name")).toBeTruthy();
        expect(screen.queryByTestId("pod-following")).toBeNull();
    });

    it("follows the pod by clearing the name, never by copying it", async () => {
        // An empty name is not a missing value: `displayName()` falls back to
        // the pod name, so clearing restores the link. Copying would freeze the
        // string, and the day the pod name changes or the ID is corrected, the
        // recipe would go on saying something slightly wrong forever.
        const onFollowPod = jest.fn();
        await renderWithProviders(
            <PodSection {...props({recipe: linked({name: "Sunday"}), onFollowPod})}/>
        );

        await fireEvent.press(screen.getByTestId("pod-use-name"));

        expect(onFollowPod).toHaveBeenCalled();
    });

    it("says a failed lookup is saved anyway, rather than failing the recipe", async () => {
        await renderWithProviders(<PodSection {...props({xidLookupFailed: true})}/>);

        expect(screen.getByTestId("pod-not-found")).toBeTruthy();
        // A note on the field's own title, not a validation failure: a recipe
        // whose ID nobody could look up still saves and still writes.
        expect(screen.getByText("Recipe ID · not found")).toBeTruthy();
        expect(screen.queryByText(/Not a valid ID/i)).toBeNull();
        // The explanation of what an ID is for belongs to a recipe that has
        // none, not to one whose lookup went out and came back empty.
        expect(screen.queryByTestId("pod-none")).toBeNull();
    });

    it("draws the pod photo when there is one", async () => {
        await renderWithProviders(
            <PodSection {...props({recipe: linked({imageURL: "https://x/pod.png"})})}/>
        );

        expect(screen.getByTestId("pod-image").props.source)
            .toEqual({uri: "https://x/pod.png"});
    });

    it("drops a photo that will not load rather than leaving an empty circle", async () => {
        // Indistinguishable from a pod that never had one. A missing image is
        // not an error and is never reported as one.
        await renderWithProviders(
            <PodSection {...props({recipe: linked({imageURL: "https://x/pod.png"})})}/>
        );

        await fireEvent(screen.getByTestId("pod-image"), "error");

        expect(screen.queryByTestId("pod-image")).toBeNull();
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("draws no pod photo while the picture setting is off", async () => {
        // The setting names the pod photo in its own description. It used to
        // govern only the sharer's mark, so turning it on changed nothing for a
        // library of pod recipes and nobody could tell it had worked.
        await renderWithProviders(<PodSection {...props({
            recipe: linked({imageURL: "https://x/pod.png"}), showAvatar: false
        })}/>);

        expect(screen.queryByTestId("pod-image")).toBeNull();
        // The row itself stays: the pod name is the point, not the picture.
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    it("reports the ID field's focus, so the lookup can be deferred", async () => {
        const onXidFocusChange = jest.fn();
        await renderWithProviders(<PodSection {...props({onXidFocusChange})}/>);

        await fireEvent(screen.getByLabelText("Recipe ID"), "focus");

        expect(onXidFocusChange).toHaveBeenCalledWith(true);
    });
});
