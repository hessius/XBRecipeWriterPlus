import React from "react";
import {Pressable, Text, View} from "react-native";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import type {WebViewNavigation} from "react-native-webview";
import type {ShouldStartLoadRequest} from "react-native-webview/lib/WebViewTypes";

import BrewMindBrowser from "@/components/BrewMindBrowser";
import {useBrewMindCreate, BREWMIND_CREATE_URL} from "@/hooks/useBrewMindCreate";
import type {BrewMindLink} from "@/library/brewmindLink";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

let mockWebViewProps: {
    source: {uri: string};
    onShouldStartLoadWithRequest: (request: ShouldStartLoadRequest) => boolean;
    onNavigationStateChange: (navigation: WebViewNavigation) => void;
    originWhitelist?: string[];
    allowsInlineMediaPlayback?: boolean;
    contentInsetAdjustmentBehavior?: string;
} | null = null;

jest.mock("react-native-webview", () => {
    return {
        WebView: jest.fn((props) => {
            mockWebViewProps = props;
            return null;
        })
    };
});

const LINK = "xbrw://import?v=1&source=brewmind&share="
    + encodeURIComponent("https://share-h5.xbloom.com/r?id=abc123")
    + "&bean.name=Finca";
const SHARE = "https://share-h5.xbloom.com/r?id=abc123";

type HarnessProps = {
    onLink: (link: BrewMindLink, url: string) => void;
    onShare: (url: string) => void;
};

function Harness({onLink, onShare}: HarnessProps) {
    const brewMind = useBrewMindCreate(onLink, onShare);

    return (
        <View>
            <Pressable accessibilityRole="button" accessibilityLabel="Open BrewMind"
                       onPress={brewMind.open}>
                <Text>Open BrewMind</Text>
            </Pressable>
            <Text testID="brewmind-busy">{String(brewMind.busy)}</Text>
            <BrewMindBrowser {...brewMind.browser}/>
        </View>
    );
}

