import {router, useRouter} from "expo-router";

/**
 * How long one move stays spoken for, in milliseconds.
 *
 * Not a motion constant, which is why it is here and not in
 * `constants/motion.ts`: nothing animates on this timing and retuning the
 * app's motion must not change it. It is the width of a fumble.
 *
 * Long enough to swallow a double tap, which lands well inside 300ms even from
 * a hesitant finger, and far too short to swallow a considered second visit.
 * Going to a screen and coming back costs two transitions and a deliberate
 * press, so a repeat that is actually meant cannot arrive this fast.
 */
export const SETTLE_MS = 600;

/** A move the app has just made: which one, and when. */
type Move = {move: string; at: number};

/**
 * Whether this move is the tail of one already under way.
 *
 * Keyed by the move itself rather than by "any navigation in flight", because
 * a screen that pushes one route and then another is doing something
 * deliberate and must not be second-guessed. A finger cannot press two
 * different buttons at once, so keying on the move loses nothing real and
 * keeps this guard out of the way of code that means it.
 *
 * Pure, and exported, so the rule can be read and tested without a navigator.
 */
export function isRepeat(move: string, at: number, last: Move | null): boolean {
    return last !== null && last.move === move && at - last.at < SETTLE_MS;
}

/**
 * The last move, shared by every screen.
 *
 * Module scope on purpose. There is one navigation stack, so there is one
 * answer to "what did we just do"; per-screen state would let the screen being
 * left and the screen arriving each believe they were first.
 */
let last: Move | null = null;

/** Forget the last move. For tests, which must not inherit each other's. */
export function forgetLastMove(): void {
    last = null;
}

/** Records the move and says whether it should be made at all. */
function claim(move: string): boolean {
    const at = Date.now();
    if (isRepeat(move, at, last)) return false;
    last = {move, at};
    return true;
}

/**
 * Wraps a router so the moves that stack up are guarded against a double tap.
 *
 * `push` and `back` both change how deep the stack is, so a tap counted twice
 * leaves the app somewhere the user did not ask to be: two copies of the about
 * screen, or two screens popped when one was meant. Both are reached by
 * tapping a row, and a row is exactly what gets tapped twice.
 *
 * `replace` and the rest are passed through untouched. Replacing a screen with
 * the same screen twice ends where replacing it once does, so there is nothing
 * to protect against and a guard would only be a place for a bug to live.
 */
function steady<R extends typeof router>(inner: R): R {
    return {
        ...inner,
        push: (...args: Parameters<R["push"]>) => {
            // The target is part of the key so that two different rows tapped
            // in quick succession both arrive; only the same row twice is a
            // fumble.
            if (claim(`push:${JSON.stringify(args[0])}`)) {
                (inner.push as (...a: unknown[]) => void)(...args);
            }
        },
        back: () => {
            if (claim("back")) inner.back();
        }
    };
}

/**
 * The guarded router, for the screens that reach for the singleton.
 *
 * Both this and the hook below exist because the app reaches for the router
 * both ways, and a guard covering only one of them would be a guard with a
 * hole in it. They share the one record of the last move, so it does not
 * matter which door a screen came through.
 */
const steadyRouter = steady(router);
export default steadyRouter;

/** The same guard, for screens that take the router from the hook. */
export function useSteadyRouter() {
    return steady(useRouter());
}
