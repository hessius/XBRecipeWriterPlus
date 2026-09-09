import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import EditRecipe from "@/app/editRecipe";
import {renderWithProviders} from "@/test-utils/render";

import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {serialiseCapture, type CardCapture} from "@/library/cardDiagnostics";

// The harness mirrors app/__tests__/editRecipe.test.tsx — the same mock shapes,
// the same `mock`-prefixed lets a hoisted factory is allowed to read, and the
// same `renderEditor` that pulls the header caret back out of `setOptions`.
jest.mock("expo-router", () => ({
    useLocalSearchParams: () =>
        mockParams ?? {recipeJSON: mockRecipeJSON, saveEnabled: "false"},
    useNavigation:        () => ({setOptions: mockSetOptions, goBack: mockGoBack})
}));

jest.mock("@/library/RecipeDatabase");

// The XID row looks its bean's name up against xBloom on mount. Only the tests
// that set `recipe.xid` reach it; the rest never construct this. Default it to
// a resolved lookup with no name so the row stays plain, and let a test flip it
// to a rejection to exercise the "not found" note.
const mockFetchRecipeDetail = jest.fn(() => Promise.resolve());
jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: jest.fn().mockImplementation(() => ({
        fetchRecipeDetail: () => mockFetchRecipeDetail(),
        getRecipeTitle:    () => "",
        getRecipe:         () => null
    }))
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

let mockParams: Record<string, string> | null = null;
let mockSettings: Record<string, unknown> = {};
const mockReact = React;
const mockSetOptions = jest.fn();
const mockGoBack = jest.fn();

/** 18 g at 1:16 over three pours of 96: 288 ml, in balance. */
function fixture(): Recipe {
    const r = new Recipe();
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 60;
    r.grindRPM = 90;
    r.addPour(0, false);
    r.addPour(0);
    r.addPour(0);
    r.autoFixPourVolumes();
    r.pours.forEach(p => { p.flowRate = 30; });
    return r;
}

/** A three-stage coffee recipe with no bypass. */
function recipeWithStages(): Partial<Recipe> {
    return {};
}

/** A tea recipe, which has no bypass anywhere. */
function teaRecipe(): Partial<Recipe> {
    return {cupType: CUP_TYPE.TEA};
}

/** A balanced coffee recipe with `n` stages, built like `fixture`. */
function recipeWithStageCount(n: number): Partial<Recipe> {
    const r = new Recipe();
    r.dosage = 18;
    r.ratio = 16;
    r.grindSize = 60;
    r.grindRPM = 90;
    r.addPour(0, false);
    for (let i = 1; i < n; i++) r.addPour(0);
    r.autoFixPourVolumes();
    r.pours.forEach(p => { p.flowRate = 30; });
    return r;
}

/**
 * A capture whose system info reports `blockCount × blockSize` bytes, modelled
 * on the fixture in components/__tests__/CardReadDiagnostic.test.tsx. That total
 * is the only field the stage ceiling reads.
 */
function captureWithBlocks(blockCount: number, blockSize: number): CardCapture {
    return {
        at: "2026-09-07T19:20:52.313Z",
        uid: [0x04, 0xa1, 0xb2, 0xc3],
        data: [],
        systemInfo: {afi: 0, dsfid: 0, blockCount, blockSize}
    };
}

let mockRecipeJSON = JSON.stringify(fixture());

beforeEach(() => {
    mockRecipeJSON = JSON.stringify(fixture());
    mockSettings = {};
    mockParams = null;
    mockGoBack.mockClear();
    mockNotify.mockClear();
    mockShareState = {status: "idle"};
    mockShareRecipe.mockReset();
    mockWriteCard.mockReset();
    mockFetchRecipeDetail.mockReset();
    mockFetchRecipeDetail.mockResolvedValue(undefined);
});

async function renderEditor(overrides: Partial<Recipe> = {}) {
    mockRecipeJSON = JSON.stringify(Object.assign(fixture(), overrides));
    const view = await renderWithProviders(<><EditRecipe key="editor"/></>);
    const options = mockSetOptions.mock.calls.at(-1)?.[0];
    if (options?.headerRight) await view.rerender(
        <>
            <EditRecipe key="editor"/>
            {options.headerRight()}
        </>
    );
    return view;
}

