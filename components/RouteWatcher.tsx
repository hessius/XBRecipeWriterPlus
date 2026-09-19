import {usePathname} from "expo-router";
import {useEffect} from "react";

import {noteRoute} from "@/hooks/steadyRouter";

/**
 * Tells the navigation guard where the app is.
 *
 * `steadyRouter` scopes a `back` to the screen it was pressed on, so that a
 * back revealing another screen's Back button does not swallow the next press.
 * It cannot find that out for itself: only a hook can answer where expo-router
 * is, and the singleton router the guard also wraps has no component to hang
 * one on.
 *
 * So the answer is pushed in from here, once, from beside the navigator. A
 * component rather than a call inside `LiveBrewBar`, which already has the
 * pathname, because that bar returns null on three routes and a watcher that
 * stops watching is worse than none.
 *
 * Renders nothing. In an effect rather than during render because writing to
 * another module while rendering is exactly what `react-hooks/purity` forbids,
 * and rightly: a render that is thrown away must not have said anything.
 */
export default function RouteWatcher() {
    const pathname = usePathname();
    useEffect(() => {
        noteRoute(pathname);
    }, [pathname]);
    return null;
}
