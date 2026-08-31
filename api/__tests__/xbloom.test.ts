import {constants, createPrivateKey, createPublicKey, generateKeyPairSync, privateDecrypt}
    from "node:crypto";

import {encryptForXbloom, mintRecipe, XBLOOM_PUBLIC_KEY} from "../_lib/xbloom";

describe("encryptForXbloom", () => {
    it("splits the plaintext into 117-byte blocks and produces 128 bytes each", () => {
        // 250 bytes of plaintext is three blocks: 117 + 117 + 16.
        const out = Buffer.from(encryptForXbloom("x".repeat(250)), "base64");
        expect(out.length).toBe(384);
    });

    it("round-trips through the matching private key", () => {
        const {publicKey, privateKey} = generateKeyPairSync("rsa", {modulusLength: 1024});
        const plaintext = JSON.stringify({hello: "world", n: 1});
        const encrypted = Buffer.from(
            encryptForXbloom(plaintext, publicKey.export({type: "spki", format: "pem"}) as string),
            "base64"
        );
        const decrypted = privateDecrypt(
            {key: createPrivateKey(privateKey.export({type: "pkcs8", format: "pem"}) as string),
             padding: constants.RSA_PKCS1_PADDING},
            encrypted
        );
        expect(decrypted.toString("utf8")).toBe(plaintext);
    });

    it("uses a 1024-bit key, which is what the 117-byte chunk size assumes", () => {
        // The chunk size is 128 - 11. A key of any other size would still
        // encrypt without complaint here and decrypt to garbage upstream, so
        // asserting the modulus is the only check that would notice.
        const key = createPublicKey(XBLOOM_PUBLIC_KEY);
        expect(key.asymmetricKeyDetails?.modulusLength).toBe(1024);
    });
});

describe("mintRecipe", () => {
    const payload = {theName: "T", dose: 18} as never;

    function mockFetch(responses: unknown[]) {
        const calls: {url: string; body: string}[] = [];
        const fn = jest.fn(async (url: string, init: {body: string}) => {
            calls.push({url, body: init.body});
            const next = responses[calls.length - 1];
            return {ok: true, status: 200, json: async () => next, text: async () => JSON.stringify(next)};
        });
        return {fn, calls};
    }

    it("logs in, mints, then reads the share link back from the library list", async () => {
        const {fn, calls} = mockFetch([
            {result: "success", member: {tableId: 159810}, token: "tok"},
            {result: "success", tableId: 1353046},
            {result: "success", list: [
                {tableId: 999, shareRecipeLink: "https://share-h5.xbloom.com/?id=wrong"},
                {tableId: 1353046, shareRecipeLink: "https://share-h5.xbloom.com/?id=right"}
            ]}
        ]);
        global.fetch = fn as never;

        const result = await mintRecipe(payload, {email: "e", password: "p"});

        expect(result).toEqual({tableId: 1353046, url: "https://share-h5.xbloom.com/?id=right"});
        expect(calls.map((c) => c.url)).toEqual([
            "https://client-api.xbloom.com/tMemberLogin.thtml",
            "https://client-api.xbloom.com/tuRecipeAdd.tuhtml",
            "https://client-api.xbloom.com/tuMyTeaRecipeCreated.tuhtml"
        ]);
    });

    it("sends the login body as plain JSON and the others encrypted", async () => {
        const {fn, calls} = mockFetch([
            {result: "success", member: {tableId: 1}, token: "tok"},
            {result: "success", tableId: 5},
            {result: "success", list: [{tableId: 5, shareRecipeLink: "https://x/?id=a"}]}
        ]);
        global.fetch = fn as never;
        await mintRecipe(payload, {email: "e", password: "p"});

        expect(JSON.parse(calls[0].body)).toMatchObject({email: "e", password: "p"});
        // The others are a JSON-encoded base64 string, not an object.
        expect(typeof JSON.parse(calls[1].body)).toBe("string");
        expect(typeof JSON.parse(calls[2].body)).toBe("string");
    });

    it("throws when the login is rejected", async () => {
        const {fn} = mockFetch([{result: "fail", info: "bad password"}]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "p"}))
            .rejects.toThrow("login rejected");
    });

    it("throws when the mint is rejected", async () => {
        const {fn} = mockFetch([
            {result: "success", member: {tableId: 1}, token: "tok"},
            {result: "fail", info: "nope"}
        ]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "p"}))
            .rejects.toThrow("mint rejected");
    });

    it("throws when the new row is not in the library list", async () => {
        const {fn} = mockFetch([
            {result: "success", member: {tableId: 1}, token: "tok"},
            {result: "success", tableId: 5},
            {result: "success", list: [{tableId: 4, shareRecipeLink: "https://x/?id=a"}]}
        ]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "p"}))
            .rejects.toThrow("share link not found");
    });

    it("never puts the password in an error message", async () => {
        const {fn} = mockFetch([{result: "fail"}]);
        global.fetch = fn as never;
        await expect(mintRecipe(payload, {email: "e", password: "hunter2"}))
            .rejects.toThrow(/^(?!.*hunter2).*$/);
    });
});
