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
    const {View} = require("react-native");
    // Rendered as a real View rather than a passthrough so a test can ask what
    // is inside the captured subtree and what style the capture is given —
    // both of which decide what the exported PNG looks like.
    // Shared across instances and exported, so a test can observe when the
    // capture happened relative to everything else the export does. Built
    // inside `useImperativeHandle` it was unreachable from outside.
    const mockCapture = jest.fn(async () => "file:///mock/brew.png");
    const ViewShot = React.forwardRef(function MockViewShot({children, ...rest}, ref) {
        React.useImperativeHandle(ref, () => ({capture: mockCapture}));
        return React.createElement(View, {testID: "viewshot", ...rest}, children);
    });
    ViewShot.displayName = "ViewShot";
    return {__esModule: true, default: ViewShot, mockCapture};
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

/**
 * `expo-crypto` is a native module. The stub is deterministic so the golden
 * vectors stay reproducible, and it deliberately emits zero bytes so the
 * "never uses a zero byte inside the padding" test has something real to
 * reject rather than passing by luck.
 *
 * Every sixteenth byte, and at offset 3 rather than 0, for two reasons a
 * first attempt got wrong. A zero every 256 is never reached: `pkcs1Pad` for
 * this key asks for 124 bytes and the sequence restarts on each call, so the
 * test passed whether or not the filtering existed. And a zero at offset 0
 * would hang `pkcs1Pad` outright — its last call asks for a single byte, and
 * a one-byte draw that is always zero never makes progress.
 */
jest.mock("expo-crypto", () => ({
    getRandomBytes: (n) => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) out[i] = i % 16 === 3 ? 0 : (i * 7 + 13) % 256;
        return out;
    },
}));

/**
 * `expo-secure-store` is native; the mock is an in-memory keychain so the
 * session tests can round-trip through it without a device.
 *
 * `__store` is exposed so `jest.afterEnv.js` can empty it between tests.
 * `jest.clearAllMocks()` cannot: the store is a Map, not a mock function, and
 * a keychain that carries a token from one test into the next makes the suite
 * order-dependent.
 */
jest.mock("expo-secure-store", () => {
    const store = new Map();
    return {
        __store: store,
        setItemAsync: async (k, v) => void store.set(k, v),
        getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
        deleteItemAsync: async (k) => void store.delete(k),
    };
});

jest.mock("expo-clipboard", () => ({
    setStringAsync:         jest.fn(async () => true),
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   () => null
}));
