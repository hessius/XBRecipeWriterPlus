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
let mockRemove: jest.Mock = jest.fn();
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
        remove: (...args: unknown[]) => mockRemove(...args),
        open: jest.fn(),
        refresh: (...args: unknown[]) => mockRefresh(...args)
    }),
    sharedBrewDatabase: () => ({})
}));

// react-native-gesture-handler's Swipeable is a native-touch-heavy component.
// Under Jest, swipe gestures cannot be fired, so the delete tile is exposed
// directly via its accessible label so tests can reach it without a gesture.
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
    const actualReact = jest.requireActual("react");
    return {
        __esModule: true,
        default: ({children, renderRightActions}: {
            children: React.ReactNode;
            renderRightActions?: () => React.ReactNode;
        }) => (
            <actualReact.Fragment>
                {children}
                {renderRightActions?.()}
            </actualReact.Fragment>
        )
    };
});

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
        mockRemove = jest.fn();
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

    it("shows a delete tile that opens a confirmation before removing", async () => {
        // The Swipeable is mocked to render its right actions inline, so the
        // "Delete brew" tile is always visible in the test tree.
        await renderWithProviders(<BrewHistory />);

        // There are two delete tiles (one per row); press the first one.
        const tiles = screen.getAllByLabelText("Delete brew");
        await fireEvent.press(tiles[0]);

        // The confirmation sheet must appear before anything is removed.
        expect(mockRemove).not.toHaveBeenCalled();
        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });

    it("deletes only after the explicit confirmation", async () => {
        await renderWithProviders(<BrewHistory />);

        const tiles = screen.getAllByLabelText("Delete brew");
        await fireEvent.press(tiles[0]);

        // The confirmation button names the brew so there is no ambiguity.
        const confirmButton = screen.getByLabelText("Delete Ethiopia Guji");
        await fireEvent.press(confirmButton);

        expect(mockRemove).toHaveBeenCalledWith("a");
    });

    it("does not delete when the user keeps the brew", async () => {
        await renderWithProviders(<BrewHistory />);

        const tiles = screen.getAllByLabelText("Delete brew");
        await fireEvent.press(tiles[0]);

        await fireEvent.press(screen.getByLabelText("Keep this brew"));

        expect(mockRemove).not.toHaveBeenCalled();
    });
});
