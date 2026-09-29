/**
 * The plugin that stops the Android manifest inheriting a Play device filter.
 *
 * Tested against a manifest object rather than a build, which is the whole
 * point of it being a function: `expo prebuild` takes minutes and a real APK
 * needs EAS, while the decision being made here is small and exact.
 *
 * The fact it rests on was checked against Android's own `<uses-feature>`
 * reference, because the intuitive answer is wrong in both directions.
 * `BLUETOOTH_ADMIN` is in Table 2 and implies `android.hardware.bluetooth`;
 * `android.permission.NFC` is not in Table 2 and implies nothing.
 */
type Feature = {$: Record<string, string>};
type Manifest = {"uses-feature"?: Feature[]};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require("@/plugins/withOptionalRadios");
const declareOptionalFeatures: (m: Manifest) => Required<Manifest> =
    plugin.declareOptionalFeatures;
const OPTIONAL_FEATURES: string[] = plugin.OPTIONAL_FEATURES;

const app = require("@/app.json");

const nameOf = (f: Feature) => f.$["android:name"];
const requiredOf = (f: Feature) => f.$["android:required"];

describe("declareOptionalFeatures", () => {
    it("names all three radios the app can do without", () => {
        const manifest = declareOptionalFeatures({});

        expect(manifest["uses-feature"].map(nameOf).sort()).toEqual([
            "android.hardware.bluetooth",
            "android.hardware.bluetooth_le",
            "android.hardware.nfc"
        ]);
    });

    it("marks every one of them optional", () => {
        const manifest = declareOptionalFeatures({});

        expect(manifest["uses-feature"].every(f => requiredOf(f) === "false")).toBe(true);
    });

    it("relaxes a requirement that is already there rather than adding a second line", () => {
        // The merger keeps the stricter of two entries for the same name, so a
        // second optional line beside a required one would change nothing. The
        // required one has to be amended in place.
        const manifest = declareOptionalFeatures({
            "uses-feature": [
                {$: {"android:name": "android.hardware.bluetooth", "android:required": "true"}}
            ]
        });

        const bluetooth = manifest["uses-feature"].filter(
            f => nameOf(f) === "android.hardware.bluetooth");
        expect(bluetooth).toHaveLength(1);
        expect(requiredOf(bluetooth[0])).toBe("false");
    });

    it("leaves a feature it has no opinion about alone", () => {
        const manifest = declareOptionalFeatures({
            "uses-feature": [
                {$: {"android:name": "android.hardware.camera", "android:required": "true"}}
            ]
        });

        const camera = manifest["uses-feature"].find(f => nameOf(f) === "android.hardware.camera");
        expect(requiredOf(camera!)).toBe("true");
    });

    it("is safe to apply twice", () => {
        const once = declareOptionalFeatures({});
        const twice = declareOptionalFeatures(once);

        expect(twice["uses-feature"]).toHaveLength(OPTIONAL_FEATURES.length);
    });
});

describe("app.json", () => {
    it("runs the plugin", () => {
        // A plugin nobody lists does nothing at all, and the failure is silent:
        // the build succeeds and the listing quietly keeps its filter.
        expect(app.expo.plugins).toContain("./plugins/withOptionalRadios");
    });

    it("still asks for NFC, which is a permission and not a requirement", () => {
        expect(app.expo.android.permissions).toContain("android.permission.NFC");
    });
});
