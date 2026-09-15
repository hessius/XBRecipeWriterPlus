# xBloom Account Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in to their own xBloom account and import the recipes they authored there into the local library, repeatably, without ever overwriting an edit they made here.

**Architecture:** A new `library/cloud/` layer, plain TypeScript with no React, owns everything: a zero-dependency RSA transport, a session backed by `expo-secure-store`, a paged library fetch, a pure classifier that decides what each row means against the local database, and a nearest-accent matcher. `hooks/useCloudImport.ts` drives it, a full-screen route draws it, and two doors (the import sheet, settings) open it. Rows come back as complete `recipeVo` objects, so the mapping reuses the hardened `XBloomRecipe` mapper rather than writing a second one.

**Tech Stack:** TypeScript, Expo SDK 57, `expo-secure-store`, `expo-crypto`, Tamagui, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-09-15-xbloom-account-import-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `library/cloud/key.ts` | xBloom's public key, and nothing else. Its own file so the cipher's tests need not import the HTTP layer. |
| `library/cloud/rsa.ts` | PKCS#1 v1.5 public-key encryption in pure BigInt. One export. No network, no app knowledge. |
| `library/cloud/transport.ts` | The xBloom HTTP envelope: headers, the encrypted body, the response unwrap. Knows nothing about recipes. |
| `library/cloud/session.ts` | Sign in, hold the token in `expo-secure-store`, sign out. The only file that touches a credential. |
| `library/cloud/cloudLibrary.ts` | Page through `/recipe/list` and return raw `recipeVo` rows. |
| `library/cloud/mapRow.ts` | One row → one `Recipe`, via `XBloomRecipe`. |
| `library/cloud/fingerprint.ts` | The stable hash of a recipe's brewing content. Used at import and at compare. |
| `library/cloud/accentMatch.ts` | `theColor` → nearest palette accent index, or `null`. |
| `library/cloud/importPlan.ts` | Pure. Rows + local recipes → `{fresh, updated, unchanged, edited}`. The bulk of the tests. |
| `hooks/useCloudImport.ts` | The state machine: signed-out → signing in → listing → choosing → importing → done. |
| `app/importCloud.tsx` | The screen. Layout only. |
| `components/CloudImportRow.tsx` | One selectable recipe row with its classification. |

`fingerprint.ts` is a file the spec's §2.1 does not name. It is separate because two
unrelated callers need it — the importer stamps it, the classifier compares it — and
putting it in either would make the other import from a module it has no other business
with.

---

## Task 1: Dependencies and version bump

**Files:**
- Modify: `package.json`
- Modify: `app.json`

- [ ] **Step 1: Install the two native dependencies**

```bash
npx expo install expo-secure-store expo-crypto
```

Expected: both appear in `package.json` `dependencies` at SDK-57-pinned versions.

If npm rejects this with `EALLOWSCRIPTS`, run `npx expo-doctor`, read off the expected
versions, and write them into `package.json` by hand, then `npm install`.

- [ ] **Step 2: Bump the app version**

Both packages are native, so the runtime version must move. In `app.json`, change
`expo.version` from `"1.6.0"` to `"1.7.0"`.

Leave the two-component spelling rule alone: this is `1.7.0`, matching the existing
three-component `1.6.0` already in the file. Do not reformat it.

`app/__tests__/native-config.test.ts` pins that string, so it fails until it is moved
too. Update the assertion *and* its docblock: the comment there explains why each
release's number is what it is, and a bump with a stale explanation is worse than none.
This one is not housekeeping — both new packages are native, so an OTA carrying the
account screen onto a 1.6.0 binary would find no keychain module at all.

- [ ] **Step 3: Verify the config still parses**

Run: `npx expo config --type public > /dev/null && echo ok`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore: add expo-secure-store and expo-crypto for account import

Both are native modules, so the runtime version moves with them."
```

---

## Task 2: RSA in pure BigInt

The app has never encrypted anything. The only RSA in the repo is `api/_lib/xbloom.ts`,
which uses `node:crypto` — absent from Hermes — and which `library/` is forbidden to
import. `node-forge` and `jsencrypt` were both rejected as an order of magnitude more
code than the single operation needed.

**Files:**
- Create: `library/cloud/key.ts`
- Create: `library/cloud/rsa.ts`
- Test: `library/cloud/__tests__/rsa.test.ts`

- [ ] **Step 1: Put the key in its own file**

The key gets a file of its own rather than living in `transport.ts`, because the RSA
tests need it and a test for the cipher has no business importing the HTTP layer to get
at a constant.

Create `library/cloud/key.ts`:

```ts
/**
 * xBloom's public key, exactly as their web client ships it.
 *
 * The irregular line wrapping is theirs. Do not reflow it: it is kept
 * comparable byte for byte with the copy in `api/_lib/xbloom.ts` and with
 * whatever their client ships next.
 *
 * Duplicated from `api/_lib/xbloom.ts` on purpose. That file is a
 * zero-dependency Vercel function and `library/` must never import from it.
 */
export const XBLOOM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC4LF40GZ72SdhMyl765K/i4nY5
CPcHz2Q1IKWKZ9S79xmK7G8pUhbVf4EZLvnNF1+9IvOFQUKV5Z7ZNNviqSpnql9
tAT+8+J/He0R7pcirvVSxgdr2i9V/C/gmqAEZ5qVTzRnd3uWdFoKzPdEBxP0Ipor
J1VBbCv90yBSOhVxO+QIDAQAB
-----END PUBLIC KEY-----`;
```

Copy it from `api/_lib/xbloom.ts:10-15` rather than retyping it. The second line is 63
characters where the others are 64; that is correct and is not a transcription error.

- [ ] **Step 2: Write the failing test**

The golden vector below was produced by `node:crypto`'s `publicEncrypt` with
`RSA_NO_PADDING` over a deterministic padded block, against the real xBloom modulus.
It is the proof that our modular exponentiation is right; the padding is tested
separately because it is random by design.

Create `library/cloud/__tests__/rsa.test.ts`:

```ts
import {encryptChunks, modPow, parsePublicKey, pkcs1Pad} from "../rsa";
import {XBLOOM_PUBLIC_KEY} from "../key";

describe("parsePublicKey", () => {
    it("reads the modulus and exponent out of the SPKI PEM", async () => {
        const key = parsePublicKey(XBLOOM_PUBLIC_KEY);
        expect(key.size).toBe(128);
        expect(key.e).toBe(65537n);
        // First and last bytes of the 128-byte modulus.
        expect(key.n >> (120n * 8n)).toBe(184n);
        expect(key.n & 0xffn).toBe(249n);
    });
});

describe("modPow", () => {
    it("matches node:crypto on a fixed padded block", async () => {
        const key = parsePublicKey(XBLOOM_PUBLIC_KEY);
        // 0x00 0x02, then 121 bytes of 0x41, then 0x00, then "XBRW".
        const padded = new Uint8Array(128);
        padded[0] = 0x00;
        padded[1] = 0x02;
        padded.fill(0x41, 2, 123);
        padded[123] = 0x00;
        padded.set([0x58, 0x42, 0x52, 0x57], 124);

        let m = 0n;
        for (const b of padded) m = (m << 8n) | BigInt(b);
        const c = modPow(m, key.e, key.n);

        const out: number[] = [];
        let v = c;
        for (let i = 0; i < 128; i++) {
            out.unshift(Number(v & 0xffn));
            v >>= 8n;
        }
        const b64 = Buffer.from(Uint8Array.from(out)).toString("base64");
        expect(b64).toBe(
            "ojmyWJ4P9FiHvrhKaflYhW4jznLLbYTdULdCKcbHP+qf5JzlpY3/IhOuZgpIMYwc" +
            "Ew/RF4mUjzU5lbGqJLmwotlGqZpSmbi70A4uuUb6VM1htUSBtjsw7ep2y6dglu/Y" +
            "cEUy58VB3p4QtsU/OZZR5DcoElvoxoMp3LRwB1Hv5r4="
        );
    });
});

describe("pkcs1Pad", () => {
    it("frames the message the way PKCS#1 v1.5 type 2 requires", async () => {
        const msg = Uint8Array.from([1, 2, 3]);
        const padded = pkcs1Pad(msg, 128);
        expect(padded.length).toBe(128);
        expect(padded[0]).toBe(0x00);
        expect(padded[1]).toBe(0x02);
        expect(padded[127 - 3]).toBe(0x00);
        expect(Array.from(padded.slice(125))).toEqual([1, 2, 3]);
    });

    it("never uses a zero byte inside the padding string", async () => {
        // A zero there would be read as the terminator and truncate the
        // plaintext on the server, which is the classic way to get an
        // intermittent, unreproducible login failure.
        for (let i = 0; i < 50; i++) {
            const padded = pkcs1Pad(Uint8Array.from([9]), 128);
            expect(Array.from(padded.slice(2, 125))).not.toContain(0);
        }
    });

    it("refuses a message too long to pad safely", async () => {
        expect(() => pkcs1Pad(new Uint8Array(118), 128)).toThrow(/too long/);
    });
});

describe("encryptChunks", () => {
    it("emits one 128-byte block per 117 bytes of plaintext", async () => {
        const out = encryptChunks("x".repeat(200), XBLOOM_PUBLIC_KEY);
        expect(Buffer.from(out, "base64").length).toBe(256);
    });

    it("emits a single block for a short plaintext", async () => {
        const out = encryptChunks("{}", XBLOOM_PUBLIC_KEY);
        expect(Buffer.from(out, "base64").length).toBe(128);
    });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest library/cloud/__tests__/rsa.test.ts`
Expected: FAIL — `Cannot find module '../rsa'`.

- [ ] **Step 4: Implement it**

Create `library/cloud/rsa.ts`:

```ts
import * as Crypto from "expo-crypto";

/**
 * PKCS#1 v1.5 public-key encryption, in BigInt, with no dependency.
 *
 * This exists because the one place the app needs RSA is the only place it
 * needs any cryptography at all. Hermes has no `node:crypto`, `library/` may
 * not reach into `api/`, and both of the usual libraries carry a whole
 * key-management surface to reach the single primitive used here.
 *
 * The exponentiation is checked against `node:crypto` by a golden vector in
 * the tests. This is a public-key operation with a public modulus and a
 * public exponent, so there is no secret for a timing attack to recover; a
 * constant-time implementation would be protecting nothing.
 */

export type PublicKey = {
    /** The modulus. */
    n: bigint;
    /** The public exponent. */
    e: bigint;
    /** The modulus length in bytes, which is also the ciphertext block size. */
    size: number;
};

function base64ToBytes(b64: string): Uint8Array {
    const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const out: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const ch of clean) {
        if (ch === "=") break;
        const v = alphabet.indexOf(ch);
        if (v < 0) continue;
        buffer = (buffer << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buffer >> bits) & 0xff);
        }
    }
    return Uint8Array.from(out);
}

function bytesToBase64(bytes: Uint8Array): string {
    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = bytes[i + 1];
        const c = bytes[i + 2];
        out += alphabet[a >> 2];
        out += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
        out += b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
        out += c === undefined ? "=" : alphabet[c & 63];
    }
    return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    return v;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
    const out = new Uint8Array(length);
    let v = value;
    for (let i = length - 1; i >= 0; i--) {
        out[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return out;
}

/**
 * Walk a DER structure to the RSA modulus and exponent.
 *
 * An SPKI key wraps a PKCS#1 key inside a BIT STRING inside a SEQUENCE. This
 * reads only what it needs to find those two integers and does not pretend to
 * be a general DER parser.
 */
export function parsePublicKey(pem: string): PublicKey {
    const body = pem
        .replace(/-----BEGIN [^-]+-----/, "")
        .replace(/-----END [^-]+-----/, "");
    const der = base64ToBytes(body);

    let i = 0;
    const readLength = (): number => {
        let len = der[i++];
        if (len & 0x80) {
            const count = len & 0x7f;
            len = 0;
            for (let k = 0; k < count; k++) len = (len << 8) | der[i++];
        }
        return len;
    };
    const expect = (tag: number) => {
        if (der[i++] !== tag) throw new Error(`Malformed key: expected tag ${tag}`);
        return readLength();
    };

    expect(0x30); // outer SEQUENCE
    const algLen = expect(0x30); // AlgorithmIdentifier
    i += algLen; // skipped: we only ever see one algorithm here
    expect(0x03); // BIT STRING
    i += 1; // the unused-bits byte, always 0 for a key
    expect(0x30); // inner SEQUENCE (PKCS#1 RSAPublicKey)

    const nLen = expect(0x02);
    let nBytes = der.slice(i, i + nLen);
    i += nLen;
    // DER signs its integers, so a high bit forces a leading zero. The key
    // size must not count it.
    if (nBytes[0] === 0x00) nBytes = nBytes.slice(1);

    const eLen = expect(0x02);
    const eBytes = der.slice(i, i + eLen);

    return {n: bytesToBigInt(nBytes), e: bytesToBigInt(eBytes), size: nBytes.length};
}

export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
    let result = 1n;
    let b = base % modulus;
    let e = exponent;
    while (e > 0n) {
        if (e & 1n) result = (result * b) % modulus;
        b = (b * b) % modulus;
        e >>= 1n;
    }
    return result;
}

/**
 * Frame a message as PKCS#1 v1.5 type 2: `00 02 <random, no zeros> 00 <message>`.
 *
 * The padding string must be at least eight bytes and must contain no zero
 * byte, since a zero there is the terminator and would truncate the plaintext
 * on the far side.
 */
export function pkcs1Pad(message: Uint8Array, size: number): Uint8Array {
    if (message.length > size - 11) {
        throw new Error("Message too long for this key");
    }
    const psLength = size - message.length - 3;
    const out = new Uint8Array(size);
    out[0] = 0x00;
    out[1] = 0x02;

    let filled = 0;
    while (filled < psLength) {
        const random = Crypto.getRandomBytes(psLength - filled);
        for (const b of random) {
            if (b === 0) continue;
            out[2 + filled] = b;
            filled += 1;
            if (filled === psLength) break;
        }
    }

    out[2 + psLength] = 0x00;
    out.set(message, 3 + psLength);
    return out;
}

/**
 * Encrypt a UTF-8 string, 117 bytes at a time, and concatenate the blocks.
 *
 * 117 is `size - 11` for this 1024-bit key: the largest message PKCS#1 v1.5
 * leaves room for. xBloom's own clients chunk at the same boundary.
 */
export function encryptChunks(plaintext: string, pem: string): string {
    const key = parsePublicKey(pem);
    const chunkSize = key.size - 11;

    const bytes = new TextEncoder().encode(plaintext);
    const out = new Uint8Array(Math.ceil(bytes.length / chunkSize) * key.size);

    let offset = 0;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const padded = pkcs1Pad(bytes.slice(i, i + chunkSize), key.size);
        const cipher = modPow(bytesToBigInt(padded), key.e, key.n);
        out.set(bigIntToBytes(cipher, key.size), offset);
        offset += key.size;
    }

    return bytesToBase64(out);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest library/cloud/__tests__/rsa.test.ts`
Expected: PASS, 8 tests. The golden-vector one failing means the exponentiation or the
DER walk is wrong — nothing downstream will work until it is green.

`expo-crypto` needs a mock. Add to `jest.setup.js`, alongside the existing mocks:

```js
jest.mock("expo-crypto", () => ({
    getRandomBytes: (n) => {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) out[i] = i % 16 === 3 ? 0 : (i * 7 + 13) % 256;
        return out;
    },
}));
```

The zeros are every sixteenth byte, and at offset 3 rather than 0, and both numbers
matter. A zero every 256 is never reached: `pkcs1Pad` for this key asks for 124 bytes
at a time and the sequence restarts on each call, so the filtering would never be
exercised and the test would pass with the filter deleted. And a zero at offset 0 hangs
`pkcs1Pad` outright — its final call asks for a single byte, and a one-byte draw that is
always zero never makes progress.

Because that is easy to get wrong and impossible to notice, the suite guards it. Add to
the `pkcs1Pad` describe, above the zero-byte test, and add `import * as Crypto from
"expo-crypto";` at the top of the test file:

```ts
    it("is tested against a source that actually yields zero bytes", async () => {
        const drawn = Crypto.getRandomBytes(124);
        expect(Array.from(drawn)).toContain(0);
    });
```

Prove the pair works by mutation: delete `if (b === 0) continue;` from `pkcs1Pad` and
confirm "never uses a zero byte inside the padding string" fails. Put it back.

- [ ] **Step 6: Commit**

```bash
git add library/cloud/key.ts library/cloud/rsa.ts library/cloud/__tests__/rsa.test.ts jest.setup.js
git commit -m "feat: add pure-BigInt RSA for the xBloom envelope

Checked against node:crypto by golden vector. Hermes has no node:crypto
and library/ may not import from api/, so the one operation the app needs
is implemented here rather than pulling in a key-management library for it."
```

---

## Task 3: The transport envelope

Every shape in this task was observed in the #74 spike against a live account.
Three of them are not what a reader would guess:

- The encrypted body is `JSON.stringify(base64String)` — a bare JSON **string**,
  not an object with a `data` field.
- Authentication travels **inside** the encrypted body as `memberId` + `token`.
  There is no `Authorization` header and no `token` header.
- Success is `result === "success"`. There is no numeric `code`.

**Files:**
- Create: `library/cloud/transport.ts`
- Test: `library/cloud/__tests__/transport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/cloud/__tests__/transport.test.ts`:

