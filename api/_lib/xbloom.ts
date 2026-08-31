import {constants, createPublicKey, publicEncrypt} from "node:crypto";

/**
 * xBloom's API key. A literal constant of their service, not a secret of ours.
 *
 * The irregular line wrapping is upstream — it is identical in pourpilot,
 * denull0 and KhalidOnzi, and `openssl rsa -pubin -text` parses it as a valid
 * 1024-bit key. Do not "fix" the wrapping.
 */
export const XBLOOM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4LF40GZ72SdhMyl765K/i4nY5
CPcHz2Q1IKWKZ9S79xmK7G8pUhbVf4EZLvnNF1+9IvOFQUKV5Z7ZNNviqSpnql9
tAT+8+J/He0R7pcirvVSxgdr2i9V/C/gmqAEZ5qVTzRnd3uWdFoKzPdEBxP0Ipor
J1VBbCv90yBSOhVxO+QIDAQAB
-----END PUBLIC KEY-----`;

const BASE = "https://client-api.xbloom.com";

/**
 * 128-byte modulus minus 11 bytes of PKCS#1 v1.5 padding. Not arbitrary: a
 * larger chunk throws, a smaller one produces more blocks than the server's
 * decryptor expects to reassemble.
 */
const CHUNK = 117;

/**
 * Sent on every call, including the unauthenticated ones.
 *
 * The Referer is load-bearing — every community client sets it, and the public
 * read endpoint requires it. The iPhone user agent is what the official share
 * page sends.
 */
const HEADERS = {
    "content-type":    "application/json",
    accept:            "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    Referer:           "https://share-h5.xbloom.com/",
    "User-Agent":      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
                       "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
                       "Mobile/15E148 Safari/604.1"
};

export type XbloomCredentials = {email: string; password: string};
export type MintResult = {tableId: number; url: string};

/** RSA-PKCS1v1.5 over 117-byte blocks, concatenated, base64'd. */
export function encryptForXbloom(plaintext: string, pem: string = XBLOOM_PUBLIC_KEY): string {
    const key = createPublicKey(pem);
    const bytes = Buffer.from(plaintext, "utf8");
    const blocks: Buffer[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
        blocks.push(publicEncrypt(
            {key, padding: constants.RSA_PKCS1_PADDING},
            bytes.subarray(i, i + CHUNK)
        ));
    }
    return Buffer.concat(blocks).toString("base64");
}

async function post(path: string, body: unknown, encrypted: boolean): Promise<unknown> {
    const res = await fetch(`${BASE}/${path}`, {
        method:  "POST",
        headers: HEADERS,
        body:    encrypted
            ? JSON.stringify(encryptForXbloom(JSON.stringify(body)))
            : JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error(`${path} returned ${res.status}`);
    }
    return res.json();
}

/**
 * The boilerplate every authenticated call carries.
 *
 * `adaptedModel` is not here: it belongs to the payload and to the lookup, and
 * the two must agree or the new row is invisible to the lookup. See the spike
 * notes in docs/machine-integration/cloud-api.md.
 */
function authFields(memberId: number, token: string) {
    return {
        interfaceVersion: 20240918,
        skey:             "testskey",
        phoneType:        "Android",
        clientType:       2,
        languageType:     1,
        memberId,
        token
    };
}

/**
 * Mint a share link for a payload.
 *
 * Three upstream calls, in this order, because the create response does not
 * contain the link and the `?id=` token is not derivable from the row id.
 *
 * Errors carry a class, never a credential and never the recipe. The message is
 * logged; the caller maps it to something the user can act on.
 */
export async function mintRecipe(
    payload: Record<string, unknown>, credentials: XbloomCredentials
): Promise<MintResult> {
    const login = await post("tMemberLogin.thtml", {
        email:            credentials.email,
        password:         credentials.password,
        interfaceVersion: 20240918,
        skey:             "testskey",
        phoneType:        "Android",
        clientType:       2,
        languageType:     1,
        jpushId:          ""
    }, false) as {result?: unknown; member?: {tableId?: unknown}; token?: unknown};

    const memberId = login?.member?.tableId;
    const token = login?.token;
    if (login?.result !== "success" || typeof memberId !== "number" || typeof token !== "string") {
        throw new Error("login rejected");
    }

    const created = await post("tuRecipeAdd.tuhtml", {
        ...authFields(memberId, token),
        ...payload,
        // Added here rather than in the app's payload so it never lands in the
        // snapshot. If it did, the snapshot would differ on every press and
        // every share would mint a duplicate.
        createTimeStamp: Date.now()
    }, true) as {result?: unknown; tableId?: unknown};

    const tableId = created?.tableId;
    if (created?.result !== "success" || typeof tableId !== "number") {
        throw new Error("mint rejected");
    }

    // The create response has no share link. Find the row we just made and read
    // the server's own link off it — the ?id= is an opaque server-issued token.
    const list = await post("tuMyTeaRecipeCreated.tuhtml", {
        ...authFields(memberId, token),
        pageNumber:   1,
        countPerPage: 20,
        adaptedModel: 1
    }, true) as {list?: {tableId?: number; shareRecipeLink?: unknown}[]};

    const row = (list?.list ?? []).find((r) => r?.tableId === tableId);
    const url = row?.shareRecipeLink;
    if (typeof url !== "string" || url.length === 0) {
        throw new Error("share link not found");
    }

    return {tableId, url};
}
