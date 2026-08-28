const preset = require("jest-expo/jest-preset");

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

module.exports = {
    preset: "jest-expo",
    testMatch: ["**/*.test.ts", "**/*.test.tsx"],
    // `tools/` holds the store-screenshot generator, a separate Next.js app.
    // Nothing in it is part of the phone app, and its dependency tree should
    // never be resolved by this project's test run.
    modulePathIgnorePatterns: ["<rootDir>/tools/"],
    setupFiles: [
        "react-native-gesture-handler/jestSetup",
        "<rootDir>/jest.setup.js"
    ],
    // Reanimated 4 pulls in react-native-worklets, whose `.native.ts` entry points
    // reach for a TurboModule that does not exist under jest. Its own resolver
    // steers those imports at the plain (non-native) files instead.
    resolver: "react-native-worklets/jest/resolver.js",
    transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
        pattern.startsWith("/node_modules/(?!(")
            ? pattern.replace("(?!(", `(?!(${extraEsmPackages.join("|")}|`)
            : pattern
    )
};
