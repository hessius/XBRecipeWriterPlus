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
        // Held upper case: the field draws what this returns, and the rail
        // around it is an all-caps readout.
        expect(result.current.text).toBe("ETH");
    });

    it("closes an empty field that has been walked away from, and says so", async () => {
        const {result} = await renderHook(() => useRailSearch(jest.fn()));
        await act(async () => result.current.onExpand());

        let closed = false;
        await act(async () => { closed = result.current.onBlur(); });

        expect(closed).toBe(true);
        expect(result.current.expanded).toBe(false);
    });

    it("keeps a field that holds a term when the keyboard leaves", async () => {
        // A user who typed a term and then looked at the results still has one.
        // Closing here would flick the library back to unfiltered every time the
        // keyboard went away.
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));
        await act(async () => result.current.onExpand());
        await act(async () => result.current.onChangeText("eth"));

        let closed = true;
        await act(async () => { closed = result.current.onBlur(); });

        expect(closed).toBe(false);
        expect(result.current.expanded).toBe(true);
        expect(result.current.text).toBe("ETH");
    });

    it("drops a backspaced term the moment the field closes", async () => {
        // The gap between the two: backspacing to empty arms a debounced empty
        // term, and blurring closes the field at once. Left alone, the field is
        // gone while the old term is still filtering the library for the rest of
        // the debounce -- a narrowed list with nothing on screen that explains
        // it, and nothing left to clear. Closing and unfiltering are one action,
        // exactly as they are for the clear button.
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));
        await act(async () => result.current.onExpand());
        await act(async () => result.current.onChangeText("eth"));
        await act(async () => { jest.advanceTimersByTime(600); });
        expect(onTerm).toHaveBeenLastCalledWith("eth");

        await act(async () => result.current.onChangeText(""));
        let closed = false;
        await act(async () => { closed = result.current.onBlur(); });

        expect(closed).toBe(true);
        // Emitted on the way out, not 600 ms later.
        expect(onTerm).toHaveBeenLastCalledWith("");
        const callsAtClose = onTerm.mock.calls.length;

        // And the cancelled timer does not arrive afterwards to repeat itself.
        await act(async () => { jest.advanceTimersByTime(600); });
        expect(onTerm).toHaveBeenCalledTimes(callsAtClose);
    });

    it("treats a field holding only spaces as empty", async () => {
        const {result} = await renderHook(() => useRailSearch(jest.fn()));
        await act(async () => result.current.onExpand());
        await act(async () => result.current.onChangeText("   "));

        let closed = false;
        await act(async () => { closed = result.current.onBlur(); });

        expect(closed).toBe(true);
        expect(result.current.expanded).toBe(false);
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

    it("cannot be overtaken by a keystroke still in flight when cleared", async () => {
        const onTerm = jest.fn();
        const {result} = await renderHook(() => useRailSearch(onTerm));

        await act(async () => result.current.onChangeText("eth"));
        await act(async () => {
            jest.advanceTimersByTime(300);
        });

        // Cleared mid-window. If the armed timer survived, it would land after
        // the clear and leave the library filtered by a term the user deleted,
        // with nothing on screen saying so.
        await act(async () => result.current.onClear());
        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        expect(onTerm).toHaveBeenCalledTimes(1);
        expect(onTerm).toHaveBeenCalledWith("");
    });

    it("does not fire into an owner that has gone away", async () => {
        const onTerm = jest.fn();
        const {result, unmount} = await renderHook(() => useRailSearch(onTerm));

        await act(async () => result.current.onChangeText("eth"));
        // Act-wrapped like every other interaction here. Called bare, the
        // cleanup has not run by the time the clock is advanced and the test
        // fails against a hook that is in fact correct.
        await act(async () => {
            unmount();
        });
        await act(async () => {
            jest.advanceTimersByTime(600);
        });

        expect(onTerm).not.toHaveBeenCalled();
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
