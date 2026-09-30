import {Platform} from "react-native";

/**
 * The harness itself, not the app.
 *
 * `jest-expo`'s default preset pins `haste.defaultPlatform` to `ios`, so for
 * most of this app's life every test ran as an iPhone and every Android branch
 * in `library/NFC.ts` and `library/machine/Transport.ts` was dead code as far
 * as CI was concerned. `jest.config.js` now runs two projects. These two tests
 * are the canary for that: they report once per platform, so a config change
 * that silently drops a project halves the count here before it goes unnoticed
 * anywhere else.
 */
describe("the test harness", () => {
    it("runs as a platform the app ships on", () => {
        expect(["ios", "android"]).toContain(Platform.OS);
    });

    it("resolves Platform.select rather than falling through to the default", () => {
        expect(Platform.select({ios: "i", android: "a", default: "d"})).not.toBe("d");
    });

    /**
     * `testTimeout` is not a project option. Jest drops it from a `projects`
     * entry without failing, and twenty seconds silently becoming five is the
     * exact failure the setting was added to stop: a timed-out screen test
     * leaves its tree mounted and takes the rest of its `describe` with it.
     *
     * Reading the config back is not possible from inside a test, so this
     * waits longer than jest's own default instead. If it ever fails with
     * "Exceeded timeout of 5000 ms", `testTimeout` has fallen out of
     * `jest.config.js` and belongs at the top level, beside `projects`.
     */
    it("honours the repo's test timeout rather than jest's default", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5_500));
        expect(true).toBe(true);
    });
});
