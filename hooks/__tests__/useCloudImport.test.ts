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
    pourCount: 1,
    grinderSize: 60,
    isSetGrinderSize: 1,
    rpm: 100,
    cupType: 1,
    podsVo: {id: "AB12CD"},
    pourList: [
        {volume: 288, temperature: 93, pattern: 3, flowRate: 3, pausing: 30, isEnableVibrationBefore: 0, isEnableVibrationAfter: 0},
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
});
