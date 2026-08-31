import handler, {respond} from "../share";

function request(body: unknown, headers: Record<string, string> = {}) {
    return new Request("https://x/api/share", {
        method:  "POST",
        headers: {"content-type": "application/json", ...headers},
        body:    JSON.stringify(body)
    });
}

function validPayload() {
    return {
        theName: "T", theColor: "#C9D5B8", dose: 18, grandWater: 16, grinderSize: 55,
        isSetGrinderSize: 1, rpm: 90, cupType: 2, bypassTemp: 85, bypassVolume: 0,
        subSetType: 2, theSubsetId: 0, appPlace: [4], isShortcuts: 2,
        isEnableBypassWater: 2, adaptedModel: 1, pourCount: 1,
        pourDataJSONStr: JSON.stringify([{
            theName: "Bloom", volume: 288, temperature: 93, flowRate: 3.5,
            pattern: 1, pausing: 0, isEnableVibrationBefore: 2, isEnableVibrationAfter: 2
        }])
    };
}

function okFetch() {
    return jest.fn(async (url: string) => ({
        ok: true, status: 200,
        json: async () => {
            if (url.endsWith("tMemberLogin.thtml")) {
                return {result: "success", member: {tableId: 1}, token: "tok"};
            }
            if (url.endsWith("tuRecipeAdd.tuhtml")) {
                return {result: "success", tableId: 42};
            }
            return {result: "success",
                    list: [{tableId: 42, shareRecipeLink: "https://share-h5.xbloom.com/?id=ok"}]};
        }
    }));
}

describe("share handler", () => {
    beforeEach(() => {
        process.env.XBLOOM_EMAIL = "e";
        process.env.XBLOOM_PASSWORD = "hunter2";
        process.env.SHARE_IP_SALT = "salt";
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("refuses anything that is not a POST", async () => {
        const res = await respond(new Request("https://x/api/share", {method: "GET"}));
        expect(res.status).toBe(405);
        await expect(res.json()).resolves.toEqual({error: "method"});
    });

    it("mints and returns the url", async () => {
        global.fetch = okFetch() as never;
        const res = await respond(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.4"}));
        expect(res.status).toBe(200);
        await expect(res.json()).resolves
            .toEqual({tableId: 42, url: "https://share-h5.xbloom.com/?id=ok"});
    });

    it("rejects a malformed payload with only a machine-readable error code", async () => {
        global.fetch = okFetch() as never;
        const res = await respond(request(
            {payload: {...validPayload(), dose: 9999}}, {"x-forwarded-for": "1.2.3.5"}
        ));
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toMatchObject({error: "invalid"});
    });

    it("rejects a body that is not JSON", async () => {
        const res = await respond(new Request("https://x/api/share", {
            method: "POST", headers: {"content-type": "application/json"}, body: "{{{"
        }));
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toMatchObject({error: "invalid"});
    });

    it("returns 503 when the credentials are not configured", async () => {
        delete process.env.XBLOOM_EMAIL;
        const res = await respond(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.6"}));
        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toEqual({error: "unavailable"});
    });

    it("returns 429 once an IP is over its allowance", async () => {
        global.fetch = okFetch() as never;
        const ip = {"x-forwarded-for": "9.9.9.9"};
        for (let i = 0; i < 10; i++) {
            expect((await respond(request({payload: validPayload()}, ip))).status).toBe(200);
        }
        const res = await respond(request({payload: validPayload()}, ip));
        expect(res.status).toBe(429);
        await expect(res.json()).resolves.toEqual({error: "limited", scope: "ip"});
    });

    it("returns 502 when the upstream mint fails", async () => {
        global.fetch = jest.fn(async () => ({
            ok: true, status: 200, json: async () => ({result: "fail"})
        })) as never;
        const res = await respond(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.7"}));
        expect(res.status).toBe(502);
        await expect(res.json()).resolves.toEqual({error: "upstream"});
    });

    it("never echoes the recipe or a credential back to the client", async () => {
        global.fetch = jest.fn(async () => ({
            ok: true, status: 200, json: async () => ({result: "fail", info: "p"})
        })) as never;
        const res = await respond(request({payload: validPayload()}, {"x-forwarded-for": "1.2.3.8"}));
        const text = await res.text();
        expect(text).not.toContain("theName");
        expect(text).not.toContain("XBLOOM");
        expect(text).not.toContain("hunter2");
        expect(text).not.toContain("tok");
    });

    it("hashes the forwarded IP before rate limiting and logging", async () => {
        global.fetch = okFetch() as never;
        const rawIp = "2.3.4.5";
        const res = await respond(request({payload: validPayload()}, {"x-forwarded-for": rawIp}));
        expect(res.status).toBe(200);
        for (const spy of [console.log, console.warn, console.error] as jest.MockedFunction<typeof console.log>[]) {
            expect(spy.mock.calls.flat().join(" ")).not.toContain(rawIp);
        }
    });
});

describe("the Node adapter", () => {
    // Vercel's Node runtime calls the default export with `(req, res)`. A
    // web-standard default export deploys without complaint and then never
    // ends the socket, so every request hangs until a 504. Nothing in the
    // suite above would notice, because it all calls `respond` directly.
    function nodeRequest(method: string, body?: string, headers: Record<string, string> = {}) {
        const chunks = body === undefined ? [] : [Buffer.from(body)];
        return {
            method,
            url:     "/api/share",
            headers: {"content-type": "application/json", ...headers},
            async *[Symbol.asyncIterator]() {
                yield* chunks;
            }
        };
    }

    function nodeResponse() {
        return {
            statusCode: 0,
            headers:    {} as Record<string, string>,
            body:       "",
            ended:      false,
            setHeader(name: string, value: string) { this.headers[name] = value; },
            end(chunk: Buffer) { this.body = chunk.toString("utf8"); this.ended = true; }
        };
    }

    it("ends the response instead of returning one", async () => {
        const res = nodeResponse();
        await handler(nodeRequest("GET") as any, res as any);
        expect(res.ended).toBe(true);
        expect(res.statusCode).toBe(405);
        expect(JSON.parse(res.body)).toEqual({error: "method"});
        expect(res.headers["content-type"]).toBe("application/json");
    });

    it("passes the body and headers through", async () => {
        const res = nodeResponse();
        await handler(
            nodeRequest("POST", JSON.stringify({payload: {}}),
                        {"x-forwarded-for": "9.9.9.9"}) as any,
            res as any
        );
        expect(res.ended).toBe(true);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe("invalid");
    });
});
