import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";

import BrewHistory from "@/app/brewHistory";
import {renderWithProviders} from "@/test-utils/render";
import type {StoredBrew} from "@/library/BrewDatabase";
import {sharedSettings} from "@/hooks/useSetting";

const mockPush = jest.fn();
let mockBrews: StoredBrew[] = [];
let mockRefresh: jest.Mock = jest.fn();
let mockRemove: jest.Mock = jest.fn();
const mockSend = jest.fn();
const mockFits = jest.fn();
const mockReset = jest.fn();

// The selection row is behind the Labs gate, so every test here needs it on.
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

beforeEach(() => {
    sharedSettings().set("beanconquerorHandoff", true);
});

jest.mock("@/hooks/useBrewBatchHandoff", () => ({
    useBrewBatchHandoff: () => ({
        send: (...args: unknown[]) => mockSend(...args),
        fits: (...args: unknown[]) => mockFits(...args),
        reset: (...args: unknown[]) => mockReset(...args),
        busy: false
    })
}));

jest.mock("expo-router", () => {
    const actualReact = jest.requireActual("react");
    return {
        router: {push: (...args: unknown[]) => mockPush(...args), back: jest.fn()},
        useLocalSearchParams: () => ({}),
        useNavigation: () => ({setOptions: jest.fn()}),
        useFocusEffect: (cb: () => void) => {
            actualReact.useEffect(() => { cb(); }, [cb]);
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

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
    const actualReact = jest.requireActual("react");
    return {
        __esModule: true,
        default: ({children, renderRightActions, enabled = true}: {
            children: React.ReactNode;
            renderRightActions?: () => React.ReactNode;
            enabled?: boolean;
        }) => (
            <actualReact.Fragment>
                {children}
                {enabled ? renderRightActions?.() : null}
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
 * Let a just-opened sheet finish arriving before it is touched.
 *
 * `XbrwSheet` slides in on the frame after it mounts (a `requestAnimationFrame`
 * that flips it from closed to shown), and a press dispatched into that gap is
 * dropped. The confirmation's own text is in the tree before that frame lands,
 * so a test that presses as soon as it can read the text wins the race most of
 * the time and loses it occasionally. Waiting a frame makes it deterministic.
 */
async function settleSheet(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
    });
}

describe("brew history batch selection", () => {
    beforeEach(() => {
        mockBrews = makeBrews();
        mockRefresh = jest.fn();
        mockRemove = jest.fn();
        mockPush.mockReset();
        mockSend.mockReset();
        mockFits.mockReset();
        mockFits.mockReturnValue(true);
        mockReset.mockReset();
    });

    it("enters selection mode from the action row", async () => {
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));

        expect(screen.getByText("0 brews selected")).toBeTruthy();
        expect(screen.getByLabelText("Send selected brews to Beanconqueror")).toBeDisabled();
        expect(screen.getAllByTestId("history-row-unselected")).toHaveLength(2);
    });

    it("toggles rows instead of opening the record screen", async () => {
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockFits).toHaveBeenCalledWith(["a"]);
        expect(screen.getByText("1 brew selected")).toBeTruthy();
        expect(screen.getByTestId("history-row-selected")).toBeTruthy();
    });

    it("keeps send disabled with an empty selection", async () => {
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));

        expect(screen.getByLabelText("Send selected brews to Beanconqueror")).toBeDisabled();
        expect(mockFits).not.toHaveBeenCalled();
    });

    it("shows copy and disables send when the selected batch is too large", async () => {
        mockFits.mockReturnValue(false);
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));

        expect(screen.getByText("Select fewer brews to send them together.")).toBeTruthy();
        expect(screen.getByLabelText("Send selected brews to Beanconqueror")).toBeDisabled();
    });

    it("cancel clears the selection", async () => {
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));
        await fireEvent.press(screen.getByLabelText("Cancel selection"));
        await fireEvent.press(screen.getByLabelText("Select brews"));

        expect(screen.getByText("0 brews selected")).toBeTruthy();
        expect(screen.getAllByTestId("history-row-unselected")).toHaveLength(2);
    });

    it("hides swipe delete actions while selecting", async () => {
        await renderWithProviders(<BrewHistory />);

        expect(screen.getAllByLabelText("Delete brew")).toHaveLength(2);
        await fireEvent.press(screen.getByLabelText("Select brews"));

        expect(screen.queryByLabelText("Delete brew")).toBeNull();
    });

    it("blocks the send when a selected brew did not finish", async () => {
        mockBrews = makeBrews();
        mockBrews[1] = {...mockBrews[1], outcome: "cancelled"};
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Kenya Nyeri,/));

        expect(screen.getByTestId("selection-blocked")).toBeTruthy();
        expect(screen.getByLabelText("Send selected brews to Beanconqueror")).toBeDisabled();
    });

    it("still lets an unfinished brew be selected so it can be deleted", async () => {
        mockBrews = makeBrews();
        mockBrews[1] = {...mockBrews[1], outcome: "failed"};
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Kenya Nyeri,/));

        expect(screen.getByTestId("history-row-selected")).toBeTruthy();
        expect(screen.getByLabelText("Delete selected brews")).not.toBeDisabled();
    });

    it("sends a short brew, which produced a drink", async () => {
        mockBrews = makeBrews();
        mockBrews[0] = {...mockBrews[0], outcome: "endedOnMachine"};
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));

        expect(screen.queryByTestId("selection-blocked")).toBeNull();
        expect(screen.getByLabelText("Send selected brews to Beanconqueror")).not.toBeDisabled();
    });

    it("deletes every selected brew once the confirmation is accepted", async () => {
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));
        await fireEvent.press(screen.getByLabelText(/^Kenya Nyeri,/));
        await fireEvent.press(screen.getByLabelText("Delete selected brews"));

        expect(screen.getByText("Delete 2 brews? This cannot be undone.")).toBeTruthy();
        await settleSheet();
        await fireEvent.press(screen.getByLabelText("Delete the selected brews"));

        expect(mockRemove).toHaveBeenCalledWith("a");
        expect(mockRemove).toHaveBeenCalledWith("b");
        expect(screen.getByLabelText("Select brews")).toBeTruthy();
    });

    it("deletes nothing when the confirmation is dismissed", async () => {
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));
        await fireEvent.press(screen.getByLabelText(/^Ethiopia Guji,/));
        await fireEvent.press(screen.getByLabelText("Delete selected brews"));
        await settleSheet();
        await fireEvent.press(screen.getByLabelText("Keep these brews"));

        expect(mockRemove).not.toHaveBeenCalled();
        expect(screen.getByText("1 brew selected")).toBeTruthy();
    });

    it("keeps delete out of reach until something is selected", async () => {
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));

        expect(screen.getByLabelText("Delete selected brews")).toBeDisabled();
    });

    it("offers selection and delete with the handoff switched off", async () => {
        sharedSettings().set("beanconquerorHandoff", false);
        await renderWithProviders(<BrewHistory />);

        await fireEvent.press(screen.getByLabelText("Select brews"));

        expect(screen.queryByLabelText("Send selected brews to Beanconqueror")).toBeNull();
        expect(screen.getByLabelText("Delete selected brews")).toBeTruthy();
    });
});
