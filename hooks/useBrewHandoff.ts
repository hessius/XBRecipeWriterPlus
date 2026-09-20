import {useRef, useState} from "react";
import {Linking} from "react-native";

import {notify} from "@/components/XbrwToast";
import {buildEnvelope} from "@/library/brew/handoff/envelope";
import {encodeHandoff} from "@/library/brew/handoff/encode";
import type {BrewExportSource} from "@/hooks/useBrewExport";

const HANDOFF_FAILED = "Could not open Beanconqueror. Make sure it is installed and try again.";

/**
 * Hands a finished brew to Beanconqueror over its deep link.
 *
 * The caller hands `source` as a thunk resolved at press time, mirroring
 * `useBrewExport`, so a screen can defer reading the final persisted brew
 * until somebody actually asks to send it.
 */
export function useBrewHandoff(source: () => BrewExportSource | null) {
    const isSendingRef = useRef(false);
    const [busy, setBusy] = useState(false);

    async function send() {
        if (isSendingRef.current) return;
        const opened = source();
        if (opened === null) return;
        isSendingRef.current = true;
        setBusy(true);
        try {
            const envelope = buildEnvelope(opened.record, opened.samples);
            const {url} = encodeHandoff(envelope);
            // Do not preflight with canOpenURL: on iOS it returns false without
            // LSApplicationQueriesSchemes, even when Beanconqueror is installed.
            await Linking.openURL(url);
        } catch {
            notify({tone: "error", message: HANDOFF_FAILED});
        } finally {
            // The React Compiler bails out on try/finally, but this hook must
            // clear the synchronous ref guard and button state after failures.
            isSendingRef.current = false;
            setBusy(false);
        }
    }

    return {send, busy};
}

export default useBrewHandoff;
