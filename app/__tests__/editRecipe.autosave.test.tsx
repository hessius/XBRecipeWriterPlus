import React from "react";
import {Share} from "react-native";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import EditRecipe from "@/app/editRecipe";
import {renderWithProviders} from "@/test-utils/render";

import Recipe from "@/library/Recipe";
import RecipeDatabase from "@/library/RecipeDatabase";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

// Copied from app/__tests__/editRecipe.test.tsx, except this suite uses the
// real RecipeDatabase through test-utils/sqlite because the assertions are
// about what lands in the store.
type BeforeRemoveEvent = {
    data: {action: {type: string}};
    preventDefault: () => void;
};

let mockBacking: FakeSQLiteDatabase;
let mockRecipeJSON = "";
let mockParams: Record<string, string> | null = null;
let mockSettings: Record<string, unknown> = {};
const mockReact = React;
const mockSetOptions = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockPush = jest.fn();
const mockBeforeRemoveListeners = new Set<(event: BeforeRemoveEvent) => void>();
let mockScreenLeft = false;

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => mockBacking
}));

jest.mock("expo-router", () => ({
    router: {
        push: (...args: unknown[]) => mockPush(...args),
        back: jest.fn()
    },
    useLocalSearchParams: () =>
        mockParams ?? {recipeJSON: mockRecipeJSON, saveEnabled: "false"},
    useNavigation: () => ({
        setOptions: mockSetOptions,
        goBack:     () => {
            mockGoBack();
            let prevented = false;
            const event = {
                data:           {action: {type: "GO_BACK"}},
                preventDefault: () => {
                    prevented = true;
                }
            };
            for (const listener of Array.from(mockBeforeRemoveListeners)) {
                listener(event);
            }
            if (!prevented) mockScreenLeft = true;
            return !prevented;
        },
        dispatch: (...args: unknown[]) => mockDispatch(...args),
        addListener: (name: string, listener: (event: BeforeRemoveEvent) => void) => {
            if (name !== "beforeRemove") return () => {};
            mockBeforeRemoveListeners.add(listener);
            return () => {
                mockBeforeRemoveListeners.delete(listener);
            };
        }
    })
}));

let mockBrewSummary = {
    times: 0, lastAt: 0, avgRating: 0, rated: 0,
    timed: 0, meanBrewSeconds: 0, measured: 0, meanCupMl: 0, abandoned: 0
};
const mockRate = jest.fn();
jest.mock("@/hooks/useBrewHistory", () => ({
    ...jest.requireActual("@/hooks/useBrewHistory"),
    useRecipeRating: () => ({summary: mockBrewSummary, rate: mockRate})
}));

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    ...jest.requireActual("@/components/XbrwToast"),
    notify: (...args: unknown[]) => mockNotify(...args)
}));

let mockShareState: {status: "idle"} | {status: "sharing"} |
    {status: "failed"; reason: "network" | "limited" | "unavailable" | "unusable"} = {status: "idle"};
const mockShareRecipe = jest.fn();
jest.mock("@/hooks/useShareRecipe", () => ({
    ...jest.requireActual("@/hooks/useShareRecipe"),
    useShareRecipe: () => ({
        state:        mockShareState,
        share:        mockShareRecipe,
        dismissError: jest.fn()
    })
}));

const mockWriteCard = jest.fn();
jest.mock("@/hooks/useCardWriter", () => ({
    useCardWriter: () => ({
        writeCard:        mockWriteCard,
        onNFCDialogClose: jest.fn(),
        showNfcOverlay:   false,
        writeProgress:    0
    })
}));

jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => {
        const [, bump] = mockReact.useState(0);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const {DEFAULTS: mockDefaults} = require("@/library/Settings");
        return [
            mockSettings[key] ?? mockDefaults[key],
            (value: unknown) => {
                mockSettings = {...mockSettings, [key]: value};
                bump((n: number) => n + 1);
            }
        ];
    }
}));

