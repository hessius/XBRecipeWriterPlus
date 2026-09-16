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
        // `clearAllMocks` clears calls but keeps implementations, so a test
        // that makes one of these reject would otherwise poison every test
        // after it. Both defaults are restated rather than assumed.
        jest.clearAllMocks();
        mockLoad.mockResolvedValue(null);
        mockSignOut.mockResolvedValue(undefined);
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

    /**
     * The one row a tick cannot help.
     *
     * Two local recipes carry this cloud id, so the plan names no local to
     * replace. Before this guard the row was an ordinary tickable one: ticking
     * it took the insert path and added a *third* recipe carrying the same
     * id, making the ambiguity worse and permanent. Refusing to pre-tick it
     * was never enough, because the tick was still there to give.
     */
    const twoCopies = () => {
        const first = new Recipe();
        first.uuid = "local-1";
        first.cloudId = 1;
        const second = new Recipe();
        second.uuid = "local-2";
        second.cloudId = 1;
        return [first, second];
    };

    it("refuses to tick a row that names no recipe to replace", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);
        const d = {...deps(), localRecipes: twoCopies};

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        expect(result.current.plan!.entries[0].selectable).toBe(false);
        await act(async () => {
            result.current.toggle(1);
        });
        expect(result.current.plan!.entries[0].selected).toBe(false);
    });

    /** The consequence of the guard above: no third copy can be written. */
    it("writes nothing when the only row is one it cannot place", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);
        const d = {...deps(), localRecipes: twoCopies};

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        await act(async () => {
            result.current.toggle(1);
        });
        await act(async () => {
            await result.current.confirm();
        });

        expect(d.saveRecipes).not.toHaveBeenCalled();
        expect(d.replaceRecipe).not.toHaveBeenCalled();
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

    /**
     * The same promise, one step further on. Ticking an `edited` box *is* the
     * consent -- §4.4 is explicit that there is no second dialog -- so this is
     * a path a user reaches deliberately, and the write it produces must
     * preserve the recipe's identity. It did not: the entry named a local uuid
     * to replace while carrying a freshly minted one, so the row stayed keyed
     * on the old uuid and held a blob claiming the new one, and the recipe
     * forked in two on the next save.
     */
    it("replaces an edited recipe in place when the user says so", async () => {
        const edited = localFrom();
        edited.name = "my own notes";

        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);
        const d = {...deps(), localRecipes: () => [edited]};

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));
        expect(result.current.plan!.entries[0].status).toBe("edited");

        await act(async () => {
            result.current.toggle(1);
        });
        await act(async () => {
            await result.current.confirm();
        });

        const [uuid, written] = d.replaceRecipe.mock.calls[0] as [string, Recipe];
        expect(uuid).toBe(edited.uuid);
        // The row is found by the uuid passed and stores the recipe's own. The
        // two must agree or the recipe splits.
        expect(written.uuid).toBe(edited.uuid);
        expect(d.saveRecipes).not.toHaveBeenCalled();
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
     * The write-once flag belongs to the plan, not to the tap: a user who
     * imports, refreshes, and imports again is doing something legitimate,
     * and a flag that only cleared on unmount would silently do nothing the
     * second time while still saying `done`.
     */
    it("writes again after a refresh brings a new plan", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row]);
        const d = deps();

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));
        await act(async () => {
            await result.current.confirm();
        });
        expect(d.saveRecipes).toHaveBeenCalledTimes(1);

        await act(async () => {
            await result.current.refresh();
        });
        await waitFor(() => expect(result.current.status).toBe("choosing"));
        await act(async () => {
            await result.current.confirm();
        });

        expect(d.saveRecipes).toHaveBeenCalledTimes(2);
    });

    it("counts every recipe that landed, not every write", async () => {
        // One save call carries all the fresh recipes, so a count taken from
        // the call rather than its contents would read 1 after importing a
        // whole account.
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([
            row,
            {...row, tableId: 2, theName: "Peru"},
            {...row, tableId: 3, theName: "Yirgacheffe"},
        ]);
        const d = deps();

        const {result} = await renderHook(() => useCloudImport(d));
        await waitFor(() => expect(result.current.status).toBe("choosing"));
        await act(async () => {
            await result.current.confirm();
        });

        await waitFor(() => expect(result.current.status).toBe("done"));
        expect(result.current.imported).toBe(3);
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

    /**
     * Parity with the restore path above. A sign-in is the slowest call in the
     * flow and the easiest one to walk away from, so the guard after it earns
     * the same proof rather than being taken on trust.
     */
    it("does no work when a sign-in lands after the screen is gone", async () => {
        let release: (s: typeof session) => void = () => {};
        mockSignIn.mockReturnValue(new Promise((resolve) => {
            release = resolve as (s: typeof session) => void;
        }) as ReturnType<typeof signIn>);
        mockFetch.mockResolvedValue([row]);

        const {result, unmount} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("signedOut"));

        await act(async () => {
            void result.current.submitSignIn("a@b.c", "secret");
        });
        await waitFor(() => expect(result.current.status).toBe("signingIn"));
        await act(async () => {
            unmount();
        });
        await act(async () => {
            release(session);
        });

        // The listing fetch is the first thing a surviving sign-in would do.
        expect(mockFetch).not.toHaveBeenCalled();
    });

    /**
     * The screen reports the outcome from this return value rather than from
     * state, because after the await the count it captured at render is one
     * import out of date. So the return value is a contract, not a
     * convenience, and it is asserted here rather than only through a mock.
     */
    it("hands back what it imported", async () => {
        mockLoad.mockResolvedValue(session);
        mockFetch.mockResolvedValue([row, {...row, tableId: 2, theName: "Peru"}]);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("choosing"));

        let outcome: unknown;
        await act(async () => {
            outcome = await result.current.confirm();
        });

        expect(outcome).toEqual({imported: 2, failed: false});
    });

    it("says it failed while still naming what landed", async () => {
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

        let outcome: unknown;
        await act(async () => {
            outcome = await result.current.confirm();
        });

        expect(outcome).toEqual({imported: 1, failed: true});
    });

    it("hands back nothing when there was no plan to import", async () => {
        // The screen distinguishes this from an outcome: it must not toast
        // "Imported 0 recipes" at someone who never started an import.
        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("signedOut"));

        let outcome: unknown = "untouched";
        await act(async () => {
            outcome = await result.current.confirm();
        });

        expect(outcome).toBeNull();
    });
    /**
     * The race a boolean could not see.
     *
     * Signing out while the listing is in flight leaves the screen present, so
     * a "has the screen gone" flag stays clear and the abandoned fetch walks
     * through the guard: it sets a plan and `choosing` on top of a user who
     * has just signed out, handing back a list of their recipes after the
     * session was deleted.
     */
    it("does not list a signed-out user back in", async () => {
        let release: (rows: unknown[]) => void = () => {};
        mockLoad.mockResolvedValue(session);
        mockFetch.mockReturnValue(new Promise((resolve) => {
            release = resolve as (rows: unknown[]) => void;
        }) as ReturnType<typeof fetchCloudRecipes>);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("listing"));

        await act(async () => {
            await result.current.forgetAccount();
        });
        await act(async () => {
            release([row]);
        });

        expect(result.current.status).toBe("signedOut");
        expect(result.current.plan).toBeNull();
    });

    /** The same race, seen from the failure side of the fetch. */
    it("does not show a listing error to a signed-out user", async () => {
        let reject: (reason: unknown) => void = () => {};
        mockLoad.mockResolvedValue(session);
        mockFetch.mockReturnValue(new Promise((_resolve, rej) => {
            reject = rej;
        }) as ReturnType<typeof fetchCloudRecipes>);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("listing"));

        await act(async () => {
            await result.current.forgetAccount();
        });
        await act(async () => {
            reject(new Error("offline"));
        });

        expect(result.current.status).toBe("signedOut");
        expect(result.current.error).toBeNull();
    });

    /**
     * A second listing retires the first, so the slower of two overlapping
     * refreshes cannot overwrite the newer answer.
     */
    it("keeps the newer of two overlapping listings", async () => {
        mockLoad.mockResolvedValue(session);
        let releaseFirst: (rows: unknown[]) => void = () => {};
        mockFetch.mockReturnValueOnce(new Promise((resolve) => {
            releaseFirst = resolve as (rows: unknown[]) => void;
        }) as ReturnType<typeof fetchCloudRecipes>);
        mockFetch.mockResolvedValue([row, {...row, tableId: 2}]);

        const {result} = await renderHook(() => useCloudImport(deps()));
        await waitFor(() => expect(result.current.status).toBe("listing"));

        await act(async () => {
            await result.current.refresh();
        });
        await waitFor(() => expect(result.current.plan?.entries).toHaveLength(2));

        await act(async () => {
            releaseFirst([row]);
        });

        expect(result.current.plan?.entries).toHaveLength(2);
    });

    /**
     * An expired token with a keychain that will not let go of it.
     *
     * `signOut` propagates that failure deliberately, because a user who
     * believes they signed out and did not is the one failure with a privacy
     * cost. That reasoning is about a sign-out the user asked for; this is an
     * expiry, and the token is dead whether or not the keychain drops it.
     * Letting the rejection escape stranded the screen on `listing` with an
     * unhandled rejection behind it, which is the one outcome with no way out.
     */
    it("signs out of an expired session even when the keychain refuses", async () => {
        const {CloudError} = jest.requireActual("@/library/cloud/transport");
        mockLoad.mockResolvedValue(session);
        mockFetch.mockRejectedValue(new CloudError("unauthorised", "stale"));
        mockSignOut.mockRejectedValue(new Error("keychain locked"));

        const {result} = await renderHook(() => useCloudImport(deps()));

        await waitFor(() => expect(result.current.status).toBe("signedOut"));
        expect(result.current.session).toBeNull();
    });
});
