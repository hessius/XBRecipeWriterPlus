import {getShareExtensionKey} from "expo-share-intent";

/**
 * Decide what a URL arriving from the system should do to the navigation stack.
 *
 * Sharing into the app wakes it with a deep link of its own -- something like
 * `xbrecipewriter://dataUrl=xbrecipewriterShareKey?nonce=...` -- which is not an
 * address in this app at all. It is a handle the native share extension uses to
 * hand its payload over, and `useShareIntent` reads it directly from the linking
 * URL. Left to itself the router still treats it as a destination and navigates,
 * which mounts a *second* copy of the library screen on top of the editor the
 * share just opened. That second screen sees the same live share intent, knows
 * nothing of the first, and imports the recipe again -- the same recipe opening
 * twice, one editor stacked on another.
 *
 * No guard inside the screen can prevent this: two instances have two sets of
 * refs. The fix has to be here, where the navigation is decided. Returning a
 * falsy path tells the router to stay where it is, which is right -- the share
 * has already been delivered by the time this is asked.
 */
export function redirectSystemPath({path}: {path: string; initial: boolean}): string | null {
    try {
        return path.includes(`dataUrl=${getShareExtensionKey()}`) ? null : path;
    } catch {
        // The scheme lookup reads app config, and a throw here can take the app
        // down with it. Letting an unrecognised path through is what the router
        // would have done anyway.
        return path;
    }
}
