import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    /**
     * 1.6.0.
     *
     * `runtimeVersion.policy` is `appVersion`, so the version string is also
     * the runtime version: an over-the-air update built against new native code
     * must never land on a binary that does not have it. This release adds no
     * native code — it is a sheet, a tile, a header glyph and domain logic —
     * but it follows 1.5.0 into the store, and a released version is not
     * reused.
     *
     * 1.5.0 build 9 is the M4 release candidate; the 1.5.1 builds 7 and 8 that
     * preceded it have been retired. This release is 1.6.0 build 1.
     */
    it("ships the create-recipe release as 1.6.0, on the appVersion runtime policy", () => {
        expect(appConfig.expo.version).toBe("1.6.0");
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
