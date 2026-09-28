import {Linking} from "react-native";

import {notify} from "@/components/XbrwToast";

export const LINK_OPEN_FAILED = "Could not open that link.";

/**
 * Hand a URL to the system, and say so when the system will not take it.
 *
 * `openURL` rejects when nothing can handle the scheme -- a managed device with
 * no browser, say. Unhandled, that rejection is a red box in development and
 * silence in production, which is the worst of both: the developer is
 * interrupted by something the user will never be told about.
 *
 * Lives here rather than inside `LinkText` because it is no longer only a
 * link's concern. `SupportTile` is a filled tile rather than a line of text and
 * shares none of that component's rendering, but it opens an external URL the
 * same way and must fail the same way. Two copies of a `catch` drift apart, and
 * the half that drifts is the half nobody ever sees run.
 *
 * In `components/` rather than `library/` despite having no JSX: it depends on
 * the toast dispatcher, which is a component module, and `library/` is
 * React-free by rule.
 */
export function openLink(url: string): void {
    Linking.openURL(url).catch(() => notify({
        tone:    "error",
        message: LINK_OPEN_FAILED
    }));
}
