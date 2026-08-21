const {withFinalizedMod} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const TARGET_NAME = 'ShareExtension';

/**
 * Makes ccache work for the share extension target.
 *
 * Enabling `ios.ccacheEnabled` makes Expo point CC/CXX/LD/LDPLUSPLUS at
 * react-native's ccache wrapper scripts, addressed as
 * `$(REACT_NATIVE_PATH)/scripts/xcode/ccache-clang.sh`. REACT_NATIVE_PATH is
 * defined project-wide as `${PODS_ROOT}/../../node_modules/react-native`.
 *
 * PODS_ROOT is only defined for targets CocoaPods integrates, and the share
 * extension is not one of them. For that target the variable expands to
 * nothing, leaving the unresolvable path `/../../node_modules/react-native/...`
 * and failing the build with "unable to spawn process".
 *
 * Defining PODS_ROOT on the target fixes it, and is preferable to clearing the
 * compiler settings because the extension then gets cached builds too. SRCROOT
 * is the `ios/` directory, so this resolves to the same location CocoaPods
 * would have used.
 *
 * This runs as a finalized mod because expo-share-intent creates the extension
 * target during prebuild, and only a finalized mod is guaranteed to run after
 * every other mod has had its turn.
 */
module.exports = function withShareExtensionCcache(config) {
    return withFinalizedMod(config, [
        'ios',
        async (cfg) => {
            const projectPath = path.join(
                cfg.modRequest.platformProjectRoot,
                'XBRecipeWriter.xcodeproj',
                'project.pbxproj'
            );

            const project = xcode.project(projectPath);
            project.parseSync();

            const targets = project.pbxNativeTargetSection();
            const targetKey = Object.keys(targets).find(
                (key) =>
                    !key.endsWith('_comment') &&
                    targets[key].name?.replace(/"/g, '') === TARGET_NAME
            );

            if (!targetKey) {
                throw new Error(
                    `[withShareExtensionCcache] No "${TARGET_NAME}" target found. ` +
                    `Ensure this plugin is listed after "expo-share-intent" in app.json.`
                );
            }

            const listKey = targets[targetKey].buildConfigurationList;
            const buildConfigs = project.pbxXCBuildConfigurationSection();

            for (const {value} of project.pbxXCConfigurationList()[listKey].buildConfigurations) {
                const settings = buildConfigs[value].buildSettings;
                if (!settings.PODS_ROOT) {
                    settings.PODS_ROOT = '"$(SRCROOT)/Pods"';
                }
            }

            fs.writeFileSync(projectPath, project.writeSync());
            return cfg;
        }
    ]);
};
