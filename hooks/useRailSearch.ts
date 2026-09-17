import {useEffect, useRef, useState} from "react";

import {TYPING_DEBOUNCE_MS} from "@/constants/motion";

/**
 * The wait before a keystroke reaches the query.
 *
 * The same constant the import field waits on, read from one place rather than
 * matched by hand: the app has two fields that act as you type, and two
 * different waits would make the same gesture feel like two different apps.
 */
const DEBOUNCE_MS = TYPING_DEBOUNCE_MS;

export type RailSearch = {
    /** Whether the field is live, with a cursor in it, rather than idle. */
    expanded: boolean;
    /** The raw field text, undebounced. */
    text: string;
    /**
     * Whether a term is currently held, so the field reads as on. Raw, not the
     * debounced copy: the library must not look unfiltered for the 600 ms
     * between a keystroke and the query catching up.
     */
    active: boolean;
    onExpand: () => void;
    onChangeText: (next: string) => void;
    onClear: () => void;
};

/**
 * The search control's state: whether it is live yet, what is in it, and when
 * that reaches the query.
 *
 * Kept beside the rail rather than in the owner so the rail is testable without
 * a database: the owner is handed only the debounced term through `onTermChange`
 * and never sees the keystrokes, the expansion, or the timer. Task 8's
 * `useLibraryQuery` becomes the one caller, and until then this is exercised on
 * its own.
 *
 * Two events look alike and are not. Clearing the field collapses it and drops
 * the term at once, because a cleared field is an unfiltered library now, not in
 * 600 ms. Dismissing the keyboard does neither: a user who typed a term and then
 * looked at the results still has one, and collapsing there would flick the
 * library back to unfiltered every time the keyboard left. So there is no blur
 * handler here at all -- the field only leaves on an explicit clear.
 *
 * A consequence worth stating: because clear is the only collapse and it also
 * drops the term, "idle while a term is held" is not a reachable state. The
 * accent therefore lives entirely on the live field; the idle control is always
 * the unfiltered one.
 */
export function useRailSearch(onTermChange: (term: string) => void): RailSearch {
    const [expanded, setExpanded] = useState(false);
    const [text, setText] = useState("");

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The latest callback, so a timer armed by an earlier render still reaches
    // the owner's current handler rather than a stale closure.
    const emit = useRef(onTermChange);
    useEffect(() => {
        emit.current = onTermChange;
    });

    // A debounce timer is a real resource and must not outlive the component,
    // or it fires into an unmounted owner.
    useEffect(() => () => {
        if (timer.current !== null) clearTimeout(timer.current);
    }, []);

    function arm(term: string) {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => emit.current(term), DEBOUNCE_MS);
    }

    function onExpand() {
        setExpanded(true);
    }

    function onChangeText(next: string) {
        setText(next);
        arm(next.trim());
    }

    function onClear() {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        setText("");
        setExpanded(false);
        // Immediate, not debounced: the collapse and the unfiltered library are
        // one action, so waiting out the debounce would leave the term in force
        // for 600 ms after the field is gone.
        emit.current("");
    }

    return {
        expanded,
        text,
        active: text.trim().length > 0,
        onExpand,
        onChangeText,
        onClear
    };
}
