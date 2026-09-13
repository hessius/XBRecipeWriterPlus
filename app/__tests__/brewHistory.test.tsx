// app/__tests__/brewHistory.test.tsx
import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import BrewHistory from "@/app/brewHistory";
import {renderWithProviders} from "@/test-utils/render";
import type {StoredBrew} from "@/library/BrewDatabase";

const mockPush = jest.fn();
const mockSetOptions = jest.fn();
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
        useNavigation: () => ({setOptions: (...args: unknown[]) => mockSetOptions(...args)}),
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

/**
 * Press a button on the confirmation sheet, retrying until the press lands.
 *
 * The sheet animates in, and while it is animating its button is in the tree
 * and findable but its press is discarded. On an idle machine the animation is
 * over before the next line runs; under load it is not, the press goes nowhere
 * with no error, and the test fails on the assertion afterwards — pointing at
 * the delete rather than at the press that never happened. That is what made
 * this intermittent failure so hard to name.
 *
 * Retrying the press rather than sleeping first, because what is being waited
 * for is the press taking effect, and that is the only honest test of it.
 */
async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    });
}

describe("brew history", () => {
    beforeEach(() => {
        mockFilter = undefined;
        mockBrews = makeBrews();
        mockPush.mockReset();
        mockSetOptions.mockReset();
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
        const {getAllByText, queryByText} = await renderWithProviders(<BrewHistory />);
        // Kenya Nyeri now appears both as the header subtitle and in its row;
        // Ethiopia Guji is filtered out of the list entirely.
        expect(getAllByText("Kenya Nyeri").length).toBeGreaterThan(0);
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
        // The row's label carries the whole summary, not just the name, so
        // that repeated brews of one recipe are distinguishable to a reader.
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));
        expect(mockPush).toHaveBeenCalledWith("/brewRecord?id=a");
    });

    it("draws the app's own pushed-screen header, with its own back key", async () => {
        // The native bar is switched off in `app/_layout.tsx`, not from inside
        // the screen: an effect runs after the first paint, so a screen that
        // hides its own bar gives it one frame to flash. An earlier pass only
        // emptied the bar's *title* from here, which left the bar itself — a
        // blank strip and a system chevron sitting above the app's header.
        await renderWithProviders(<BrewHistory />);
        expect(screen.getByText("Brew history")).toBeTruthy();
        expect(screen.getByTestId("screen-header-back")).toBeTruthy();
    });

    it("does not reach for the native bar's options at all", async () => {
        // The whole bug was a screen trying to dress a bar it should not have
        // had. If this screen starts calling setOptions again, the bar is back.
        await renderWithProviders(<BrewHistory />);
        expect(mockSetOptions).not.toHaveBeenCalled();
    });

    it("counts the brews beside the title", async () => {
        // Two rows are seeded by this suite's fixture.
        await renderWithProviders(<BrewHistory />);
        expect(screen.getByTestId("screen-title-count")).toHaveTextContent("2");
    });

    it("names the recipe when filtered to one, and not when unfiltered", async () => {
        // The recipe subtitle says which recipe the filtered list belongs to.
        // A recipe name is human-typed, so it is Inter prose, not Doto — this
        // asserts it exists, the DotMatrixText rule is enforced by the type of
        // the component it renders through.
        mockFilter = "uuid-2";
        const filtered = await renderWithProviders(<BrewHistory />);
        expect(filtered.getByTestId("history-header-recipe")).toBeTruthy();
        expect(filtered.getByTestId("history-header-recipe")).toHaveTextContent("Kenya Nyeri");
    });

    it("shows no recipe subtitle when nothing is filtered", async () => {
        const {queryByTestId} = await renderWithProviders(<BrewHistory />);
        expect(queryByTestId("history-header-recipe")).toBeNull();
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
        await pressOnSheet("Delete Ethiopia Guji", () => mockRemove.mock.calls.length > 0);

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
