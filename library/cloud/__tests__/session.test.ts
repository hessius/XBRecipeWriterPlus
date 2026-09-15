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
