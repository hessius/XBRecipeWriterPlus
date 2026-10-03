import {parseBrewMindLink, type BrewMindLink} from "@/library/brewmindLink";
import {parseImportInput} from "@/library/importInput";
import {XBLOOM_SHARE_HOST} from "@/library/shareLink";

export type BrewMindNavigation =
    | {kind: "brewmind"; link: BrewMindLink}
    | {kind: "share"; url: string}
    | {kind: "allow"};

export function readBrewMindNavigation(url: string): BrewMindNavigation {
    const link = parseBrewMindLink(url);
    if (link !== null) {
        return {kind: "brewmind", link};
    }

    if (isXBloomHost(url) && parseImportInput(url)?.kind === "share") {
        return {kind: "share", url};
    }

    return {kind: "allow"};
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
