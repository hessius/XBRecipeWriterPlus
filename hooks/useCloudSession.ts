import {useFocusEffect} from "expo-router";
import {useCallback, useRef, useState} from "react";

import {loadSession, signOut, type Session} from "@/library/cloud/session";

/**
 * Which xBloom account, if any, this device is signed in to.
 *
 * Settings needs far less than `useCloudImport` does -- it never lists or
 * imports -- so it gets its own small hook rather than mounting the whole state
 * machine to read one email off it.
 *
 * It reloads on focus rather than only on mount, because the way the account
 * changes is that the user leaves this screen for the import route, signs in
 * there, and comes back. Without that, Settings would still be offering `Sign
 * in` to somebody who just did.
 *
 * `enabled` is the feature gate, and it is a parameter rather than a condition
 * at the call site because a hook cannot be called conditionally. It has to be
 * honoured here, and honoured on the read rather than on the result: while the
 * gate is off this hook must not touch the keychain at all. `loadSession` is a
 * `SecureStore` read, and on a device that is a Keychain call -- a user who has
 * never enabled this feature must never be asked about a keychain by it, and
 * "we read it and then ignored what we found" would not be that promise kept.
 */
export function useCloudSession(enabled = true) {
    const [session, setSession] = useState<Session | null>(null);
    // A counter rather than a boolean, and not state: nothing renders from it,
    // and every async path reads it after an await, where a captured render's
    // value would already be stale.
    //
    // A boolean could only say whether the screen was focused now, which is not
    // the question. Someone who leaves mid-load and comes straight back focuses
    // again, clearing the flag, and the load from the visit they abandoned then
    // passes the guard and writes -- possibly over the newer load, if it lands
    // second. Counting says which visit a load belongs to, so only the current
    // one may write. `forget` bumps it too, so a load still in flight cannot
    // sign the user back in a moment after they signed out.
    const visit = useRef(0);

    useFocusEffect(
        useCallback(() => {
            // Read, not bumped. Every refocus is preceded by a blur, and the
            // cleanup below is what bumps, so a bump here would be a line no
            // test could ever observe.
            const mine = visit.current;
            if (!enabled) return;
            void (async () => {
                const stored = await loadSession();
                if (visit.current !== mine) return;
                setSession(stored);
            })();
            return () => {
                visit.current++;
            };
        }, [enabled])
    );

    /**
     * Forgetting is local. There is no endpoint to call: the token simply stops
     * being held, which is the whole of what signing out means here.
     *
     * It does not catch. `signOut` is deliberately undefended -- a keychain that
     * refuses the delete leaves the token in place, and someone believing they
     * had signed out of an account they had not is the one failure here with a
     * privacy cost. The caller reports it; this hook must not swallow it, and
     * must not clear the session it failed to discard either.
     */
    async function forget() {
        const mine = ++visit.current;
        await signOut();
        if (visit.current !== mine) return;
        setSession(null);
    }

    return {session, forget};
}

export type CloudSession = ReturnType<typeof useCloudSession>;
