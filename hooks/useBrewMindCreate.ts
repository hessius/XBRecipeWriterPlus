import {useState} from "react";
import * as WebBrowser from "expo-web-browser";

import {parseBrewMindLink, type BrewMindLink} from "@/library/brewmindLink";

/**
 * The page a user is sent to when they want to build a recipe around a coffee
 * (issue #159). `client` and `v` say who is asking and which grammar we can
 * read back, so the page can hand control straight back rather than making the
 * user copy a link.
 */
export const BREWMIND_CREATE_URL = "https://brewmind.coffee/?client=xbrw&v=1";

/**
 * The scheme the session watches for. `openAuthSessionAsync` exists to return
 * control the moment a page redirects to a given scheme, which is exactly the
 * handoff #159 describes, and it dismisses the browser itself rather than
 * leaving the user to.
 */
export const BREWMIND_RETURN_URL = "xbrw://import";

/**
 * Send the user to BrewMind and come back with whatever they built.
 *
 * This degrades honestly, which is why it is worth shipping before BrewMind
 * has finished their half. If they honour `client=xbrw`, the session returns
 * an import link on its own and the user presses nothing. If they do not, the
 * session is an ordinary in-app browser and the user shares the link back by
 * hand, which already works through the other three doors. Neither outcome is
 * a failure, so this does not wait on anybody.
 *
 * A link that comes back is read by the same parser a cold deep link goes
 * through. There is one grammar and one reader.
 */
export function useBrewMindCreate(onLink: (link: BrewMindLink) => void) {
    const [busy, setBusy] = useState(false);

    async function open() {
        if (busy) return;
        setBusy(true);
        // `try`/`finally` would be the obvious shape, but it bails the React
        // Compiler out of the whole component, so the release runs down both
        // paths by hand instead.
        try {
            const result = await WebBrowser.openAuthSessionAsync(
                BREWMIND_CREATE_URL,
                BREWMIND_RETURN_URL
            );
            setBusy(false);
            if (result.type !== "success") return;
            const link = parseBrewMindLink(result.url);
            if (link !== null) onLink(link);
        } catch {
            // Nothing is said. The user either never left, or came back with
            // nothing, and in both cases the sheet they started from is still
            // in front of them with its field ready. An error line here would
            // name a failure they cannot act on.
            setBusy(false);
        }
    }

    return {busy, open};
}
