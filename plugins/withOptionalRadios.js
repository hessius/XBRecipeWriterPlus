const {withAndroidManifest} = require('expo/config-plugins');

/**
 * The three radios this app can do without, said out loud.
 *
 * Android infers hardware requirements from permissions, and the inference is
 * wrong in both directions here.
 *
 * `BLUETOOTH_ADMIN` is in Table 2 of the `<uses-feature>` reference, so it
 * implies `android.hardware.bluetooth` with `required="true"` and Play filters
 * the listing to devices that have it. Nothing in `app.json` asks for that:
 * react-native-ble-manager's own library manifest declares the permission, it
 * merges in, and the filter arrives with it. `android.permission.NFC` is *not*
 * in Table 2, which is the surprising half, so declaring NFC buys no filtering
 * and never did.
 *
 * Neither radio is needed to use the app. The library, the editor, import and
 * the community hub all work on a phone with no NFC controller and no
 * Bluetooth, and Task 5's copy says so to anyone who tries a card. An explicit
 * `required="false"` on all three states that, and stops the manifest
 * inheriting an intent nobody wrote down.
 *
 * `bluetooth_le` is declared alongside `bluetooth` because that is the one the
 * app actually uses, and leaving it unstated would let a future permission
 * change imply it as required in the same silent way.
 *
 * An existing declaration is amended rather than duplicated: the merger keeps
 * the strictest of two `<uses-feature>` entries for the same name, so adding a
 * second optional line next to a required one would change nothing at all.
 */
const OPTIONAL_FEATURES = [
    'android.hardware.nfc',
    'android.hardware.bluetooth',
    'android.hardware.bluetooth_le'
];

/**
 * Exported for its test. Takes and returns the parsed `<manifest>` node, so it
 * can be checked against a minimal object without a device or a build.
 */
function declareOptionalFeatures(manifest) {
    const features = manifest['uses-feature'] ?? [];

    for (const name of OPTIONAL_FEATURES) {
        const existing = features.find(f => f.$?.['android:name'] === name);
        if (existing) {
            existing.$['android:required'] = 'false';
        } else {
            features.push({$: {'android:name': name, 'android:required': 'false'}});
        }
    }

    manifest['uses-feature'] = features;
    return manifest;
}

module.exports = function withOptionalRadios(config) {
    return withAndroidManifest(config, cfg => {
        declareOptionalFeatures(cfg.modResults.manifest);
        return cfg;
    });
};

module.exports.declareOptionalFeatures = declareOptionalFeatures;
module.exports.OPTIONAL_FEATURES = OPTIONAL_FEATURES;
