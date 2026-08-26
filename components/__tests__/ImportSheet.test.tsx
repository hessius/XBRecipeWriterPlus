/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import ImportSheet from "@/components/ImportSheet";
import type {RecipeImport} from "@/hooks/useRecipeImport";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   ({onPress, ...rest}: {onPress?: (data: unknown) => void}) => {
        const {View} = jest.requireActual("react-native");
        // Stash the handler so a test can drive it with a chosen payload; a bare
        // View would leave the native paste path untested. `rest` is spread so
        // the real props under test -- the testID and the accessibility-hiding
        // pair `PasteOverlay` sets -- reach the RN view where RNTL can see them.
        mockNativePasteOnPress = onPress;
        return <View {...rest}/>;
    }
}));

let mockNativePasteOnPress: ((data: unknown) => void) | undefined;

beforeEach(() => {
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = false;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(false);
    mockNativePasteOnPress = undefined;
});

/** A hook stub. The sheet is layout; every rule under test lives in the hook. */
function stubImport(overrides: Partial<RecipeImport> = {}): RecipeImport {
    return {
        state:        {status: "idle"},
        value:        "",
        hint:         false,
        onChangeText: jest.fn(),
        resolveNow:   jest.fn(),
        onPastedText: jest.fn(),
        openFound:    jest.fn(),
        reset:        jest.fn(),
        ...overrides
    };
}

function foundState() {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.pours = [new Pour(1, 288, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return {
        status:  "found" as const,
        preview: {
            recipe, isExisting: false,
            name: "Ethiopia Guji", subtitle: "Washed", imageURL: ""
        }
    };
}

it("shows the field when there is something to type into it", async () => {
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={stubImport()}/>
    );

    expect(await screen.findByLabelText("Share link or pod code")).toBeTruthy();
});

it("hides the field when the value arrived whole", async () => {
    // A share intent and the tile shortcut both deliver a complete value, so
    // there is nothing to put in a field and no reason to draw one.
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField={false}
                     importer={stubImport({state: {status: "resolving"}})}/>
    );

    expect(screen.queryByLabelText("Share link or pod code")).toBeNull();
    expect(await screen.findByTestId("import-resolving")).toBeTruthy();
});

it("passes typing to the hook", async () => {
    const importer = stubImport();
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={importer}/>
    );

    await fireEvent.changeText(
        await screen.findByLabelText("Share link or pod code"), "ETH120"
    );

    expect(importer.onChangeText).toHaveBeenCalledWith("ETH120");
});

it("shows an error inline, never as an alert or a toast", async () => {
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField
                     importer={stubImport({
                         state: {
                             status:  "error",
                             reason:  "notFound",
                             message: "No recipe with that code."
                         }
                     })}/>
    );

    expect(await screen.findByText("No recipe with that code.")).toBeTruthy();
    // Announced cross-platform, not on Android only: `alert` is the repo's
    // portable announcement, so an iOS VoiceOver user is told the lookup failed.
    expect(await screen.findByRole("alert")).toHaveTextContent("No recipe with that code.");
});

it("explains the format once the hook says they have stopped", async () => {
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField
                     importer={stubImport({value: "ETH1", hint: true})}/>
    );

    expect(await screen.findByText("Paste an xBloom share link, or a pod code like ETH120."))
        .toBeTruthy();
});

it("shows the found panel and opens what it found", async () => {
    const importer = stubImport({state: foundState()});
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={importer}/>
    );

    await fireEvent.press(await screen.findByLabelText("Open Ethiopia Guji"));

    expect(importer.openFound).toHaveBeenCalledTimes(1);
});

it("renders the shared paste face with the house fallback (no native control)", async () => {
    // Finding 1: one definition of the face, drawn on both platforms -- not two
    // lookalikes kept in sync. Here the house fallback: the dot-matrix `PASTE`
    // face is present and no native control is laid over it.
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = false;
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={stubImport()}/>
    );

    expect(screen.getByTestId("import-paste-face", {includeHiddenElements: true}))
        .toHaveTextContent("PASTE");
    expect(screen.queryByTestId("native-paste", {includeHiddenElements: true})).toBeNull();
});

