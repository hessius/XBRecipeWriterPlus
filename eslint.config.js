const {defineConfig} = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
    expoConfig,
    {
        ignores: [
            "dist/*",
            "ios/*",
            "android/*",
            ".expo/*",
            ".agents/*",
            "expo-env.d.ts"
        ]
    },
    {
        // Node-run files: config, jest setup and scripts.
        files: ["*.js", "*.cjs", "jest.setup.js", "scripts/**"],
        languageOptions: {
            globals: {
                __dirname: "readonly",
                __filename: "readonly",
                Buffer: "readonly",
                module: "writable",
                require: "readonly",
                process: "readonly",
                jest: "readonly"
            }
        }
    },
    {
        rules: {
            // The React Compiler is enabled, so it — not ESLint — decides what to
            // memoise. We still want the hook rules themselves, which is what
            // caught the conditional useEffect in app/index.tsx.
            "react-hooks/exhaustive-deps": "warn"
        }
    }
]);
