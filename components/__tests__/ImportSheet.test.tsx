/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import {Keyboard, TextInput} from "react-native";

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
        showField:    true,
        focusField:   true,
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
        <ImportSheet open onOpenChange={() => {}} importer={stubImport()}/>
    );

    expect(await screen.findByLabelText("Share link or pod code")).toBeTruthy();
});

it("hides the field when the value arrived whole", async () => {
    // A share intent and the tile shortcut both deliver a complete value, so
    // there is nothing to put in a field and no reason to draw one.
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({showField: false, state: {status: "resolving"}})}/>
    );

    expect(screen.queryByLabelText("Share link or pod code")).toBeNull();
    expect(await screen.findByTestId("import-resolving")).toBeTruthy();
});

it("passes typing to the hook", async () => {
    const importer = stubImport();
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} importer={importer}/>
    );

    await fireEvent.changeText(
        await screen.findByLabelText("Share link or pod code"), "ETH120"
    );

    expect(importer.onChangeText).toHaveBeenCalledWith("ETH120");
});

it("shows an error inline, never as an alert or a toast", async () => {
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
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
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({value: "ETH1", hint: true})}/>
    );

    expect(await screen.findByText("Paste an xBloom share link, or a pod code like ETH120."))
        .toBeTruthy();
});

it("shows the found panel and opens what it found", async () => {
    const importer = stubImport({state: foundState()});
    await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}} importer={importer}/>
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
        <ImportSheet open onOpenChange={() => {}} importer={stubImport()}/>
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
        <ImportSheet open onOpenChange={() => {}} importer={stubImport()}/>
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
        <ImportSheet open onOpenChange={() => {}} importer={importer}/>
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
        <ImportSheet open onOpenChange={() => {}} importer={stubImport()}/>
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
        <ImportSheet open onOpenChange={() => {}} importer={stubImport()}/>
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
        <ImportSheet open onOpenChange={() => {}} importer={importer}/>
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
        <ImportSheet open onOpenChange={() => {}}
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

it("dismisses the keyboard when a typed lookup resolves to the found panel", async () => {
    // Finding 1: a typed value resolves without navigating so the panel can be
    // read, but the keyboard is still up from typing and covers it. On the
    // transition into found, from the typed path (the field was on screen while
    // resolving), the keyboard is dropped -- once.
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const {rerender} = await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({showField: true, state: {status: "resolving"}})}/>
    );
    expect(dismiss).not.toHaveBeenCalled();

    await act(async () => {
        rerender(
            <ImportSheet open onOpenChange={() => {}}
                         importer={stubImport({showField: true, state: foundState()})}/>
        );
    });
    expect(dismiss).toHaveBeenCalledTimes(1);

    // Not again on a repaint that keeps the found panel: it is once per
    // resolution, not once per render.
    await act(async () => {
        rerender(
            <ImportSheet open onOpenChange={() => {}}
                         importer={stubImport({showField: true, state: foundState()})}/>
        );
    });
    expect(dismiss).toHaveBeenCalledTimes(1);

    dismiss.mockRestore();
});

it("does not dismiss the keyboard when a lookup fails", async () => {
    // A mistyped code lands on the error state, where the user needs the
    // keyboard kept up to correct it. The dismiss is keyed on found, so error
    // never triggers it.
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const {rerender} = await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({showField: true, state: {status: "resolving"}})}/>
    );

    await act(async () => {
        rerender(
            <ImportSheet open onOpenChange={() => {}}
                         importer={stubImport({
                             showField: true,
                             state:     {
                                 status:  "error",
                                 reason:  "notFound",
                                 message: "No recipe with that code."
                             }
                         })}/>
        );
    });
    expect(dismiss).not.toHaveBeenCalled();

    dismiss.mockRestore();
});

it("does not raise the keyboard when a failed share intent restores the field", async () => {
    // The bug: a share intent hides the field while it resolves, so a failure
    // remounts the `TextInput`. If that remount grabs focus the keyboard rises
    // on someone whose attention is still in the app they shared from -- an
    // ambush. The hook says so by handing back `focusField: false`, and the
    // field's `autoFocus` obeys it, so the field comes back as a retry
    // affordance but the keyboard stays down. Focus does not fire `onFocus`
    // under the test renderer, so this spies on the imperative `focus` the way
    // the repo already does elsewhere.
    const focus = jest.spyOn(TextInput.prototype, "focus");
    const {rerender} = await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({showField: false, state: {status: "resolving"}})}/>
    );
    // The field is hidden here, so nothing legitimately focuses; clear any
    // async focus scheduled by a neighbouring test so only the remount counts.
    focus.mockClear();

    await act(async () => {
        rerender(
            <ImportSheet open onOpenChange={() => {}}
                         importer={stubImport({
                             showField: true, focusField: false,
                             state:     {
                                 status:  "error",
                                 reason:  "network",
                                 message: "Couldn't reach xBloom. Check your connection."
                             }
                         })}/>
        );
    });

    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
});

it("raises the keyboard when a failed shortcut restores the field", async () => {
    // The counterpart, and the guard against fixing the ambush by killing focus
    // everywhere: a tile shortcut also hides its field, but the user tapped the
    // tile and is now in the sheet, so its restored field *does* take focus --
    // `focusField` stays true -- ready to type the next code.
    const focus = jest.spyOn(TextInput.prototype, "focus");
    const {rerender} = await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({showField: false, state: {status: "resolving"}})}/>
    );
    focus.mockClear();

    await act(async () => {
        rerender(
            <ImportSheet open onOpenChange={() => {}}
                         importer={stubImport({
                             showField: true, focusField: true,
                             state:     {
                                 status:  "error",
                                 reason:  "notFound",
                                 message: "No recipe with that code."
                             }
                         })}/>
        );
    });

    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
});

it("leaves the keyboard alone when a typed lookup fails", async () => {
    // The positive case for the typed path: its field never unmounts, so a
    // failure neither remounts-and-refocuses nor dismisses. The keyboard the
    // user was typing with stays exactly where it was, ready to correct the
    // typo. The initial mount focuses once (the field is present from the
    // start); clear that, then assert the *failure* transition touches nothing.
    const focus = jest.spyOn(TextInput.prototype, "focus");
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const {rerender} = await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({showField: true, state: {status: "resolving"}})}/>
    );
    focus.mockClear();

    await act(async () => {
        rerender(
            <ImportSheet open onOpenChange={() => {}}
                         importer={stubImport({
                             showField: true, focusField: true,
                             state:     {
                                 status:  "error",
                                 reason:  "notFound",
                                 message: "No recipe with that code."
                             }
                         })}/>
        );
    });

    expect(focus).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    focus.mockRestore();
    dismiss.mockRestore();
});

it("does not dismiss the keyboard when a shortcut degrades to the found panel", async () => {
    // The tile shortcut resolves with the field hidden, so its keyboard was
    // never up; a degrade restores the field at found and lets `autoFocus`
    // raise the keyboard on purpose. Dismissing there would fight that, so the
    // dismiss is gated on the field having been on screen *before* found.
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const {rerender} = await renderWithProviders(
        <ImportSheet open onOpenChange={() => {}}
                     importer={stubImport({showField: false, state: {status: "resolving"}})}/>
    );

    await act(async () => {
        rerender(
            <ImportSheet open onOpenChange={() => {}}
                         importer={stubImport({showField: true, state: foundState()})}/>
        );
    });
    expect(dismiss).not.toHaveBeenCalled();

    dismiss.mockRestore();
});
