import React from "react";
import {screen} from "@testing-library/react-native";

import HelpSheet from "@/components/HelpSheet";
import {DETAILED_TOPICS, RECIPE_HELP, helpQuestion} from "@/constants/recipeHelp";
import {renderWithProviders} from "@/test-utils/render";

describe("HelpSheet", () => {
    it("asks every question that has an answer", async () => {
        await renderWithProviders(<HelpSheet open onOpenChange={jest.fn()}/>);

        for (const topic of DETAILED_TOPICS) {
            const entry = helpQuestion(topic);
            expect(entry).toBeDefined();
            expect(screen.getByText(entry!.question)).toBeTruthy();
        }
    });

    it("answers them", async () => {
        await renderWithProviders(<HelpSheet open onOpenChange={jest.fn()}/>);

        expect(screen.getByText(RECIPE_HELP.grinder.detail!)).toBeTruthy();
        expect(screen.getByText(RECIPE_HELP.xid.detail!)).toBeTruthy();
    });

    it("leaves out the fields whose hint is the whole story", async () => {
        // Grind size says all it has to say in a line, and a line that is
        // already under the label is not a question anyone came here with.
        await renderWithProviders(<HelpSheet open onOpenChange={jest.fn()}/>);

        expect(screen.queryByText(RECIPE_HELP.grindSize.hint)).toBeNull();
    });

    it("heads its answers with questions, not with field names", async () => {
        // The reader has just come from the label. Repeating it as a heading
        // makes them work out for themselves which paragraph is theirs.
        await renderWithProviders(<HelpSheet open onOpenChange={jest.fn()}/>);

        expect(screen.queryByText(RECIPE_HELP.grinder.title)).toBeNull();
    });

    it("renders nothing while closed", async () => {
        await renderWithProviders(<HelpSheet open={false} onOpenChange={jest.fn()}/>);

        expect(screen.queryByText(RECIPE_HELP.grinder.detail!)).toBeNull();
    });
});