describe("editor bypass rung", () => {
    it("offers the ghost rung on the stages deck", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.getByTestId("bypass-ghost")).toBeTruthy();
    });

    it("turns bypass on, and the rung replaces the ghost", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        expect(screen.getByTestId("bypass-rung")).toBeTruthy();
        expect(screen.queryByTestId("bypass-ghost")).toBeNull();
    });

    it("puts the bypass band on the profile once it is on", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.queryByTestId("stage-profile-bypass")).toBeNull();
        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        expect(screen.getByTestId("stage-profile-bypass")).toBeTruthy();
    });

    it("closes the rung when bypass is switched off", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText(/^Stages,/));
        // Enabling bypass already opens the rung (see the onEnabledChange in
        // StagesDeck), so REMOVE is in the open fold and reachable without a
        // second tap on the header -- a header toggle here would close the fold
        // and hide REMOVE, since Collapsible marks a closed fold
        // accessibilityElementsHidden.
        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        await fireEvent.press(screen.getByLabelText("Remove bypass water"));

        // The ghost is back, and nothing is left selected pointing at a rung
        // that no longer exists.
        expect(screen.getByTestId("bypass-ghost")).toBeTruthy();
        expect(screen.queryByTestId("stage-profile-band")).toBeNull();
    });

    it("shows no bypass affordance for tea", async () => {
        await renderEditor(teaRecipe());
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.queryByTestId("bypass-ghost")).toBeNull();
        expect(screen.queryByTestId("bypass-rung")).toBeNull();
    });

    it("leaves the stage balance untouched when bypass is added", async () => {
        await renderEditor(recipeWithStages());
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        await fireEvent.press(screen.getByLabelText("Add bypass water"));

        // Bypass is dispensed outside the sum the machine checks. If this
        // fails, bypass has leaked into the pour-volume invariant.
        expect(screen.queryByTestId("stage-mismatch")).toBeNull();
    });
});

describe("brew deck total", () => {
    it("shows one total when bypass is off", async () => {
        await renderEditor(recipeWithStages());

        expect(screen.getByTestId("brew-target")).toHaveTextContent("288");
        expect(screen.queryByTestId("brew-bypass-split")).toBeNull();
    });

    it("splits the total when bypass is on", async () => {
        await renderEditor({...recipeWithStages(), bypassEnabled: true, bypassVolume: 45});

        // The stage target is unchanged: the machine still checks 288.
        expect(screen.getByTestId("brew-target")).toHaveTextContent("288");
        expect(screen.getByTestId("brew-bypass-split"))
            .toHaveTextContent("+ 45 ML BYPASS");
    });

    it("shows no split for tea", async () => {
        await renderEditor({...teaRecipe(), bypassEnabled: true, bypassVolume: 45});

        expect(screen.queryByTestId("brew-bypass-split")).toBeNull();
    });
});

describe("stage ceiling advisory", () => {
    it("says nothing at ten stages on a 128-byte card", async () => {
        mockSettings.lastCardRead = serialiseCapture(captureWithBlocks(32, 4));
        await renderEditor(recipeWithStageCount(10));
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.queryByTestId("stage-ceiling")).toBeNull();
    });

    it("advises at eleven stages on a 128-byte card", async () => {
        mockSettings.lastCardRead = serialiseCapture(captureWithBlocks(32, 4));
        await renderEditor(recipeWithStageCount(11));
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.getByTestId("stage-ceiling"))
            .toHaveTextContent(/A card holds 10 stages/);
    });

    it("still advises at eleven on the larger card, because the machine refuses it", async () => {
        // This used to assert the opposite. A 160-byte card has room for
        // fourteen stages by the byte arithmetic, so the advisory was silenced
        // for eleven -- and on device that card is then rejected outright by
        // the machine, which will not load an eleven-stage card at all. Ten
        // brews normally. The tag's capacity was never the only ceiling.
        mockSettings.lastCardRead = serialiseCapture(captureWithBlocks(40, 4));
        await renderEditor(recipeWithStageCount(11));
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.getByTestId("stage-ceiling"))
            .toHaveTextContent(/A card holds 10 stages/);
    });

    it("says nothing at ten stages on the larger card either", async () => {
        // The pair to the test above: ten is the machine's ceiling, not nine,
        // so a recipe that sits exactly on it must not be nagged about it.
        mockSettings.lastCardRead = serialiseCapture(captureWithBlocks(40, 4));
        await renderEditor(recipeWithStageCount(10));
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.queryByTestId("stage-ceiling")).toBeNull();
    });

    it("falls back to ten when no card has ever been read", async () => {
        mockSettings.lastCardRead = "";
        await renderEditor(recipeWithStageCount(11));
        await fireEvent.press(screen.getByLabelText(/^Stages,/));

        expect(screen.getByTestId("stage-ceiling")).toBeTruthy();
    });

    it("still lets the recipe be saved", async () => {
        mockSettings.lastCardRead = "";
        await renderEditor(recipeWithStageCount(11));

        expect(screen.getByLabelText("Save").props.accessibilityState.disabled)
            .toBeFalsy();
    });
});

describe("editor XID lookup", () => {
    it("marks the XID row when the lookup fails", async () => {
        mockFetchRecipeDetail.mockRejectedValue(new Error("offline"));
        await renderEditor({xid: "XB0001"});

        await waitFor(() =>
            expect(screen.getByText(/not found/i)).toBeTruthy());
    });

    it("does not gate the save button on a failed lookup", async () => {
        mockFetchRecipeDetail.mockRejectedValue(new Error("offline"));
        await renderEditor({xid: "XB0001"});

        await waitFor(() =>
            expect(screen.getByText(/not found/i)).toBeTruthy());
        expect(screen.getByLabelText("Save").props.accessibilityState.disabled)
            .toBeFalsy();
    });
});
