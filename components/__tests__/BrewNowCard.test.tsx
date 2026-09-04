import React from "react";
import {cleanup} from "@testing-library/react-native";

import BrewNowCard from "@/components/BrewNowCard";
import {palette} from "@/constants/colors";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

afterEach(cleanup);

function stage(pattern: number, pause: number): Pour {
    return new Pour(1, 70, 92, 40, AGITATION.ALL_OFF, pattern, pause);
}

describe("BrewNowCard", () => {
    it("names what the stage is doing, in the order the mockup had it", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByText("POURING · SPIRAL · 92°")).toBeTruthy();
    });

    it("says the pattern in a sentence, and what happens after it", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByText(/Out from the centre and back/)).toBeTruthy();
        expect(getByText(/rests 20 s/)).toBeTruthy();
    });

    it("does not promise a rest that the recipe does not ask for", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.CIRCULAR, 0)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByText(/Round the bed in a steady ring\.$/)).toBeTruthy();
    });

    it("says RESTING once the water is in", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting />
        );

        expect(getByText("RESTING · SPIRAL · 92°")).toBeTruthy();
    });

    it("mentions the stirring, which the pour pattern never says", async () => {
        const stirring = new Pour(1, 70, 92, 40, AGITATION.BEFORE_ON_AFTER_ON,
                                  POUR_PATTERN.CIRCULAR, 0);
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stirring} accent={palette.brand} resting={false} />
        );

        expect(getByText(/It stirs the bed before and after\.$/)).toBeTruthy();
    });

    it("shows nothing at all before a stage is live", async () => {
        const {queryByText} = await renderWithProviders(
            <BrewNowCard pour={undefined} accent={palette.brand} resting={false} />
        );

        // Not `toJSON()).toBeNull()`: the provider wrapper is a node whether or
        // not the card draws, so that assertion would pass for the wrong reason.
        // Any text at all means the card put something on the screen.
        expect(queryByText(/\S/)).toBeNull();
    });
});