async function renderHarness(onLink = jest.fn(), onShare = jest.fn()) {
    mockWebViewProps = null;
    await renderWithProviders(<Harness onLink={onLink} onShare={onShare}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Open BrewMind"}));
}

function request(url: string): ShouldStartLoadRequest {
    return {url} as ShouldStartLoadRequest;
}

function navigation(url: string): WebViewNavigation {
    return {url} as WebViewNavigation;
}

describe("useBrewMindCreate", () => {
    it("opens BrewMind in the app browser", async () => {
        await renderHarness();

        expect(mockWebViewProps?.source).toEqual({uri: BREWMIND_CREATE_URL});
        expect(screen.getByTestId("brewmind-busy")).toHaveTextContent("true");
    });

    it("intercepts share links, closes, and hands the URL to the importer", async () => {
        const onShare = jest.fn();
        await renderHarness(jest.fn(), onShare);

        let allowed = true;
        await act(async () => {
            allowed = mockWebViewProps?.onShouldStartLoadWithRequest(request(SHARE)) ?? true;
        });

        expect(allowed).toBe(false);
        expect(onShare).toHaveBeenCalledWith(SHARE);
        expect(screen.getByTestId("brewmind-busy")).toHaveTextContent("false");
    });

    it("intercepts BrewMind links, closes, and hands back the parsed link", async () => {
        const onLink = jest.fn();
        await renderHarness(onLink, jest.fn());

        await act(async () => {
            mockWebViewProps?.onShouldStartLoadWithRequest(request(LINK));
        });

        expect(onLink).toHaveBeenCalledWith(
            expect.objectContaining({
                share:  "https://share-h5.xbloom.com/r?id=abc123",
                source: "brewmind",
                coffee: {name: "Finca"}
            }),
            // The raw URL goes with it: on Android this same redirect is also
            // delivered as a Linking event, and the caller can only recognise
            // the two as one arrival by the string.
            LINK
        );
        expect(screen.getByTestId("brewmind-busy")).toHaveTextContent("false");
    });

    it("allows ordinary navigation through", async () => {
        const onLink = jest.fn();
        const onShare = jest.fn();
        await renderHarness(onLink, onShare);

        let allowed = false;
        await act(async () => {
            allowed = mockWebViewProps
                ?.onShouldStartLoadWithRequest(request("https://brewmind.coffee/coffee?id=42"))
                ?? false;
        });

        expect(allowed).toBe(true);
        expect(onLink).not.toHaveBeenCalled();
        expect(onShare).not.toHaveBeenCalled();
        expect(screen.getByTestId("brewmind-busy")).toHaveTextContent("true");
    });

    it("acts once when both WebView callbacks report the same URL", async () => {
        const onShare = jest.fn();
        await renderHarness(jest.fn(), onShare);

        await act(async () => {
            mockWebViewProps?.onShouldStartLoadWithRequest(request(SHARE));
            mockWebViewProps?.onNavigationStateChange(navigation(SHARE));
        });

        expect(onShare).toHaveBeenCalledTimes(1);
    });

    it("uses navigation state changes as an Android backstop", async () => {
        const onShare = jest.fn();
        await renderHarness(jest.fn(), onShare);

        await act(async () => {
            mockWebViewProps?.onNavigationStateChange(navigation(SHARE));
        });

        expect(onShare).toHaveBeenCalledWith(SHARE);
        expect(screen.getByTestId("brewmind-busy")).toHaveTextContent("false");
    });

    it("clears busy when the browser is closed by hand", async () => {
        await renderHarness();

        await fireEvent.press(screen.getByRole("button", {name: "Close BrewMind"}));

        expect(screen.getByTestId("brewmind-busy")).toHaveTextContent("false");
    });

});

describe("the browser's origin whitelist", () => {
    /*
     * Without the app schemes on this list the WebView never asks
     * `onShouldStartLoadWithRequest` about BrewMind's redirect: the default is
     * http and https only, and anything else goes straight to
     * `Linking.openURL`. The import would still happen, by the redirect
     * re-entering the app from the outside, but nothing would close the
     * browser, so it would sit open above the recipe it just imported.
     */
    it("lets the classifier see the app's own schemes", async () => {
        const onLink = jest.fn();
        const onShare = jest.fn();
        await renderWithProviders(<Harness onLink={onLink} onShare={onShare}/>);

        await waitFor(() => {
            fireEvent.press(screen.getByLabelText("Open BrewMind"));
            expect(mockWebViewProps).not.toBeNull();
        }, {timeout: SHEET_PRESS_TIMEOUT});

        expect(mockWebViewProps?.originWhitelist)
            .toEqual(expect.arrayContaining(["xbrw://*", "xbrecipewriter://*"]));
    });
});

/*
 * Two props whose native default is the opposite of what the browser wants,
 * which is the whole reason they are pinned. Neither is visible in a snapshot
 * of what the page draws and neither fails loudly: deleting either one leaves
 * a browser that still loads BrewMind, still imports, and still passes every
 * other test in this file, while quietly undoing the thing it was set for.
 */
describe("the browser's iOS presentation defaults", () => {
    async function propsAfterOpen() {
        await renderWithProviders(
            <Harness onLink={jest.fn()} onShare={jest.fn()}/>);

        await waitFor(() => {
            fireEvent.press(screen.getByLabelText("Open BrewMind"));
            expect(mockWebViewProps).not.toBeNull();
        }, {timeout: SHEET_PRESS_TIMEOUT});

        return mockWebViewProps;
    }

    /*
     * BrewMind reads a coffee bag from a photo, so the page may ask for a live
     * camera. The native default is false, which plays a captured stream
     * fullscreen: the page's own framing, including its shutter control, is
     * torn away and the user is left in a video player.
     */
    it("keeps a camera preview inside the page", async () => {
        expect((await propsAfterOpen())?.allowsInlineMediaPlayback).toBe(true);
    });

    /*
     * The container deliberately does not pad the bottom safe area, because
     * doing so drew a black bar under the page. That only works while the
     * WebView insets its own content: the native default is `never`, which
     * would leave the page running under the home indicator instead.
     */
    it("hands the bottom inset to the page rather than padding around it", async () => {
        expect((await propsAfterOpen())?.contentInsetAdjustmentBehavior)
            .toBe("automatic");
    });
});
