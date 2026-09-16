import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    /**
     * 1.6.0, and deliberately not bumped by this branch.
     *
     * Main owns the version. 1.6.0 is the create-recipe release and is shipping
     * from main; this branch merges underneath it with its feature gated off,
     * so it adds nothing a user can see and has no release of its own to name.
     * Under the agreed ladder 1.7.0 belongs to M5 and the account import gets
     * 2.0.0 when it is ungated, the major marking credentials leaving the
     * device for the first time (see issue #76).
     *
     * `runtimeVersion.policy` is `appVersion`, so the version string is also
     * the runtime version. Normally that would make this branch's two new
     * native modules, `expo-secure-store` and `expo-crypto`, a reason the bump
     * was mandatory rather than optional: an over-the-air update built against
     * new native code must never land on a binary without it. It is not a
     * reason here, because `expo-updates` is not a dependency of this app at
     * all. Nothing is ever delivered over the air, so `runtimeVersion` names a
     * mechanism that is not in the build, and the version string is a store
     * version and nothing more. If OTA updates are ever adopted, this is the
     * paragraph that stops being true.
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
