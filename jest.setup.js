// The card encode/decode paths in library/ log hex dumps on every call, which drowns
// out test output. Silence the informational levels but keep warnings and errors.
global.console.log = jest.fn();
global.console.info = jest.fn();
global.console.debug = jest.fn();

/**
 * `expo-clipboard` is a native module, so Jest sees nothing without this.
 *
 * `getStringAsync` returns `''` by default, which is the same answer the real
 * module gives for an empty clipboard *and* for a paste the user denied — iOS
 * offers no way to tell those apart, so the app treats both as "nothing
 * happened". Tests that want a value override it per case.
 */
/**
 * `expo-sharing` is a native module; calling through would throw in Jest.
 * `isAvailableAsync` returns true so tests can assert the happy path without
 * platform-detecting. Individual tests that need it unavailable can override.
 */
jest.mock("expo-sharing", () => ({
    isAvailableAsync: jest.fn(async () => true),
    shareAsync:       jest.fn(async () => undefined)
}));

/**
 * `react-native-view-shot` captures a native view; it has no meaningful
 * implementation under Jest. The mock returns a stable URI so share tests
 * can assert that shareAsync was called with it.
 */
jest.mock("react-native-view-shot", () => {
    const React = require("react");
    const ViewShot = React.forwardRef(function MockViewShot({children}, ref) {
        React.useImperativeHandle(ref, () => ({
            capture: jest.fn(async () => "file:///mock/brew.png")
        }));
        return children;
    });
    ViewShot.displayName = "ViewShot";
    return {__esModule: true, default: ViewShot};
});

/**
 * `expo-file-system` is native; the mock provides just the subset the app
 * uses (the File class and Paths).
 */
jest.mock("expo-file-system", () => {
    const MockFile = jest.fn(function MockFile(_dir, name) {
        this.uri   = `file:///mock-cache/${String(name)}`;
        this.write = jest.fn();
    });
    const Paths = {cache: {uri: "file:///mock-cache/"}};
    return {__esModule: true, File: MockFile, Paths};
});

jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   () => null
}));
