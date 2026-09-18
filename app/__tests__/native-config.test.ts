import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    /**
     * 1.7.0, the M5 release.
     *
     * Under the agreed ladder (issue #76) 1.7.0 belongs to M5 and the account
     * import gets 2.0.0 when it is ungated, the major marking credentials
     * leaving the device for the first time. M5 is the first of those to reach
     * a user: shelves, cover art, ratings and the brew history are all visible
     * work, so the release is named here rather than left to main.
     *
     * `runtimeVersion.policy` is `appVersion`, so the version string is also
     * the runtime version. That is the reason the bump travels with the SDK
     * patch upgrades in `package.json` rather than trailing them: a rebuilt
     * binary must not wear the runtime identity of the one before it. The
     * belt-and-braces part is that `expo-updates` is not a dependency of this
     * app at all, so nothing is ever delivered over the air and
     * `runtimeVersion` names a mechanism that is not in the build. If OTA
     * updates are ever adopted, that second sentence stops being true and the
     * first one carries the whole weight.
     */
    it("ships the M5 release as 1.7.0, on the appVersion runtime policy", () => {
        expect(appConfig.expo.version).toBe("1.7.0");
        expect(appConfig.expo.runtimeVersion.policy).toBe("appVersion");
    });

    it("allows iOS central-role Bluetooth events in the background", () => {
        expect(appConfig.expo.ios.infoPlist).toEqual({
            UIBackgroundModes: ["bluetooth-central"]
        });
    });

    it("does not advertise an unused BLE plugin modes option", () => {
        const plugins = appConfig.expo.plugins as PluginEntry[];
        const entry = plugins.find(
            (plugin): plugin is [string, Record<string, unknown>] =>
                Array.isArray(plugin) && plugin[0] === "react-native-ble-manager"
        );

        expect(entry).toBeDefined();
        expect(entry?.[1]).not.toHaveProperty("modes");
    });
});
