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
    /**
     * Returns whether the field closed, so the caller can tell the rail in the
     * same breath rather than watching `expanded` from an effect.
     */
    onBlur: () => boolean;
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
 * 600 ms. Dismissing the keyboard with a term held does neither: a user who
 * typed a term and then looked at the results still has one, and collapsing
 * there would flick the library back to unfiltered every time the keyboard
 * left.
 *
 * Dismissing it with nothing typed is a third thing again, and it does collapse.
 * There is no term to lose, so the field is a cursor the user has walked away
 * from, and leaving it open held the sort chip's word away for a search that was
 * never made. Nothing is dropped here, which is why this is not the blur handler
 * the paragraph above rules out.
 *
 * A consequence worth stating: neither collapse can leave a term behind -- clear
 * drops it, and blur declines to close while one is held -- so "idle while a term
 * is held" is not a reachable state. The accent therefore lives entirely on the
 * live field; the idle control is always the unfiltered one.
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
        // Held upper case, because that is how the field draws it and the rail
        // around it. `textTransform` cannot do this: React Native implements it
        // for Text and never plumbs it through to a TextInput on either
        // platform, so the caps have to be in the string.
        setText(next.toUpperCase());
        arm(searchTerm(next));
    }

    /**
     * The term as the query should see it, which is not what the field shows.
     *
     * Lower case, because the field's own casing is a display choice and the
     * query must not inherit it. SQL LIKE folds ASCII case and nothing else, so
     * the case that reaches it decides which accented text still matches: a
     * recipe name is unaffected either way, since names match through the
     * accent-folded key rather than literally, but a description or a sharer's
     * name is matched as written, and free text is written in lower case far
     * more often than in upper.
     */
    function searchTerm(text: string): string {
        return text.trim().toLowerCase();
    }

    function onBlur(): boolean {
        // A term survives the keyboard leaving. Only an empty field closes, and
        // an empty field has nothing to tell the owner, so no term is emitted
        // either way.
        if (text.trim().length > 0) return false;
        setExpanded(false);
        return true;
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
        onBlur,
        onClear
    };
}
