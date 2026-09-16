/**
 * `renderHook` is asynchronous in this repository, like `render` and
 * `fireEvent`. Without the `await`, `result` is undefined.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useCloudSession} from "@/hooks/useCloudSession";

let mockFocusCleanup: (() => void) | undefined;
let mockRefocus: (() => void) | undefined;
jest.mock("expo-router", () => ({
    ...jest.requireActual("expo-router"),
    useFocusEffect: (cb: () => void | (() => void)) => {
        const {useEffect} = jest.requireActual("react");
        useEffect(() => {
            // Kept so a test can drive a blur and a refocus by hand. The real
            // navigator runs the callback again on every return to the screen,
            // which is the cycle the hook exists to survive.
            mockRefocus = () => {
                mockFocusCleanup = (cb() ?? undefined) as (() => void) | undefined;
            };
            mockRefocus();
            return () => mockFocusCleanup?.();
        }, [cb]);
    }
}));

const mockLoadSession = jest.fn(async () => null as unknown);
const mockSignOut = jest.fn(async () => {});
jest.mock("@/library/cloud/session", () => ({
    loadSession: () => mockLoadSession(),
    signOut:     () => mockSignOut()
}));

const sam = {memberId: 7, token: "t", email: "sam@example.com"};

beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCleanup = undefined;
    mockRefocus = undefined;
    mockLoadSession.mockResolvedValue(null);
});

it("starts holding nothing, so Settings never flashes an account nobody has", async () => {
    const {result} = await renderHook(() => useCloudSession());

    expect(result.current.session).toBeNull();
});

it("picks up the stored account", async () => {
    mockLoadSession.mockResolvedValue(sam);

    const {result} = await renderHook(() => useCloudSession());

    await waitFor(() => expect(result.current.session).toEqual(sam));
});

it("forgets the account locally, with no endpoint to tell", async () => {
    mockLoadSession.mockResolvedValue(sam);
    const {result} = await renderHook(() => useCloudSession());
    await waitFor(() => expect(result.current.session).toEqual(sam));

    await act(async () => {
        await result.current.forget();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(result.current.session).toBeNull();
});

it("drops a load that lands after the screen has gone", async () => {
    // The guard cannot be proved by the absence of a React warning: React 18
    // removed the setState-after-unmount warning, so asserting on console.error
    // would pass whether or not the guard were there. What is provable is that
    // the state the late load would have written is not written.
    let land: (value: unknown) => void = () => {};
    mockLoadSession.mockReturnValue(new Promise(resolve => {
        land = resolve;
    }));

    const {result} = await renderHook(() => useCloudSession());
    // The focus effect's own cleanup is what marks the hook gone, and it runs
    // on blur as well as unmount -- someone who walks away mid-load.
    await act(async () => {
        mockFocusCleanup?.();
    });

    await act(async () => {
        land(sam);
    });

    expect(result.current.session).toBeNull();
});

it("picks the account up again on the way back", async () => {
    // The whole reason it reloads on focus rather than on mount: the way the
    // account changes is that the user leaves for the import route, signs in
    // there, and returns. A hook that only looked once would still be offering
    // Sign in to somebody who had just done it.
    const {result} = await renderHook(() => useCloudSession());
    await waitFor(() => expect(result.current.session).toBeNull());

    await act(async () => {
        mockFocusCleanup?.();
    });
    mockLoadSession.mockResolvedValue(sam);
    await act(async () => {
        mockRefocus?.();
    });

    await waitFor(() => expect(result.current.session).toEqual(sam));
});

it("lets the visit they came back to win, not the one they walked out of", async () => {
    // A load from the abandoned visit can land after the new one. A guard that
    // only asked "is the screen focused now" would wave it through, because
    // coming back has focused it again -- and it would overwrite the newer
    // answer with a stale one.
    let landStale: (value: unknown) => void = () => {};
    mockLoadSession.mockReturnValueOnce(new Promise(resolve => {
        landStale = resolve;
    }));

    const {result} = await renderHook(() => useCloudSession());
    await act(async () => {
        mockFocusCleanup?.();
    });

    mockLoadSession.mockResolvedValue(null);
    await act(async () => {
        mockRefocus?.();
    });
    await waitFor(() => expect(result.current.session).toBeNull());

    await act(async () => {
        landStale(sam);
    });

    expect(result.current.session).toBeNull();
});

it("does not sign them back in with a load that was already in flight", async () => {
    let land: (value: unknown) => void = () => {};
    mockLoadSession.mockReturnValue(new Promise(resolve => {
        land = resolve;
    }));
    const {result} = await renderHook(() => useCloudSession());

    await act(async () => {
        await result.current.forget();
    });
    await act(async () => {
        land(sam);
    });

    expect(result.current.session).toBeNull();
});

it("holds on to the account when the keychain refused to let go of it", async () => {
    // `signOut` is undefended on purpose. Clearing the session anyway would
    // show a signed-out screen over a token still on the device, which is the
    // one failure here with a privacy cost.
    mockLoadSession.mockResolvedValue(sam);
    mockSignOut.mockRejectedValue(new Error("keychain locked"));
    const {result} = await renderHook(() => useCloudSession());
    await waitFor(() => expect(result.current.session).toEqual(sam));

    await act(async () => {
        await expect(result.current.forget()).rejects.toThrow("keychain locked");
    });

    expect(result.current.session).toEqual(sam);
});

it("drops a clearing that lands after they walked away", async () => {
    mockLoadSession.mockResolvedValue(sam);
    const {result} = await renderHook(() => useCloudSession());
    await waitFor(() => expect(result.current.session).toEqual(sam));

    let finishSignOut: () => void = () => {};
    mockSignOut.mockReturnValue(new Promise<void>(resolve => {
        finishSignOut = resolve;
    }));

    let forgetting: Promise<void> | undefined;
    await act(async () => {
        forgetting = result.current.forget();
    });
    await act(async () => {
        mockFocusCleanup?.();
    });
    await act(async () => {
        finishSignOut();
        await forgetting;
    });

    // The screen is gone; writing to it would be writing on behalf of a hook
    // nobody is watching.
    expect(result.current.session).toEqual(sam);
});
