import {isValidXID} from "./Recipe";

/**
 * What the import field will accept, and which endpoint it implies.
 *
 * Pure: no React, no network. Everything downstream decides what to do from
 * this answer, so this is the only place that knows what an xBloom link looks
 * like -- `app/index.tsx` used to know it too, and two modules that have to
 * agree eventually do not.
 */
export type ImportSource =
    | {kind: "share"; id: string}
    | {kind: "xid"; xid: string};

/**
 * The parsed source, or `null` when there is nothing to look up.
 *
 * A share link and a pod code cannot be mistaken for one another, which is why
 * the sheet has no mode switch: asking the user to declare which one they are
 * holding would be asking for something the app can already see.
 *
 * The host is deliberately not checked. Any `http(s)` URL carrying an `id` is
 * accepted -- the id is opaque to us, the server rejects a bad one, and an
 * allowlist of xBloom domains would break silently on the day they change
 * domain. The cost of being wrong is one wasted request.
 */
export function parseImportInput(raw: string): ImportSource | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return null;
    }

    const share = shareId(trimmed);
    if (share !== null) {
        return {kind: "share", id: share};
    }

    // `isValidXID` accepts an empty string -- a recipe brews without an ID --
    // and the empty case is already gone above.
    if (isValidXID(trimmed)) {
        // Upper-cased because that is how the card holds it, so a code typed in
        // lower case produces the same recipe as one pasted from a pack.
        return {kind: "xid", xid: trimmed.toUpperCase()};
    }

    return null;
}

function shareId(candidate: string): string | null {
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return null;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null;
    }

    // `URL` has already decoded this.
    const id = url.searchParams.get("id");
    return id !== null && id.length > 0 ? id : null;
}
