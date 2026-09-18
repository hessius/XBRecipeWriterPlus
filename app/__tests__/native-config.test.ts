import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    /**
     * 2.0.0.
     *
     * The ladder in issue #76 put M5 at 1.7.0 and reserved the major for the
     * account import, the release in which credentials leave the device for the
     * first time. Both are now in the same tree, so the major is what ships:
     * a user upgrading gets the shelves, the brew evidence and the account
     * import together, and one of those three is the one that changes what the
     * app does with their password.
     *
     * `runtimeVersion.policy` is `appVersion`, so the version string is also
     * the runtime version, which is why a native affecting change has to bump
     * it. The belt and braces part is that `expo-updates` is not a dependency
     * of this app at all, so nothing is ever delivered over the air and
     * `runtimeVersion` names a mechanism that is not in the build. If OTA
     * updates are ever adopted, that second sentence stops being true and the
     * first one carries the whole weight.
     */
    it("ships as 2.0.0, on the appVersion runtime policy", () => {
        expect(appConfig.expo.version).toBe("2.0.0");
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
