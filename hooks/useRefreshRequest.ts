import {useEffect, useState} from "react";

export type RefreshState = "idle" | "asking" | "noAnswer";

/** How long the machine is given to answer before we say it has not. */
export const ASK_TIMEOUT_MS = 6000;

/** How long `NO ANSWER` is shown before the control offers itself again. */
export const NO_ANSWER_MS = 4000;

/**
 * The refresh control's state, over the age of the reading it refreshes.
 *
 * `askedAt` is the whole input. Pressing does not make the reading fresh --
 * that was the original bug, a `setPopoverNow(Date.now())` on press which reset
 * the displayed age to `JUST NOW` before the machine had said anything. Once
 * only a real answer moves `askedAt`, a *change* in it is exactly the event
 * that ends the wait, and the wait becomes something the control can show.
 *
 * Pure over a number and a clock, so it is tested without a machine.
 */
export function useRefreshRequest(askedAt: number, ask: () => void): {
    state: RefreshState;
    press: () => void;
} {
    // The reading's age at the moment of asking, so a later change to it can be
    // recognised as this request's answer.
    const [request, setRequest] =
        useState<{state: Exclude<RefreshState, "idle">; at: number} | null>(null);

    const answered = request !== null && request.state === "asking"
        && askedAt !== request.at;
    const state: RefreshState = request === null || answered ? "idle" : request.state;

    useEffect(() => {
        if (request === null || answered) return;
        const ms = request.state === "asking" ? ASK_TIMEOUT_MS : NO_ANSWER_MS;
        const timer = setTimeout(() => {
            setRequest(request.state === "asking"
                ? {state: "noAnswer", at: request.at}
                : null);
        }, ms);
        return () => clearTimeout(timer);
    }, [request, answered]);

    return {
        state,
        press: () => {
            setRequest({state: "asking", at: askedAt});
            ask();
        }
    };
}
