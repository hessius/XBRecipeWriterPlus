const {withXcodeProject} = require('expo/config-plugins');

/**
 * Keeps Xcode on implicit modules, because ccache hides the real compiler.
 *
 * `ios.ccacheEnabled` makes Expo point CC/CXX at react-native's ccache wrapper
 * *shell scripts*. Xcode 26 builds with explicit modules by default, which
 * needs to introspect the compiler to plan the module graph, and it cannot
 * introspect a bash script:
 *
 *     note: Explicit modules is enabled but the compiler was not recognized;
 *     disable explicit modules with CLANG_ENABLE_EXPLICIT_MODULES=NO, ...
 *
 * Xcode sometimes recovers from that by falling back to implicit modules, and
 * sometimes does not — when it does not, every pod's Swift bridging header
 * precompile fails with "module map file '.../<Pod>.modulemap' not found".
 * Asking for implicit modules up front removes the guess.
 *
 * The alternative the note offers, C_COMPILER_LAUNCHER with
 * CLANG_ENABLE_EXPLICIT_MODULES_WITH_COMPILER_LAUNCHER, does not apply: react
 * native drives ccache by replacing the compiler, not by launching it.
 *
 * This covers the app project only. The Pods project keeps emitting the note,
 * harmlessly — CocoaPods owns those build settings, and nothing there has ever
 * failed on it.
 *
 * Delete this plugin if `ios.ccacheEnabled` is ever turned off in app.json.
 */
module.exports = function withExplicitModulesDisabled(config) {
    return withXcodeProject(config, (cfg) => {
        const configurations = cfg.modResults.pbxXCBuildConfigurationSection();

        for (const key of Object.keys(configurations)) {
            const entry = configurations[key];
            // The section is interleaved with `_comment` string entries.
            if (typeof entry !== 'object' || !entry.buildSettings) continue;
            entry.buildSettings.CLANG_ENABLE_EXPLICIT_MODULES = 'NO';
        }

        return cfg;
    });
};
