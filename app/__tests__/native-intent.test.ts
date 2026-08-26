import {redirectSystemPath} from "@/app/+native-intent";

jest.mock("expo-share-intent", () => ({
    getShareExtensionKey: () => "xbrecipewriterShareKey"
}));

describe("redirectSystemPath", () => {
    it("stays put when the share extension hands over a payload", () => {
        // Not an address in this app: the share extension's own handle, which
        // `useShareIntent` reads straight off the linking URL. Navigating on it
        // mounts a second library screen over the editor the share just opened,
        // and that screen imports the same recipe all over again.
        const path = "xbrecipewriter://dataUrl=xbrecipewriterShareKey?nonce=4DAB54E9#weburl";

        expect(redirectSystemPath({path, initial: false})).toBeNull();
    });

    it("stays put when the payload arrives as the app's first URL", () => {
        // Sharing into a closed app delivers the same handle as the initial URL,
        // where a stray navigation is just as wrong.
        const path = "xbrecipewriter://dataUrl=xbrecipewriterShareKey?nonce=1#weburl";

        expect(redirectSystemPath({path, initial: true})).toBeNull();
    });

    it("lets an ordinary deep link through untouched", () => {
        // Only the share handle is special. Every other URL is still the
        // router's business, and rewriting one here would break it.
        const path = "xbrecipewriter://editRecipe";

        expect(redirectSystemPath({path, initial: false})).toBe(path);
    });

    it("lets a link through when the scheme cannot be read", () => {
        // The scheme lookup reads app config and can throw. Failing open leaves
        // the router doing what it would have done anyway; failing closed would
        // silently swallow every deep link the app has.
        const shareIntent = jest.requireMock("expo-share-intent");
        const spy = jest.spyOn(shareIntent, "getShareExtensionKey")
            .mockImplementation(() => {
                throw new Error("no scheme");
            });
        const path = "xbrecipewriter://editRecipe";

        expect(redirectSystemPath({path, initial: false})).toBe(path);

        spy.mockRestore();
    });
});