jest.mock("@/library/NFC", () => ({
    __esModule:     true,
    default:        jest.fn().mockImplementation(() => ({
        getIsClosed: jest.fn(() => true),
        close:       jest.fn(),
        writeCard:   jest.fn()
    })),
    setNfcAlertIOS: jest.fn()
}));

/** 18 g at 1:16 over one pour of 288 ml, in balance. */
function fixture(): Recipe {
    const r = new Recipe();
    r.uuid = "u1";
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 60;
    r.grindRPM = 90;
    r.addOpeningPour();
    r.pours[0].volume = 288;
    r.pours[0].flowRate = 30;
    return r;
}

function stored(): Recipe | null {
    return new RecipeDatabase().getRecipe("u1");
}

async function openSavedRecipe() {
    const saved = fixture();
    new RecipeDatabase().insertRecipe(saved);
    mockRecipeJSON = JSON.stringify(saved);
    return renderWithProviders(<EditRecipe/>);
}

async function openAbout(): Promise<void> {
    await fireEvent.press(screen.getByLabelText("About this recipe"));
}

async function typeDose(value: string): Promise<void> {
    await fireEvent.press(screen.getByLabelText("Edit Dose"));
    const input = screen.getByLabelText("Dose");
    await fireEvent.changeText(input, value);
    await fireEvent(input, "submitEditing", {nativeEvent: {text: value}});
}

async function pressOnSheet(label: string, landed: () => boolean): Promise<void> {
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText(label));
        expect(landed()).toBe(true);
    });
}

describe("editRecipe autosave", () => {
    beforeEach(() => {
        mockBacking = createTestDatabase();
        mockRecipeJSON = "";
        mockParams = null;
        mockSettings = {};
        mockSetOptions.mockClear();
        mockGoBack.mockClear();
        mockDispatch.mockClear();
        mockPush.mockClear();
        mockScreenLeft = false;
        mockNotify.mockClear();
        mockShareState = {status: "idle"};
        mockShareRecipe.mockReset();
        mockWriteCard.mockReset();
        mockBeforeRemoveListeners.clear();
        jest.spyOn(Share, "share").mockResolvedValue({action: Share.dismissedAction});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("keeps a typed note after backing out", async () => {
        await openSavedRecipe();
        await openAbout();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Sweet"}});
        await fireEvent.press(screen.getByLabelText("Back"));

        expect(stored()?.description).toBe("Sweet");
    });

    it("leaves the dose alone when it saves the note", async () => {
        await openSavedRecipe();
        await typeDose("22");
        await openAbout();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Sweet"}});

        expect(stored()?.description).toBe("Sweet");
        expect(stored()?.dosage).toBe(18);
    });

    it("asks before backing out with a changed dose", async () => {
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("Back"));

        expect(screen.getByLabelText("Save changes")).toBeTruthy();
        expect(mockScreenLeft).toBe(false);
        expect(stored()?.dosage).toBe(18);
    });

    it("does not ask when nothing SAVE owns has changed", async () => {
        await openSavedRecipe();
        await openAbout();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Sweet"}});
        await fireEvent.press(screen.getByLabelText("Back"));

        expect(screen.queryByLabelText("Save changes")).toBeNull();
        expect(mockScreenLeft).toBe(true);
    });

    it("saves and leaves when asked to", async () => {
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("Back"));
        await pressOnSheet("Save changes", () => stored()?.dosage === 22);

        expect(stored()?.dosage).toBe(22);
    });

    it("leaves the stored recipe alone when asked to discard", async () => {
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("Back"));
        await pressOnSheet("Discard changes", () => mockDispatch.mock.calls.length > 0);

        expect(stored()?.dosage).toBe(18);
    });

    it("does not ask on the way out of a delete", async () => {
        // The recipe is gone. Offering to save it would be offering to put it back.
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("More"));
        await pressOnSheet("Delete", () => stored() === null);

        expect(screen.queryByLabelText("Save changes")).toBeNull();
        expect(mockScreenLeft).toBe(true);
    });
});
