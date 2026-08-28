const {defineConfig} = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const COLOUR_MESSAGE =
    "Colour literals are not allowed here. Add a semantically named token to " +
    "constants/colors.ts (danger, surface, muted — never red) and import it.";

/** The CSS named colours, for the "colour-valued property" selectors below. */
const NAMED_COLOURS = [
    "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
    "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
    "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
    "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
    "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
    "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
    "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
    "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
    "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
    "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
    "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
    "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
    "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
    "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
    "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen",
    "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue",
    "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
    "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
    "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace",
    "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
    "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
    "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
    "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
    "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
    "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle",
    "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
    "yellowgreen"
].join("|");

module.exports = defineConfig([
    expoConfig,
    {
        ignores: [
            "dist/*",
            "ios/*",
            "android/*",
            ".expo/*",
            ".agents/*",
            // The store-screenshot generator is a separate Next.js app with its
            // own toolchain. It is also, by nature, made almost entirely of
            // colour literals, so the palette rule below would reject every
            // line of it for breaking a convention that only governs the phone
            // app's own surfaces.
            "tools/*",
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
    },
    {
        // All colour comes from constants/colors.ts. Roughly half the colour call
        // sites are plain React Native, expo-router or SVG props that cannot take
        // a Tamagui "$token" at all, so the palette module is the only thing that
        // can be the single source — and only a lint rule keeps it that way.
        //
        // Tests are exempt: asserting on a concrete colour value is the point of
        // them.
        files:   ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
        ignores: ["**/__tests__/**"],
        rules:   {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
                    message:  COLOUR_MESSAGE
                },
                {
                    selector: "Literal[value=/^(?:rgba?|hsla?)\\(/]",
                    message:  COLOUR_MESSAGE
                },
                // Named colours are only flagged where they are unambiguously a
                // colour. Matching the bare word everywhere would fail on
                // Tamagui's theme names, which are not colours at all:
                // <Button theme="red"> selects a theme, and is legitimate.
                //
                // Descendant, not direct child: a direct-child selector only
                // sees `color="red"`, so `color={bad ? "red" : "green"}` and any
                // other nested expression walked straight past the rule.
                {
                    selector: `JSXAttribute[name.name=/^(?:.*[Cc]olor|fill|stroke|tint)$/] Literal[value=/^(?:${NAMED_COLOURS})$/i]`,
                    message:  COLOUR_MESSAGE
                },
                {
                    selector: `Property[key.name=/^(?:.*[Cc]olor|fill|stroke|tint)$/] Literal[value=/^(?:${NAMED_COLOURS})$/i]`,
                    message:  COLOUR_MESSAGE
                }
            ]
        }
    }
]);
