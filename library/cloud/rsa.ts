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
