import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import {AccessibilityInfo} from "react-native";

import ImportTile from "@/components/ImportTile";
import {renderWithProviders} from "@/test-utils/render";

// The real `useFocusEffect` calls `useNavigation`, which throws outside a
// navigator, so a bare render would crash. `app/index.test.tsx` mocks it the
// same way. Here it runs the callback once on mount so the focus refresh path
// is exercised rather than dead in coverage.
jest.mock("expo-router", () => {
    const React = jest.requireActual("react");
    return {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(() => cb(), [])
    };
});

jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: true,
    ClipboardPasteButton:   ({onPress}: {onPress: (d: {type: "text"; text: string}) => void}) => {
        const {Pressable, Text} = jest.requireActual("react-native");
        return (
            <Pressable testID="native-paste-control"
                       onPress={() => onPress({type: "text", text: "ETH120"})}>
                <Text>Paste</Text>
            </Pressable>
        );
    }
}));

type Mutable = {isPasteButtonAvailable: boolean};

beforeEach(() => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(false);
    // Reset each test: one case flips it to false and must not leak.
    (Clipboard as unknown as Mutable).isPasteButtonAvailable = true;
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
});

it("is a plain button when the clipboard is empty", async () => {
    // `ClipboardPasteButton` disables itself when there is nothing conformant
    // to paste, so a disguised one would be dead furniture.
    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();
    expect(screen.queryByTestId("native-paste-control")).toBeNull();
});

it("becomes a paste control when the clipboard holds text", async () => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control")).not.toBeNull()
    );
});

it("hands the pasted text upward", async () => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    const onPasted = jest.fn();

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={onPasted}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control")).not.toBeNull()
    );

    await fireEvent.press(screen.getByTestId("native-paste-control"));

    expect(onPasted).toHaveBeenCalledWith("ETH120");
});

it("stays a plain button under a screen reader", async () => {
    // The native control announces itself as "Paste" whatever is drawn over it,
    // so a screen reader user would hear a label contradicting the screen. The
    // shortcut is a sighted convenience; what is announced stays honest.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("native-paste-control")).toBeNull());
});

it("opens the sheet when pressed in plain mode", async () => {
    const onOpen = jest.fn();
    await renderWithProviders(<ImportTile onOpen={onOpen} onPasted={() => {}}/>);

    await fireEvent.press(await screen.findByLabelText("Import a recipe"));

    expect(onOpen).toHaveBeenCalledTimes(1);
});

it("stays a plain button when the paste-button API is absent (Android / iOS 15)", async () => {
    // The mock sets `isPasteButtonAvailable` true globally; without it, paste
    // mode must never engage, whatever is on the clipboard.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    (Clipboard as unknown as Mutable).isPasteButtonAvailable = false;

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("native-paste-control")).toBeNull());
});

it("drops to plain mode when VoiceOver is switched on mid-session", async () => {
    // A user who turns VoiceOver on mid-session must not be left with a control
    // announcing "Paste" over a tile that says IMPORT.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    let onChange: (() => void) | undefined;
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
        ((event: string, handler: () => void) => {
            if (event === "screenReaderChanged") onChange = handler;
            return {remove: () => {}};
        }) as typeof AccessibilityInfo.addEventListener
    );

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control")).not.toBeNull()
    );

    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);
    await act(async () => {
        onChange?.();
    });

    await waitFor(() => expect(screen.queryByTestId("native-paste-control")).toBeNull());
});
