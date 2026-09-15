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
