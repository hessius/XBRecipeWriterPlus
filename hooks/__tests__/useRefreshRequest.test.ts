import {act, renderHook} from "@testing-library/react-native";

import {ASK_TIMEOUT_MS, NO_ANSWER_MS, useRefreshRequest}
    from "@/hooks/useRefreshRequest";

describe("useRefreshRequest", () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it("starts idle", async () => {
        const {result} = await renderHook(() => useRefreshRequest(1000, () => undefined));

        expect(result.current.state).toBe("idle");
    });

    it("asks the machine when pressed", async () => {
        const ask = jest.fn();
        const {result} = await renderHook(() => useRefreshRequest(1000, ask));

        await act(async () => { result.current.press(); });

        expect(ask).toHaveBeenCalledTimes(1);
        expect(result.current.state).toBe("asking");
    });

    it("goes back to idle when the machine actually answers", async () => {
        const {result, rerender} = await renderHook(
            ({at}: {at: number}) => useRefreshRequest(at, () => undefined),
            {initialProps: {at: 1000}}
        );

        await act(async () => { result.current.press(); });
        expect(result.current.state).toBe("asking");

        await rerender({at: 2000});

        expect(result.current.state).toBe("idle");
    });

    it("stays asking while the reading is unchanged", async () => {
        const {result, rerender} = await renderHook(
            ({at}: {at: number}) => useRefreshRequest(at, () => undefined),
            {initialProps: {at: 1000}}
        );

        await act(async () => { result.current.press(); });
        await rerender({at: 1000});

        expect(result.current.state).toBe("asking");
    });

    it("gives up after the timeout", async () => {
        const {result} = await renderHook(() => useRefreshRequest(1000, () => undefined));

        await act(async () => { result.current.press(); });
        await act(async () => { jest.advanceTimersByTime(ASK_TIMEOUT_MS); });

        expect(result.current.state).toBe("noAnswer");
    });

    it("does not sit on no answer forever", async () => {
        const {result} = await renderHook(() => useRefreshRequest(1000, () => undefined));

        await act(async () => { result.current.press(); });
        await act(async () => { jest.advanceTimersByTime(ASK_TIMEOUT_MS); });
        await act(async () => { jest.advanceTimersByTime(NO_ANSWER_MS); });

        expect(result.current.state).toBe("idle");
    });

    it("does not give up on a reading that arrived just in time", async () => {
        const {result, rerender} = await renderHook(
            ({at}: {at: number}) => useRefreshRequest(at, () => undefined),
            {initialProps: {at: 1000}}
        );

        await act(async () => { result.current.press(); });
        await rerender({at: 2000});
        await act(async () => { jest.advanceTimersByTime(ASK_TIMEOUT_MS * 2); });

        expect(result.current.state).toBe("idle");
    });

    it("goes back to asking and calls ask again after an answer arrives and the user presses again", async () => {
        // After an answer, `request` is left as a stale non-null asking record
        // while `state` is derived as `idle`. Pressing again must overwrite that
        // stale record so the next change in `askedAt` is measured from the new
        // press — not from the previous one — and `ask` must be called again.
        const ask = jest.fn();
        const {result, rerender} = await renderHook(
            ({at}: {at: number}) => useRefreshRequest(at, ask),
            {initialProps: {at: 1000}}
        );

        await act(async () => { result.current.press(); });
        await rerender({at: 2000});
        expect(result.current.state).toBe("idle");

        await act(async () => { result.current.press(); });
        expect(result.current.state).toBe("asking");
        expect(ask).toHaveBeenCalledTimes(2);
    });
});
