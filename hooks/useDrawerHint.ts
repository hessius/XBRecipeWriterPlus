import {useEffect, useState} from "react";

import {STAGGER, useReducedMotion} from "@/constants/motion";
import {
    DRAWER_ACTION_SIGNATURE,
    type DrawerHintState,
    noteHintShown,
    noteManualOpen as noteManualOpenPolicy,
    rearmDrawerHint,
    shouldShowDrawerHint
} from "@/library/drawerHint";
import {type Settings} from "@/library/Settings";
import {sharedSettings} from "@/hooks/useSetting";

export type DrawerHint = {
    /** Which tray this row should demonstrate, or null for silence. */
    trayFor: (recipeIndex: number) => "action" | "management" | null;
    delayFor: (recipeIndex: number) => number;
    noteManualOpen: () => void;
    dismiss: () => void;
};

type DrawerHintDecision = {
    armed: DrawerHintState;
    decidedAt: number;
    showing: boolean;
};

function readDrawerHintState(settings: Settings): DrawerHintState {
    return {
        lastShownAt: settings.get("drawerHintLastShownAt"),
        shownCount:  settings.get("drawerHintShownCount"),
        manualOpens: settings.get("drawerHintManualOpens"),
        signature:   settings.get("drawerHintSignature"),
        lastSeenAt:  settings.get("drawerHintLastSeenAt")
    };
}

function writeDrawerHintState(settings: Settings, state: DrawerHintState) {
    settings.set("drawerHintLastShownAt", state.lastShownAt);
    settings.set("drawerHintShownCount", state.shownCount);
    settings.set("drawerHintManualOpens", state.manualOpens);
    settings.set("drawerHintSignature", state.signature);
    settings.set("drawerHintLastSeenAt", state.lastSeenAt);
}

export function useDrawerHint(settings: Settings = sharedSettings()): DrawerHint {
    const reducedMotion = useReducedMotion();
    const [decision] = useState<DrawerHintDecision>(() => {
        const now = Date.now();
        const armed = rearmDrawerHint(
            readDrawerHintState(settings),
            now,
            DRAWER_ACTION_SIGNATURE
        );
        return {
            armed,
            decidedAt: now,
            // A user who asks the OS to reduce motion should not be shown an
            // animated demonstration. The trays stay discoverable by swiping.
            showing:  !reducedMotion && shouldShowDrawerHint(armed, now)
        };
    });
    const [showing, setShowing] = useState(decision.showing);

    useEffect(() => {
        // Count the lesson when the launch decision is made, not when either
        // row finishes animating: two rows close separately, and completion
        // callbacks would count one lesson twice.
        const next = decision.showing
            ? {...noteHintShown(decision.armed, decision.decidedAt), lastSeenAt: decision.decidedAt}
            : {...decision.armed, lastSeenAt: decision.decidedAt};
        writeDrawerHintState(settings, next);
    }, [decision, settings]);

    function trayFor(recipeIndex: number): "action" | "management" | null {
        if (!showing) return null;
        if (recipeIndex === 0) return "action";
        if (recipeIndex === 1) return "management";
        return null;
    }

    function delayFor(recipeIndex: number): number {
        return recipeIndex === 1 ? STAGGER.drawerHint : 0;
    }

    function noteManualOpen() {
        const current = readDrawerHintState(settings);
        const next = noteManualOpenPolicy(current);
        settings.set("drawerHintManualOpens", next.manualOpens);
        setShowing(false);
    }

    function dismiss() {
        setShowing(false);
    }

    return {trayFor, delayFor, noteManualOpen, dismiss};
}

