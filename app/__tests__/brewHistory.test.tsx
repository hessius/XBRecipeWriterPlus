// app/__tests__/brewHistory.test.tsx
import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BrewHistory from "@/app/brewHistory";
import {renderWithProviders} from "@/test-utils/render";
import type {StoredBrew} from "@/library/BrewDatabase";

const mockPush = jest.fn();
let mockFilter: string | undefined = undefined;
let mockBrews: StoredBrew[] = [];
let mockRefresh: jest.Mock = jest.fn();
let mockFocusEpoch = 0;

jest.mock("expo-router", () => {
    const actualReact = jest.requireActual("react");
    return {
        router: {push: (...args: unknown[]) => mockPush(...args), back: jest.fn()},
        useLocalSearchParams: () => ({recipeUuid: mockFilter}),
        useNavigation: () => ({setOptions: jest.fn()}),
        useFocusEffect: (cb: () => void) => {
            const epoch = mockFocusEpoch;
            actualReact.useEffect(() => { cb(); }, [cb, epoch]);
        }
    };
});

jest.mock("@/hooks/useBrewHistory", () => ({
    useBrewHistory: () => ({
        brews: mockBrews,
        remove: jest.fn(),
        open: jest.fn(),
        refresh: (...args: unknown[]) => mockRefresh(...args)
    }),
    sharedBrewDatabase: () => ({})
}));

function makeBrews(): StoredBrew[] {
    return [
        {id: "a", recipeUuid: "uuid-1", recipeName: "Ethiopia Guji",
         accent: "#C86A3B", startedAt: 2, endedAt: 3, outcome: "done",
         failure: null, pours: 5, waterTotal: 250, cupTotal: 244,
         heldSeconds: 0, hasStream: true},
        {id: "b", recipeUuid: "uuid-2", recipeName: "Kenya Nyeri",
         accent: "#4A7BC8", startedAt: 1, endedAt: 2, outcome: "done",
         failure: null, pours: 3, waterTotal: 200, cupTotal: 195,
         heldSeconds: 0, hasStream: false}
    ];
}

describe("brew history", () => {
    beforeEach(() => {
        mockFilter = undefined;
        mockBrews = makeBrews();
        mockPush.mockReset();
        mockRefresh = jest.fn();
        mockFocusEpoch = 0;
    });

    it("lists every brew when nothing is filtered", async () => {
        const {getByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText("Ethiopia Guji")).toBeTruthy();
        expect(getByText("Kenya Nyeri")).toBeTruthy();
    });

    it("shows one recipe's brews when reached from that recipe", async () => {
        mockFilter = "uuid-2";
        const {getByText, queryByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText("Kenya Nyeri")).toBeTruthy();
        expect(queryByText("Ethiopia Guji")).toBeNull();
    });

    it("says so when there is nothing yet", async () => {
        mockBrews = [];
        const {getByText} = await renderWithProviders(<BrewHistory />);
        expect(getByText(/no brews yet/i)).toBeTruthy();
    });

    it("refreshes the list when the screen gains focus", async () => {
        await renderWithProviders(<BrewHistory />);
        // useFocusEffect fires once on mount.
        expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it("navigates to the record screen with the id param the record screen reads", async () => {
        // This pins the URL shape so a rename of the query-param on either
        // side would produce a test failure rather than a silent 'brew not
        // found' screen.
        await renderWithProviders(<BrewHistory />);
        await fireEvent.press(screen.getByLabelText("Ethiopia Guji"));
        expect(mockPush).toHaveBeenCalledWith("/brewRecord?id=a");
    });
});
