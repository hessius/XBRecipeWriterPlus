/**
 * The rail's search state.
 *
 * `renderHook` and `act` are asynchronous in this repository; a missing `await`
 * runs the assertions against a hook that has not settled and passes for the
 * wrong reason.
 */
import {act, renderHook} from "@testing-library/react-native";

import {useRailSearch} from "@/hooks/useRailSearch";

describe("useRailSearch", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("expands on demand and holds what is typed", async () => {
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));

        expect(result.current.expanded).toBe(false);
        await act(async () => result.current.onExpand());
        expect(result.current.expanded).toBe(true);

        await act(async () => result.current.onChangeText("eth"));
        expect(result.current.text).toBe("eth");
    });

    it("debounces the term before it reaches the owner", async () => {
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));

        await act(async () => result.current.onChangeText("eth"));

        // One millisecond short pins the constant. A bare wait would tolerate any
        // debounce up to the test's timeout and prove nothing.
        await act(async () => {
            jest.advanceTimersByTime(599);
        });
        expect(onTerm).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(1);
        });
        expect(onTerm).toHaveBeenCalledTimes(1);
        expect(onTerm).toHaveBeenCalledWith("eth");
    });

    it("restarts the debounce on each keystroke", async () => {
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));

        for (const value of ["e", "et", "eth"]) {
            await act(async () => result.current.onChangeText(value));
            await act(async () => {
                jest.advanceTimersByTime(400);
            });
        }
        expect(onTerm).not.toHaveBeenCalled();

        await act(async () => {
            jest.advanceTimersByTime(600);
        });
        expect(onTerm).toHaveBeenCalledTimes(1);
        expect(onTerm).toHaveBeenCalledWith("eth");
    });

    it("collapses and drops the term at once when cleared", async () => {
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));

        await act(async () => result.current.onChangeText("eth"));
        await act(async () => {
            jest.advanceTimersByTime(600);
        });
        expect(result.current.active).toBe(true);

        await act(async () => result.current.onClear());

        // The drop is immediate, not debounced: no clock advance stands between
        // the clear and the empty term.
        expect(onTerm).toHaveBeenLastCalledWith("");
        expect(result.current.expanded).toBe(false);
        expect(result.current.text).toBe("");
        expect(result.current.active).toBe(false);
    });

    it("marks a held term active from the first keystroke, not the debounce", async () => {
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));

        await act(async () => result.current.onChangeText("e"));
        // Still inside the debounce window: the owner has not been told yet, but
        // the chip must already read as filtered.
        expect(onTerm).not.toHaveBeenCalled();
        expect(result.current.active).toBe(true);
    });
});
