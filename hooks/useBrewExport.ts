import {File as FSFile, Paths} from "expo-file-system";
import * as Sharing from "expo-sharing";
import {useRef, useState} from "react";
import type {ViewShotRef} from "react-native-view-shot";

import {brewFilename, toExportJson} from "@/library/brew/brewExport";
import type {BrewSample} from "@/library/brew/BrewRecord";
import type {StoredBrew} from "@/library/BrewDatabase";

/** Everything the two exports need to name and serialise a brew. */
export type BrewExportSource = {record: StoredBrew; samples: BrewSample[]};

/**
 * The share mechanics for a finished brew, owned in one place so the record
 * screen and the live brew modal export identically.
 *
 * The caller wires `shotRef` onto the `ViewShot` that wraps the summary, and
 * hands `source` — a thunk resolved at press time, not at render, so the live
 * modal can read the just-written record straight from the database only when
 * somebody actually presses export.
 *
 * Both shares are guarded against a second press while the first is still in
 * flight: the guard is a ref, set synchronously before the first `await`, so a
 * double tap cannot open two share sheets. `busy` is the same fact as state,
 * for a caller that wants to disable a button.
 */
export function useBrewExport(
    source: () => BrewExportSource | null,
    /**
     * Run before the PNG is captured, for a caller that must take something
     * off the screen first — the record screen clears its selected stage, so
     * the shading and the tint do not end up baked into a picture nobody can
     * tap.
     *
     * Awaited, and the capture waits a further frame afterwards, because
     * `ViewShot` photographs what is on the glass: a state change is not on
     * the glass until React has committed it and the compositor has drawn it.
     */
    prepare?: () => Promise<void>
) {
    // Attached by the caller to the ViewShot wrapping the summary.
    const shotRef = useRef<ViewShotRef>(null);

    // Guards against a second press while an export is already in flight.
    const isSharingImageRef = useRef(false);
    const isSharingDataRef  = useRef(false);
    const [busy, setBusy] = useState(false);

    /**
     * Capture the summary as a PNG and hand it to the system share sheet.
     * Sharing can fail silently (user cancel, simulator, no share sheet) —
     * none of those is an error worth surfacing.
     */
    async function shareImage() {
        if (isSharingImageRef.current) return;
        const opened = source();
        if (opened === null) return;
        isSharingImageRef.current = true;
        setBusy(true);
        try {
            if (prepare) {
                await prepare();
                await nextPaint();
            }
            const uri = await shotRef.current?.capture?.();
            if (uri === undefined) return;
            if (!(await Sharing.isAvailableAsync())) return;
            await Sharing.shareAsync(uri, {
                mimeType:    "image/png",
                // iOS decides what the share sheet may offer from the UTI, not
                // the MIME type. Without it there is no "Save Image".
                UTI:         "public.png",
                dialogTitle: brewFilename(opened.record, "png")
            });
        } catch {
            // User cancelled, or the share sheet is unavailable — not an error.
        } finally {
            isSharingImageRef.current = false;
            setBusy(isSharingDataRef.current);
        }
    }

    /**
     * Write the brew as JSON to the cache directory and share the file.
     * The cache directory is the right place: it is writable, and the system
     * may reclaim it when space is low, which is exactly what we want for a
     * temporary export file.
     *
     * Availability is checked before writing so we do not produce a file that
     * is never read.
     */
    async function shareData() {
        if (isSharingDataRef.current) return;
        const opened = source();
        if (opened === null) return;
        isSharingDataRef.current = true;
        setBusy(true);
        try {
            if (!(await Sharing.isAvailableAsync())) return;
            const name = brewFilename(opened.record, "json");
            const file = new FSFile(Paths.cache, name);
            file.write(toExportJson(opened.record, opened.samples));
            await Sharing.shareAsync(file.uri, {
                mimeType:    "application/json",
                dialogTitle: name
            });
        } catch {
            // User cancelled — not an error.
        } finally {
            isSharingDataRef.current = false;
            setBusy(isSharingImageRef.current);
        }
    }

    return {shotRef, shareImage, shareData, busy};
}

/**
 * Resolve after the next paint.
 *
 * Two frames, not one: the first carries React's commit into the native tree,
 * and the second is the one that actually draws it. Whether one frame would
 * in fact do is untested on a device — two is the cheap, safe side of a guess.
 */
function nextPaint(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}

export default useBrewExport;
