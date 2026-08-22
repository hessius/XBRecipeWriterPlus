import {useState} from "react";
import type {NativeScrollEvent, NativeSyntheticEvent} from "react-native";

/**
 * How far the list must scroll before the header collapses. Roughly the height
 * of one CTA tile: the tiles should be gone by the time the first card would
 * otherwise be hidden behind them.
 */
export const COLLAPSE_AT = 72;

/**
 * How far back up the list must come before the header expands again.
 *
 * Lower than `COLLAPSE_AT` on purpose. With a single threshold, a list resting a
 * few pixels either side of it alternates state on every scroll event and the
 * header strobes; the gap between these two numbers is what makes that
 * impossible rather than unlikely.
 */
export const EXPAND_AT = 24;

/**
 * The next collapsed state, given where the list is and where the header is now.
 *
 * Pure, and the whole of the decision. Two discrete states rather than an
 * interpolation: interpolating leaves the tiles resting at an arbitrary
 * half-size whenever the list stops mid-threshold, which is a state nobody
 * designed.
 */
export function nextCollapsed(offset: number, collapsed: boolean): boolean {
    return collapsed ? offset > EXPAND_AT : offset > COLLAPSE_AT;
}

export type CollapsibleHeader = {
    collapsed: boolean;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * Drives the home screen header from the list's scroll position.
 *
 * The state lives in React rather than on the UI thread because it switches
 * which components are mounted, not just how they are styled.
 */
export function useCollapsibleHeader(): CollapsibleHeader {
    const [collapsed, setCollapsed] = useState(false);

    function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        const offset = event.nativeEvent.contentOffset.y;
        setCollapsed((current) => nextCollapsed(offset, current));
    }

    return {collapsed, onScroll};
}

export default useCollapsibleHeader;
