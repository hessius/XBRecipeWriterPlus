/**
 * Kept separate from brewRecord.test.tsx because that file switches the Labs
 * gate on to exercise the hidden action. Merging this file would destroy the
 * only test that leaves `beanconquerorHandoff` at the value a default install
 * has, which is what a user who has never opened Labs actually sees.
 */
import React from "react";

import BrewRecord, {type RecipeLookup} from "@/app/brewRecord";
import {renderWithProviders} from "@/test-utils/render";
import type Recipe from "@/library/Recipe";
import {screen} from "@testing-library/react-native";
import {
    brewRecordFixture as record,
    brewRecordSamples,
    type BrewRecordOpenResult
} from "@/test-utils/brewRecordMocks";
import {HANDOFF_TARGETS} from "@/library/brew/handoff/targets";

const mockPush = jest.fn();
const mockSetOptions = jest.fn();

let mockOpened: BrewRecordOpenResult = {
    record,
    samples: brewRecordSamples
};

jest.mock("expo-router", () => {
    const mocks = jest.requireActual<typeof import("@/test-utils/brewRecordMocks")>(
        "@/test-utils/brewRecordMocks"
    );
    return mocks.createExpoRouterMock({
        push: (...args: unknown[]) => mockPush(...args),
        back: jest.fn(),
        setOptions: (...args: unknown[]) => mockSetOptions(...args),
        params: () => ({id: "brew-1"})
    });
});

jest.mock("@/hooks/useSetting", () => {
    const mockSettings = jest.requireActual<typeof import("@/test-utils/settingsMock")>(
        "@/test-utils/settingsMock"
    );
    return mockSettings.settingsMock();
});

jest.mock("@/hooks/useBrewHistory", () => {
    const mocks = jest.requireActual<typeof import("@/test-utils/brewRecordMocks")>(
        "@/test-utils/brewRecordMocks"
    );
    return mocks.createBrewHistoryMock({
        brews: () => [],
        opened: () => mockOpened
    });
});

describe("brew record handoff gate", () => {
    beforeEach(() => {
        mockOpened = {
            record,
            samples: brewRecordSamples
        };
    });

    it("does not offer Beanconqueror handoff while the Labs setting is off", async () => {
        const mockLookup: RecipeLookup = {
            getRecipe: jest.fn(() => ({pours: []}) as unknown as Recipe)
        };
        const [handoffTarget] = HANDOFF_TARGETS;

        await renderWithProviders(<BrewRecord recipeLookup={mockLookup} />);

        expect(screen.getByLabelText("Save as image")).toBeTruthy();
        expect(screen.queryByLabelText(handoffTarget.buttonLabel)).toBeNull();
    });
});