```ts
import {CloudError, authFields, post} from "../transport";

const okResponse = (body: unknown) => ({ok: true, json: async () => body});

describe("post", () => {
    afterEach(() => {
        // @ts-expect-error -- putting the real fetch back
        global.fetch = undefined;
    });

    it("sends a plain JSON body when the caller asks for one", async () => {
        global.fetch = jest.fn(async () =>
            okResponse({result: "success", token: "t"})
        ) as never;

        const data = await post("tMemberLogin.thtml", {email: "a@b.c"}, false);

        expect(data).toMatchObject({token: "t"});
        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe("https://client-api.xbloom.com/tMemberLogin.thtml");
        expect(JSON.parse(init.body)).toEqual({email: "a@b.c"});
    });

    it("sends a bare encrypted JSON string when the caller asks for one", async () => {
        global.fetch = jest.fn(async () =>
            okResponse({result: "success", list: []})
        ) as never;

        await post("tuMyTeaRecipeCreated.tuhtml", {memberId: 1}, true);

        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        const body = JSON.parse(init.body);
        // A string, not an object -- this is the shape their server wants.
        expect(typeof body).toBe("string");
        expect(body).not.toContain("memberId");
        // 1024-bit key, so one block is 128 bytes.
        expect(Buffer.from(body, "base64").length % 128).toBe(0);
    });

    it("classifies an unreadable reply as a server failure", async () => {
        // A captive portal or a proxy's HTML error page arrives as a 200 whose
        // body is not JSON. Without this branch the only way out of `post`
        // that is not a CloudError is a raw SyntaxError, which the caller's
        // per-kind copy cannot match.
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => {
                throw new SyntaxError("Unexpected token < in JSON");
            },
        })) as never;

        await expect(post("x.thtml", {}, false)).rejects.toMatchObject({
            kind: "server",
        });
    });

    it("treats a reply with no result at all as an auth failure", async () => {
        // The catch-all. Every failure the spike saw carried result: "fail",
        // so this shape is unexpected -- and of the two ways to be wrong
        // about it, asking for a sign-in is the recoverable one.
        global.fetch = jest.fn(async () => okResponse({nothing: true})) as never;

        await expect(post("x.tuhtml", {}, true)).rejects.toMatchObject({
            kind: "unauthorised",
        });
    });

    it("classifies a rejected login as a credentials failure", async () => {
        global.fetch = jest.fn(async () =>
            okResponse({result: "fail", info: "wrong password"})
        ) as never;

        await expect(
            post("tMemberLogin.thtml", {}, false)
        ).rejects.toMatchObject({kind: "credentials"});
    });

    it("classifies a rejected authed call as unauthorised", async () => {
        // There is no documented code for a stale token, so an authed call
        // that fails is assumed to have lost its session. The cost of being
        // wrong is one re-login; the cost of the opposite mistake is a user
        // stuck on an error they cannot clear.
        global.fetch = jest.fn(async () =>
            okResponse({result: "fail", info: "token invalid"})
        ) as never;

        await expect(
            post("tuMyTeaRecipeCreated.tuhtml", {}, true)
        ).rejects.toMatchObject({kind: "unauthorised"});
    });

    it("classifies a non-200 status as a server failure", async () => {
        global.fetch = jest.fn(async () => ({ok: false, status: 502})) as never;

        await expect(
            post("tuMyTeaRecipeCreated.tuhtml", {}, true)
        ).rejects.toMatchObject({kind: "server"});
    });

    it("classifies a thrown fetch as a network failure", async () => {
        global.fetch = jest.fn(async () => {
            throw new TypeError("Network request failed");
        }) as never;

        await expect(
            post("tuMyTeaRecipeCreated.tuhtml", {}, true)
        ).rejects.toMatchObject({kind: "network"});
    });

    it("lets an abort through as an abort", async () => {
        const abort = new Error("Aborted");
        abort.name = "AbortError";
        global.fetch = jest.fn(async () => {
            throw abort;
        }) as never;

        await expect(
            post("tuMyTeaRecipeCreated.tuhtml", {}, true)
        ).rejects.toMatchObject({name: "AbortError"});
    });

    it("keeps the request body out of the thrown error", async () => {
        global.fetch = jest.fn(async () =>
            okResponse({result: "fail", info: "no"})
        ) as never;

        const error = (await post(
            "tMemberLogin.thtml",
            {password: "hunter2"},
            false
        ).catch((e) => e)) as CloudError;

        expect(JSON.stringify({m: error.message, k: error.kind})).not.toContain(
            "hunter2"
        );
    });
});

describe("authFields", () => {
    it("carries the boilerplate every authed endpoint expects", async () => {
        expect(authFields(42, "tok")).toEqual({
            interfaceVersion: 20240918,
            skey: "testskey",
            phoneType: "Android",
            clientType: 2,
            languageType: 1,
            memberId: 42,
            token: "tok",
        });
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/cloud/__tests__/transport.test.ts`
Expected: FAIL — `Cannot find module '../transport'`.

- [ ] **Step 3: Implement it**

Create `library/cloud/transport.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npx jest library/cloud/__tests__/transport.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add library/cloud/transport.ts library/cloud/__tests__/transport.test.ts
git commit -m "feat: add the xBloom request envelope

Shapes taken from the #74 spike against a live account, not from endpoint
names: the encrypted body is a bare JSON string and the credentials ride
inside it. Errors are classified at the boundary so nothing above has to
read a status, and nothing on this path is logged."
```

---

## Task 4: The session

**Files:**
- Create: `library/cloud/session.ts`
- Test: `library/cloud/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/cloud/__tests__/session.test.ts`:

```ts
import * as SecureStore from "expo-secure-store";
import {post} from "../transport";
import {loadSession, signIn, signOut} from "../session";

jest.mock("../transport", () => ({
    ...jest.requireActual("../transport"),
    post: jest.fn(),
}));

const mockPost = post as jest.MockedFunction<typeof post>;

describe("signIn", () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await SecureStore.deleteItemAsync("xbloom.session");
    });

    it("stores the member id, token and email on success", async () => {
        mockPost.mockResolvedValue({
            result: "success",
            token: "abc",
            member: {tableId: 7},
        });

        const session = await signIn("a@b.c", "secret");

        expect(session).toEqual({memberId: 7, token: "abc", email: "a@b.c"});
        expect(await loadSession()).toEqual(session);
    });

    it("sends the login unencrypted, as that endpoint expects", async () => {
        mockPost.mockResolvedValue({
            result: "success",
            token: "abc",
            member: {tableId: 7},
        });

        await signIn("a@b.c", "secret");

        expect(mockPost).toHaveBeenCalledWith(
            "tMemberLogin.thtml",
            expect.objectContaining({email: "a@b.c", password: "secret"}),
            false
        );
    });

    it("never writes the password anywhere", async () => {
        mockPost.mockResolvedValue({
            result: "success",
            token: "abc",
            member: {tableId: 7},
        });

        await signIn("a@b.c", "hunter2");

        const stored = await SecureStore.getItemAsync("xbloom.session");
        expect(stored).not.toContain("hunter2");
    });

    it("rejects a success response that carries no usable token", async () => {
        // A shape change on their side must fail loudly here rather than
        // leave a session object that every later call quietly rejects.
        mockPost.mockResolvedValue({result: "success", member: {tableId: 7}});

        await expect(signIn("a@b.c", "secret")).rejects.toMatchObject({
            kind: "server",
        });
        expect(await loadSession()).toBeNull();
    });

    it("rejects a success response that carries no member id", async () => {
        mockPost.mockResolvedValue({result: "success", token: "abc"});

        await expect(signIn("a@b.c", "secret")).rejects.toMatchObject({
            kind: "server",
        });
        expect(await loadSession()).toBeNull();
    });
});

describe("loadSession", () => {
    it("is null before anyone has signed in", async () => {
        await SecureStore.deleteItemAsync("xbloom.session");
        expect(await loadSession()).toBeNull();
    });

    it("survives a corrupt store rather than throwing", async () => {
        await SecureStore.setItemAsync("xbloom.session", "{not json");
        expect(await loadSession()).toBeNull();
    });

    it("treats a stored object missing a token as no session", async () => {
        await SecureStore.setItemAsync(
            "xbloom.session",
            JSON.stringify({memberId: 7, email: "a@b.c"})
        );
        expect(await loadSession()).toBeNull();
    });
});

describe("signOut", () => {
    it("removes the stored session", async () => {
        mockPost.mockResolvedValue({
            result: "success",
            token: "abc",
            member: {tableId: 7},
        });
        await signIn("a@b.c", "secret");

        await signOut();

        expect(await loadSession()).toBeNull();
    });
});
```

- [ ] **Step 2: Add the SecureStore mock**

`expo-secure-store` has no Jest implementation. Add an in-memory one to
`jest.setup.js`, next to the `expo-crypto` mock from Task 2:

```js
jest.mock("expo-secure-store", () => {
    const store = new Map();
    return {
        setItemAsync: async (k, v) => void store.set(k, v),
        getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
        deleteItemAsync: async (k) => void store.delete(k),
    };
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npx jest library/cloud/__tests__/session.test.ts`
Expected: FAIL — `Cannot find module '../session'`.

- [ ] **Step 4: Implement it**

Create `library/cloud/session.ts`:

```ts
import * as SecureStore from "expo-secure-store";
import {CloudError, post} from "./transport";

/**
 * The signed-in account.
 *
 * This is the only file in the app that ever holds a credential, which is the
 * point of it being its own file: "does the app store my password" is a
 * question answerable by reading one short module rather than auditing five.
 *
 * The password is an argument to `signIn` and nothing else. It is never
 * written, never returned, and never held beyond the call. What is stored is
 * the token, which xBloom can revoke and which grants nothing on any other
 * service.
 */

const KEY = "xbloom.session";

export type Session = {
    memberId: number;
    token: string;
    /** Shown in Settings so the user can see which account is connected. */
    email: string;
};

function isSession(value: unknown): value is Session {
    if (typeof value !== "object" || value === null) return false;
    const s = value as Partial<Session>;
    return (
        typeof s.memberId === "number" &&
        typeof s.token === "string" &&
        s.token.length > 0 &&
        typeof s.email === "string"
    );
}

export async function signIn(email: string, password: string): Promise<Session> {
    const response = await post(
        "tMemberLogin.thtml",
        {
            email,
            password,
            interfaceVersion: 20240918,
            skey: "testskey",
            phoneType: "Android",
            clientType: 2,
            languageType: 1,
            jpushId: "",
        },
        false
    );

    const token = response.token;
    const memberId = (response.member as {tableId?: unknown} | undefined)?.tableId;

    // A `result: success` carrying neither of the two things the session is
    // made of means their shape has moved. Failing here is much cheaper than
    // storing a session whose every later use fails for no visible reason.
    if (typeof token !== "string" || !token || typeof memberId !== "number") {
        throw new CloudError("server", "xBloom signed in but returned no session");
    }

    const session: Session = {memberId, token, email};
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
    return session;
}

export async function loadSession(): Promise<Session | null> {
    let raw: string | null;
    try {
        raw = await SecureStore.getItemAsync(KEY);
    } catch {
        // The keychain can be unavailable before first unlock. That is not a
        // reason to fail; it is a reason to look signed out.
        return null;
    }
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);
        return isSession(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Not defended like `loadSession` is, deliberately.
 *
 * If the keychain refuses the delete — it is locked, say — the session is
 * still there, and the honest answer is to say so. Swallowing it would leave
 * the user believing they had signed out of an account they had not, which is
 * the one failure here with a privacy cost.
 */
export async function signOut(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest library/cloud/__tests__/session.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add library/cloud/session.ts library/cloud/__tests__/session.test.ts jest.setup.js
git commit -m "feat: hold the xBloom session in the keychain

The password is an argument and nothing else; only the revocable token is
stored. Kept to one small file so the claim can be checked by reading it."
```

---
## Task 5: Paging the account library

**Files:**
- Create: `library/cloud/cloudLibrary.ts`
- Test: `library/cloud/__tests__/cloudLibrary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/cloud/__tests__/cloudLibrary.test.ts`:

```ts
import {post} from "../transport";
import {fetchCloudRecipes} from "../cloudLibrary";

jest.mock("../transport", () => ({
    ...jest.requireActual("../transport"),
    post: jest.fn(),
}));

const mockPost = post as jest.MockedFunction<typeof post>;
const session = {memberId: 7, token: "tok", email: "a@b.c"};
const rows = (n: number, from = 0) =>
    Array.from({length: n}, (_, i) => ({tableId: from + i, theName: `R${from + i}`}));

describe("fetchCloudRecipes", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns a single short page without asking for another", async () => {
        mockPost.mockResolvedValue({result: "success", list: rows(3)});

        const out = await fetchCloudRecipes(session);

        expect(out).toHaveLength(3);
        expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it("walks every page until one comes back short", async () => {
        mockPost
            .mockResolvedValueOnce({result: "success", list: rows(100, 0)})
            .mockResolvedValueOnce({result: "success", list: rows(100, 100)})
            .mockResolvedValueOnce({result: "success", list: rows(4, 200)});

        const out = await fetchCloudRecipes(session);

        expect(out).toHaveLength(204);
        expect(mockPost).toHaveBeenCalledTimes(3);
        expect(
            (mockPost.mock.calls[2][1] as {pageNumber: number}).pageNumber
        ).toBe(3);
    });

    it("stops on an exactly-full final page rather than looping forever", async () => {
        // A library that is an exact multiple of the page size returns a full
        // page and then an empty one. Without the empty-page stop this walks
        // until the page cap and makes a request for nothing every time.
        mockPost
            .mockResolvedValueOnce({result: "success", list: rows(100, 0)})
            .mockResolvedValueOnce({result: "success", list: []});

        const out = await fetchCloudRecipes(session);

        expect(out).toHaveLength(100);
        expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it("refuses to page forever if the server keeps returning full pages", async () => {
        mockPost.mockResolvedValue({result: "success", list: rows(100)});

        // 20 pages of 100 is far past any real library; a server that never
        // runs out is a bug on one side or the other, and the app must not
        // answer it with an unbounded request loop.
        //
        // It fails rather than returning the 2,000 rows it has. A capped walk
        // that returns quietly is indistinguishable from a complete one, and
        // the recipes beyond the cap would read as "not in your account".
        await expect(fetchCloudRecipes(session)).rejects.toMatchObject({
            kind: "server",
        });
        expect(mockPost).toHaveBeenCalledTimes(20);
    });

    it("fails rather than truncating when a page part way through is unreadable", async () => {
        mockPost
            .mockResolvedValueOnce({result: "success", list: rows(100)})
            .mockResolvedValueOnce({result: "success"});

        await expect(fetchCloudRecipes(session)).rejects.toMatchObject({
            kind: "server",
        });
    });

    it("passes the abort signal through rather than swallowing it", async () => {
        const failure = new Error("Aborted");
        failure.name = "AbortError";
        mockPost.mockRejectedValue(failure);

        const controller = new AbortController();
        // Straight out, not a short list dressed up as a complete one.
        await expect(
            fetchCloudRecipes(session, controller.signal)
        ).rejects.toMatchObject({name: "AbortError"});
    });

    it("sends the auth fields and the adaptedModel filter in every request", async () => {
        mockPost.mockResolvedValue({result: "success", list: []});

        await fetchCloudRecipes(session);

        expect(mockPost).toHaveBeenCalledWith(
            "tuMyTeaRecipeCreated.tuhtml",
            expect.objectContaining({
                memberId: 7,
                token: "tok",
                skey: "testskey",
                pageNumber: 1,
                countPerPage: 100,
                adaptedModel: 1,
            }),
            true,
            undefined
        );
    });

    it("treats a missing list as an empty page rather than throwing", async () => {
        mockPost.mockResolvedValue({result: "success"});
        await expect(fetchCloudRecipes(session)).resolves.toEqual([]);
    });

    it("drops rows that are not objects", async () => {
        mockPost.mockResolvedValue({
            result: "success",
            list: [{tableId: 1}, null, "nonsense", {tableId: 2}],
        });

        const out = await fetchCloudRecipes(session);
        expect(out).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/cloud/__tests__/cloudLibrary.test.ts`
Expected: FAIL — `Cannot find module '../cloudLibrary'`.

- [ ] **Step 3: Implement it**

Create `library/cloud/cloudLibrary.ts`:

```ts
import type {Session} from "./session";
import {CloudError, authFields, post} from "./transport";

/**
 * The recipes the account *created*.
 *
 * The endpoint is `tuMyTeaRecipeCreated` — Created — and the #74 spike
 * confirmed against a live account that it means exactly that: recipes opened
 * from a share link and brewed do not appear. This is why the feature is
 * "import my xBloom recipes" and not "import my xBloom library".
 *
 * Every surveyed client asks for one page of 100 and stops. The spike proved
 * pagination actually works, so this walks it: a library of 101 recipes would
 * otherwise lose one silently, which is the worst way to lose anything.
 */

const PAGE_SIZE = 100;

/**
 * Far past any real library. A server still returning full pages here is
 * broken, and the walk fails rather than looping or truncating.
 */
const MAX_PAGES = 20;

/** A `recipeVo`, exactly as `XBloomRecipe` already knows how to read one. */
export type CloudRow = Record<string, unknown>;

export async function fetchCloudRecipes(
    session: Session,
    signal?: AbortSignal
): Promise<CloudRow[]> {
    const out: CloudRow[] = [];

    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
        const response = await post(
            "tuMyTeaRecipeCreated.tuhtml",
            {
                ...authFields(session.memberId, session.token),
                pageNumber,
                countPerPage: PAGE_SIZE,
                adaptedModel: 1,
            },
            true,
            signal
        );

        if (!Array.isArray(response.list)) {
            // An empty account is allowed to answer with no list at all, so on
            // the first page this is simply "nothing here". Part way through a
            // walk it is not: it would end the loop early and hand back some
            // of the user's recipes as though they were all of them, and the
            // ones missing would read as "not in your account" — a wrong
            // answer given confidently, which is worse than an error.
            if (out.length > 0) {
                throw new CloudError("server", "xBloom stopped mid-list");
            }
            break;
        }

        const list = response.list;
        for (const row of list) {
            if (typeof row === "object" && row !== null) out.push(row as CloudRow);
        }

        // Short page means last page. An exactly-full library returns a full
        // page and then an empty one, which the same test catches.
        if (list.length < PAGE_SIZE) break;

        // Reaching the cap is not an ending, it is a failure to find one. The
        // rows gathered so far are deliberately thrown away rather than
        // returned: 2,000 recipes indistinguishable from a complete library is
        // the silent partial this whole function is arranged to avoid.
        if (pageNumber === MAX_PAGES) {
            throw new CloudError("server", "xBloom never stopped sending pages");
        }
    }

    return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest library/cloud/__tests__/cloudLibrary.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add library/cloud/cloudLibrary.ts library/cloud/__tests__/cloudLibrary.test.ts
git commit -m "feat: page the xBloom account library

Every surveyed client asks for one page of 100 and stops; the #74 spike
showed pagination works, so a 101-recipe library does not quietly lose one."
```

---

## Task 6: Two new fields on Recipe

**Files:**
- Modify: `library/Recipe.ts`
- Modify: `library/backup.ts:217`
- Test: `library/__tests__/recipeCloudFields.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/__tests__/recipeCloudFields.test.ts`:

