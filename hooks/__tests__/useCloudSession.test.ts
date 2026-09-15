/**
 * `renderHook` is asynchronous in this repository, like `render` and
 * `fireEvent`. Without the `await`, `result` is undefined.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useCloudSession} from "@/hooks/useCloudSession";

let focusCleanup: (() => void) | undefined;
jest.mock("expo-router", () => ({
    ...jest.requireActual("expo-router"),
    useFocusEffect: (cb: () => void | (() => void)) => {
        const {useEffect} = jest.requireActual("react");
        useEffect(() => {
            const cleanup = cb();
            focusCleanup = typeof cleanup === "function" ? cleanup : undefined;
            return cleanup;
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
    focusCleanup = undefined;
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
        focusCleanup?.();
    });

    await act(async () => {
        land(sam);
    });

    expect(result.current.session).toBeNull();
});
