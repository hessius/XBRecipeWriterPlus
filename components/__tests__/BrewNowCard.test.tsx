import React from "react";
import {StyleSheet} from "react-native";
import {cleanup} from "@testing-library/react-native";

import BrewNowCard from "@/components/BrewNowCard";
import {AGITATION_SENTENCE, LONGEST_NOW_SENTENCE, PATTERN_SENTENCE}
    from "@/constants/brewCopy";
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
        const {getByTestId} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByTestId("brew-now-sentence").props.children)
            .toBe("Spiral pour, then it rests 20 s.");
    });

    it("does not promise a rest that the recipe does not ask for", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.CIRCULAR, 0)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByTestId("brew-now-sentence").props.children)
            .toBe("Circular pour.");
    });

    it("says RESTING once the water is in", async () => {
        const {getByText} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting />
        );

        expect(getByText("RESTING · SPIRAL · 92°")).toBeTruthy();
    });

    it("mentions the stirring, which the pour pattern never says", async () => {
        const stirred = new Pour(
            1, 70, 92, 40,
            AGITATION.BEFORE_ON_AFTER_ON, POUR_PATTERN.CIRCULAR, 0
        );
        const {getByTestId} = await renderWithProviders(
            <BrewNowCard pour={stirred} accent={palette.brand} resting={false} />
        );

        expect(getByTestId("brew-now-sentence").props.children)
            .toBe("Circular pour. Agitates the bed before and after pouring.");
    });

    it("reserves the tallest sentence so the card cannot change height", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.CENTERED, 0)} accent={palette.brand}
                         resting={false} />
        );

        const reserve = getByTestId("brew-now-reserve");

        expect(reserve.props.children).toBe(LONGEST_NOW_SENTENCE);
        expect(StyleSheet.flatten(reserve.props.style).opacity).toBe(0);
    });

    it("reserves the same height for a stage that says the least", async () => {
        const short = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.CENTERED, 0)} accent={palette.brand}
                         resting={false} />
        );
        const shortReserve = short.getByTestId("brew-now-reserve").props.children;

        const talkative = new Pour(
            1, 70, 92, 40,
            AGITATION.BEFORE_ON_AFTER_ON, POUR_PATTERN.CIRCULAR, 20
        );
        const long = await renderWithProviders(
            <BrewNowCard pour={talkative} accent={palette.brand} resting={false} />
        );

        expect(long.getByTestId("brew-now-reserve").props.children)
            .toBe(shortReserve);
    });

    it("draws the live sentence over the reserve, not beside it", async () => {
        const {getByTestId} = await renderWithProviders(
            <BrewNowCard pour={stage(POUR_PATTERN.SPIRAL, 20)} accent={palette.brand}
                         resting={false} />
        );

        expect(getByTestId("brew-now-sentence").props.children)
            .toBe("Spiral pour, then it rests 20 s.");
    });

    it("says the longest sentence any stage could ask for", () => {
        expect(LONGEST_NOW_SENTENCE)
            .toContain(PATTERN_SENTENCE.circular);
        expect(LONGEST_NOW_SENTENCE)
            .toContain(AGITATION_SENTENCE[AGITATION.BEFORE_ON_AFTER_ON]);
        expect(LONGEST_NOW_SENTENCE).toContain("rests");
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