```ts
import Recipe from "../Recipe";
import {parseBackup, buildBackup} from "../backup";

describe("cloud fields on Recipe", () => {
    it("round-trips through JSON", async () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.cloudId = 4242;
        recipe.cloudFingerprint = "abc123";

        const revived = new Recipe(JSON.parse(JSON.stringify(recipe)));

        expect(revived.cloudId).toBe(4242);
        expect(revived.cloudFingerprint).toBe("abc123");
    });

    it("is absent on a recipe that never came from an account", async () => {
        const recipe = new Recipe(undefined, undefined);
        expect(recipe.cloudId).toBeUndefined();
        expect(recipe.cloudFingerprint).toBeUndefined();
    });

    it("is not the same field as shareId or sharedTableId", async () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.cloudId = 1;
        recipe.sharedTableId = 2;
        recipe.shareId = "three";

        const revived = new Recipe(JSON.parse(JSON.stringify(recipe)));
        expect(revived.cloudId).toBe(1);
        expect(revived.sharedTableId).toBe(2);
        expect(revived.shareId).toBe("three");
    });
});

describe("backup validation of the cloud fields", () => {
    const wrap = (recipe: unknown) =>
        JSON.stringify({
            ...JSON.parse(buildBackup([], {})),
            recipes: [recipe],
        });

    it("accepts a recipe carrying both fields", async () => {
        const recipe = new Recipe(undefined, undefined);
        recipe.cloudId = 9;
        recipe.cloudFingerprint = "deadbeef";

        const parsed = parseBackup(wrap(JSON.parse(JSON.stringify(recipe))));
        expect(parsed.recipes[0].cloudId).toBe(9);
        expect(parsed.recipes[0].cloudFingerprint).toBe("deadbeef");
    });

    it("rejects a recipe whose cloudId is not a number", async () => {
        const recipe = JSON.parse(
            JSON.stringify(new Recipe(undefined, undefined))
        );
        recipe.cloudId = "nine";

        expect(() => parseBackup(wrap(recipe))).toThrow();
    });

    it("rejects a recipe whose cloudFingerprint is not a string", async () => {
        const recipe = JSON.parse(
            JSON.stringify(new Recipe(undefined, undefined))
        );
        recipe.cloudFingerprint = 7;

        expect(() => parseBackup(wrap(recipe))).toThrow();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/__tests__/recipeCloudFields.test.ts`
Expected: FAIL — TypeScript will not have `cloudId` on `Recipe`.

- [ ] **Step 3: Add the fields to Recipe**

In `library/Recipe.ts`, immediately after the `sharedTableId` / `shareUrl` pair
(around line 130), add:

```ts
    /**
     * The row id of this recipe in **your own xBloom account library**.
     *
     * A third id, and not either of the two above it. `shareId` is where a
     * recipe was imported *from*; `sharedTableId` is a link this app *minted*.
     * `cloudId` is neither — it is the identity of a recipe you authored in
     * xBloom's own app, and it is what makes a second import recognise a
     * recipe it has already brought across instead of duplicating it.
     */
    public cloudId?: number;
    /**
     * The fingerprint of this recipe's brewing content as it stood at import.
     *
     * Compared against the recipe's fingerprint now to tell an untouched
     * import from one the user has since edited here. See
     * `library/cloud/fingerprint.ts` for what it covers and, more
     * importantly, what it deliberately does not.
     */
    public cloudFingerprint?: string;
```

Then, in the `Recipe(json)` constructor, alongside where `sharedTableId` is read,
add:

```ts
            if (typeof json.cloudId === "number") this.cloudId = json.cloudId;
            if (typeof json.cloudFingerprint === "string") {
                this.cloudFingerprint = json.cloudFingerprint;
            }
```

If the constructor assigns `sharedTableId` by a different idiom than the one above,
match that idiom rather than this one — the point is that the two new fields are read
in the same place and the same way as the id beside them.

- [ ] **Step 4: Add the backup validators**

In `library/backup.ts`, inside the `RECIPE_FIELDS` map (line 217), after the
`sharedTableId: isNumber,` entry, add:

```ts
    cloudId:          isNumber,
    cloudFingerprint: (v) => typeof v === "string",
```

This is a trust boundary, not bookkeeping: a backup file is untrusted input and the
`Recipe` constructor is deliberately forgiving so it can migrate its own old shapes.
A field with no entry here is a field an attacker-supplied backup can set to anything.

- [ ] **Step 5: Run the tests**

Run: `npx jest library/__tests__/recipeCloudFields.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the whole library suite**

Run: `npx jest library/`
Expected: PASS. The card-format characterisation tests must be untouched — neither
new field goes near `getData`, and if one of those tests moves, something is wrong.

- [ ] **Step 7: Commit**

```bash
git add library/Recipe.ts library/backup.ts library/__tests__/recipeCloudFields.test.ts
git commit -m "feat: remember which account recipe a local recipe came from

cloudId is a third id and deliberately not shareId or sharedTableId, whose
comment already explains what reusing one of them would break."
```

---


- [ ] **Step 6: Stop a duplicate from claiming the account recipe**

`duplicateRecipe` rebuilds the copy from the whole source JSON, so the two
new fields carry over the way every other field does. They must not. The
import matches a local recipe to an account recipe by `cloudId`, and two
local rows holding one id give the next sync two candidates for one account
row with no basis to choose between them. `duplicateRecipe` already clears
`uuid` and `accentIndex` for the same reason; these join them.

In `library/RecipeDatabase.ts`, after `copy.accentIndex = undefined;`:

```ts
        // A duplicate is a new local recipe, not a second copy of the account
        // recipe. Carrying the id over would leave two rows both claiming to
        // be the same xBloom recipe, and the import matches on exactly that
        // id: the next sync would find two locals for one account row and
        // have no basis to choose between them. The fingerprint records what
        // the account's copy looked like, so it goes with the id it belongs to.
        copy.cloudId = undefined;
        copy.cloudFingerprint = undefined;
```

with a test in `library/__tests__/RecipeDatabase.test.ts` asserting the copy
has neither field and the original still has both -- assert the original's
fingerprint too, not just its id, or clearing the wrong one passes.

---


- [ ] **Step 7: Keep the account identity through a revert**

`hooks/useRecipeEditor.ts` restores a recipe by building a fresh `Recipe` and
copying a whitelist of fields back over it — `alwaysKeepFields`, whose comment
says a restore replaces the brew parameters and not the recipe's *identity*.
`cloudId` is identity by that definition, so it belongs in the list; without
it every revert silently orphans the row and the next sync re-imports the
recipe as though it had never been seen.

Add `'cloudId', 'cloudFingerprint'` to `alwaysKeepFields`, with the reason,
and a test in `hooks/__tests__/useRecipeEditor.test.ts` that runs the `saved`
revert through `revertSources` and asserts both survive. (`runRevert` is not
on the hook's public surface; it is reached through `revertSources[].action`.)

Note also that `cloudId`'s validator is stricter than its siblings —
`isNumber(v) && v >= 0` — because a tableId is a primary key and a negative
one means a tampered file, not a plausible mistake.

---

## Task 7: The fingerprint

**Files:**
- Create: `library/cloud/fingerprint.ts`
- Test: `library/cloud/__tests__/fingerprint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/cloud/__tests__/fingerprint.test.ts`:

```ts
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {fingerprint} from "../fingerprint";

function make(): Recipe {
    const recipe = new Recipe(undefined, undefined);
    recipe.name = "Kenya";
    recipe.dosage = 18;
    recipe.ratio = 16;
    recipe.grindSize = 60;
    recipe.pours = [new Pour(1, 150, 93, 3, 0, 0, 30)];
    return recipe;
}

