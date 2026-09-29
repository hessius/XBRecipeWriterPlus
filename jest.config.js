// jest-expo's allow-list does not know about the packages this app pulls in that
// ship untranspiled ESM, so extend the first (and only broad) pattern rather
// than replacing the list wholesale.
const extraEsmPackages = [
    "tamagui",
    "@tamagui",
    "react-native-css-interop",
    "@backpackapp-io",
    "react-native-gesture-handler",
    "react-native-svg",
    "@gorhom",
    "burnt",
    "react-native-nfc-manager",
    "@miblanchard"
];

const allowEsm = (patterns) => patterns.map((pattern) =>
    pattern.startsWith("/node_modules/(?!(")
        ? pattern.replace("(?!(", `(?!(${extraEsmPackages.join("|")}|`)
        : pattern
);

const base = {
    testMatch: ["**/*.test.ts", "**/*.test.tsx"],
    // `tools/` holds the store-screenshot generator, a separate Next.js app.
    // Nothing in it is part of the phone app, and its dependency tree should
    // never be resolved by this project's test run.
    modulePathIgnorePatterns: ["<rootDir>/tools/"],
    setupFiles: [
        "react-native-gesture-handler/jestSetup",
        "<rootDir>/jest.setup.js"
    ],
    // Anything needing `beforeEach` and friends: `setupFiles` runs before the
    // test framework installs them.
    setupFilesAfterEnv: ["<rootDir>/jest.afterEnv.js"],
    // Reanimated 4 pulls in react-native-worklets, whose `.native.ts` entry points
    // reach for a TurboModule that does not exist under jest. Its own resolver
    // steers those imports at the plain (non-native) files instead.
    resolver: "react-native-worklets/jest/resolver.js"
};

/**
 * One jest project per platform.
 *
 * The app has complete Android code paths -- the raw ISO 15693 transceive
 * commands in `library/NFC.ts`, the MTU negotiation and permission split in
 * `library/machine/Transport.ts` -- that had never been executed by a test,
 * because `jest-expo`'s default preset pins `haste.defaultPlatform` to `ios`
 * and so the whole suite only ever ran as an iPhone. Running it twice is what
 * puts a regression net under code nobody can reach with a simulator.
 *
 * `preset` is left as a string rather than spread by hand: jest's own preset
 * merge concatenates `setupFiles`, `setupFilesAfterEnv`, `moduleNameMapper` and
 * `transform` rather than replacing them, and reproducing that by hand is how
 * the iOS run would quietly drift away from what it is today.
 */
const project = (name, presetPath) => ({
    ...base,
    rootDir: __dirname,
    displayName: name,
    preset: presetPath,
    transformIgnorePatterns: allowEsm(
        require(`${presetPath}/jest-preset`).transformIgnorePatterns
    )
});

module.exports = {
    // Jest's 5 s default is a guess about how fast the machine is, not a budget
    // these tests were written to. The heaviest screen suites render the whole
    // library through Tamagui and sit close to it, so once enough suites run in
    // parallel for the workers to contend, they tip over -- and a timed-out
    // test takes the rest of its `describe` with it, because it leaves its tree
    // mounted and the next test cannot find the chrome it looks for. Nothing
    // here hangs; a real hang still fails, just later.
    //
    // This has to sit out here rather than inside a project: jest does not
    // accept `testTimeout` as a project option, and quietly drops it. Twenty
    // seconds silently becoming five is exactly the failure this setting was
    // added to stop, so `library/__tests__/platformHarness.test.ts` asserts
    // the resolved value rather than trusting the shape of this file.
    testTimeout: 20_000,
    // Two projects means twice the suites through one worker pool, and the
    // heaviest screen suites are memory-hungry rather than CPU-hungry: they
    // render the whole library through Tamagui. At jest's default of one worker
    // per core minus one, enough of those land together that a handful of
    // suites time out -- and they pass one at a time, so it is contention and
    // not a defect. Fewer workers is the honest fix; a longer timeout would
    // only move the cliff. Run a single project with `npm run test:ios` or
    // `npm run test:android` when you want the whole machine on one platform.
    maxWorkers: "50%",
    projects: [
        project("ios", "jest-expo"),
        project("android", "jest-expo/android")
    ]
};
