import {act, renderHook} from "@testing-library/react-native";

import {ASK_BACKSTOP_MS, NO_ANSWER_MS, useRefreshRequest}
    from "@/hooks/useRefreshRequest";

/** A promise plus the handle to settle it whenever the test chooses. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return {promise, resolve, reject};
}

describe("useRefreshRequest", () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it("starts idle", async () => {
        const {result} = await renderHook(
            () => useRefreshRequest(() => Promise.resolve(true))
        );

        expect(result.current.state).toBe("idle");
    });

    it("asks the machine when pressed, and says it is asking", async () => {
        const ask = jest.fn(() => deferred<boolean>().promise);
        const {result} = await renderHook(() => useRefreshRequest(ask));

        await act(async () => { result.current.press(); });

        expect(ask).toHaveBeenCalledTimes(1);
        expect(result.current.state).toBe("asking");
    });

    it("goes back to idle when the machine answers", async () => {
        const {result} = await renderHook(
            () => useRefreshRequest(() => Promise.resolve(true))
        );

        await act(async () => { result.current.press(); });

        expect(result.current.state).toBe("idle");
    });

    it("waits as long as the machine is allowed to take", async () => {
        // The regression test for the reported bug. `askHowItIsDoing` may
        // legitimately spend about 12.2 s -- a handshake, a frame gap, three
        // attempts of INFO_WAIT_MS and the gaps between them. The control used
        // to give up at six seconds, say NO ANSWER, and then have the answer
        // arrive: exactly what device testing saw. Eleven seconds is inside
        // the machine's budget, so it is a slow yes and nothing else.
        const answer = deferred<boolean>();
        const {result} = await renderHook(() => useRefreshRequest(() => answer.promise));

        await act(async () => { result.current.press(); });
        await act(async () => { jest.advanceTimersByTime(11_000); });

        expect(result.current.state).toBe("asking");

        await act(async () => { answer.resolve(true); });

        expect(result.current.state).toBe("idle");
    });

    it("says NO ANSWER when the machine does not answer, then offers itself again",
       async () => {
        const {result} = await renderHook(
            () => useRefreshRequest(() => Promise.resolve(false))
        );

        await act(async () => { result.current.press(); });
        expect(result.current.state).toBe("noAnswer");

        await act(async () => { jest.advanceTimersByTime(NO_ANSWER_MS); });

        expect(result.current.state).toBe("idle");
    });

    it("treats a refused question as no answer", async () => {
        // A radio that will not carry the frame tells the user nothing useful
        // about the machine, so it is given the same words rather than an
        // unhandled rejection.
        const {result} = await renderHook(
            () => useRefreshRequest(() => Promise.reject(new Error("no radio")))
        );

        await act(async () => { result.current.press(); });

        expect(result.current.state).toBe("noAnswer");
    });

    it("gives up on a promise that never settles at all", async () => {
        const {result} = await renderHook(
            () => useRefreshRequest(() => deferred<boolean>().promise)
        );

        await act(async () => { result.current.press(); });
        await act(async () => { jest.advanceTimersByTime(ASK_BACKSTOP_MS); });

        expect(result.current.state).toBe("noAnswer");
    });

    it("ignores an old request settling after a newer one replaced it", async () => {
        const first  = deferred<boolean>();
        const second = deferred<boolean>();
        const asks   = [first, second];
        let n = 0;
        const {result} = await renderHook(
            () => useRefreshRequest(() => asks[n++].promise)
        );

        await act(async () => { result.current.press(); });
        await act(async () => { result.current.press(); });
        // The first request fails, late, after the second has taken over. If it
        // were allowed to land the control would say NO ANSWER about a question
        // that is still outstanding.
        await act(async () => { first.resolve(false); });

        expect(result.current.state).toBe("asking");

        await act(async () => { second.resolve(true); });

        expect(result.current.state).toBe("idle");
    });
});
