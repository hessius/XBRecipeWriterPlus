import {useEffect, useRef, useState} from "react";
import {AppState} from "react-native";

import {STAGGER, useReducedMotionState} from "@/constants/motion";
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
    noteShown: () => void;
    noteBounced: (recipeIndex: number) => void;
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
    const reducedMotion = useReducedMotionState();
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
            showing: shouldShowDrawerHint(armed, now)
        };
    });
    const [showing, setShowing] = useState(decision.showing);
    const [bouncedRows, setBouncedRows] = useState<ReadonlySet<number>>(() => new Set());
    const shownRecordedRef = useRef(false);

    useEffect(() => {
        const next = {...decision.armed, lastSeenAt: decision.decidedAt};
        writeDrawerHintState(settings, next);
    }, [decision, settings]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (next) => {
            if (next !== "active") return;

            // Foregrounding is a visit, but not a fresh chance to decide. A
            // mid-session re-arm could pop trays open while the user is already
            // reading the list, so only the dormancy timestamp moves here.
            settings.set("drawerHintLastSeenAt", Date.now());
        });

        return () => subscription.remove();
    }, [settings]);

    function trayFor(recipeIndex: number): "action" | "management" | null {
        // The first reduced-motion read is asynchronous. Until it resolves the
        // safe failure mode is silence: if native never answers, the lesson
        // never shows rather than spending an appearance on motion a user may
        // have asked us not to play.
        if (!showing || !reducedMotion.resolved || reducedMotion.reduced ||
            bouncedRows.has(recipeIndex)) return null;
        if (recipeIndex === 0) return "action";
        if (recipeIndex === 1) return "management";
        return null;
    }

    function delayFor(recipeIndex: number): number {
        return recipeIndex === 1 ? STAGGER.drawerHint : 0;
    }

    function noteShown() {
        if (shownRecordedRef.current) return;
        shownRecordedRef.current = true;

        const next = noteHintShown(readDrawerHintState(settings), Date.now());
        writeDrawerHintState(settings, next);
    }

    function noteBounced(recipeIndex: number) {
        setBouncedRows((current) => {
            if (current.has(recipeIndex)) return current;
            const next = new Set(current);
            next.add(recipeIndex);
            return next;
        });
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

    return {trayFor, delayFor, noteShown, noteBounced, noteManualOpen, dismiss};
}