it("renders the same shared paste face with the native control over it", async () => {
    // The other branch: the invisible `UIPasteControl` is laid over the *same*
    // face. Asserting the shared `import-paste-face` testID -- not a lookalike --
    // is what proves the two branches cannot drift apart.
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = true;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={stubImport()}/>
    );

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste", {includeHiddenElements: true})).not.toBeNull()
    );
    expect(screen.getByTestId("import-paste-face", {includeHiddenElements: true}))
        .toHaveTextContent("PASTE");
});

it("offers a paste button on a platform without the native control", async () => {
    const importer = stubImport();
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={importer}/>
    );

    await fireEvent.press(await screen.findByLabelText("Paste from clipboard"));

    // `getStringAsync` is mocked to `''`, which is both an empty clipboard and
    // a denied prompt -- so the sheet hands it over and the hook says nothing.
    expect(importer.onPastedText).toHaveBeenCalledWith("");
});

it("lays the native control over the face when iOS has one and there is something to paste", async () => {
    // The disguise now matches the tile: the control is present but invisible
    // and hidden from accessibility, so the visible affordance is the app's own
    // face and the tap still reaches the real `UIPasteControl` (no prompt). The
    // one announced element stays the wrapper's "Paste from clipboard" label.
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = true;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={stubImport()}/>
    );

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste", {includeHiddenElements: true})).not.toBeNull()
    );
    // Hidden from accessibility, so the default (visible-only) query cannot reach
    // it -- only the wrapper is announced.
    expect(screen.queryByTestId("native-paste")).toBeNull();
    expect(await screen.findByLabelText("Paste from clipboard")).toBeTruthy();
});

it("falls back to the house button when iOS has the control but the clipboard is empty", async () => {
    // The branch that decides whether an iOS 16 user with an empty clipboard
    // gets a self-disabling system control or a working house button. Without
    // it, `setNativePaste(has)` could ignore the clipboard entirely and pass.
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = true;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(false);

    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={stubImport()}/>
    );

    expect(await screen.findByLabelText("Paste from clipboard")).toBeTruthy();
    await waitFor(() => expect(Clipboard.hasStringAsync).toHaveBeenCalled());
    expect(screen.queryByTestId("native-paste", {includeHiddenElements: true})).toBeNull();
});

it("forwards a native text paste, and forwards nothing for an image", async () => {
    // The native control's handler, exercised directly: the mock exposes its
    // `onPress` so both payload shapes reach the hook. Replacing the handler
    // with a no-op would otherwise pass.
    (Clipboard.isPasteButtonAvailable as unknown as boolean) = true;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    const importer = stubImport();

    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField importer={importer}/>
    );

    await waitFor(() => expect(mockNativePasteOnPress).toBeDefined());

    mockNativePasteOnPress!({type: "text", text: "ETH120"});
    expect(importer.onPastedText).toHaveBeenCalledWith("ETH120");

    mockNativePasteOnPress!({type: "image", data: "…"});
    expect(importer.onPastedText).toHaveBeenCalledWith("");
});

it("does not offer the format hint while an error is showing", async () => {
    // The hint is guidance for someone who has stopped; an error means they
    // acted and it failed. Only one belongs on screen, so the hint is gated on
    // `status === "idle"`.
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} showField
                     importer={stubImport({
                         value: "ETH1", hint: true,
                         state: {
                             status:  "error",
                             reason:  "notFound",
                             message: "No recipe with that code."
                         }
                     })}/>
    );

    expect(await screen.findByText("No recipe with that code.")).toBeTruthy();
    expect(screen.queryByText("Paste an xBloom share link, or a pod code like ETH120."))
        .toBeNull();
});
