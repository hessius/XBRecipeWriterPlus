import {useEffect, useRef} from "react";
import * as Linking from "expo-linking";

import {parseBrewMindLink, type BrewMindLink} from "@/library/brewmindLink";

/**
 * Deliver every import link the system hands the app (issue #159).
 *
 * Deliberately not `Linking.useURL`. That hook keeps the latest URL in state,
 * which makes it the wrong shape for this twice over: it hands the opening URL
 * back on every render, so acting on it needs a guard, and setting state to a
 * string equal to the one already there changes nothing, so opening the *same*
 * link a second time is never delivered at all. A failed import could then
 * never be retried by opening the link again, which is exactly when somebody
 * would try.
 *
 * A link is an event, not a value, so this subscribes to the events: the URL
 * the app was launched with, then each one delivered while it runs. Every
 * delivery is a delivery, including a repeat.
 *
 * The raw URL is passed on beside the parsed link because the caller needs to
 * recognise a single redirect arriving twice, which it can only do by string.
 */
export function useImportLink(onLink: (link: BrewMindLink, url: string) => void) {
    // The subscription is made once, so it must not close over a stale
    // callback. Updated in an effect rather than during render, because
    // writing to a ref while rendering is not a pure render.
    const handler = useRef(onLink);
    useEffect(() => {
        handler.current = onLink;
    });

    useEffect(() => {
        let listening = true;

        function deliver(url: string | null) {
            if (!listening || !url) return;
            const link = parseBrewMindLink(url);
            if (link !== null) handler.current(link, url);
        }

        // The cold-start case: the app was not running when the link was
        // opened, so there is no event to hear, only the URL it launched with.
        void Linking.getInitialURL().then(deliver).catch(() => {
            // A launch URL that cannot be read is not something to report:
            // there is no link, so there is nothing the user asked for.
        });

        const subscription = Linking.addEventListener("url", ({url}) => deliver(url));
        return () => {
            listening = false;
            subscription.remove();
        };
    }, []);
}
