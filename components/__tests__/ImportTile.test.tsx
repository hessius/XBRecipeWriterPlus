import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import {AccessibilityInfo, AppState, StyleSheet} from "react-native";

import ImportTile from "@/components/ImportTile";
import {palette} from "@/constants/colors";
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

// The payload the mocked control hands back, so a test can drive the empty /
// blank / image arms rather than only the happy `ETH120` path.
type PastePayload = {type: "text"; text: string} | {type: "image"; data: string};
let mockPastePayload: PastePayload = {type: "text", text: "ETH120"};

jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: true,
    // Spreads `rest` so the real props under test -- `acceptedContentTypes` and
    // the accessibility-hiding pair -- reach a real RN view, where RNTL can see
    // them. Without that forwarding, asserting them would be impossible.
    ClipboardPasteButton:   ({onPress, ...rest}: {onPress: (d: PastePayload) => void}) => {
        const {Pressable, Text} = jest.requireActual("react-native");
        return (
            <Pressable testID="native-paste-control" onPress={() => onPress(mockPastePayload)} {...rest}>
                <Text>Paste</Text>
            </Pressable>
        );
    }
}));

type Mutable = {isPasteButtonAvailable: boolean};

/** DFS order of testIDs in the rendered host tree, for z-order assertions. */
function testIdOrder(): string[] {
    const ids: string[] = [];
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!node || typeof node !== "object") return;
        // `react-test-renderer`'s `toJSON` nodes carry `children` at the top
        // level, not under `props`.
        const el = node as {props?: {testID?: string}; children?: unknown};
        if (el.props?.testID) ids.push(el.props.testID);
        walk(el.children);
    };
    walk(screen.toJSON());
    return ids;
}

beforeEach(() => {
    mockPastePayload = {type: "text", text: "ETH120"};
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(false);
    // Reset each test: one case flips it to false and must not leak.
    (Clipboard as unknown as Mutable).isPasteButtonAvailable = true;
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
});

afterEach(() => {
    // `jest.config.js` sets no `restoreMocks`, and the `addEventListener` spy in
    // one test would otherwise outlive it and only survive `--randomize` by
    // being last. Restore every spy so order cannot matter.
    jest.restoreAllMocks();
});

it("is a plain button when the clipboard is empty", async () => {
    // `ClipboardPasteButton` disables itself when there is nothing conformant
    // to paste, so a disguised one would be dead furniture.
    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();
    expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).toBeNull();
});

it("becomes a paste control when the clipboard holds text", async () => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );
});

it("hands the pasted text upward", async () => {
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    const onPasted = jest.fn();

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={onPasted}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    await fireEvent.press(screen.getByTestId("native-paste-control", {includeHiddenElements: true}));

    expect(onPasted).toHaveBeenCalledWith("ETH120");
});

it.each<[string, PastePayload]>([
    ["an empty string", {type: "text", text: ""}],
    ["a blank string", {type: "text", text: "   "}],
    ["an image", {type: "image", data: "data:image/png;base64,AAAA"}]
])("opens the sheet, and does not paste, on %s", async (_label, payload) => {
    // The paste arm only navigates on a non-blank string. An empty or blank
    // value is an empty clipboard or a denied paste, and the image arm carries
    // no text at all; all three must degrade to a plain open.
    mockPastePayload = payload;
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    const onOpen = jest.fn();
    const onPasted = jest.fn();

    await renderWithProviders(<ImportTile onOpen={onOpen} onPasted={onPasted}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    await fireEvent.press(screen.getByTestId("native-paste-control", {includeHiddenElements: true}));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onPasted).not.toHaveBeenCalled();
});

it("keeps the visible tile face in paste mode", async () => {
    // Deleting the face would leave a blank, invisible tile in the home grid.
    // The wrapper carries the label now, so this asserts the face's own glyph.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    expect(screen.getByTestId("cta-tile-icon", {includeHiddenElements: true})).toBeTruthy();
});

it("stretches the tile face to the wrapper instead of collapsing it", async () => {
    // The face wraps `CtaTile`, whose own `flex: 1` is `flexBasis: 0` and
    // collapses to nothing unless the face gives it a definite height. The home
    // row stretches the wrapper to the READ CARD tile's height, so the face
    // must carry `flex: 1` to pass that height down. react-test-renderer does no
    // layout, so this cannot assert measured height -- it asserts the style prop
    // that produces the stretch instead.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    const face = screen.getByTestId("import-tile-face", {includeHiddenElements: true});
    expect(StyleSheet.flatten(face.props.style)).toMatchObject({flex: 1});
});

it("makes the paste control invisible by alpha, not tappably by zero", async () => {
    // The disguise now rides on view alpha, which iOS cannot override the way it
    // overrides the control's own colours. `0.02` is below visibility yet above
    // UIKit's `alpha < 0.01` hit-testing cutoff, so the control still receives
    // the tap. Zero would drop it from hit-testing and silently break paste.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    const control = screen.getByTestId("native-paste-control", {includeHiddenElements: true});
    const style = StyleSheet.flatten(control.props.style);
    expect(style.opacity).toBe(0.02);
    expect(style.opacity).toBeGreaterThanOrEqual(0.01);
});

it("draws the paste control above the face so the tap is the consent", async () => {
    // The whole design is that the tap reaches the control, not the face.
    // Reversing the z-order would route every tap to `onOpen` and never paste,
    // and no press-based test can see it, so the order is asserted directly.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    const order = testIdOrder();
    expect(order.indexOf("cta-tile-icon")).toBeLessThan(order.indexOf("native-paste-control"));
});

