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
 */
export function useCloudSession() {
    const [session, setSession] = useState<Session | null>(null);
    // Not state: nothing renders from it, and the async load reads it after an
    // await, where a captured render's value would already be stale.
    const gone = useRef(false);

    useFocusEffect(
        useCallback(() => {
            gone.current = false;
            void (async () => {
                const stored = await loadSession();
                // A load that lands after the screen is gone must not touch
                // state: it would be writing on behalf of a hook nobody is
                // watching.
                if (gone.current) return;
                setSession(stored);
            })();
            return () => {
                gone.current = true;
            };
        }, [])
    );

    /**
     * Forgetting is local. There is no endpoint to call: the token simply stops
     * being held, which is the whole of what signing out means here.
     */
    async function forget() {
        await signOut();
        if (gone.current) return;
        setSession(null);
    }

    return {session, forget};
}

export type CloudSession = ReturnType<typeof useCloudSession>;
