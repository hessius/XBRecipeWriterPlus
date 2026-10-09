import {useEffect, useRef, useState} from "react";
import {AppState} from "react-native";

import {OVERFLOW_PUBLISH_MS} from "@/constants/overflow";
import type Machine from "@/library/machine/Machine";
import {OverflowController, type OverflowSnapshot} from "@/library/brew/OverflowController";
import type {OverflowProtection} from "@/library/brew/overflowConfig";

type OverflowMachine = Pick<Machine,
    "onNotification" | "onPhase" | "pauseBrew" | "resumeBrew" | "phase">;

/** One controller per run, above route lifetimes, fed by the raw machine stream. */
export function useOverflowProtection({machine, config, runId}: {
    machine: OverflowMachine;
    config: OverflowProtection | undefined;
    runId: number;
}): {
    overflow: OverflowSnapshot | undefined;
    manualPause: () => void;
    manualResume: () => void;
    cancel: () => void;
} {
    const configRef = useRef(config);
    const handle = useRef<OverflowController | null>(null);
    const [published, setPublished] = useState<{
        from: OverflowMachine; runId: number; snapshot: OverflowSnapshot;
    } | null>(null);

    useEffect(() => { configRef.current = config; }, [config]);

    useEffect(() => {
        const fixed = configRef.current;
        if (fixed === undefined) return;
        let alive = true;
        const controller = new OverflowController({
            config: fixed,
            commands: {
                pause: () => machine.pauseBrew("overflow"),
                resume: () => machine.resumeBrew()
            },
            now: Date.now,
            onChange: snapshot => {
                if (alive) setPublished({from: machine, runId, snapshot});
            }
        });
        handle.current = controller;
        // Unknown is not foreground. Disable before any telemetry can request a pause.
        if (AppState.currentState !== "active") controller.background();
        // The machine's current phase may belong to the previous attempt.
        // Only phases heard after this run subscribed can grant ownership.
        const offNotification = machine.onNotification(parsed => controller.notification(parsed));
        const offPhase = machine.onPhase(phase => controller.phase(phase));
        const appState = AppState.addEventListener("change", state => {
            if (state !== "active") controller.background();
        });
        const timer = setInterval(() => controller.tick(), OVERFLOW_PUBLISH_MS);
        return () => {
            alive = false;
            offNotification();
            offPhase();
            appState.remove();
            clearInterval(timer);
            controller.dispose();
            if (handle.current === controller) handle.current = null;
        };
    }, [machine, runId]);

    return {
        overflow: published?.from === machine && published.runId === runId
            ? published.snapshot : undefined,
        manualPause: () => { handle.current?.manualPause(); },
        manualResume: () => { handle.current?.manualResume(); },
        cancel: () => { handle.current?.cancel(); }
    };
}
