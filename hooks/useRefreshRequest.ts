import {useEffect, useRef, useState} from "react";

export type RefreshState = "idle" | "asking" | "noAnswer";

/** How long `NO ANSWER` is shown before the control offers itself again. */
export const NO_ANSWER_MS = 4000;

/**
 * A bug net, not part of the normal path.
 *
 * `Machine.askHowItIsDoing` has a ceiling of its own: a handshake, a frame gap,
 * three attempts each waiting `INFO_WAIT_MS`, and a gap between them -- about
 * 12.2 s in the worst case. This sits comfortably above that, so it only ever
 * fires for a promise that never settles at all, which would otherwise leave
 * the control saying `CHECKING…` for good.
 */
export const ASK_BACKSTOP_MS = 20_000;

/**
 * The refresh control's state, over the request it makes.
 *
 * Driven by the promise, not by a timer racing it. The original bug was a
 * `setPopoverNow(Date.now())` on press, which reset the displayed age to
 * `JUST NOW` before the machine had said anything. The fix for that introduced
 * a second one: a six-second timeout, chosen before anybody had added up what
 * the machine is actually allowed to spend. It gave up with half the machine's
 * budget unspent, said `NO ANSWER`, and then the answer arrived -- which is
 * what device testing reported, down to the third press appearing to be the
 * one that worked.
 *
 * So the question is asked and the answer is awaited. A machine that says no,
 * or throws, is a `NO ANSWER`; a machine that takes eleven seconds to say yes
 * is simply a slow yes.
 *
 * Pure over a promise, so it is tested without a machine.
 */
export function useRefreshRequest(ask: () => Promise<boolean>): {
    state: RefreshState;
    press: () => void;
} {
    const [state, setState] = useState<RefreshState>("idle");
    // Identifies the request in flight, so that a superseded one settling late
    // cannot overwrite the state of the one that replaced it.
    const seq = useRef(0);

    useEffect(() => {
        if (state === "idle") return;
        const mine = seq.current;
        const timer = setTimeout(() => {
            if (seq.current !== mine) return;
            setState(state === "asking" ? "noAnswer" : "idle");
        }, state === "asking" ? ASK_BACKSTOP_MS : NO_ANSWER_MS);
        return () => clearTimeout(timer);
    }, [state]);

    return {
        state,
        press: () => {
            const mine = seq.current + 1;
            seq.current = mine;
            // Pressing again while already asking would set the state to the
            // value it already holds, so React skips the re-render, the
            // backstop effect below never re-runs, and the second ask would
            // sit under the first press's timer. It cannot happen today only
            // because MachinePanel leaves onPress undefined unless the state
            // is idle. If another caller ever wires this up unconditionally,
            // that guard has to move in here.
            setState("asking");
            const settle = (next: RefreshState): void => {
                if (seq.current === mine) setState(next);
            };
            // A radio that refuses the question is no more of an answer than a
            // machine that ignores it, and the user is owed the same words.
            void ask().then((ok) => settle(ok ? "idle" : "noAnswer"),
                            () => settle("noAnswer"));
        }
    };
}