describe("fingerprint", () => {
    it("is stable across two calls on the same recipe", async () => {
        const recipe = make();
        expect(fingerprint(recipe)).toBe(fingerprint(recipe));
    });

    it("is equal for two recipes with the same brewing content", async () => {
        expect(fingerprint(make())).toBe(fingerprint(make()));
    });

    it("changes when the dose changes", async () => {
        const a = make();
        const b = make();
        b.dosage = 19;
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("changes when a pour volume changes", async () => {
        const a = make();
        const b = make();
        b.pours[0].volume = 151;
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("changes when the name changes", async () => {
        const a = make();
        const b = make();
        b.name = "Ethiopia";
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("ignores the uuid", async () => {
        // Two copies of one imported recipe are the same recipe.
        const a = make();
        const b = make();
        b.uuid = "a-completely-different-uuid";
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores the accent", async () => {
        // We assign the accent ourselves at import. If it were covered, every
        // recipe would be marked edited the instant it arrived, and the whole
        // feature would report that the user had changed everything.
        const a = make();
        const b = make();
        b.accentIndex = 5;
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores the card backup buffers", async () => {
        // These change when a card is written. Writing a card is not editing
        // a recipe, and treating it as such would mark a recipe edited for
        // having been used.
        const a = make();
        const b = make();
        b.backup = [1, 2, 3];
        b.offline_backup = [4, 5, 6];
        b.uid = [7, 8];
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores cloudId and cloudFingerprint", async () => {
        // Stamping the fingerprint must not change the fingerprint.
        const a = make();
        const b = make();
        b.cloudId = 12;
        b.cloudFingerprint = "whatever";
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("ignores createdAt", async () => {
        const a = make();
        const b = make();
        b.createdAt = 1700000000000;
        expect(fingerprint(a)).toBe(fingerprint(b));
    });

    it("does not confuse two pours with the same values in a different order", async () => {
        const a = make();
        a.pours = [new Pour(1, 100, 90, 3, 0, 0, 30), new Pour(2, 50, 95, 3, 0, 0, 20)];
        const b = make();
        b.pours = [new Pour(1, 50, 95, 3, 0, 0, 20), new Pour(2, 100, 90, 3, 0, 0, 30)];
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });

    it("distinguishes a field boundary rather than concatenating blindly", async () => {
        // "1" + "23" must not collide with "12" + "3".
        const a = make();
        a.dosage = 1;
        a.ratio = 23;
        const b = make();
        b.dosage = 12;
        b.ratio = 3;
        expect(fingerprint(a)).not.toBe(fingerprint(b));
    });
});

/**
 * Every field the digest covers, and how to change it.
 *
 * The hand-written tests above each name one field, which left the other
 * eighteen unguarded: a review proved that `pauseTime` and fifteen others
 * could be deleted from the digest with the whole suite still green. That is
 * the "too blind" failure -- a real edit the fingerprint cannot see, and a
 * sync that overwrites the user's work believing nothing had changed. A table
 * is the only form of this test that does not rot as fields are added.
 */
const COVERED: [string, (r: Recipe) => void][] = [
    ["name",           (r) => { r.name = "Other"; }],
    ["xid",            (r) => { r.xid = "ZZZZ"; }],
    ["dosage",         (r) => { r.dosage += 1; }],
    ["ratio",          (r) => { r.ratio += 1; }],
    ["grindSize",      (r) => { r.grindSize += 1; }],
    ["grindRPM",       (r) => { r.grindRPM += 1; }],
    ["grinder",        (r) => { r.grinder = !r.grinder; }],
    ["cupType",        (r) => { r.cupType = r.cupType === 1 ? 2 : 1; }],
    ["defaultCups",    (r) => { r.defaultCups += 1; }],
    ["bypassEnabled",  (r) => { r.bypassEnabled = !r.bypassEnabled; }],
    ["bypassVolume",   (r) => { r.bypassVolume += 1; }],
    ["bypassTemp",     (r) => { r.bypassTemp += 1; }],
    ["pours.length",   (r) => { r.pours.push(new Pour(2, 100, 90, 3, 0, 0, 20)); }],
    ["pourNumber",     (r) => { r.pours[0].pourNumber += 1; }],
    ["volume",         (r) => { r.pours[0].volume += 1; }],
    ["temperature",    (r) => { r.pours[0].temperature += 1; }],
    ["flowRate",       (r) => { r.pours[0].flowRate += 1; }],
    ["agitation",      (r) => { r.pours[0].setAgitation(3); }],
    ["pourPattern",    (r) => { r.pours[0].pourPattern += 1; }],
    ["pauseTime",      (r) => { r.pours[0].pauseTime += 1; }],
];

describe("every field the digest claims to cover", () => {
    it.each(COVERED)("notices a change to %s", async (_field, change) => {
        const before = make();
        const after = make();
        change(after);
        expect(fingerprint(after)).not.toBe(fingerprint(before));
    });
});

/**
 * The other direction. Touching any of these must NOT move the digest, or
 * importing a recipe, colouring it, or writing it to a card would each mark
 * it as edited by the user before the user had touched it.
 */
const IGNORED: [string, (r: Recipe) => void][] = [
    ["uuid",             (r) => { r.uuid = "different-uuid"; }],
    ["key",              (r) => { r.key = "different-key"; }],
    ["accentIndex",      (r) => { r.accentIndex = 4; }],
    ["createdAt",        (r) => { r.createdAt = 1234567890; }],
    ["source",           (r) => { r.source = "duplicate"; }],
    ["shareId",          (r) => { r.shareId = "abc"; }],
    ["shareUrl",         (r) => { r.shareUrl = "https://example.test/x"; }],
    ["sharedTableId",    (r) => { r.sharedTableId = 77; }],
    ["backup",           (r) => { r.backup = [1, 2, 3]; }],
    ["offline_backup",   (r) => { r.offline_backup = [4, 5, 6]; }],
    ["uid",              (r) => { r.uid = [7, 8, 9]; }],
    ["cloudId",          (r) => { r.cloudId = 4242; }],
    ["cloudFingerprint", (r) => { r.cloudFingerprint = "stamped"; }],
    ["xbloomName",       (r) => { r.xbloomName = "Refreshed From Cloud"; }],
    ["checksum",         (r) => { r.checksum = 123; }],
    ["shareSnapshot",    (r) => { r.shareSnapshot = "snapshot"; }],
];

describe("what the digest must stay blind to", () => {
    it.each(IGNORED)("ignores %s", async (_field, change) => {
        const before = make();
        const after = make();
        change(after);
        expect(fingerprint(after)).toBe(fingerprint(before));
    });
});

it("cannot be forged by a name containing the field separator", async () => {
    // Joining on a separator is only unambiguous if no value can contain it.
    // `name` and `xbloomName` are whatever the user typed, so a name carrying
    // the separator could reproduce another recipe's parts string exactly and
    // the two would hash equal -- "unchanged", which is the state a sync may
    // overwrite without asking. The encoding has to rule it out, not the hash.
    // Both of these join to the same three-part string, "Kenya|Pour|Over".
    const a = make();
    a.name = "Kenya";
    a.xid = "Pour\u001fOver";

    const b = make();
    b.name = "Kenya\u001fPour";
    b.xid = "Over";

    expect(fingerprint(a)).not.toBe(fingerprint(b));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/cloud/__tests__/fingerprint.test.ts`
Expected: FAIL — `Cannot find module '../fingerprint'`.

- [ ] **Step 3: Implement it**

Create `library/cloud/fingerprint.ts`:

```ts
import type Recipe from "@/library/Recipe";

/**
 * A stable hash of what a recipe *brews like*.
 *
 * Used for exactly one judgement: has the user edited this imported recipe
 * since it arrived? So it covers the fields a user edits and nothing else.
 *
 * What it deliberately excludes matters more than what it includes:
 *
 * - `uuid`, `key` — identity, not content. Two copies of one recipe are one
 *   recipe.
 * - `accentIndex` — we choose the accent ourselves at import, so covering it
 *   would mark every recipe edited the moment it arrived.
 * - `backup`, `offline_backup`, `uid` — raw card bytes, which change when a
 *   card is written. Brewing a recipe is not editing it.
 * - `cloudId`, `cloudFingerprint` — stamping the fingerprint must not change
 *   the fingerprint.
 * - `xbloomName` — the cloud's cached title, whose own doc says it is not
 *   hand-edited and that a sync refreshes it. The user edits `name`. Hashing
 *   a field the app rewrites for itself can only ever report an edit nobody
 *   made; it can never catch one.
 * - `checksum`, `shareSnapshot` — derived from content, or rewritten when a
 *   share link is minted. Sharing a recipe is not editing it.
 * - `createdAt` — bookkeeping.
 *
 * Not to be confused with `Recipe.fingerprint()`, which is card-byte identity
 * for the duplicate detector. This one is about brewing content.
 *
 * This is not a security hash — nobody is trying to forge one. But it is not
 * a throwaway either. Equal means "untouched since import", and untouched is
 * the state the sync is allowed to overwrite without asking, so a collision
 * costs a user the edits they made. That asymmetry is why the digest is 64
 * bits rather than 32 and why the input is encoded unambiguously below: both
 * cost nothing, and the failure they prevent is silent.
 */
export function fingerprint(recipe: Recipe): string {
    const parts: (string | number)[] = [
        recipe.name ?? "",
        recipe.xid ?? "",
        recipe.dosage,
        recipe.ratio,
        recipe.grindSize,
        recipe.grindRPM,
        recipe.grinder ? 1 : 0,
        recipe.cupType,
        recipe.defaultCups,
        recipe.bypassEnabled ? 1 : 0,
        recipe.bypassVolume,
        recipe.bypassTemp,
        recipe.pours.length,
    ];

    for (const pour of recipe.pours) {
        parts.push(
            pour.pourNumber,
            pour.volume,
            pour.temperature,
            pour.flowRate,
            pour.getAgitation(),
            pour.pourPattern,
            pour.pauseTime
        );
    }

    // Every numeric part above must have a value. JSON turns `undefined` into
    // `null`, which is a shape a string can never take but two absent numbers
    // can share, so an optional number added here without a default would put
    // the ambiguity back.
    //
    // Encoded, not joined. A separator stops 1|23 colliding with 12|3, but
    // `name` and `xbloomName` are whatever the user typed, so a name that
    // contained the separator could reproduce another recipe's parts string
    // exactly -- an ambiguity in the encoding rather than a collision in the
    // hash, and not one the digest width can help with. JSON quotes and
    // escapes every string, so distinct parts always encode distinctly.
    return hash(JSON.stringify(parts));
}

/** FNV-1a's 64-bit offset basis and prime. */
const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/**
 * FNV-1a, 64 bits, rendered as hex.
 *
 * Chosen because it is ten lines and needs no dependency. 64 rather than 32
 * because the birthday bound on 32 bits is around 77,000 values, which is not
 * a comfortable distance from a real library, and the price of being wrong is
 * a user's edits. BigInt is slower than `Math.imul`, but this runs once per
 * recipe at import, not per frame.
 */
function hash(input: string): string {
    let h = OFFSET;
    for (let i = 0; i < input.length; i++) {
        h = (h ^ BigInt(input.charCodeAt(i))) * PRIME & MASK;
    }
    return h.toString(16).padStart(16, "0");
}
```

The bypass fields really are spelled `bypassEnabled`, `bypassVolume` and `bypassTemp`
(`Recipe.ts:139-141`) — the last one is not `bypassTemperature`. There is no `title`
field on `Recipe`; the `title` entry in `backup.ts`'s validator map is a legacy shape
the constructor migrates, and it is not part of the current content.

- [ ] **Step 4: Run the tests**

Run: `npx jest library/cloud/__tests__/fingerprint.test.ts`
Expected: PASS, 49 tests.

- [ ] **Step 5: Commit**

```bash
git add library/cloud/fingerprint.ts library/cloud/__tests__/fingerprint.test.ts
git commit -m "feat: fingerprint what a recipe brews like

Covers what a user edits and nothing else. Covering the accent would mark
every import edited on arrival; covering the card buffers would mark a
recipe edited for having been brewed."
```

---
## Task 8: Matching an xBloom colour to one of ours

**Files:**
- Create: `library/cloud/accentMatch.ts`
- Test: `library/cloud/__tests__/accentMatch.test.ts`

- [ ] **Step 1: Write the failing test**

The four coffee distances below were measured against the real `theColor` values the
spike returned from the user's account. They are in the test so that a change to the
palette that breaks a match fails here rather than on a device.

Create `library/cloud/__tests__/accentMatch.test.ts`:

```ts
import {accents} from "@/constants/colors";
import {MAX_ACCENT_DISTANCE, matchAccent} from "../accentMatch";

describe("matchAccent", () => {
    it("finds Sage for the xBloom green", async () => {
        expect(matchAccent("#B8C9A2", "coffee")).toBe(
            accents.coffee.indexOf("#B4D6A8")
        );
    });

    it("finds Peach for the xBloom tan", async () => {
        expect(matchAccent("#DEC3AF", "coffee")).toBe(
            accents.coffee.indexOf("#F0B98E")
        );
    });

    it("finds Lilac for the xBloom violet", async () => {
        expect(matchAccent("#ABACD1", "coffee")).toBe(
            accents.coffee.indexOf("#BDB2E8")
        );
    });

    it("finds Sky for the xBloom blue", async () => {
        expect(matchAccent("#ADBDDB", "coffee")).toBe(
            accents.coffee.indexOf("#9FC3F0")
        );
    });

    it("returns null for a blue-green in the tea palette", async () => {
        // The tea accents are four warm colours. A blue-green has no
        // neighbour among them: every candidate is roughly three times
        // further away than any real match, and they sit within noise of each
        // other, so "nearest" would be a coin toss that confidently returns a
        // pink. No answer is the honest answer.
        expect(matchAccent("#A2C0C2", "tea")).toBeNull();
    });

    it("returns an exact match at zero distance", async () => {
        expect(matchAccent("#9FC3F0", "coffee")).toBe(0);
    });

    it("only ever answers within its own group", async () => {
        // A tea recipe must never be given a coffee accent: the two halves
        // are what tell the library at a glance which is which.
        const index = matchAccent("#CFD6A3", "tea");
        expect(index).not.toBeNull();
        expect(index!).toBeLessThan(accents.tea.length);
    });

    it("accepts a colour without its hash", async () => {
        expect(matchAccent("9FC3F0", "coffee")).toBe(0);
    });

    it("rejects a three-digit hex", async () => {
        expect(matchAccent("#fff", "coffee")).toBeNull();
    });

    it("returns null for anything that is not a colour", async () => {
        expect(matchAccent("", "coffee")).toBeNull();
        expect(matchAccent("rebeccapurple", "coffee")).toBeNull();
        expect(matchAccent("#12345", "coffee")).toBeNull();
    });

    it("keeps the threshold above every real match and below the tea one", async () => {
        // Guards the number itself: the measured matches sit at 0.032-0.045
        // and the nearest tea candidate at 0.093.
        expect(MAX_ACCENT_DISTANCE).toBeGreaterThan(0.045);
        expect(MAX_ACCENT_DISTANCE).toBeLessThan(0.093);
    });
});

describe("colour values a server might actually send", () => {
    // The import loop runs over every recipe in an account. One recipe with no
    // colour, or a colour of a shape nobody anticipated, must cost that one
    // recipe its accent and nothing else -- never the whole import.
    it.each([
        ["null", null],
        ["undefined", undefined],
        ["an empty string", ""],
        ["a colour name", "rebeccapurple"],
        ["short hex", "#fff"],
        ["a number where a string was promised", 16711680 as unknown as string],
        ["an object", {r: 1} as unknown as string],
    ])("answers null for %s rather than throwing", async (_label, value) => {
        expect(() => matchAccent(value as string, "coffee")).not.toThrow();
        expect(matchAccent(value as string, "coffee")).toBeNull();
    });
});

describe("colours with no hue to match", () => {
    // The palette is light, low-chroma pastel, so a neutral in the same
    // lightness band is genuinely close to an accent in OKLab -- #CCCCCC is
    // 0.056 from Ice, inside the distance threshold. Distance alone would
    // paint a recipe the user coloured silver a confident blue. Grey is not a
    // bluish colour to be rounded to blue; it is the absence of the thing
    // being matched.
    it.each([
        ["silver", "#CCCCCC"],
        ["a darker grey", "#C8C8C8"],
        ["mid grey", "#808080"],
        ["white", "#FFFFFF"],
        ["black", "#000000"],
    ])("declines to match %s", async (_label, hex) => {
        expect(matchAccent(hex, "coffee")).toBeNull();
        expect(matchAccent(hex, "tea")).toBeNull();
    });

    it("still matches every colour seen in a real account", async () => {
        // The floor has to sit below the least saturated colour the user
        // actually chose (0.033) and above a true neutral (exactly 0).
        expect(matchAccent("#B8C9A2", "coffee")).not.toBeNull();
        expect(matchAccent("#DEC3AF", "coffee")).not.toBeNull();
        expect(matchAccent("#ABACD1", "coffee")).not.toBeNull();
        expect(matchAccent("#ADBDDB", "coffee")).not.toBeNull();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/cloud/__tests__/accentMatch.test.ts`
Expected: FAIL — `Cannot find module '../accentMatch'`.

- [ ] **Step 3: Implement it**

Create `library/cloud/accentMatch.ts`:

```ts
import {accents, type AccentGroup} from "@/constants/colors";

/**
 * Give an imported recipe the palette accent closest to the colour it wore in
 * xBloom — but only when there really is one.
 *
 * The app's accents are a deliberate palette, so an imported hex cannot simply
 * be kept: it would sit among them looking almost right, which is worse than
 * looking different. Matching keeps the user's own sense of which recipe is
 * which without letting a foreign colour into the palette.
 *
 * The comparison is in OKLab because RGB distance does not mean what it looks
 * like it means: two colours a fixed RGB distance apart can be obviously
 * different in one part of the space and indistinguishable in another, and
 * the nearest neighbour by RGB is regularly not the nearest one to the eye.
 */

/**
 * How far is too far.
 *
 * The four coffee colours observed in a real account matched at 0.032-0.045.
 * The one tea colour observed was a blue-green whose nearest of four warm tea
 * accents was 0.093, with all four clustered inside 0.013 of each other —
 * which is to say "nearest" there was noise, and the winner would have been a
 * pink. Above this line the answer is no answer, and `assignAccent` picks as
 * it does for any other new recipe.
 */
export const MAX_ACCENT_DISTANCE = 0.06;

type Lab = {L: number; a: number; b: number};

function parseHex(value: string | null | undefined): [number, number, number] | null {
    // Typed loosely on purpose. `theColor` arrives over the network, where a
    // recipe may simply not have one, and the type says nothing about what a
    // server actually sent. Every other malformed shape already answers null
    // and falls back to the app's own accent assignment; a missing one must
    // do the same rather than throw and take the whole import down with it.
    if (typeof value !== "string") return null;
    const hex = value.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
    ];
}

function toLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toOklab(hex: string | null | undefined): Lab | null {
    const rgb = parseHex(hex);
    if (!rgb) return null;
    const [r, g, b] = rgb.map(toLinear);

    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

    return {
        L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    };
}

function distance(x: Lab, y: Lab): number {
    return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

/**
 * The index of the nearest accent **within the given group**, or `null` when
 * nothing is near enough.
 *
 * An index, not a colour: `Recipe.accentIndex` is an index into the group's
 * array, and handing it a hex string would store something the palette cannot
 * be retuned through.
 */
export function matchAccent(color: string | null | undefined, group: AccentGroup): number | null {
    const target = toOklab(color);
    if (!target) return null;

    const palette = accents[group];
    let best: number | null = null;
    let bestDistance = Infinity;

    for (let i = 0; i < palette.length; i++) {
        const candidate = toOklab(palette[i]);
        if (!candidate) continue;
        const d = distance(target, candidate);
        if (d < bestDistance) {
            bestDistance = d;
            best = i;
        }
    }

    return bestDistance <= MAX_ACCENT_DISTANCE ? best : null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest library/cloud/__tests__/accentMatch.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add library/cloud/accentMatch.ts library/cloud/__tests__/accentMatch.test.ts
git commit -m "feat: match an imported colour to the nearest palette accent

In OKLab, and only when something is actually near: the one tea colour
observed has no neighbour among four warm tea accents, and nearest-wins
would have confidently made it pink."
```

---

## Task 9: One row into one Recipe

**Files:**
- Modify: `library/XBloomRecipe.ts`
- Create: `library/cloud/mapRow.ts`
- Test: `library/cloud/__tests__/mapRow.test.ts`

The rows are complete `recipeVo` objects — the #74 spike checked every field
`XBloomRecipe` reads and found all of them present. So this task writes no mapping.
It gives the existing, hardened mapper a way to be handed a row it already has,
instead of fetching one it already has.

- [ ] **Step 1: Write the failing test**

Create `library/cloud/__tests__/mapRow.test.ts`:

```ts
import {cardWriteProblems} from "@/library/cardLimits";
import {AGITATION, POUR_PATTERN} from "@/library/Pour";
import {CUP_TYPE} from "@/library/Recipe";
import {mapRow} from "../mapRow";

const row = () => ({
    tableId: 4242,
    theName: "Kenya Nyeri",
    theColor: "#B8C9A2",
    grandWater: 16,
    dose: 18,
    pourCount: 2,
    grinderSize: 60,
    isSetGrinderSize: 1,
    rpm: 100,
    cupType: 1,
    podsVo: {id: "AB12CD"},
    // Two stages, because one is not a realistic account recipe and 288 ml in
    // a single stage is not even writable -- the card stops at 240. 18 g at
    // 1:16 is 288 ml, which is what the machine checks the stages sum to.
    pourList: [
        {
            pourNumber: 1,
            volume: 144,
            temperature: 93,
            pattern: 1,
            flowRate: 3,
            pausing: 30,
            isEnableVibrationBefore: 1,
            isEnableVibrationAfter: 0,
        },
        {
            pourNumber: 2,
            volume: 144,
            temperature: 90,
            pattern: 2,
            flowRate: 3,
            pausing: 0,
            isEnableVibrationBefore: 0,
            isEnableVibrationAfter: 1,
        },
    ],
});

describe("mapRow", () => {
    it("produces a Recipe from a row", async () => {
        const mapped = mapRow(row());
        expect(mapped).not.toBeNull();
        expect(mapped!.recipe.dosage).toBe(18);
        expect(mapped!.recipe.ratio).toBe(16);
        expect(mapped!.recipe.xid).toBe("AB12CD");
    });

    it("carries the cloud id across", async () => {
        expect(mapRow(row())!.recipe.cloudId).toBe(4242);
    });

    it("marks the recipe as imported", async () => {
        expect(mapRow(row())!.recipe.source).toBe("import");
    });

    it("returns null for a row the mapper cannot read", async () => {
        // A shape change must not produce a half-built recipe whose next stop
        // is a real card.
        expect(mapRow({tableId: 1})).toBeNull();
        expect(mapRow({})).toBeNull();
    });

    it("returns null when the row carries no id", async () => {
        const bad = row() as Record<string, unknown>;
        delete bad.tableId;
        expect(mapRow(bad)).toBeNull();
    });

    it("keeps the raw colour so the accent can be matched later", async () => {
        expect(mapRow(row())!.color).toBe("#B8C9A2");
    });

    /**
     * Every field the mapper reads, asserted one by one.
     *
     * Without these the pour mapping was barely tested: renaming `pausing` to
     * anything else left the suite green while every stage silently kept
     * `pauseTime` at its -1 sentinel. The names here are xBloom's, and the
     * only place they are checked is against a real server we cannot call
     * from a test -- so the test has to at least notice when we stop reading
     * one of them.
     */
    it("reads every field of every stage", async () => {
        const recipe = mapRow(row())!.recipe;
        expect(recipe.pours).toHaveLength(2);

        const [first, second] = recipe.pours;

        expect(first.volume).toBe(144);
        expect(first.temperature).toBe(93);
        // xBloom's pattern numbers are not ours and are not even in the same
        // order: their 1 is centred, their 2 is spiral, their 3 is circular,
        // while ours run centred, circular, spiral. Anyone "tidying" that
        // switch into a straight 1:1 would swap spiral and circular on every
        // imported recipe, so both mappings are pinned here.
        expect(first.pourPattern).toBe(POUR_PATTERN.CENTERED);
        expect(first.flowRate).toBe(30);
        expect(first.pauseTime).toBe(30);
        expect(first.getAgitation()).toBe(AGITATION.BEFORE_ON_AFTER_OFF);

        expect(second.volume).toBe(144);
        expect(second.temperature).toBe(90);
        expect(second.pourPattern).toBe(POUR_PATTERN.SPIRAL);
        expect(second.pauseTime).toBe(0);
        expect(second.getAgitation()).toBe(AGITATION.BEFORE_OFF_AFTER_ON);
    });

    it("takes the name the user gave the recipe in xBloom", async () => {
        expect(mapRow(row())!.recipe.name).toBe("Kenya Nyeri");
    });

    it("reads the grinder settings", async () => {
        const recipe = mapRow(row())!.recipe;
        expect(recipe.grindSize).toBe(60);
        expect(recipe.grindRPM).toBe(100);
        expect(recipe.grinder).toBe(true);
    });

    /**
     * The one assertion that ties this to the real constraint.
     *
     * A mapped recipe's next stop is a physical card, and `cardWriteProblems`
     * is the app's single authority on what a card will take -- per-stage
     * volume, temperature, flow rate, pause, pattern, agitation, and the sum
     * the machine rejects a recipe for missing. An account recipe that arrives
     * whole should need no repair, and if the mapper starts producing one that
     * does, this says so in the language the user would have been shown.
     */
    it("produces a recipe the card will actually take", async () => {
        expect(cardWriteProblems(mapRow(row())!.recipe)).toEqual([]);
    });

    /**
     * Tea is special-cased everywhere in this app, and all of it happens
     * inside the mapper this module delegates to: volumes clamp to 90 ml, the
     * dose falls back to 5 g and the ratio is recomputed from what survived
     * the clamp. Nothing here does any of that, which is the point -- but a
     * change that quietly stopped passing the cup type through would corrupt
     * every tea import on its way to a card, and nothing else would notice.
     */
    it("carries a tea row through its clamping intact", async () => {
        // 4, not CUP_TYPE.TEA. xBloom numbers cups 1-4 and we number them
        // 0-3, and the two orders do not even agree: their 2 is our OMNI and
        // their 3 is our OTHER. Writing our own enum into a row fixture is
        // the same mistake as reading their pattern numbers as ours.
        const tea = row() as Record<string, unknown>;
        tea.cupType = 4;
        tea.dose = 5;

        const {recipe} = mapRow(tea)!;

        expect(recipe.cupType).toBe(CUP_TYPE.TEA);
        expect(recipe.isTea()).toBe(true);
        for (const pour of recipe.pours) {
            expect(pour.volume).toBeLessThanOrEqual(90);
        }
        // Clamping the stages changes the water, so the ratio has to follow or
        // the machine rejects the card for a sum it cannot reconcile.
        expect(cardWriteProblems(recipe)).toEqual([]);
    });

    it("carries a recipe whose grinder is off", async () => {
        // 2 is xBloom's "no grinder", and the mapper also treats a grind size
        // of 81 as off -- the two ways a row can say the same thing.
        const off = row() as Record<string, unknown>;
        off.isSetGrinderSize = 2;

        expect(mapRow(off)!.recipe.grinder).toBe(false);

        const byGrindSize = row() as Record<string, unknown>;
        byGrindSize.grinderSize = 81;
        expect(mapRow(byGrindSize)!.recipe.grinder).toBe(false);
    });

    it.each([
        ["1", 1, CUP_TYPE.XPOD],
        ["2", 2, CUP_TYPE.OMNI],
        ["3", 3, CUP_TYPE.OTHER],
        ["4", 4, CUP_TYPE.TEA],
    ])("reads xBloom's cup type %s as ours", async (_label, theirs, ours) => {
        const r = row() as Record<string, unknown>;
        r.cupType = theirs;
        expect(mapRow(r)!.recipe.cupType).toBe(ours);
    });

    /**
     * The guard is about coherence, not about what a card will take.
     *
     * A recipe ground for espresso is an ordinary account recipe that the
     * editor exists to coarsen, so it must survive the import even though it
     * cannot be written as-is. A dose of zero or less is a different thing: it
     * is a row we failed to read, and `fixRatio` turns it into a negative
     * ratio rather than refusing, so nothing downstream would catch it.
     */
    it("keeps a recipe that needs fixing before a card will take it", async () => {
        const espresso = row() as Record<string, unknown>;
        espresso.grinderSize = 12;

        const mapped = mapRow(espresso);

        expect(mapped).not.toBeNull();
        expect(mapped!.recipe.grindSize).toBe(12);
        expect(cardWriteProblems(mapped!.recipe).length).toBeGreaterThan(0);
    });

    it.each([
        ["a dose of zero", 0],
        ["a negative dose", -5],
    ])("refuses %s, which is a row we did not read", async (_label, dose) => {
        const bad = row() as Record<string, unknown>;
        bad.dose = dose;
        expect(mapRow(bad)).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/cloud/__tests__/mapRow.test.ts`
Expected: FAIL — `Cannot find module '../mapRow'`.

- [ ] **Step 3: Let XBloomRecipe accept a row it already has**

In `library/XBloomRecipe.ts`, add a static factory to the class, immediately after
the constructor:

```ts
    /**
     * Wrap a `recipeVo` this app already holds.
     *
     * The account list returns complete `recipeVo` objects — the #74 spike
     * checked every field `getRecipe` reads — so an account import is one
     * request, not one per recipe. The rows are entered as `xid` sources
     * because that path reads `shareRecipeLink`, which is where a row carries
     * its share id.
     */
    public static fromAccountRow(row: Record<string, unknown>): XBloomRecipe {
        const pods = row.podsVo as {id?: unknown} | undefined;
        const xid = typeof pods?.id === "string" ? pods.id : "";
        const instance = new XBloomRecipe({kind: "xid", xid});
        instance.xbRecipeJSON = {recipeVo: row};
        return instance;
    }
```

`xbRecipeJSON` is `private`, which is exactly why this factory lives on the class
rather than reaching in from outside.

- [ ] **Step 4: Implement the mapper**

Create `library/cloud/mapRow.ts`:

```ts
import type Recipe from "@/library/Recipe";
import {XBloomRecipe} from "@/library/XBloomRecipe";
import type {CloudRow} from "./cloudLibrary";

/**
 * One account row, one `Recipe` — or nothing.
 *
 * There is no mapping code here on purpose. `XBloomRecipe.getRecipe` already
 * reads this shape, and has been hardened against every out-of-range value
 * their API has produced; a second mapper would be a second place for those
 * lessons to be forgotten.
 *
 * `null` rather than a partial recipe: the next stop for one of these is a
 * write to a genuine card, and a recipe assembled from a row the mapper could
 * not read is not something to hand to that.
 */
export function mapRow(row: CloudRow): Recipe | null {
    if (typeof row.tableId !== "number") return null;

    const recipe = XBloomRecipe.fromAccountRow(row).getRecipe();
    if (!recipe) return null;

    recipe.cloudId = row.tableId;
    if (typeof row.theName === "string" && row.theName) {
        recipe.name = row.theName;
    }

    return {
        recipe,
        color: typeof row.theColor === "string" ? row.theColor : undefined,
    };
}
```

The colour is returned **beside** the recipe, as a `MappedRow`, and is never set on the
`Recipe` itself. `Recipe` is persisted by a blanket `JSON.stringify` with no allowlist,
into both the database and backup files, so a "transient" field hung on it is not
transient at all — it is a foreign hex written to disk that survives only because nothing
reads it back yet. The alternative, stripping it again at every save site, is the same
shape as the bug that once lost `showHints` from backups. Here it cannot leak, because
there is nowhere for it to leak from. Task 10 consumes it as an argument.

- [ ] **Step 5: Run the tests**

Run: `npx jest library/cloud/__tests__/mapRow.test.ts`
Expected: PASS, 19 tests.

If a row in the fixture above turns out not to be quite what `getRecipe` reads, fix the
fixture from `library/XBloomRecipe.ts` — not the mapper. The fixture is a claim about
their API and the mapper is the thing that has been proven against it.

- [ ] **Step 6: Commit**

```bash
git add library/XBloomRecipe.ts library/Recipe.ts library/cloud/mapRow.ts library/cloud/__tests__/mapRow.test.ts
git commit -m "feat: turn an account row into a Recipe

No new mapping: the rows are complete recipeVo objects, so this hands them
to the mapper that has already been hardened against their API."
```

---
## Task 9.5: Capture what only the import response carries (inserted)

Inserted mid-milestone, ahead of Task 10, because it is the one piece of this feature
that cannot be deferred. `shareMemberName`, `shareMemberHead` and `podsVo.imagePath`
exist only in the API response at the moment of import. A recipe imported without them
has lost them permanently: recovering them would mean re-fetching every share link a
user has ever imported, and share links expire. Index columns and UI can be rebuilt from
the stored blob at any time; these cannot be rebuilt from anything.

**Files:** `library/Recipe.ts`, `library/XBloomRecipe.ts`, `library/backup.ts`,
`library/__tests__/recipeAttribution.test.ts`

- [x] Three optional string fields on `Recipe` — `sharedBy`, `sharedByAvatar`,
  `imageURL` — read forgivingly in the `json` constructor so older stored recipes keep
  loading. Metadata only: absent from `getData`/`parseData`, no card bytes, no CRC.
- [x] `XBloomRecipe.getRecipe` reads all three. The two `shareMember` keys are siblings
  of `recipeVo`, not inside it, so an account row (which is a bare `recipeVo`) carries
  the artwork but no sharer. `imagePath` was already being read into a private field
  that nothing persisted.
- [x] `backup.ts` drops a malformed one rather than rejecting the recipe.

**Naming is a contract**: M5 is designed against exactly `sharedBy`, `sharedByAvatar`
and `imageURL`. All three kept.

**Out of scope, owned by M5:** UI, settings, index columns, `INDEX_REVISION`.

### The one place the brief did not match the code

The brief asked to follow `backup.ts`'s "existing rule" that a malformed value is
dropped rather than rejecting the recipe. **That rule did not exist.** Every entry in
`RECIPE_FIELDS` is load-bearing, and a failure makes `looksLikeRecipe` return `false`,
which rejects the whole recipe. Adding an HTTPS check for the avatar there would have
deleted the user's recipe over a picture — the opposite of what was asked.

So `DROPPABLE_RECIPE_FIELDS` is a genuinely new mechanism, applied in `reviveRecipe`
before the constructor sees the entry. The asymmetry is the point: the existing map
guards fields whose corruption means the file is not what it claims, while these three
are third-party decoration where a bad value is a plausible thing to find in an honest
file. (The brief also referred to how `tags` are read; `Recipe` has no `tags` field.)

## Task 10: The import plan

This is where the promise in the spec lives — *never silently overwrite an edit made
here* — so it is pure, takes the local recipes as an argument, and has no idea what a
database is. Everything about the feature that could hurt a user is decided in this one
testable function.

**Files:**
- Create: `library/cloud/importPlan.ts`
- Test: `library/cloud/__tests__/importPlan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `library/cloud/__tests__/importPlan.test.ts`:

```ts
import Recipe from "@/library/Recipe";
import {fingerprint} from "../fingerprint";
import {buildImportPlan} from "../importPlan";
import {mapRow} from "../mapRow";

// The plan's fixture used a `pourList` shape the mapper does not read
// (`water`/`pourType`/`speed`/`pauseTime`/`agitation`); the real field names
// are `volume`/`temperature`/`pattern`/`flowRate`/`pausing`/
// `isEnableVibration*`, verified against `mapRow.test.ts` and
// `XBloomRecipe.getRecipe`. A row with the wrong names maps to a recipe with a
// NaN flow rate and no volume, so every fingerprint comparison below would be
// noise.
const row = (over: Record<string, unknown> = {}) => ({
    tableId: 1,
    theName: "Kenya",
    theColor: "#B8C9A2",
    grandWater: 16,
    dose: 18,
    pourCount: 2,
    grinderSize: 60,
    isSetGrinderSize: 1,
    rpm: 100,
    cupType: 1,
    podsVo: {id: "AB12CD"},
    // Two stages, not one of 288 ml: a non-tea stage is capped at 240 ml by
    // `cardLimits.ts`, and the next stop for one of these is a genuine card.
    pourList: [
        {
            pourNumber: 1,
            volume: 144,
            temperature: 93,
            pattern: 1,
            flowRate: 3,
            pausing: 30,
            isEnableVibrationBefore: 0,
            isEnableVibrationAfter: 0,
        },
        {
            pourNumber: 2,
            volume: 144,
            temperature: 93,
            pattern: 2,
            flowRate: 3,
            pausing: 0,
            isEnableVibrationBefore: 0,
            isEnableVibrationAfter: 0,
        },
    ],
    ...over,
});

/**
 * The local recipe that a given row would have produced when imported.
 *
 * The plan hand-reconstructed this recipe, but a hand-built copy has to
 * replicate everything `XBloomRecipe.getRecipe` and `fixRatio` derive, and any
 * drift there makes the fingerprint comparison test something other than what
 * it claims. This is the state we are comparing against, so it is produced by
 * the very mapper the plan uses, then stamped the way `buildImportPlan` stamps
 * a fresh import: accent excluded from the fingerprint on purpose.
 */
function imported(over: Record<string, unknown> = {}): Recipe {
    const mapped = mapRow(row());
    const recipe = mapped!.recipe;
    Object.assign(recipe, over);
    recipe.cloudFingerprint = recipe.cloudFingerprint ?? fingerprint(recipe);
    return recipe;
}

describe("buildImportPlan", () => {
    it("calls a row with no local counterpart new", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries).toHaveLength(1);
        expect(plan.entries[0].status).toBe("new");
    });

    it("selects new rows by default", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries[0].selected).toBe(true);
    });

    it("calls an unchanged local copy unchanged", async () => {
        const plan = buildImportPlan([row()], [imported()]);
        expect(plan.entries[0].status).toBe("unchanged");
    });

    it("does not select an unchanged row", async () => {
        // Importing it again would do nothing but cost a write.
        const plan = buildImportPlan([row()], [imported()]);
        expect(plan.entries[0].selected).toBe(false);
    });

    it("calls a changed row updated when the local copy is untouched", async () => {
        const plan = buildImportPlan([row({dose: 20})], [imported()]);
        expect(plan.entries[0].status).toBe("updated");
        expect(plan.entries[0].selected).toBe(true);
    });

    it("calls a locally edited recipe edited and does not select it", async () => {
        // The whole promise of the feature. A recipe the user has changed
        // here is never re-imported unless they say so.
        const local = imported();
        local.dosage = 22; // edited after import; fingerprint now stale

        const plan = buildImportPlan([row()], [local]);
        expect(plan.entries[0].status).toBe("edited");
        expect(plan.entries[0].selected).toBe(false);
    });

    it("still calls it edited when the cloud side changed too", async () => {
        const local = imported();
        local.dosage = 22;

        const plan = buildImportPlan([row({dose: 20})], [local]);
        expect(plan.entries[0].status).toBe("edited");
        expect(plan.entries[0].selected).toBe(false);
    });

    it("treats a local copy with no stored fingerprint as edited", async () => {
        // It came from an older version of the app, or from a backup. We
        // cannot prove it is untouched, so we must not overwrite it.
        const local = imported();
        local.cloudFingerprint = undefined;

        const plan = buildImportPlan([row({dose: 20})], [local]);
        expect(plan.entries[0].status).toBe("edited");
    });

    it("matches on cloudId and not on name", async () => {
        const local = imported();
        local.cloudId = 99;

        const plan = buildImportPlan([row()], [local]);
        expect(plan.entries[0].status).toBe("new");
    });

    it("ignores local recipes that never came from an account", async () => {
        const stranger = new Recipe(undefined, undefined);
        stranger.name = "Kenya";

        const plan = buildImportPlan([row()], [stranger]);
        expect(plan.entries[0].status).toBe("new");
    });

    it("carries the local uuid on an entry that would replace one", async () => {
        const local = imported();
        const plan = buildImportPlan([row({dose: 20})], [local]);
        expect(plan.entries[0].existingUuid).toBe(local.uuid);
    });

    it("has no existing uuid on a new entry", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    it("drops a row the mapper cannot read and counts it", async () => {
        const plan = buildImportPlan([row(), {tableId: 2}], []);
        expect(plan.entries).toHaveLength(1);
        expect(plan.unreadable).toBe(1);
    });

    it("gives every entry a recipe with an accent already chosen", async () => {
        const plan = buildImportPlan([row()], []);
        expect(plan.entries[0].recipe.accentIndex).toBeGreaterThanOrEqual(0);
    });

    it("matches the accent to the xBloom colour when one is near", async () => {
        const plan = buildImportPlan([row()], []);
        // #B8C9A2 is Sage.
        expect(plan.entries[0].recipe.accentIndex).toBe(3);
    });

    it("falls back to assignAccent when no accent is near", async () => {
        const plan = buildImportPlan([row({theColor: "#123456"})], []);
        const index = plan.entries[0].recipe.accentIndex;
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(8);
    });

    it("reads a recipe it just imported as unchanged", async () => {
        // This is the first of the two fingerprint traps in spec 3.1. We give
        // every import an accent of our own, so if the fingerprint covered the
        // accent, every recipe would come back "edited" the moment it landed
        // and the feature would accuse the user of edits they never made.
        //
        // It does not pin the *order* of the stamp and the accent, despite an
        // earlier title here claiming it did: the fingerprint excludes the
        // accent, so both orders give the same answer. The exclusion is pinned
        // directly in `fingerprint.test.ts`.
        const first = buildImportPlan([row()], []);
        const stored = first.entries[0].recipe;

        const second = buildImportPlan([row()], [stored]);
        expect(second.entries[0].status).toBe("unchanged");
    });

    it("does not give two new recipes the same accent", async () => {
        const plan = buildImportPlan(
            [
                row({tableId: 1, theColor: "#123456"}),
                row({tableId: 2, theColor: "#123456"}),
            ],
            []
        );
        expect(plan.entries[0].recipe.accentIndex).not.toBe(
            plan.entries[1].recipe.accentIndex
        );
    });

    it("summarises the counts", async () => {
        const local = imported();
        local.dosage = 22;

        const plan = buildImportPlan(
            [row({tableId: 1}), row({tableId: 2}), row({tableId: 3})],
            [local, imported({cloudId: 2} as Record<string, unknown>)]
        );

        expect(plan.counts).toEqual({
            new: 1,
            updated: 0,
            unchanged: 1,
            edited: 1,
        });
    });

    /**
     * The spec calls this the one bug in the design that would quietly destroy
     * work: `cloudId: 0` means "did not come from an account", so a hand-made
     * recipe must never be seen as already imported and replaced by a
     * stranger's. Guarded on both sides -- a row cannot claim id 0, and a local
     * recipe holding the sentinel cannot be matched by one.
     */
    it("never matches a recipe carrying the cloudId 0 sentinel", async () => {
        const handMade = new Recipe();
        handMade.name = "My own";
        handMade.uuid = "mine";
        handMade.cloudId = 0;

        const plan = buildImportPlan([row({tableId: 0})], [handMade]);

        // The row itself is not a row we can identify, so it never becomes an
        // entry at all.
        expect(plan.entries).toHaveLength(0);
        expect(plan.unreadable).toBe(1);
    });

    it("does not let a real row claim a local recipe holding the sentinel", async () => {
        const handMade = new Recipe();
        handMade.uuid = "mine";
        handMade.cloudId = 0;

        const plan = buildImportPlan([row({tableId: 7})], [handMade]);

        expect(plan.entries[0].status).toBe("new");
        expect(plan.entries[0].existingUuid).toBeUndefined();
    });

    /**
     * Two local copies of one cloud id -- from a restore, say -- leave us
     * unable to say which one a row refers to. Letting the map's insertion
     * order decide would make the answer depend on the order the database
     * returned rows, and could pre-select an overwrite while the other copy
     * holds the user's edits.
     */
    it("refuses to choose between two local copies of one cloud id", async () => {
        const untouched = imported();
        untouched.uuid = "a";
        const edited = imported();
        edited.uuid = "b";
        edited.name = "changed here";

        const changedUpstream = row({theName: "Kenya AB"});

        for (const order of [[untouched, edited], [edited, untouched]]) {
            const plan = buildImportPlan([changedUpstream], order);

            expect(plan.entries[0].status).toBe("edited");
            expect(plan.entries[0].selected).toBe(false);
            // Naming one of the two copies would aim a hand-ticked write at
            // whichever the database returned first.
            expect(plan.entries[0].existingUuid).toBeUndefined();
        }
    });

    it("takes one row twice as one decision, and says so", async () => {
        const plan = buildImportPlan([row(), row()], []);

        expect(plan.entries).toHaveLength(1);
        expect(plan.duplicated).toBe(1);
        expect(plan.counts.new).toBe(1);
    });

    // Both of these were completely unguarded: the entry could name any recipe
    // and carry any id with the suite still green, and they are what the
    // import screen lists and what the writer keys on.
    it("names the entry after the recipe it carries", async () => {
        const plan = buildImportPlan([row({theName: "Yirgacheffe"})], []);

        expect(plan.entries[0].name).toBe("Yirgacheffe");
        expect(plan.entries[0].name).toBe(plan.entries[0].recipe.name);
    });

    it("carries the row's own cloud id on the entry", async () => {
        const plan = buildImportPlan([row({tableId: 4242})], []);

        expect(plan.entries[0].cloudId).toBe(4242);
        expect(plan.entries[0].recipe.cloudId).toBe(4242);
    });

    /**
     * Accents are chosen against the existing library as well as against this
     * import. Without that, a first-ever import into a library already skewed
     * onto one colour would happily pile onto it -- and the whole point of
     * `assignAccent` is that a new recipe is visually distinguishable from the
     * ones already there.
     */
    it("avoids an accent the local library is already crowded with", async () => {
        const crowded: Recipe[] = [];
        for (let i = 0; i < 6; i += 1) {
            const local = new Recipe();
            local.uuid = `local-${i}`;
            local.accentIndex = 0;
            crowded.push(local);
        }

        // A colour far from every palette accent, so this goes down the
        // `assignAccent` path rather than the fidelity path.
        const plan = buildImportPlan([row({theColor: "#808080"})], crowded);

        expect(plan.entries[0].status).toBe("new");
        expect(plan.entries[0].recipe.accentIndex).not.toBe(0);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest library/cloud/__tests__/importPlan.test.ts`
Expected: FAIL — `Cannot find module '../importPlan'`.

- [ ] **Step 3: Implement it**

Create `library/cloud/importPlan.ts`:

```ts
import {accentGroupFor, assignAccent} from "@/library/accent";
import type Recipe from "@/library/Recipe";
import {matchAccent} from "./accentMatch";
import type {CloudRow} from "./cloudLibrary";
import {fingerprint} from "./fingerprint";
import {mapRow} from "./mapRow";

/**
 * What a second import would do, decided before anything is written.
 *
 * Pure: it takes the rows and the local recipes and returns a description. It
 * has no database, so there is no arrangement of it that can write anything,
 * and the rule the whole feature rests on — that an edit made here is never
 * silently overwritten — is a property of a function that can simply be
 * tested.
 *
 * `edited` is the interesting case. It is not an error and not a conflict to
 * be resolved: it is the app declining to make a decision that is the user's,
 * offering the row unselected and saying why.
 */

export type ImportStatus =
    /** No local recipe carries this cloud id. */
    | "new"
    /** The local copy is untouched and the cloud copy has moved on. */
    | "updated"
    /** The local copy is untouched and identical. Nothing to do. */
    | "unchanged"
    /** The local copy has been changed here since it arrived. Hands off. */
    | "edited";

export type ImportEntry = {
    /** The id of this recipe in the account library. */
    cloudId: number;
    name: string;
    status: ImportStatus;
    /** The recipe as it would be written, accent and fingerprint already set. */
    recipe: Recipe;
    /** The local recipe this would replace, when there is one. */
    existingUuid?: string;
    /** Pre-ticked for `new` and `updated`; never for `unchanged` or `edited`. */
    selected: boolean;
};

export type ImportPlan = {
    entries: ImportEntry[];
    /** Rows the mapper could not read. Surfaced, never silently dropped. */
    unreadable: number;
    counts: Record<ImportStatus, number>;
};

export function buildImportPlan(
    rows: CloudRow[],
    local: Recipe[]
): ImportPlan {
    const byCloudId = new Map<number, Recipe>();
    for (const recipe of local) {
        if (typeof recipe.cloudId === "number") {
            byCloudId.set(recipe.cloudId, recipe);
        }
    }

    const entries: ImportEntry[] = [];
    let unreadable = 0;

    // Accents are chosen against the local library *and* against the recipes
    // earlier in this same import, so twenty recipes arriving together do not
    // all land on the same colour.
    const assignedSoFar: Recipe[] = [...local];

    for (const row of rows) {
        const recipe = mapRow(row);
        if (!recipe) {
            unreadable += 1;
            continue;
        }

        const existing = byCloudId.get(recipe.cloudId!);
        const status = classify(existing, recipe);

        applyAccent(recipe, assignedSoFar);
        // After the accent, because the fingerprint excludes it and this is
        // the value the *next* import will compare against.
        recipe.cloudFingerprint = fingerprint(recipe);
        assignedSoFar.push(recipe);

        entries.push({
            cloudId: recipe.cloudId!,
            name: recipe.name,
            status,
            recipe,
            existingUuid: existing?.uuid,
            selected: status === "new" || status === "updated",
        });
    }

    const counts: Record<ImportStatus, number> = {
        new: 0,
        updated: 0,
        unchanged: 0,
        edited: 0,
    };
    for (const entry of entries) counts[entry.status] += 1;

    return {entries, unreadable, counts};
}

function classify(existing: Recipe | undefined, incoming: Recipe): ImportStatus {
    if (!existing) return "new";

    // No stored fingerprint means the local copy predates this feature or came
    // from a backup. We cannot show it is untouched, so we must not touch it.
    if (!existing.cloudFingerprint) return "edited";

    const localNow = fingerprint(existing);
    if (localNow !== existing.cloudFingerprint) return "edited";

    return localNow === fingerprint(incoming) ? "unchanged" : "updated";
}

function applyAccent(recipe: Recipe, color: string | undefined, others: Recipe[]): void {
    const matched = color
        ? matchAccent(color, accentGroupFor(recipe))
        : null;

    if (matched === null) {
        assignAccent(recipe, others);
    } else {
        recipe.accentIndex = matched;
    }
}

// The colour arrives beside the recipe, from `mapRow`'s `MappedRow`, and is
// consumed here. It is never set on the `Recipe`: that object is persisted by
// a blanket `JSON.stringify`, so a foreign hex parked on it would be written
// to the database and to backups, and stripping it again everywhere it is
// saved is a promise this codebase has already failed to keep once.
```

- [ ] **Step 4: Run the tests**

Run: `npx jest library/cloud/__tests__/importPlan.test.ts`
Expected: PASS, 26 tests.

Two will be fiddly and are worth getting right rather than adjusting:

- *"stamps the fingerprint after the accent is chosen"* failing means the fingerprint
  covers something it should not. Fix `fingerprint.ts`, not this test.
- *"does not give two new recipes the same accent"* failing means `assignedSoFar` is
  not being appended to, and every recipe in a large import will arrive the same
  colour.

- [ ] **Step 5: Commit**

```bash
git add library/cloud/importPlan.ts library/cloud/__tests__/importPlan.test.ts
git commit -m "feat: decide what a repeat import would do, before writing anything

Pure, so the promise that a local edit is never silently overwritten is a
property of a function rather than of a sequence of database calls."
```

---
## Task 11: The hook

**Files:**
- Create: `hooks/useCloudImport.ts`
- Test: `hooks/__tests__/useCloudImport.test.ts`

Remember the repository rules that bite hardest here: the React Compiler is on, so do
**not** hand-write `useMemo`/`useCallback`, and state may not be seeded or reset from an
effect. `renderHook` from RNTL v14 is **async** — without `await`, `result` is
`undefined` and the failure is confusing.

- [ ] **Step 1: Write the failing test**

Create `hooks/__tests__/useCloudImport.test.ts`:

```ts
import {act, renderHook, waitFor} from "@testing-library/react-native";

import Recipe from "@/library/Recipe";
import {fetchCloudRecipes} from "@/library/cloud/cloudLibrary";
import {fingerprint} from "@/library/cloud/fingerprint";
import {loadSession, signIn, signOut} from "@/library/cloud/session";
import {useCloudImport} from "@/hooks/useCloudImport";

// `jest.mock` is hoisted above these imports, so the bindings above resolve to
// the mocked modules despite sitting with the rest of the imports.
jest.mock("@/library/cloud/session", () => ({
    loadSession: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
}));
jest.mock("@/library/cloud/cloudLibrary", () => ({
    fetchCloudRecipes: jest.fn(),
}));

const mockLoad = loadSession as jest.MockedFunction<typeof loadSession>;
const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;
const mockFetch = fetchCloudRecipes as jest.MockedFunction<typeof fetchCloudRecipes>;

const session = {memberId: 7, token: "tok", email: "a@b.c"};
const row = {
    tableId: 1,
    theName: "Kenya",
    theColor: "#B8C9A2",
    grandWater: 288,
    dose: 18,
    pourCount: 2,
    grinderSize: 60,
    isSetGrinderSize: 1,
    rpm: 100,
    cupType: 1,
    podsVo: {id: "AB12CD"},
    // Two stages: a non-tea stage is capped at 240 ml by `cardLimits.ts`, and
    // these recipes are written to genuine cards.
    pourList: [
        {volume: 144, temperature: 93, pattern: 3, flowRate: 3, pausing: 30, isEnableVibrationBefore: 0, isEnableVibrationAfter: 0},
        {volume: 144, temperature: 93, pattern: 2, flowRate: 3, pausing: 0, isEnableVibrationBefore: 0, isEnableVibrationAfter: 0},
    ],
};

const deps = () => ({
    localRecipes: () => [] as Recipe[],
    saveRecipes: jest.fn(),
    replaceRecipe: jest.fn(),
});

describe("useCloudImport", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLoad.mockResolvedValue(null);
    });

    it("starts signed out when there is no stored session", async () => {
        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("signedOut"));
    });

    it("lists immediately when a session is already stored", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);

        const {result} = await renderHook(() => useCloudImport(deps()));

        await waitFor(() => expect(result.current.status).toBe("choosing"));
        expect(result.current.plan?.entries).toHaveLength(1);
    });

    it("signs in and then lists", async () => {
        mockSignIn.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("signedOut"));

        await act(async () => {
            await result.current.submitSignIn("a@b.c", "secret");
        });

        await waitFor(() => expect(result.current.status).toBe("choosing"));
    });

    it("reports a rejected sign-in without leaving the sign-in state", async () => {
        const {CloudError} = jest.requireActual("@/library/cloud/transport");
        mockSignIn.mockRejectedValue(new CloudError("credentials", "no"));

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("signedOut"));

        await act(async () => {
            await result.current.submitSignIn("a@b.c", "wrong");
        });

        await waitFor(() => expect(result.current.error).toBe("credentials"));
        expect(result.current.status).toBe("signedOut");
    });

    it("returns to signed out when the stored session is refused", async () => {
        // The one thing a token-only design must handle gracefully.
        const {CloudError} = jest.requireActual("@/library/cloud/transport");
        mockLoad.mockResolvedValue(session);
        mockFetch.mockRejectedValue(new CloudError("unauthorised", "stale"));

        const {result} = await renderHook(() => useCloudImport(deps()));

        await waitFor(() => expect(result.current.status).toBe("signedOut"));
        expect(mockSignOut).toHaveBeenCalled();
    });

    it("toggles an entry's selection", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        expect(result.current.plan!.entries[0].selected).toBe(true);
        await act(async () => {
            result.current.toggle(1);
        });
        expect(result.current.plan!.entries[0].selected).toBe(false);
    });

    it("writes only the selected entries", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row, {...row, tableId: 2}]);
        const d = deps();

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        await act(async () => {
            result.current.toggle(2);
        });
        await act(async () => {
            await result.current.confirm();
        });

        await waitFor(() => expect(result.current.status).toBe("done"));
        expect(d.saveRecipes).toHaveBeenCalledTimes(1);
        expect(d.saveRecipes.mock.calls[0][0]).toHaveLength(1);
    });

    it("replaces rather than inserts an entry that has a local counterpart", async () => {
        const local = new Recipe(undefined, undefined);
        local.cloudId = 1;
        // The stored fingerprint has to match the local recipe as it stands, or
        // `classify` reads it as user-edited and declines to pre-select it. A
        // matching stamp with a differing cloud copy is exactly the "updated"
        // case this test means to exercise.
        local.cloudFingerprint = fingerprint(local);

        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);
        const d = {...deps(), localRecipes: () => [local]};

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));
        await act(async () => {
            await result.current.confirm();
        });

        await waitFor(() => expect(result.current.status).toBe("done"));
        expect(d.replaceRecipe).toHaveBeenCalledWith(local.uuid, expect.anything());
        expect(d.saveRecipes).not.toHaveBeenCalled();
    });

    it("signs out back to the sign-in state", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([]);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        await act(async () => {
            await result.current.forgetAccount();
        });

        expect(mockSignOut).toHaveBeenCalled();
        await waitFor(() => expect(result.current.status).toBe("signedOut"));
    });

    /**
     * The local recipe a row would have produced, stamped as an untouched
     * import so `classify` reads it as `unchanged`/`updated` rather than
     * `edited`.
     */
    function localFrom(over: Record<string, unknown> = {}): Recipe {
        const {mapRow} = jest.requireActual("@/library/cloud/mapRow");
        const recipe: Recipe = mapRow(row).recipe;
        recipe.uuid = "local-1";
        recipe.key = "local-1";
        Object.assign(recipe, over);
        recipe.cloudFingerprint = fingerprint(recipe);
        return recipe;
    }

    /**
     * The promise the whole milestone rests on, checked at the last gate
     * before a write. An edited recipe is offered unticked; if `confirm` ever
     * stopped honouring that tick, the user's own work would be replaced by a
     * stranger's copy with no warning.
     */
    it("never writes over a locally edited recipe", async () => {
        const edited = localFrom();
        edited.name = "my own notes";

        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);
        const d = {...deps(), localRecipes: () => [edited]};

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        expect(result.current.plan!.entries[0].status).toBe("edited");
        expect(result.current.plan!.entries[0].selected).toBe(false);

        await act(async () => {
            await result.current.confirm();
        });
        await waitFor(() => expect(result.current.status).toBe("done"));

        expect(d.replaceRecipe).not.toHaveBeenCalled();
        expect(d.saveRecipes).not.toHaveBeenCalled();
        expect(result.current.imported).toBe(0);
    });

    it("writes the recipe the user ticked, not merely the right number of them", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row, {...row, tableId: 2, theName: "Peru"}]);
        const d = deps();

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        await act(async () => {
            result.current.toggle(1);
        });
        await act(async () => {
            await result.current.confirm();
        });
        await waitFor(() => expect(result.current.status).toBe("done"));

        const written = d.saveRecipes.mock.calls[0][0] as Recipe[];
        expect(written).toHaveLength(1);
        expect(written[0].cloudId).toBe(2);
        expect(result.current.imported).toBe(1);
    });

    it("hands the replacement the recipe it named, under the local uuid", async () => {
        const stored = localFrom();

        mockLoad.mockResolvedValue(session);
        // A fresh row alongside the replacement, so that picking any other
        // entry's recipe -- the first, say -- is distinguishable from picking
        // the right one.
        mockFetch.mockResolvedValue([
            {...row, tableId: 2, theName: "Peru"},
            {...row, theName: "Kenya AB"},
        ]);
        const d = {...deps(), localRecipes: () => [stored]};

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));
        expect(result.current.plan!.entries[1].status).toBe("updated");

        await act(async () => {
            await result.current.confirm();
        });
        await waitFor(() => expect(result.current.status).toBe("done"));

        const [uuid, recipe] = d.replaceRecipe.mock.calls[0] as [string, Recipe];
        expect(uuid).toBe("local-1");
        expect(recipe.cloudId).toBe(1);
        // `updateRecipe` finds the row by the uuid it is given but stores the
        // recipe's own. If they differ, the row and its contents disagree and
        // the next lookup forks the recipe in two.
        expect(recipe.uuid).toBe("local-1");
        expect(d.saveRecipes.mock.calls[0][0]).toHaveLength(1);
    });

    it("toggles back on, not merely off", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        await act(async () => {
            result.current.toggle(1);
        });
        expect(result.current.plan!.entries[0].selected).toBe(false);
        await act(async () => {
            result.current.toggle(1);
        });
        expect(result.current.plan!.entries[0].selected).toBe(true);
    });

    it("keeps the session when the network fails, and offers a retry", async () => {
        const {CloudError} = jest.requireActual("@/library/cloud/transport");
        mockLoad.mockResolvedValue(session);
        mockFetch.mockRejectedValue(new CloudError("network", "offline"));

        const {result} = await renderHook(() => useCloudImport(deps()));

        await waitFor(() => expect(result.current.error).toBe("network"));
        // Signing the user out over bad wifi would lose them a working token
        // for a failure that has nothing to do with it.
        expect(result.current.status).toBe("choosing");
        expect(mockSignOut).not.toHaveBeenCalled();
        expect(result.current.session).toEqual(session);
    });

    it("clears the error when the retry succeeds", async () => {
        const {CloudError} = jest.requireActual("@/library/cloud/transport");
        mockLoad.mockResolvedValue(session);
        mockFetch.mockRejectedValueOnce(new CloudError("network", "offline"));
        mockFetch.mockResolvedValue([row]);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.error).toBe("network"));

        await act(async () => {
            await result.current.refresh();
        });

        await waitFor(() => expect(result.current.status).toBe("choosing"));
        expect(result.current.error).toBeNull();
    });

    it("does nothing when confirm arrives with no plan", async () => {
        const d = deps();
        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("signedOut"));

        await act(async () => {
            await result.current.confirm();
        });

        expect(d.saveRecipes).not.toHaveBeenCalled();
        expect(d.replaceRecipe).not.toHaveBeenCalled();
        expect(result.current.status).toBe("signedOut");
    });

    it("writes once when confirm is tapped twice before it renders", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);
        const d = deps();

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        await act(async () => {
            await Promise.all([result.current.confirm(), result.current.confirm()]);
        });

        expect(d.saveRecipes).toHaveBeenCalledTimes(1);
    });

    /**
     * A failed write is not a reason to strand the screen on a spinner. The
     * recipes that landed are real, so the count must be the truth rather than
     * the total that was attempted.
     */
    it("keeps and reports what landed when a write fails", async () => {
        const stored = localFrom();
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([
            {...row, tableId: 2, theName: "Peru"},
            {...row, theName: "Kenya AB"},
        ]);
        const d = {...deps(), localRecipes: () => [stored]};
        d.replaceRecipe.mockImplementation(() => {
            throw new Error("disk full");
        });

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        await act(async () => {
            await result.current.confirm();
        });

        await waitFor(() => expect(result.current.status).toBe("done"));
        expect(result.current.imported).toBe(1);
        expect(result.current.error).toBe("server");
    });

    /**
     * Asserting that React did not warn would prove nothing: React 18 dropped
     * the setState-after-unmount warning, so that test passes whether the
     * guard is there or not. What is observable is the work the guard skips --
     * reading the whole local library and building a plan for a screen nobody
     * is looking at.
     */
    it("does no work when the fetch lands after the screen is gone", async () => {
        let release: (rows: unknown[]) => void = () => {};
        mockLoad.mockResolvedValue(session);
        mockFetch.mockReturnValue(new Promise((resolve) => {
            release = resolve as (rows: unknown[]) => void;
        }) as ReturnType<typeof fetchCloudRecipes>);

        const localRecipes = jest.fn(() => [] as Recipe[]);
        const {result, unmount} = await renderHook(
            () => useCloudImport({...deps(), localRecipes})
        );
        await waitFor(() => expect(result.current.status).toBe("listing"));
        expect(localRecipes).not.toHaveBeenCalled();

        // Two acts, not one: inside a single act React has not committed the
        // unmount by the time the promise resolves, so the guard would not yet
        // be set and the test would be measuring the wrong moment.
        await act(async () => {
            unmount();
        });
        await act(async () => {
            release([row]);
        });

        expect(localRecipes).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest hooks/__tests__/useCloudImport.test.ts`
Expected: FAIL — `Cannot find module '@/hooks/useCloudImport'`.

- [ ] **Step 3: Implement it**

Create `hooks/useCloudImport.ts`:

```ts
import {useEffect, useState} from "react";

import type Recipe from "@/library/Recipe";
import {fetchCloudRecipes} from "@/library/cloud/cloudLibrary";
import {buildImportPlan, type ImportPlan} from "@/library/cloud/importPlan";
import {loadSession, signIn, signOut, type Session} from "@/library/cloud/session";
import {CloudError, type CloudErrorKind} from "@/library/cloud/transport";

/**
 * Sign in, list, choose, write.
 *
 * The screen above holds no logic: everything that can be got wrong is either
 * here or, better, in `buildImportPlan`, which is pure. This hook's own job is
 * only the order things happen in and what to do when one of them fails.
 *
 * The database is injected rather than reached for, which is what lets the
 * whole state machine be tested without one.
 */

export type CloudImportStatus =
    | "restoring"
    | "signedOut"
    | "signingIn"
    | "listing"
    | "choosing"
    | "importing"
    | "done";

export type CloudImportDeps = {
    localRecipes: () => Recipe[];
    saveRecipes: (recipes: Recipe[]) => void;
    replaceRecipe: (uuid: string, recipe: Recipe) => void;
};

export function useCloudImport(deps: CloudImportDeps) {
    const {localRecipes, saveRecipes, replaceRecipe} = deps;

    const [status, setStatus] = useState<CloudImportStatus>("restoring");
    const [session, setSession] = useState<Session | null>(null);
    const [plan, setPlan] = useState<ImportPlan | null>(null);
    const [error, setError] = useState<CloudErrorKind | null>(null);
    const [imported, setImported] = useState(0);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const stored = await loadSession();
            if (cancelled) return;
            if (!stored) {
                setStatus("signedOut");
                return;
            }
            setSession(stored);
            await list(stored);
        })();
        return () => {
            cancelled = true;
        };
        // Once, on mount. The hook owns the session from here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function list(active: Session) {
        setStatus("listing");
        setError(null);
        try {
            const rows = await fetchCloudRecipes(active);
            setPlan(buildImportPlan(rows, localRecipes()));
            setStatus("choosing");
        } catch (caught) {
            const kind = caught instanceof CloudError ? caught.kind : "server";
            setError(kind);
            if (kind === "unauthorised") {
                // A token-only design has exactly one failure that matters,
                // and this is it. Drop the dead session and ask again rather
                // than leaving the user on an error with no way out.
                await signOut();
                setSession(null);
                setStatus("signedOut");
            } else {
                setStatus(session ? "choosing" : "signedOut");
            }
        }
    }

    async function submitSignIn(email: string, password: string) {
        setStatus("signingIn");
        setError(null);
        try {
            const next = await signIn(email, password);
            setSession(next);
            await list(next);
        } catch (caught) {
            setError(caught instanceof CloudError ? caught.kind : "server");
            setStatus("signedOut");
        }
    }

    function toggle(cloudId: number) {
        setPlan((current) =>
            current === null
                ? current
                : {
                      ...current,
                      entries: current.entries.map((entry) =>
                          entry.cloudId === cloudId
                              ? {...entry, selected: !entry.selected}
                              : entry
                      ),
                  }
        );
    }

    async function confirm() {
        if (!plan) return;
        setStatus("importing");

        const chosen = plan.entries.filter((entry) => entry.selected);
        const fresh = chosen.filter((entry) => !entry.existingUuid);
        const replacing = chosen.filter((entry) => entry.existingUuid);

        // One call for the inserts, because `insertRecipes` is transactional:
        // twenty recipes arrive together or not at all.
        if (fresh.length > 0) saveRecipes(fresh.map((entry) => entry.recipe));
        for (const entry of replacing) {
            replaceRecipe(entry.existingUuid!, entry.recipe);
        }

        setImported(chosen.length);
        setStatus("done");
    }

    async function forgetAccount() {
        await signOut();
        setSession(null);
        setPlan(null);
        setError(null);
        setStatus("signedOut");
    }

    async function refresh() {
        if (session) await list(session);
    }

    return {
        status,
        session,
        plan,
        error,
        imported,
        submitSignIn,
        toggle,
        confirm,
        refresh,
        forgetAccount,
    };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest hooks/__tests__/useCloudImport.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Run lint on the new hook**

Run: `npx eslint hooks/useCloudImport.ts library/cloud/`
Expected: 0 errors. The one `exhaustive-deps` disable is deliberate and matches the
repository's existing practice — that rule is a warning here because the compiler owns
memoisation — but every other hook rule is an error and must be clean.

- [ ] **Step 6: Commit**

```bash
git add hooks/useCloudImport.ts hooks/__tests__/useCloudImport.test.ts
git commit -m "feat: drive the account import

The database is injected, so the whole state machine -- including the one
failure a token-only design has to handle -- is tested without one."
```

---
## Task 12: The row component

**Files:**
- Create: `components/CloudImportRow.tsx`
- Test: `components/__tests__/CloudImportRow.test.tsx`

RNTL v14 has removed `UNSAFE_getAllByType` and `root.findAllByType`, so these tests
assert on text, test IDs and accessible labels — never on a child's props. Render via
`renderWithProviders` and **await** it.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/CloudImportRow.test.tsx`:

```tsx
import {fireEvent, screen} from "@testing-library/react-native";

import CloudImportRow from "@/components/CloudImportRow";
import type {ImportEntry} from "@/library/cloud/importPlan";
import {accents, palette} from "@/constants/colors";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

const entry = (over: Partial<ImportEntry> = {}): ImportEntry => {
    const recipe = new Recipe(undefined, undefined);
    recipe.name = "Kenya";
    return {
        cloudId: 1,
        name: "Kenya",
        status: "new",
        recipe,
        selected: true,
        ...over,
    };
};

/**
 * Tamagui resolves colour into the style prop, which arrives as a nest of
 * arrays. Flatten it before asking what colour something is.
 *
 * Note that nothing here calls `unmount()`. Under RNTL v14 a manual unmount
 * leaves the next render unable to find anything at all -- including through
 * its own returned queries -- so every case below gets its own `it` and lets
 * automatic cleanup do the work. A comparison is two tests, not one test with
 * two renders.
 */
const styleOf = (testID: string): Record<string, unknown> =>
    Object.assign({}, ...[screen.getByTestId(testID).props.style].flat(Infinity));

const LABEL = {
    new: "New here",
    updated: "Changed in xBloom",
    unchanged: "Already in your library",
} as const;

describe("CloudImportRow", () => {
    it("shows the recipe name", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry()} onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Kenya")).toBeTruthy();
    });

    it("says what will happen for a new recipe", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry()} onToggle={jest.fn()}/>
        );
        expect(screen.getByText("New here")).toBeTruthy();
    });

    it("says what will happen for an updated recipe", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "updated"})} onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Changed in xBloom")).toBeTruthy();
    });

    it("explains why an edited recipe is not selected", async () => {
        // The user must be able to see that the app is declining rather than
        // failing, and why.
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "edited", selected: false})}
                onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Edited here")).toBeTruthy();
    });

    it("marks an unchanged recipe as already imported", async () => {
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "unchanged", selected: false})}
                onToggle={jest.fn()}/>
        );
        expect(screen.getByText("Already in your library")).toBeTruthy();
    });

    it("reports its selected state to assistive technology", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry()} onToggle={jest.fn()}/>
        );
        const row = screen.getByRole("checkbox", {name: /Kenya/});
        expect(row.props.accessibilityState.checked).toBe(true);
    });

    it("calls back with its cloud id when tapped", async () => {
        const onToggle = jest.fn();
        await renderWithProviders(
            <CloudImportRow entry={entry({cloudId: 42})} onToggle={onToggle}/>
        );

        await fireEvent.press(screen.getByRole("checkbox", {name: /Kenya/}));
        expect(onToggle).toHaveBeenCalledWith(42);
    });

    it("is still tappable when it starts unselected", async () => {
        // An `edited` row is offered, not forbidden. The user may overrule us.
        const onToggle = jest.fn();
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "edited", selected: false})}
                onToggle={onToggle}/>
        );

        await fireEvent.press(screen.getByRole("checkbox", {name: /Kenya/}));
        expect(onToggle).toHaveBeenCalled();
    });

    /**
     * The spec puts the consent on the tick itself: there is no confirming
     * dialog after it. So the row has to say what ticking would cost before
     * the user does it, or they are agreeing to something never stated.
     */
    it("tells an edited row what importing would cost, before it is ticked", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "edited", selected: false})} onToggle={jest.fn()}/>
        );

        expect(
            await screen.findByText("Importing replaces the changes you made here")
        ).toBeTruthy();
    });

    it.each(["new", "updated", "unchanged"] as const)(
        "does not caption %s, where ticking costs nothing",
        async (status) => {
            await renderWithProviders(
                <CloudImportRow entry={entry({status})} onToggle={jest.fn()}/>
            );

            // Positively assert the row is there first: without it this would
            // pass just as well against a component that rendered nothing.
            expect(screen.getByText(LABEL[status])).toBeTruthy();
            expect(
                screen.queryByText("Importing replaces the changes you made here")
            ).toBeNull();
        }
    );

    /**
     * The glyph is the only selection signal a sighted user gets, and it can
     * be exactly backwards while every assertion about copy stays green.
     */
    it("shows a ticked box when the entry is selected", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: true})} onToggle={jest.fn()}/>
        );
        expect(screen.getByTestId("cloud-import-tick")).toHaveTextContent("\u2713");
    });

    it("shows an empty box when the entry is not", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: false})} onToggle={jest.fn()}/>
        );
        expect(screen.getByTestId("cloud-import-tick")).toHaveTextContent("\u25cb");
    });

    it("announces an unselected row as unchecked", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: false})} onToggle={jest.fn()}/>
        );
        expect(screen.getByRole("checkbox").props.accessibilityState.checked)
            .toBe(false);
    });

    /**
     * The label is the whole row for a screen reader. If it carried only the
     * name, a blind user ticking an edited recipe would never be told that
     * doing so discards their changes -- and the tick is the only consent.
     */
    it("reads the name, the status and the consequence aloud", async () => {
        await renderWithProviders(
            <CloudImportRow
                entry={entry({status: "edited", selected: false})}
                onToggle={jest.fn()}/>
        );

        expect(screen.getByRole("checkbox").props.accessibilityLabel).toBe(
            "Kenya, Edited here, Importing replaces the changes you made here"
        );
    });

    it("wears the recipe's own accent when selected", async () => {
        const picked = entry({selected: true});
        picked.recipe.accentIndex = 2;

        await renderWithProviders(<CloudImportRow entry={picked} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-accent").backgroundColor)
            .toBe(accents.coffee[2]);
    });

    it("steps the accent back when the entry is not selected", async () => {
        const unpicked = entry({selected: false});
        unpicked.recipe.accentIndex = 2;

        await renderWithProviders(<CloudImportRow entry={unpicked} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-accent").backgroundColor).toBe(palette.dim);
    });

    it("gives a tea recipe a tea accent, not a coffee one", async () => {
        // The two palettes are separate on purpose, and a tea recipe drawn in
        // a coffee accent would be the one place the import screen disagreed
        // with the library it is feeding.
        const tea = entry({selected: true});
        // Ours, not xBloom's: their cup types are 1-4 and tea is their 4,
        // while CUP_TYPE.TEA is 0x03 here. The assertion below is what stops
        // a wrong constant from quietly making this a coffee test.
        tea.recipe.cupType = CUP_TYPE.TEA;
        tea.recipe.accentIndex = 1;
        expect(tea.recipe.isTea()).toBe(true);

        await renderWithProviders(<CloudImportRow entry={tea} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-accent").backgroundColor).toBe(accents.tea[1]);
        expect(accents.tea[1]).not.toBe(accents.coffee[1]);
    });

    // Spec 4.4: already-imported is "unchecked, dimmed". The rows that would
    // act carry full-strength text; the two that would not step back.
    it.each(["new", "updated"] as const)(
        "keeps %s at full strength", async (status) => {
            await renderWithProviders(
                <CloudImportRow entry={entry({status})} onToggle={jest.fn()}/>
            );
            expect(styleOf("cloud-import-status").color).toBe(palette.text);
        }
    );

    it.each(["unchanged", "edited"] as const)(
        "dims %s, which is not offering to do anything", async (status) => {
            await renderWithProviders(
                <CloudImportRow entry={entry({status})} onToggle={jest.fn()}/>
            );
            expect(styleOf("cloud-import-status").color).toBe(palette.dim);
        }
    );

    it("carries the selection in the tick's colour, not only its shape", async () => {
        const picked = entry({selected: true});
        picked.recipe.accentIndex = 2;

        await renderWithProviders(<CloudImportRow entry={picked} onToggle={jest.fn()}/>);

        expect(styleOf("cloud-import-tick").color).toBe(accents.coffee[2]);
    });

    it("steps the tick back when the entry is not selected", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({selected: false})} onToggle={jest.fn()}/>
        );
        expect(styleOf("cloud-import-tick").color).toBe(palette.dim);
    });

    /**
     * The three captionless statuses have nothing to append, and a label built
     * by joining an absent one reads "Kenya, New here, " -- a trailing pause
     * and then silence, every row, for the whole list.
     */
    it("does not trail an empty clause when there is no caption", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "new"})} onToggle={jest.fn()}/>
        );

        expect(screen.getByRole("checkbox").props.accessibilityLabel)
            .toBe("Kenya, New here");
    });

    it("keeps the name at full strength and the caption stepped back", async () => {
        await renderWithProviders(
            <CloudImportRow entry={entry({status: "edited", selected: false})} onToggle={jest.fn()}/>
        );

        expect(styleOf("cloud-import-name").color).toBe(palette.text);
        expect(styleOf("cloud-import-caption").color).toBe(palette.dim);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/CloudImportRow.test.tsx`
Expected: FAIL — `Cannot find module '@/components/CloudImportRow'`.

- [ ] **Step 3: Implement it**

Create `components/CloudImportRow.tsx`:

```tsx
import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import {palette} from "@/constants/colors";
import {resolveAccent} from "@/library/accent";
import type {ImportEntry, ImportStatus} from "@/library/cloud/importPlan";

/**
 * One recipe offered for import, and what importing it would do.
 *
 * `edited` is shown in the same voice as the rest, not as a warning: nothing
 * has gone wrong. The app is saying it will not overwrite a change the user
 * made here unless asked, which is a courtesy, and a red row would read as a
 * problem to be solved.
 *
 * It does carry one extra line, though. Ticking the box *is* the consent --
 * there is no confirmation dialog after it -- so the row has to state the
 * consequence at the point of decision, or the user is agreeing to something
 * the screen never told them (spec 4.4).
 */

// The wording runs on one axis -- *here* versus *in xBloom* -- so the four
// statuses read as one sentence about two places rather than four unrelated
// adjectives. Taken from spec 4.4, which quotes its copy.
const LABELS: Record<ImportStatus, string> = {
    new: "New here",
    updated: "Changed in xBloom",
    unchanged: "Already in your library",
    edited: "Edited here",
};

/**
 * The consequence, for the one status where ticking costs the user something.
 *
 * Only `edited` has one: for the others, importing is either the obvious thing
 * or a no-op, and a caption on every row would turn into wallpaper and stop
 * being read on the row that matters.
 */
const CAPTIONS: Partial<Record<ImportStatus, string>> = {
    edited: "Importing replaces the changes you made here",
};

// `unchanged` and `edited` step back to secondary text. `dim` rather than
// `muted`: `muted` is 4.12:1 on `base` and documented as a non-text colour, so
// a status line drawn in it would fall under AA.
const TONES: Record<ImportStatus, string> = {
    new: palette.text,
    updated: palette.text,
    unchanged: palette.dim,
    edited: palette.dim,
};

const BAR_WIDTH = 4;

type Props = {
    entry: ImportEntry;
    onToggle: (cloudId: number) => void;
};

export default function CloudImportRow({entry, onToggle}: Props) {
    // The library's own resolver, not a local lookup: it validates the index
    // and falls back to the same hash every other screen uses, so a recipe
    // with a missing or bogus index is the same colour here as it will be in
    // the list this screen is feeding.
    const accent = resolveAccent(entry.recipe);

    return (
        <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{checked: entry.selected}}
            accessibilityLabel={[entry.name, LABELS[entry.status], CAPTIONS[entry.status]]
                .filter(Boolean)
                .join(", ")}
            onPress={() => onToggle(entry.cloudId)}
            style={({pressed}) => ({
                opacity: pressed ? 0.7 : 1,
                transform: [{scale: pressed ? 0.98 : 1}],
            })}>
            <XStack alignItems="center" gap="$3" paddingVertical="$3" paddingHorizontal="$4">
                {/* The tick is the selection; the bar is the accent this
                    recipe will wear once it lands, so the choice and its
                    result are visible in the same glance. */}
                <YStack
                    testID="cloud-import-accent"
                    width={BAR_WIDTH}
                    height={32}
                    // Half the width, so the bar is a pill at any width. Not a
                    // `$` token: the radius is a consequence of this bar's
                    // geometry, and a token would drift away from it.
                    borderRadius={BAR_WIDTH / 2}
                    backgroundColor={entry.selected ? accent : palette.dim}/>
                <YStack flex={1} gap="$1">
                    <Text testID="cloud-import-name" color={palette.text} fontSize={16}>
                        {entry.name}
                    </Text>
                    <Text testID="cloud-import-status" color={TONES[entry.status]} fontSize={13}>
                        {LABELS[entry.status]}
                    </Text>
                    {CAPTIONS[entry.status] ? (
                        <Text testID="cloud-import-caption" color={palette.dim} fontSize={12}>
                            {CAPTIONS[entry.status]}
                        </Text>
                    ) : null}
                </YStack>
                <Text
                    testID="cloud-import-tick"
                    color={entry.selected ? accent : palette.dim}
                    fontSize={18}>
                    {entry.selected ? "✓" : "○"}
                </Text>
            </XStack>
        </Pressable>
    );
}
```

`palette.muted` is under AA (4.12:1 on `base`) and is documented as a non-text
colour, so the status line uses `dim` for the two greyed states. Fix `TONES` to read
`unchanged: palette.dim, edited: palette.dim`. No hex literal may appear in this file.

- [ ] **Step 4: Run the tests**

Run: `npx jest components/__tests__/CloudImportRow.test.tsx`
Expected: PASS, 27 tests.

- [ ] **Step 5: Commit**

```bash
git add components/CloudImportRow.tsx components/__tests__/CloudImportRow.test.tsx
git commit -m "feat: draw one offered recipe and what importing it would do

'Edited here' is in the same voice as the rest: nothing has gone wrong,
the app is declining to overwrite a change without being asked."
```

---

## Task 13: The screen

**Files:**
- Create: `app/importCloud.tsx`
- Modify: `app/_layout.tsx`
- Test: `app/__tests__/importCloud.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/importCloud.test.tsx`:

```tsx
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import ImportCloudScreen from "@/app/importCloud";
import {renderWithProviders} from "@/test-utils/render";

// The screen constructs a `new RecipeDatabase()` at module scope of the
// component body; without this mock jest opens real expo-sqlite.
jest.mock("@/library/RecipeDatabase");

const mockHook = {
    status: "signedOut" as string,
    session: null as unknown,
    plan: null as unknown,
    error: null as string | null,
    imported: 0,
    submitSignIn: jest.fn(),
    toggle: jest.fn(),
    confirm: jest.fn(),
    refresh: jest.fn(),
    forgetAccount: jest.fn(),
};

jest.mock("@/hooks/useCloudImport", () => ({
    useCloudImport: () => mockHook,
}));

describe("importCloud", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.assign(mockHook, {
            status: "signedOut",
            session: null,
            plan: null,
            error: null,
            imported: 0,
        });
    });

    it("warns about the unofficial endpoints before the password field", async () => {
        // Before, not after: a caveat under a submit button is not consent.
        await renderWithProviders(<ImportCloudScreen/>);
        expect(
            screen.getByText(/not an official xBloom feature/i)
        ).toBeTruthy();
    });

    it("sends the typed credentials on submit", async () => {
        await renderWithProviders(<ImportCloudScreen/>);

        await fireEvent.changeText(screen.getByLabelText("Email"), "a@b.c");
        await fireEvent.changeText(screen.getByLabelText("Password"), "secret");
        await fireEvent.press(screen.getByRole("button", {name: /sign in/i}));

        expect(mockHook.submitSignIn).toHaveBeenCalledWith("a@b.c", "secret");
    });

    it("says so when the credentials were refused", async () => {
        mockHook.error = "credentials";
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/Email or password not accepted/i)).toBeTruthy();
    });

    it("says so when the network was unreachable", async () => {
        mockHook.error = "network";
        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/Could not reach xBloom/i)).toBeTruthy();
    });

    it("lists the offered recipes once there is a plan", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [
                {
                    cloudId: 1,
                    name: "Kenya",
                    status: "new",
                    selected: true,
                    recipe: {uuid: "u-1", accentIndex: 0, cupType: 1, isTea: () => false},
                },
            ],
            unreadable: 0,
            counts: {new: 1, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        await waitFor(() => expect(screen.getByText("Kenya")).toBeTruthy());
    });

    it("says how many recipes it could not read rather than hiding it", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [],
            unreadable: 2,
            counts: {new: 0, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/2 recipes could not be read/i)).toBeTruthy();
    });

    it("says so when the account has no recipes at all", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [],
            unreadable: 0,
            counts: {new: 0, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/No recipes to import/i)).toBeTruthy();
    });

    it("confirms the chosen recipes", async () => {
        mockHook.status = "choosing";
        mockHook.plan = {
            entries: [
                {
                    cloudId: 1,
                    name: "Kenya",
                    status: "new",
                    selected: true,
                    recipe: {uuid: "u-1", accentIndex: 0, cupType: 1, isTea: () => false},
                },
            ],
            unreadable: 0,
            counts: {new: 1, updated: 0, unchanged: 0, edited: 0},
        };

        await renderWithProviders(<ImportCloudScreen/>);
        await fireEvent.press(screen.getByRole("button", {name: /import 1 recipe/i}));
        expect(mockHook.confirm).toHaveBeenCalled();
    });

    it("reports what it imported when it is done", async () => {
        mockHook.status = "done";
        mockHook.imported = 3;

        await renderWithProviders(<ImportCloudScreen/>);
        expect(screen.getByText(/Imported 3 recipes/i)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest app/__tests__/importCloud.test.tsx`
Expected: FAIL — `Cannot find module '@/app/importCloud'`.

- [ ] **Step 3: Implement the screen**

Create `app/importCloud.tsx`:

```tsx
import {router} from "expo-router";
import React, {useState} from "react";
import {ScrollView} from "react-native";
import {Button, Input, Text, YStack, type ColorTokens} from "tamagui";

import CloudImportRow from "@/components/CloudImportRow";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {useCloudImport} from "@/hooks/useCloudImport";
import RecipeDatabase from "@/library/RecipeDatabase";
import type {CloudErrorKind} from "@/library/cloud/transport";

/**
 * Sign in to xBloom and bring your own recipes across.
 *
 * A full screen rather than a sheet: this is a form, a list that can be long,
 * and a decision per row. A sheet would put all three behind a keyboard.
 *
 * The screen is layout. Every judgement it appears to make was made in
 * `buildImportPlan` and is tested there without a renderer.
 */

const ERRORS: Record<CloudErrorKind, string> = {
    credentials: "Email or password not accepted.",
    unauthorised: "That sign-in has expired. Please sign in again.",
    network: "Could not reach xBloom. Check your connection.",
    server: "xBloom could not answer that just now.",
};

export default function ImportCloudScreen() {
    const database = new RecipeDatabase();
    const cloud = useCloudImport({
        localRecipes: () => database.retrieveAllRecipes() ?? [],
        saveRecipes: (recipes) => database.insertRecipes(recipes),
        replaceRecipe: (uuid, recipe) => database.updateRecipe(uuid, recipe),
    });

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const selected = cloud.plan?.entries.filter((e) => e.selected) ?? [];

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="xBloom account" onBack={() => router.back()}/>

            <ScrollView>
                <YStack gap="$4" paddingHorizontal="$4" paddingBottom="$6">
                    {cloud.error && (
                        <Text color={palette.danger} fontSize={14}>
                            {ERRORS[cloud.error as CloudErrorKind]}
                        </Text>
                    )}

                    {(cloud.status === "signedOut" || cloud.status === "signingIn") && (
                        <>
                            {/* Before the fields, not after. A caveat placed
                                under a submit button has already been walked
                                past by everyone who was going to walk past it. */}
                            <Text color={palette.dim} fontSize={13}>
                                This is not an official xBloom feature. Signing in
                                sends your email and password directly to xBloom,
                                never to us or to anyone else. Only a revocable
                                token is kept on this phone — your password is
                                never stored.
                            </Text>

                            <Input
                                accessibilityLabel="Email"
                                placeholder="Email"
                                placeholderTextColor={palette.dim as ColorTokens}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                value={email}
                                onChangeText={setEmail}/>
                            <Input
                                accessibilityLabel="Password"
                                placeholder="Password"
                                placeholderTextColor={palette.dim as ColorTokens}
                                autoCapitalize="none"
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}/>

                            <Button
                                accessibilityLabel="Sign in"
                                disabled={cloud.status === "signingIn"}
                                backgroundColor={palette.raised}
                                color={palette.text}
                                onPress={() => cloud.submitSignIn(email, password)}>
                                {cloud.status === "signingIn" ? "Signing in…" : "Sign in"}
                            </Button>
                        </>
                    )}

                    {(cloud.status === "listing" || cloud.status === "restoring") && (
                        <Text color={palette.dim}>Reading your recipes…</Text>
                    )}

                    {cloud.status === "choosing" && cloud.plan && (
                        <>
                            {cloud.plan.entries.length === 0 && (
                                <Text color={palette.dim}>
                                    No recipes to import. This lists the recipes you
                                    created in xBloom, not ones you have opened from
                                    a link.
                                </Text>
                            )}

                            {cloud.plan.entries.map((entry) => (
                                <CloudImportRow
                                    key={entry.cloudId}
                                    entry={entry}
                                    onToggle={cloud.toggle}/>
                            ))}

                            {cloud.plan.unreadable > 0 && (
                                // Said out loud. A recipe quietly missing from a
                                // list is the one failure the user cannot notice.
                                <Text color={palette.dim} fontSize={13}>
                                    {cloud.plan.unreadable} recipes could not be read
                                    and were left out.
                                </Text>
                            )}

                            {cloud.plan.entries.length > 0 && (
                                <Button
                                    accessibilityLabel={
                                        `Import ${selected.length} recipe` +
                                        (selected.length === 1 ? "" : "s")
                                    }
                                    disabled={selected.length === 0}
                                    backgroundColor={palette.raised}
                                    color={palette.text}
                                    onPress={() => cloud.confirm()}>
                                    {`Import ${selected.length} recipe` +
                                        (selected.length === 1 ? "" : "s")}
                                </Button>
                            )}
                        </>
                    )}

                    {cloud.status === "importing" && (
                        <Text color={palette.dim}>Importing…</Text>
                    )}

                    {cloud.status === "done" && (
                        <>
                            <Text color={palette.text}>
                                {`Imported ${cloud.imported} recipe` +
                                    (cloud.imported === 1 ? "" : "s") + "."}
                            </Text>
                            <Button onPress={() => router.back()}>Done</Button>
                        </>
                    )}

                    {cloud.session && (
                        // `Session.email` exists so the user can see which
                        // account is connected; without it "Sign out" asks them
                        // to revoke something they cannot identify.
                        <Text color={palette.dim} fontSize={13}>
                            {`Signed in as ${cloud.session.email}`}
                        </Text>
                    )}

                    {cloud.session && (
                        <Button
                            accessibilityLabel="Sign out"
                            chromeless
                            color={palette.danger}
                            onPress={() => cloud.forgetAccount()}>
                            Sign out
                        </Button>
                    )}
                </YStack>
            </ScrollView>
        </YStack>
    );
}
```

The palette keys used here are the real ones: `base` (screen background), `raised`
(the fill every other button in the app uses -- `ImportSheet.tsx:198` and
`ImportResult.tsx:176` both do), `text`, `dim`, `muted` and `danger`. `muted` is
**4.12:1 on base and under AA**, so it is correct for the row's status annotation but
**not** for the consent paragraph -- use `dim` there. No hex literal may appear.

- [ ] **Step 4: Switch off the native header for the route**

In `app/_layout.tsx`, beside the other `headerShown: false` entries, add:

```tsx
                <Stack.Screen name="importCloud" options={{headerShown: false}}/>
```

Match the exact form the neighbouring routes use — the screen draws its own
`ScreenHeader`, and leaving the native bar on would put two titles on the screen in two
different fonts.

- [ ] **Step 5: Run the tests**

Run: `npx jest app/__tests__/importCloud.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add app/importCloud.tsx app/_layout.tsx app/__tests__/importCloud.test.tsx
git commit -m "feat: add the xBloom account screen

A screen rather than a sheet: a form, a list and a decision per row would
all sit behind a keyboard in one. The caveat sits above the fields."
```

---
## Task 14: The two doors

**Files:**
- Modify: `components/ImportSheet.tsx`
- Modify: `app/settings.tsx`
- Test: `components/__tests__/ImportSheet.test.tsx` (existing — add a case)

Import already has three doors that all open the one sheet. The account is the fourth
way in and belongs *inside* that sheet, not beside it as a fifth home-screen tile: it is
a kind of import, and the home screen's three tiles are the app's whole top-level
vocabulary. Settings gets a second entrance because that is where a signed-in account
has to be visible and revocable.

- [ ] **Step 1: Write the failing test**

Add to `components/__tests__/ImportSheet.test.tsx` (inside the existing top-level
`describe`; keep the file's existing imports and helpers):

```tsx
    it("offers the xBloom account as a way in", async () => {
        await renderWithProviders(<ImportSheet {...props()} open/>);
        expect(
            screen.getByRole("button", {name: /Import from your xBloom account/i})
        ).toBeTruthy();
    });

    it("leaves the sheet and opens the account screen", async () => {
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <ImportSheet {...props()} open onOpenChange={onOpenChange}/>
        );

        await fireEvent.press(
            screen.getByRole("button", {name: /Import from your xBloom account/i})
        );

        // Closed first, then pushed: a sheet left open behind a pushed screen
        // is still there when the user comes back, over the screen they
        // navigated to.
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(router.push).toHaveBeenCalledWith("/importCloud");
    });
```

If the file does not already mock `expo-router`, add at the top, beside the other mocks:

```tsx
jest.mock("expo-router", () => ({router: {push: jest.fn()}}));
import {router} from "expo-router";
```

and `jest.clearAllMocks()` in a `beforeEach` if there is not one already. Read the file
first and fit the case to its existing shape — `props()` above stands for whatever
helper that file already uses to build the component's props; if it builds them inline,
build them inline.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest components/__tests__/ImportSheet.test.tsx`
Expected: FAIL — unable to find an element with that role and name.

- [ ] **Step 3: Add the row to the sheet**

In `components/ImportSheet.tsx`, inside the `YStack` that opens at line ~166, after the
`PasteOverlay` block and still inside the `state.status === "idle"` gate that the paste
affordance uses, add:

```tsx
                {/* The fourth door. It lives in the sheet rather than on the
                    home screen because it is a kind of import, and the home
                    screen's three tiles are the app's entire top-level
                    vocabulary — a fourth would cost more than it bought. */}
                <Button
                    accessibilityLabel="Import from your xBloom account"
                    backgroundColor={palette.raised}
                    color={palette.text}
                    onPress={() => {
                        onOpenChange(false);
                        router.push("/importCloud");
                    }}>
                    Import from your xBloom account
                </Button>
```

Add `import {router} from "expo-router";` to the file's imports if it is not there, and
`Button` to the existing `tamagui` import if it is not.

- [ ] **Step 4: Run the sheet's tests**

Run: `npx jest components/__tests__/ImportSheet.test.tsx`
Expected: PASS — the two new cases and every case that was passing before.

- [ ] **Step 5: Add the settings section**

In `app/settings.tsx`, directly above the `SettingsSection title="Library"` block at
line ~276, add:

```tsx
                {/* Its own section above Library, not a line inside it:
                    Library is the recipes you hold, and this is where some of
                    them can come from. */}
                <SettingsSection title="xBloom account">
                    <SettingsActionRow label="Import from xBloom"
                                       detail="Sign in and bring across the recipes you made there."
                                       onPress={() => router.push("/importCloud")}/>
                </SettingsSection>
```

`router` is already imported in that file.

- [ ] **Step 6: Run the settings tests**

Run: `npx jest app/__tests__/settings.test.tsx`
Expected: PASS. If that file asserts on a count of rows or sections, update the count —
it is a count, not a contract.

- [ ] **Step 7: Commit**

```bash
git add components/ImportSheet.tsx app/settings.tsx components/__tests__/ImportSheet.test.tsx app/__tests__/settings.test.tsx
git commit -m "feat: open the account screen from the import sheet and settings

The sheet, because an account is a kind of import and the home screen's
three tiles are the app's whole top-level vocabulary. Settings, because a
signed-in account has to be visible and revocable somewhere permanent."
```

---

## Task 15: Gates and the device pass

Nothing here is new code. This is the point at which the feature is either finished or
is not.

- [ ] **Step 1: Types**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: **0 errors.** The pre-existing baseline is 8 warnings; this branch may add the
one deliberate `exhaustive-deps` disable in `useCloudImport.ts` and nothing else. If the
warning count has risen, find out why rather than accepting it.

- [ ] **Step 3: The whole suite**

Run: `npm test`
Expected: every suite green. The count should have risen by roughly 100 tests — this
branch adds nine test files.

- [ ] **Step 4: Dependency health**

Run: `npx expo-doctor`
Expected: all checks passed. CI treats this as a hard failure, so a warning here is a
red build.

- [ ] **Step 5: Build to the device**

Run: `npx expo run:ios --device "iPhone14"`

`expo-secure-store` is a native module, so the JS-only dev client already on the phone
cannot run this branch. The build is mandatory, not optional.

- [ ] **Step 6: The device pass**

Do all of it, in order, and read the result rather than assuming it:

1. Import ▸ **Import from your xBloom account**. The screen opens; the consent paragraph
   is above the fields.
2. Sign in with the real account. The list arrives.
3. Confirm the list holds the recipes **you authored** in xBloom and not the ones you
   opened from links — this is what the #74 spike measured and it is the feature's
   central claim.
4. Everything unimported reads **New** and is ticked. Import the lot.
5. The home screen shows them. Confirm **no two adjacent recipes share an accent** and
   that any recipe whose xBloom colour is close to a palette accent got that accent.
6. Open one imported recipe, change its dose, save.
7. Go back into the account screen. That one now reads **Edited here** and is **not**
   ticked; the others read **Already imported**.
8. Force-quit the app and reopen it. The account screen goes straight to the list — the
   token survived in the keychain.
9. **Sign out.** Reopen: the form is back.
10. Turn off wifi and cellular, open the screen: *"Could not reach xBloom."* Not a crash,
    not a spinner that never ends.

- [ ] **Step 7: Commit anything the pass changed**

If the device pass changed nothing, there is nothing to commit. If it did, the fix needs
a test — a bug found on the device is a bug the suite did not have.

---

## Self-review

Run this checklist before opening the pull request.

- [ ] **Spec coverage.** Walk `docs/superpowers/specs/2026-09-15-xbloom-account-import-design.md`
      section by section and name the task that implements each: §2 RSA → Task 2; §2
      transport → Task 3; §3 data model and the three ids → Task 6; §3 fingerprint →
      Task 7; §4 the user's path → Tasks 10–13; §5 accents → Tasks 8, 9; §6 credentials
      and failure → Tasks 4, 11; §8 testing → every task. §7 (#76, publishing) and §9
      are out of scope by the spec's own words and have no task by design.
- [ ] **Placeholders.** Grep the diff for `TODO`, `TBD`, `FIXME` and `any`.
- [ ] **Type consistency.** `ImportEntry`'s fields as used in Tasks 11–13 (`cloudId`,
      `name`, `status`, `recipe`, `selected`, `existingUuid`) must match Task 10's
      definition exactly, and `ImportPlan`'s (`entries`, `unreadable`, `counts`) likewise.
      A field renamed in one place and not the other typechecks as `undefined` in a
      `.map` and fails silently in the UI.
- [ ] **No colour literal.** `grep -nE "#[0-9a-fA-F]{6}" app/ components/` over the diff
      returns nothing.
- [ ] **No `library/` import of `api/`.** `library/cloud/` duplicates the public key
      deliberately; `api/_lib/xbloom.ts` is a zero-dependency Vercel function and must
      stay one.

---

## What this deliberately does not do

- **Publish a local recipe to xBloom.** That is #59, re-scoped, and needs a write
  endpoint this spike never exercised.
- **Refresh in the background.** The list is fetched when the screen opens and not
  otherwise. A sync loop against an undocumented endpoint is a way to get an account
  rate-limited.
- **Resolve a conflict.** A recipe changed on both sides reads `edited` and is left
  alone. Merging two brewing recipes is a decision the app is not entitled to make.
