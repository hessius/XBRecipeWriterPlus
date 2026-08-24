const {withXcodeProject} = require('expo/config-plugins');

/**
 * Lets react-native's bundling script write into the app bundle.
 *
 * Expo generates the project with `ENABLE_USER_SCRIPT_SANDBOXING = YES`, which
 * confines every run-script build phase to reading and writing only its
 * declared inputs and outputs. React Native's "Bundle React Native code and
 * images" phase declares none, and on a *device* Debug build it writes an
 * `ip.txt` into the .app so the binary knows which host to look for the dev
 * server on. The sandbox denies the write and the build fails with:
 *
 *     error: Sandbox: bash(N) deny(1) file-write-create .../XBRW.app/ip.txt
 *
 * Simulator builds are unaffected — they reach the packager over localhost and
 * never write the file — which is why this only appears the first time the app
 * is built for a phone.
 *
 * Turned off project-wide rather than per phase: the setting is inherited, and
 * the phases that trip over it are all generated (react-native's, CocoaPods',
 * expo-dev-launcher's), so a narrower fix would have to enumerate scripts this
 * project does not own.
 */
module.exports = function withUserScriptSandboxDisabled(config) {
    return withXcodeProject(config, (cfg) => {
        const project = cfg.modResults;
        const configurations = project.pbxXCBuildConfigurationSection();

        for (const key of Object.keys(configurations)) {
            const entry = configurations[key];
            // The section is interleaved with `_comment` string entries.
            if (typeof entry !== 'object' || !entry.buildSettings) continue;
            entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
        }

        return cfg;
    });
};
