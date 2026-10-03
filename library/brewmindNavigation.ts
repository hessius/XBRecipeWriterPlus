import {parseBrewMindLink, type BrewMindLink} from "@/library/brewmindLink";
import {parseImportInput} from "@/library/importInput";
import {XBLOOM_SHARE_HOST} from "@/library/shareLink";

export type BrewMindNavigation =
    | {kind: "brewmind"; link: BrewMindLink}
    | {kind: "share"; url: string}
    | {kind: "allow"};

/**
 * The schemes this app is registered for, as `app.json` lists them.
 *
 * Restated rather than read from the config because this is a trust boundary
 * and should not move because somebody added a fourth alias for convenience.
 * `app/__tests__/native-config.test.ts` already pins the registered list and
 * its order; a test here pins that these two agree with it.
 */
const APP_SCHEMES = ["xbrw:", "xbrecipewriter:"];

export function readBrewMindNavigation(url: string): BrewMindNavigation {
    // Only our own scheme may be a BrewMind handoff, and this is the line that
    // used to be free.
    //
    // `parseBrewMindLink` accepts an https URL with `import` in the path, and
    // its own comment says which links can actually reach the app is settled by
    // the registered schemes rather than by it. That was true while the handoff
    // ran through `openAuthSessionAsync`, which returned control only on a
    // redirect to `xbrw://import` and so was the scheme check.
    //
    // This interceptor sees every page the user browses, so that sentence stops
    // being true here. Without this test, any site could navigate to
    // `/import?v=1&share=...&bean.name=...` and have the app import a recipe
    // carrying metadata the site chose. The scheme check puts the old boundary
    // back where the browser removed it. An https navigation falls through to
    // the share rule below, which is host checked.
    if (isAppScheme(url)) {
        const link = parseBrewMindLink(url);
        if (link !== null) {
            return {kind: "brewmind", link};
        }
    }

    if (isXBloomHost(url) && parseImportInput(url)?.kind === "share") {
        return {kind: "share", url};
    }

    return {kind: "allow"};
}

function isAppScheme(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    return APP_SCHEMES.includes(url.protocol.toLowerCase());
}

function isXBloomHost(raw: string): boolean {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }

    const host = url.hostname.toLowerCase();
    // `parseImportInput` deliberately accepts any http(s) URL with an `id`,
    // which is right for a paste field and wrong for a navigation interceptor:
    // without this boundary check, BrewMind visiting `/coffee?id=42` would be
    // hijacked into the xBloom importer.
    return host === XBLOOM_SHARE_HOST
        || host === "xbloom.com"
        || host.endsWith(".xbloom.com");
}
