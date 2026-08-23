import React from "react";
import {screen} from "@testing-library/react-native";

import HelpSheet from "@/components/HelpSheet";
import {RECIPE_HELP} from "@/constants/recipeHelp";
import {renderWithProviders} from "@/test-utils/render";

describe("HelpSheet", () => {
    it("shows one topic when asked for one", async () => {
        await renderWithProviders(
            <HelpSheet open topic="grinder" onOpenChange={jest.fn()}/>
        );

        expect(screen.getByText(RECIPE_HELP.grinder.title)).toBeTruthy();
        expect(screen.getByText(RECIPE_HELP.grinder.detail!)).toBeTruthy();
        expect(screen.queryByText(RECIPE_HELP.ratio.title)).toBeNull();
    });

    it("falls back to the hint for a topic with no long answer", async () => {
        // `grindSize` is one of the topics that says all it has to say in a
        // line. Asking for it by name still has to answer.
        await renderWithProviders(
            <HelpSheet open topic="grindSize" onOpenChange={jest.fn()}/>
        );

        expect(screen.getByText(RECIPE_HELP.grindSize.title)).toBeTruthy();
        expect(screen.getByText(RECIPE_HELP.grindSize.hint)).toBeTruthy();
    });

    it("shows every topic that has something to say when asked for all", async () => {
        await renderWithProviders(
            <HelpSheet open topic="all" onOpenChange={jest.fn()}/>
        );

        expect(screen.getByText(RECIPE_HELP.grinder.title)).toBeTruthy();
        expect(screen.getByText(RECIPE_HELP.ratio.title)).toBeTruthy();
        // A topic with no long answer is not padded out with its hint here —
        // "all" means every topic that has more to say, not every topic.
        expect(screen.queryByText(RECIPE_HELP.grindSize.title)).toBeNull();
    });

    it("renders nothing while closed", async () => {
        await renderWithProviders(
            <HelpSheet open={false} topic="grinder" onOpenChange={jest.fn()}/>
        );

        expect(screen.queryByText(RECIPE_HELP.grinder.detail!)).toBeNull();
    });
});
