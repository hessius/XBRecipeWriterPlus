import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    /**
     * 1.5.0, not 1.5.1.
     *
     * The background-modes change is native and `runtimeVersion.policy` is
     * `appVersion`, which normally means a native-affecting change has to carry
     * a bump: an over-the-air update built against new native code must never
     * land on a binary that does not have it. That rule has no subject here.
     * 1.5.0 exists only as TestFlight builds 4 to 6, the store still holds
     * 1.0.0, and no update has ever been published — there are no EAS Update
     * branches at all — so no installed binary claims runtime 1.5.0 and none
     * can be handed the wrong bundle. M4 therefore reaches the store as the
     * 1.5.0 it was developed as, rather than skipping a version to record a
     * collision that cannot happen.
     */
    it("ships M4 as 1.5.0, on the appVersion runtime policy", () => {
        expect(appConfig.expo.version).toBe("1.5.0");
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
