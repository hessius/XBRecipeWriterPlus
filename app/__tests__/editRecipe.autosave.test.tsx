import React from "react";
import {Share} from "react-native";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";

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

/**
 * 12 g at 1:16 over one pour of 192 ml.
 *
 * Smaller than `fixture` on purpose: a card holds at most 240 ml in a stage,
 * so the 288 ml one can never be written or brewed and BREW stays disabled
 * against it. Anything pressing BREW needs this one.
 */
function brewableFixture(): Recipe {
    const r = fixture();
    r.dosage = 12;
    r.pours[0].volume = 192;
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

async function renameFromHeader(name: string): Promise<void> {
    await fireEvent.press(screen.getByTestId("hero-rename"));
    await waitFor(() => {
        expect(screen.getByTestId("rename-field")).toBeTruthy();
    });
    await fireEvent.changeText(screen.getByTestId("rename-field"), name);
    await waitFor(async () => {
        await fireEvent.press(screen.getByTestId("rename-confirm"));
        expect(stored()?.name).toBe(name);
    }, {timeout: 5000});
}

/**
 * Nudge the grind coarser. Unlike the dose, the grind is not a term in
 * `dose x ratio = sum of stage volumes`, so changing it leaves the recipe in
 * balance and BREW enabled. That matters wherever a test needs a pending edit
 * *and* a pressable BREW.
 */
async function coarsenGrind(): Promise<void> {
    await fireEvent.press(screen.getByLabelText("Increase Grind size"));
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
    }, {timeout: 5000});
}

function attemptNativeExit(action = {type: "GO_BACK"}): boolean {
    let prevented = false;
    const event = {
        data:           {action},
        preventDefault: () => {
            prevented = true;
        }
    };
    for (const listener of Array.from(mockBeforeRemoveListeners)) {
        listener(event);
    }
    if (!prevented) mockScreenLeft = true;
    return !prevented;
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

    it("renames a saved recipe without waiting for SAVE", async () => {
        await openSavedRecipe();

        await renameFromHeader("Kenya");

        expect(stored()?.name).toBe("Kenya");
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

    it("autosaves an unblurred note before backing out", async () => {
        await openSavedRecipe();
        await openAbout();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await fireEvent.press(screen.getByLabelText("Back"));

        expect(stored()?.description).toBe("Sweet");
        expect(screen.queryByLabelText("Save changes")).toBeNull();
        expect(mockScreenLeft).toBe(true);
    });

    it("autosaves an unblurred note before a native back exit", async () => {
        await openSavedRecipe();
        await openAbout();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await act(async () => {
            attemptNativeExit({type: "POP"});
        });

        await waitFor(() => {
            expect(stored()?.description).toBe("Sweet");
            expect(mockDispatch).toHaveBeenCalledWith({type: "POP"});
        });
        expect(screen.queryByLabelText("Save changes")).toBeNull();
    });

    it("asks to save a never-saved recipe with a typed note", async () => {
        mockRecipeJSON = JSON.stringify(fixture());
        await renderWithProviders(<EditRecipe/>);
        await openAbout();

        await fireEvent.changeText(screen.getByTestId("note-field"), "Sweet");
        await fireEvent(screen.getByTestId("note-field"), "endEditing",
                        {nativeEvent: {text: "Sweet"}});
        await fireEvent.press(screen.getByLabelText("Back"));

        expect(stored()).toBeNull();
        expect(screen.getByText("This recipe is not in your library yet. Save it to keep the name, note, tags and brew settings.")).toBeTruthy();
        expect(screen.getByLabelText("Save to library")).toBeTruthy();
        expect(screen.getByLabelText("Discard recipe")).toBeTruthy();
        expect(mockScreenLeft).toBe(false);

        await pressOnSheet("Save to library", () => stored()?.description === "Sweet");

        expect(stored()?.description).toBe("Sweet");
    });

    it("saves and leaves when asked to", async () => {
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("Back"));
        await pressOnSheet("Save changes", () => stored()?.dosage === 22);

        expect(stored()?.dosage).toBe(22);
    });

    it("keeps the leave sheet open when saving from it fails", async () => {
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("Back"));
        expect(screen.getByLabelText("Save changes")).toBeTruthy();

        jest.spyOn(RecipeDatabase.prototype, "updateRecipe").mockImplementation(() => {
            throw new Error("disk full");
        });
        await fireEvent.press(screen.getByLabelText("Save changes"));

        await waitFor(() => {
            expect(mockNotify).toHaveBeenCalledWith({
                tone:    "error",
                message: "Could not save the recipe."
            });
        });
        expect(screen.getByLabelText("Save changes")).toBeTruthy();
        expect(mockDispatch).not.toHaveBeenCalled();
        expect(stored()?.dosage).toBe(18);
    });

    it("leaves the stored recipe alone when asked to discard", async () => {
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("Back"));
        await pressOnSheet("Discard changes", () => mockDispatch.mock.calls.length > 0);

        expect(stored()?.dosage).toBe(18);
    });

    it("guards the next exit if a replayed exit did not remove the screen", async () => {
        // A navigator can refuse or ignore the replayed action. The bypass is
        // only for that one replay, not a permanent opt-out for this screen.
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("Back"));
        await pressOnSheet("Discard changes", () => mockDispatch.mock.calls.length > 0);
        mockDispatch.mockClear();

        await fireEvent.press(screen.getByLabelText("Back"));

        expect(screen.getByLabelText("Save changes")).toBeTruthy();
        expect(mockDispatch).not.toHaveBeenCalled();
        expect(mockScreenLeft).toBe(false);
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

    it("does not ask on the way out of a duplicate", async () => {
        // The copy is already the answer. Prompting here would offer to save
        // the original recipe after the user asked for a duplicate instead.
        await openSavedRecipe();

        await typeDose("22");
        await fireEvent.press(screen.getByLabelText("More"));
        await pressOnSheet("Duplicate", () => mockScreenLeft);

        expect(screen.queryByLabelText("Save changes")).toBeNull();
        expect(mockScreenLeft).toBe(true);
    });

    it("asks before brewing with a changed dose, and still brews", async () => {
        mockSettings = {machineDeviceId: "AA:BB:CC:DD:EE:FF"};
        const brewable = brewableFixture();
        new RecipeDatabase().insertRecipe(brewable);
        mockRecipeJSON = JSON.stringify(brewable);
        await renderWithProviders(<EditRecipe/>);

        await coarsenGrind();
        await fireEvent.press(screen.getByLabelText("Brew"));

        expect(screen.getByLabelText("Save and brew")).toBeTruthy();
        expect(mockPush).not.toHaveBeenCalled();

        await pressOnSheet("Brew without saving", () => mockPush.mock.calls.length > 0);

        expect(stored()?.grindSize).toBe(60);
    });

    it("saves a recipe that is not in the library on the way to the machine", async () => {
        // A brew record points back at its recipe by uuid, and the record
        // screen draws its stage ladder from that row. BREW has always saved
        // first; what changed is only that a recipe already in the library is
        // no longer written over without being asked.
        mockSettings = {machineDeviceId: "AA:BB:CC:DD:EE:FF"};
        mockRecipeJSON = JSON.stringify(brewableFixture());
        await renderWithProviders(<EditRecipe/>);

        expect(stored()).toBeNull();

        await coarsenGrind();
        await fireEvent.press(screen.getByLabelText("Brew"));

        expect(screen.queryByLabelText("Save and brew")).toBeNull();
        expect(stored()?.grindSize).toBe(61);
    });
});
