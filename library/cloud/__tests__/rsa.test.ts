import * as Crypto from "expo-crypto";

import {encryptChunks, modPow, parsePublicKey, pkcs1Pad} from "../rsa";
import {XBLOOM_PUBLIC_KEY} from "../key";

describe("parsePublicKey", () => {
    it("reads the modulus and exponent out of the SPKI PEM", async () => {
        const key = parsePublicKey(XBLOOM_PUBLIC_KEY);
        expect(key.size).toBe(128);
        expect(key.e).toBe(65537n);
        // First and last bytes of the 128-byte modulus.
        expect(key.n >> (127n * 8n)).toBe(184n);
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

    it("is tested against a source that actually yields zero bytes", async () => {
        // Guards the test below. The first stub drew its zeros every 256
        // bytes, but `pkcs1Pad` never asks for more than 124 at a time and
        // the sequence restarts on each call, so the filtering was never
        // exercised and the test would have passed with the filter deleted.
        const drawn = Crypto.getRandomBytes(124);
        expect(Array.from(drawn)).toContain(0);
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