it("keeps the face out of the tap path in paste mode", async () => {
    // `pointerEvents` none is what lets a sighted tap fall through to the
    // control beneath; without it the face swallows the tap.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    const face = screen.getByTestId("import-tile-face", {includeHiddenElements: true});
    expect(face.props.pointerEvents).toBe("none");
});

it("restricts the paste control to text and links", async () => {
    // The default also accepts `image`, which would activate the control on an
    // image clipboard and deliver a payload with no text.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    const control = screen.getByTestId("native-paste-control", {includeHiddenElements: true});
    expect(control.props.acceptedContentTypes).toEqual(["plain-text", "url"]);
});

it("colours the paste control to the tile so its glyph disappears", async () => {
    // The disguise is the whole point: both colours are the tile's own
    // `raised`, so the control vanishes into the face with no visible glyph. A
    // visible foreground or a contrasting background would expose it.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    const control = screen.getByTestId("native-paste-control", {includeHiddenElements: true});
    expect(control.props.backgroundColor).toBe(palette.raised);
    expect(control.props.foregroundColor).toBe(palette.raised);
});

it("hides the paste control from the accessibility tree", async () => {
    // Voice Control, Switch Control and Full Keyboard Access all read the tree
    // while `isScreenReaderEnabled()` is false, so in paste mode the control's
    // forced "Paste" element must be hidden, leaving only the tile's label.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    // Present in the host tree, but hidden from accessibility: the default
    // queries (which exclude hidden elements) must not reach it.
    expect(screen.queryByTestId("native-paste-control")).toBeNull();
});

it("announces one element, and that element opens the sheet", async () => {
    // The announced element must be the actionable one: a synthesized
    // activation from Voice Control reaches whatever carries the label, so that
    // element -- not the disabled face -- has to route to `onOpen`.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    const onOpen = jest.fn();

    await renderWithProviders(<ImportTile onOpen={onOpen} onPasted={() => {}}/>);
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    // Exactly one accessible element carries the label -- not the wrapper and a
    // second face underneath.
    const announced = screen.getByLabelText("Import a recipe");
    await fireEvent.press(announced);

    expect(onOpen).toHaveBeenCalledTimes(1);
});

it("stays a plain button under a screen reader", async () => {
    // The native control announces itself as "Paste" whatever is drawn over it,
    // so a screen reader user would hear a label contradicting the screen. The
    // shortcut is a sighted convenience; what is announced stays honest.
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).toBeNull()
    );
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
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).toBeNull()
    );
});

it("re-samples when the app returns to the foreground", async () => {
    // The clipboard changes behind the app's back, so the answer is re-asked on
    // foreground. Start empty (plain), fill the clipboard, foreground: paste.
    let onAppChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(
        ((event: string, handler: (state: string) => void) => {
            if (event === "change") onAppChange = handler;
            return {remove: () => {}};
        }) as typeof AppState.addEventListener
    );

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();

    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    await act(async () => {
        onAppChange?.("active");
    });

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );
});

it("ignores foreground changes that are not 'active'", async () => {
    // Only `active` re-samples; a `background` transition must not.
    let onAppChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(
        ((event: string, handler: (state: string) => void) => {
            if (event === "change") onAppChange = handler;
            return {remove: () => {}};
        }) as typeof AppState.addEventListener
    );

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);
    expect(await screen.findByLabelText("Import a recipe")).toBeTruthy();

    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);
    await act(async () => {
        onAppChange?.("background");
    });

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).toBeNull()
    );
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
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);
    await act(async () => {
        onChange?.();
    });

    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).toBeNull()
    );
});

it("lets the newest sample win when two resolve out of order", async () => {
    // Two samples in flight resolve in completion order, not start order. An
    // earlier sample must never overwrite a newer one: the generation counter is
    // what stops a stale `true` (paste) outliving a fresh `false` (plain).
    (Clipboard.hasStringAsync as jest.Mock).mockResolvedValue(true);

    // Deferred screen-reader reads, resolved by hand in a chosen order.
    const resolvers: ((v: boolean) => void)[] = [];
    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockImplementation(
        () => new Promise<boolean>((resolve) => resolvers.push(resolve))
    );

    let onAppChange: ((state: string) => void) | undefined;
    let onReaderChange: (() => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation(
        ((event: string, handler: (state: string) => void) => {
            if (event === "change") onAppChange = handler;
            return {remove: () => {}};
        }) as typeof AppState.addEventListener
    );
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(
        ((event: string, handler: () => void) => {
            if (event === "screenReaderChanged") onReaderChange = handler;
            return {remove: () => {}};
        }) as typeof AccessibilityInfo.addEventListener
    );

    await renderWithProviders(<ImportTile onOpen={() => {}} onPasted={() => {}}/>);

    // Settle the mount / focus samples first: resolve them all as "not a screen
    // reader" so the tile begins in paste mode.
    await act(async () => {
        while (resolvers.length) resolvers.shift()?.(false);
    });
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).not.toBeNull()
    );

    // Older sample: foreground, screen reader off -> would set paste mode true.
    await act(async () => {
        onAppChange?.("active");
    });
    // Newer sample: screen reader turned on -> plain mode false. Started last.
    await act(async () => {
        onReaderChange?.();
    });

    const [olderResolve, newerResolve] = resolvers;
    // Resolve the *newer* sample first, then let the *older* one land last -- the
    // exact out-of-order case that a bare cancel flag cannot survive.
    await act(async () => {
        newerResolve(true);
    });
    await act(async () => {
        olderResolve(false);
    });

    // The newest answer (plain) must stick despite the older sample resolving
    // afterwards.
    await waitFor(() =>
        expect(screen.queryByTestId("native-paste-control", {includeHiddenElements: true})).toBeNull()
    );
});
