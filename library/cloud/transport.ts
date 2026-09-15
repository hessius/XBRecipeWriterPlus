// The key lives in `key.ts` so the RSA tests can reach it without importing
// the HTTP layer. Imported rather than re-exported bare, because `post` uses
// it; the re-export below is for callers who think of it as part of the
// transport.
import {XBLOOM_PUBLIC_KEY} from "./key";
import {encryptChunks} from "./rsa";

/**
 * The xBloom client API envelope.
 *
 * This file knows about HTTP and about xBloom's framing. It knows nothing
 * about recipes, and nothing above it knows about either.
 *
 * Nothing here is ever logged. A body on this path may be a password or a
 * token, and a `console.log` left in after debugging would write it to the
 * device log, where anything that can read logs can read it.
 *
 * The shapes below were observed against a live account in the #74 spike.
 * They are not guesses from endpoint names, and two of them would be guessed
 * wrong: the encrypted body is a bare JSON string rather than an object, and
 * the credentials ride inside that body rather than in a header.
 */

const BASE = "https://client-api.xbloom.com";

export {XBLOOM_PUBLIC_KEY};

const HEADERS: Record<string, string> = {
    "Content-Type": "application/json",
    Referer: "https://share-h5.xbloom.com/",
    "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
        "Mobile/15E148 Safari/604.1",
};

export type CloudErrorKind =
    /** The credentials were rejected. Not retryable without new input. */
    | "credentials"
    /** The session is gone or stale. It must be rebuilt. */
    | "unauthorised"
    /** The request never arrived. Retryable as-is. */
    | "network"
    /** Anything else. */
    | "server";

export class CloudError extends Error {
    public readonly kind: CloudErrorKind;

    constructor(kind: CloudErrorKind, message: string) {
        super(message);
        this.name = "CloudError";
        this.kind = kind;
    }
}

/**
 * The boilerplate every authenticated endpoint expects in its body.
 *
 * `skey` really is the literal string below in every surveyed client; it is
 * not a secret and not per-account.
 */
/**
 * The shape every call carries. Written out rather than inferred so a drift
 * in `interfaceVersion` or `clientType` is a compile error here, at the wire
 * contract, rather than only a test failure somewhere downstream.
 */
export type AuthFields = {
    interfaceVersion: number;
    skey: string;
    phoneType: string;
    clientType: number;
    languageType: number;
    memberId: number;
    token: string;
};

export function authFields(memberId: number, token: string): AuthFields {
    return {
        interfaceVersion: 20240918,
        skey: "testskey",
        phoneType: "Android",
        clientType: 2,
        languageType: 1,
        memberId,
        token,
    };
}

export type CloudResponse = {
    result?: string;
    info?: string;
    [key: string]: unknown;
};

export async function post(
    path: string,
    payload: unknown,
    encrypted: boolean,
    signal?: AbortSignal
): Promise<CloudResponse> {
    const json = JSON.stringify(payload);
    const body = encrypted
        ? JSON.stringify(encryptChunks(json, XBLOOM_PUBLIC_KEY))
        : json;

    let response: {ok: boolean; status?: number; json: () => Promise<unknown>};
    try {
        response = await fetch(`${BASE}/${path}`, {
            method: "POST",
            headers: HEADERS,
            body,
            signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new CloudError("network", "Could not reach xBloom");
    }

    if (!response.ok) {
        throw new CloudError("server", `xBloom replied ${response.status}`);
    }

    let parsed: CloudResponse;
    try {
        parsed = (await response.json()) as CloudResponse;
    } catch {
        // A 200 carrying something that is not JSON — a captive portal, a
        // proxy's HTML error page, an empty body. `server` because the
        // response is well-formed HTTP the app simply cannot use. Without
        // this, the one path out of `post` that is not a `CloudError` is a
        // raw SyntaxError, which the caller's per-kind copy cannot match and
        // which reaches the user as a crash rather than a sentence.
        //
        // The caught error is deliberately not carried: it may quote the
        // response body, and nothing on this path is ever surfaced anyway.
        throw new CloudError("server", "xBloom sent a reply we could not read");
    }

    if (parsed?.result === "success") return parsed;

    // Their message, kept so a bug report can quote it. It is never shown:
    // the UI has its own copy per `kind`, in the user's own language.
    //
    // This branch is the catch-all on purpose. A 200 whose JSON omits
    // `result` altogether lands here too and is reported as an auth failure.
    // Every failure the spike saw carried `result: "fail"`, so the shape is
    // not expected; and of the two ways to be wrong about it, asking for a
    // sign-in the user did not need is the recoverable one.
    const message = parsed?.info ?? "xBloom rejected the request";

    // An encrypted call is an authenticated call, and the overwhelmingly
    // likely reason for one to fail is a session that has lapsed. Treating it
    // as such costs a re-login when it is wrong; the opposite mistake leaves
    // the user looking at an error no action can clear.
    throw new CloudError(encrypted ? "unauthorised" : "credentials", message);
}
