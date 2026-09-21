import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

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
});
