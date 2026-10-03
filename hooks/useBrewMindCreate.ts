import {useRef, useState} from "react";
import type {WebViewNavigation} from "react-native-webview";
import type {ShouldStartLoadRequest} from "react-native-webview/lib/WebViewTypes";

import type {BrewMindLink} from "@/library/brewmindLink";
import {readBrewMindNavigation} from "@/library/brewmindNavigation";

/**
 * The page a user is sent to when they want to build a recipe around a coffee
 * (issue #159). `client` and `v` say who is asking and which grammar we can
 * read back, so the page can hand control straight back rather than making the
 * user copy a link.
 */
export const BREWMIND_CREATE_URL = "https://brewmind.coffee/?client=xbrw&v=1";

/**
 * Send the user to BrewMind and come back with whatever they built.
 *
 * The browser is in this app's tree rather than in a system sheet so its
 * navigation can be classified before it loads. That keeps BrewMind's eventual
 * `xbrw://import` redirect working and lets the temporary ordinary xBloom share
 * link path use the same importer the paste field uses.
 *
 * A link that comes back is read by the same parser a cold deep link goes
 * through. There is one grammar and one reader.
 *
 * The raw URL is handed on with it. Android can deliver the same navigation
 * through both callbacks, so the hook remembers which URL already acted during
 * this browser session and refuses to act on it twice.
 */
export function useBrewMindCreate(
    onLink: (link: BrewMindLink, url: string) => void,
    onShare: (url: string) => void
) {
    const [busy, setBusy] = useState(false);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const acted = useRef<Set<string>>(new Set());

    function close() {
        setVisible(false);
        setLoading(false);
        setBusy(false);
    }

    function actOnUrl(url: string): boolean {
        const navigation = readBrewMindNavigation(url);
        if (navigation.kind === "allow") return false;
        if (acted.current.has(url)) return true;
        acted.current.add(url);
        close();
        if (navigation.kind === "brewmind") {
            onLink(navigation.link, url);
            return true;
        }
        onShare(navigation.url);
        return true;
    }

    function open() {
        if (busy) return;
        acted.current = new Set();
        setBusy(true);
        setLoading(true);
        setVisible(true);
    }

    function onShouldStartLoadWithRequest(request: ShouldStartLoadRequest): boolean {
        return !actOnUrl(request.url);
    }

    function onNavigationStateChange(navigation: WebViewNavigation) {
        if (navigation.url === undefined) return;
        actOnUrl(navigation.url);
    }

    return {
        busy,
        open,
        browser: {
            visible,
            url: BREWMIND_CREATE_URL,
            loading,
            onClose: close,
            onLoadStart: () => setLoading(true),
            onLoadEnd:   () => setLoading(false),
            onShouldStartLoadWithRequest,
            onNavigationStateChange
        }
    };
}
