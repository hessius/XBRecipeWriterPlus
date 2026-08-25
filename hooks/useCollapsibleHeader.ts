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
 * How much shorter the page gets when the header collapses.
 *
 * A deliberate overestimate. It is the height of everything the two screens
 * fold away -- the home screen's tiles, or the editor's name slab and the tall
 * form of its curve -- and it is only ever used to decide whether there is
 * enough page to bother collapsing at all. Guessing high means refusing to
 * collapse a page that could just about have managed it; guessing low means the
 * strobe comes back. Those are not comparable mistakes.
 */
export const COLLAPSE_SHRINK = 140;

/**
 * The next collapsed state, given where the list is and where the header is now.
 *
 * Pure, and the whole of the decision. Two discrete states rather than an
 * interpolation: interpolating leaves the tiles resting at an arbitrary
 * half-size whenever the list stops mid-threshold, which is a state nobody
 * designed.
 *
 * `extent` is the furthest the list can scroll. It matters because collapsing
 * the header is not a passive observer of the scroll position -- it shortens the
 * page, and a list resting at the bottom of that page is dragged up by however
 * much was taken away. On a screen only slightly taller than the phone that
 * carried the offset back under `EXPAND_AT`, the header expanded, the page grew,
 * the list fell to the bottom again, and it strobed for as long as you held it
 * there.
 *
 * So a collapse is refused unless the page would still be scrolled past
 * `EXPAND_AT` after the collapse has taken its `COLLAPSE_SHRINK` back. That
 * makes the state a fixed point of its own consequences, which is the property
 * the dead band alone could not provide. There is no matching guard on
 * expanding: expanding lengthens the page, and a longer page cannot move a list
 * that is already near its top.
 *
 * Omitting `extent` asks for the decision without that guard, for callers with
 * no measurement to hand.
 */
export function nextCollapsed(
    offset: number, collapsed: boolean, extent: number = Infinity
): boolean {
    if (collapsed) {
        return offset > EXPAND_AT;
    }
    return offset > COLLAPSE_AT && extent - COLLAPSE_SHRINK > EXPAND_AT;
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
        const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
        const extent = contentSize.height - layoutMeasurement.height;
        setCollapsed((current) => nextCollapsed(contentOffset.y, current, extent));
    }

    return {collapsed, onScroll};
}

export default useCollapsibleHeader;
