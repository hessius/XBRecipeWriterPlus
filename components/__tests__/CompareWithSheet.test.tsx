import {fireEvent, waitFor} from "@testing-library/react-native";
import React from "react";

import CompareWithSheet from "@/components/CompareWithSheet";
import {makeBrewRecordFixture} from "@/test-utils/brewRecordMocks";
import {renderWithProviders} from "@/test-utils/render";

const OTHERS = [
    makeBrewRecordFixture({id: "older", startedAt: 1_000, rating: 3}),
    makeBrewRecordFixture({id: "newer", startedAt: 9_000, rating: 0})
];

describe("CompareWithSheet", () => {
    it("lists the recipe's other brews, newest first", async () => {
        const {getAllByTestId} = await renderWithProviders(
            <CompareWithSheet open candidates={OTHERS} onPick={jest.fn()}
                              onClose={jest.fn()} />
        );
        const ids = getAllByTestId(/^compare-candidate-/)
            .map((node) => node.props.testID);
        expect(ids).toEqual(["compare-candidate-newer", "compare-candidate-older"]);
    });

    it("hands back the brew that was tapped", async () => {
        const onPick = jest.fn();
        const {getByTestId} = await renderWithProviders(
            <CompareWithSheet open candidates={OTHERS} onPick={onPick}
                              onClose={jest.fn()} />
        );

        await waitFor(async () => {
            await fireEvent.press(getByTestId("compare-candidate-older"));
            expect(onPick).toHaveBeenCalledWith("older");
        });
    });

    it("says so when this is the only brew of its recipe", async () => {
        const {getByTestId} = await renderWithProviders(
            <CompareWithSheet open candidates={[]} onPick={jest.fn()}
                              onClose={jest.fn()} />
        );
        expect(getByTestId("compare-no-candidates")).toBeTruthy();
    });
});
