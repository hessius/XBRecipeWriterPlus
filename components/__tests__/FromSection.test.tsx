import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import FromSection from "@/components/FromSection";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

function recipeWith(over: Partial<Recipe> = {}): Recipe {
    return Object.assign(new Recipe(), over);
}

function props(over: Partial<React.ComponentProps<typeof FromSection>> = {}) {
    return {
        recipe:     recipeWith(),
        accent:     palette.info,
        showAvatar: false,
        ...over
    };
}

describe("FromSection", () => {
    it("names who a recipe arrived from, as a claim rather than an identity", async () => {
        // "arrived from", never "by": the name is whatever the person sharing
        // it had typed into xBloom, and nothing here can check it.
        await renderWithProviders(
            <FromSection {...props({recipe: recipeWith({sharedBy: "BrewMind"})})}/>
        );

        expect(screen.getByText("Arrived from BrewMind")).toBeTruthy();
        expect(screen.queryByText(/by BrewMind/)).toBeNull();
    });

    it("names xBloom for a pod recipe nobody shared", async () => {
        // An account import carries no sharer at all, which is correct rather
        // than missing: there is no other author to name. It still came from
        // somewhere, and the pod ID is the proof.
        await renderWithProviders(
            <FromSection {...props({recipe: recipeWith({xid: "CGL12"})})}/>
        );

        expect(screen.getByTestId("about-from")).toBeTruthy();
        expect(screen.getByText(/An xBloom recipe/)).toBeTruthy();
        expect(screen.queryByText(/Arrived from/)).toBeNull();
    });

    it("is absent for a recipe the user wrote here", async () => {
        // No sharer and no pod ID: it came from nowhere but this phone. The
        // section used to say so out loud, which is a row spent telling
        // someone something they already knew.
        await renderWithProviders(<FromSection {...props()}/>);

        expect(screen.queryByTestId("about-from")).toBeNull();
    });

    it("draws the accent mark while the setting is off, whatever the recipe carries", async () => {
        await renderWithProviders(
            <FromSection {...props({
                recipe: recipeWith({sharedBy: "BrewMind", sharedByAvatar: "https://x/a.png"})
            })}/>
        );

        expect(screen.getByTestId("from-mark")).toBeTruthy();
        expect(screen.queryByTestId("from-avatar")).toBeNull();
    });

    it("draws the picture once the setting is on", async () => {
        await renderWithProviders(
            <FromSection {...props({
                showAvatar: true,
                recipe:     recipeWith({sharedBy: "BrewMind", sharedByAvatar: "https://x/a.png"})
            })}/>
        );

        expect(screen.getByTestId("from-avatar").props.source)
            .toEqual({uri: "https://x/a.png"});
        expect(screen.queryByTestId("from-mark")).toBeNull();
    });

    it("keeps the accent mark for a sharer who left no picture", async () => {
        await renderWithProviders(
            <FromSection {...props({showAvatar: true, recipe: recipeWith({sharedBy: "BrewMind"})})}/>
        );

        expect(screen.getByTestId("from-mark")).toBeTruthy();
    });

    it("falls silently back to the accent mark when the picture will not load", async () => {
        // Never an error, never a broken-image box. The row looks exactly like
        // one that never had a picture.
        await renderWithProviders(
            <FromSection {...props({
                showAvatar: true,
                recipe:     recipeWith({sharedBy: "BrewMind", sharedByAvatar: "https://x/a.png"})
            })}/>
        );

        await fireEvent(screen.getByTestId("from-avatar"), "error");

        expect(screen.queryByTestId("from-avatar")).toBeNull();
        expect(screen.getByTestId("from-mark")).toBeTruthy();
        expect(screen.getByText("Arrived from BrewMind")).toBeTruthy();
    });
});
