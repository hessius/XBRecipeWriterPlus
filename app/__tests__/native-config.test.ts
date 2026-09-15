import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    /**
     * 1.7.0.
     *
     * `runtimeVersion.policy` is `appVersion`, so the version string is also
     * the runtime version: an over-the-air update built against new native code
     * must never land on a binary that does not have it. This release does add
     * native code — `expo-secure-store` and `expo-crypto`, for the xBloom
     * account sign-in — so the bump is mandatory rather than housekeeping. An
     * OTA carrying the account screen onto a 1.6.0 binary would find no
     * keychain module and fail at the first call.
     *
     * 1.6.0 is the create-recipe release, on TestFlight. A released version is
     * never reused.
     */
    it("ships the account-import release as 1.7.0, on the appVersion runtime policy", () => {
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
